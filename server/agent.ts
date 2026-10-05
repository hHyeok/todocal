import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import path from "node:path";
import { loadConfig } from "./config.js";

// 도구 스키마가 매 요청 입력 토큰이 되므로 캘린더에 필요한 것만 노출한다
const ALLOWED_TOOLS = new Set([
  "add-tasks",
  "complete-tasks",
  "uncomplete-tasks",
  "update-tasks",
  "reschedule-tasks",
  "find-tasks",
  "find-tasks-by-date",
  "find-completed-tasks",
  "find-projects",
  "add-projects",
  "find-sections",
  "add-sections",
  "find-labels",
  "add-labels",
  "add-comments",
  "add-reminders",
  "delete-object",
  "get-overview",
]);

let mcp: { client: Client; token: string; tools: Anthropic.Tool[] } | null = null;

async function getMcp(token: string) {
  if (mcp && mcp.token === token) return mcp;
  if (mcp) await mcp.client.close().catch(() => {});
  const require = createRequire(import.meta.url);
  const pkgDir = path.dirname(require.resolve("@doist/todoist-mcp/package.json"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(pkgDir, "dist/main.js")],
    env: { ...(process.env as Record<string, string>), TODOIST_API_KEY: token },
    stderr: "ignore",
  });
  const client = new Client({ name: "todocal", version: "0.1.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const anthropicTools: Anthropic.Tool[] = tools
    .filter((t) => ALLOWED_TOOLS.has(t.name))
    .sort((a, b) => a.name.localeCompare(b.name)) // 순서 고정 → 프롬프트 캐시 유지
    .map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
  mcp = { client, token, tools: anthropicTools };
  return mcp;
}

const SYSTEM = `너는 Todoist 캘린더 앱 안의 비서다. 사용자의 지시를 Todoist 도구로 바로 실행한다.
- 할 일 추가 지시는 되묻지 말고 add-tasks로 넣는다. 날짜·시간·우선순위·프로젝트·라벨은 문장에서 뽑는다.
- 우선순위: "급함/중요/p1" → p1. 프로젝트 이름이 애매하면 find-projects로 찾고, 없으면 Inbox.
- 날짜를 옮길 때는 reschedule-tasks를 쓴다(반복 유지). update-tasks로 due를 바꾸지 않는다.
- 삭제처럼 되돌리기 어려운 작업은 대상이 명확할 때만 한다.
- 답은 한국어로 한두 줄. 무엇을 했는지만 말한다.`;

export interface AgentTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AgentResult {
  text: string;
  actions: { tool: string; ok: boolean }[];
}

export async function runAgent(history: AgentTurn[], now: string, tz: string): Promise<AgentResult> {
  const cfg = loadConfig();
  if (!cfg.todoistToken) throw new Error("Todoist 토큰이 없습니다");
  if (!cfg.anthropicKey) throw new Error("Anthropic API 키가 없습니다");
  const { client: mcpClient, tools } = await getMcp(cfg.todoistToken);
  const anthropic = new Anthropic({ apiKey: cfg.anthropicKey });

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.text }));
  // 날짜는 매번 바뀌므로 캐시되는 system 대신 마지막 사용자 턴 뒤에 붙인다
  const last = messages[messages.length - 1];
  last.content = `${last.content}\n\n(현재 시각: ${now}, 시간대: ${tz})`;

  const actions: AgentResult["actions"] = [];
  for (let i = 0; i < 12; i++) {
    const res = await anthropic.beta.messages.create({
      model: cfg.model!,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (res.stop_reason === "refusal") return { text: "요청을 처리할 수 없습니다.", actions };
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "pause_turn") continue;

    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || uses.length === 0) {
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: text || "완료", actions };
    }

    const results = await Promise.all(
      uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        try {
          const out = await mcpClient.callTool({ name: u.name, arguments: u.input as Record<string, unknown> });
          const content = (out.content as { type: string; text?: string }[])
            .filter((c) => c.type === "text")
            .map((c) => ({ type: "text" as const, text: c.text ?? "" }));
          actions.push({ tool: u.name, ok: !out.isError });
          return { type: "tool_result", tool_use_id: u.id, content, is_error: Boolean(out.isError) };
        } catch (e) {
          actions.push({ tool: u.name, ok: false });
          return { type: "tool_result", tool_use_id: u.id, content: String(e), is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { text: "작업이 너무 길어져 중단했습니다.", actions };
}
