process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { detectAgy, loadConfig } from "./config.js";

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

async function runAgentClaude(
  history: AgentTurn[],
  now: string,
  tz: string,
  cfg: ReturnType<typeof loadConfig>,
  mcpClient: Client,
  tools: Anthropic.Tool[],
): Promise<AgentResult> {
  const anthropic = new Anthropic({ apiKey: cfg.anthropicKey });
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.text }));
  const last = messages[messages.length - 1];
  last.content = `${last.content}\n\n(현재 시각: ${now}, 시간대: ${tz})`;

  const actions: AgentResult["actions"] = [];
  for (let i = 0; i < 12; i++) {
    const res = await anthropic.beta.messages.create({
      model: cfg.model || "claude-opus-5",
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

export interface TodoistProject {
  id: string;
  name: string;
  is_inbox_project?: boolean;
}

let cachedProjects: { token: string; projects: TodoistProject[]; expiry: number } | null = null;

export async function getProjects(token: string): Promise<TodoistProject[]> {
  const now = Date.now();
  if (cachedProjects && cachedProjects.token === token && cachedProjects.expiry > now) {
    return cachedProjects.projects;
  }
  try {
    const res = await fetch("https://api.todoist.com/api/v1/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const list: TodoistProject[] = (Array.isArray(data) ? data : data.results || []).map((p: any) => ({
      id: String(p.id),
      name: String(p.name),
      is_inbox_project: Boolean(p.is_inbox_project || p.inbox_project),
    }));
    cachedProjects = { token, projects: list, expiry: now + 60_000 };
    return list;
  } catch (err) {
    console.warn("[getProjects error]", err);
    return [];
  }
}

export function resolveProjectId(
  rawProject: unknown,
  content: string,
  projects: TodoistProject[],
): string | undefined {
  if (typeof rawProject === "string" && rawProject.trim()) {
    const pStr = rawProject.trim();
    const pStrLower = pStr.toLowerCase();
    // 1. 정확한 ID 일치
    const byId = projects.find((p) => p.id === pStr);
    if (byId) return byId.id;
    // 2. 정확한 이름 일치
    const byName = projects.find((p) => p.name.toLowerCase() === pStrLower);
    if (byName) return byName.id;
    // 3. 부분 일치 (예: "회사일" -> "회사", "공부하기" -> "공부", "회사" -> "회사")
    const byPartial = projects.find(
      (p) => !p.is_inbox_project && (pStrLower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(pStrLower)),
    );
    if (byPartial) return byPartial.id;
  }

  // 4. 모델이 projectId를 명시하지 않은 경우, 작업 내용(content)에서 프로젝트 키워드 매핑
  if (content && typeof content === "string") {
    const lower = content.toLowerCase();
    for (const p of projects) {
      if (p.is_inbox_project) continue;
      if (lower.includes(p.name.toLowerCase())) {
        return p.id;
      }
    }
    // 동의어 매핑
    if (lower.includes("회사") || lower.includes("업무") || lower.includes("출근") || lower.includes("직장") || lower.includes("회의") || lower.includes("보고서")) {
      const companyProj = projects.find((p) => p.name.includes("회사"));
      if (companyProj) return companyProj.id;
    }
    if (lower.includes("공부") || lower.includes("과제") || lower.includes("강의") || lower.includes("시험") || lower.includes("학습")) {
      const studyProj = projects.find((p) => p.name.includes("공부"));
      if (studyProj) return studyProj.id;
    }
    if (lower.includes("개발") || lower.includes("코딩") || lower.includes("배포") || lower.includes("깃") || lower.includes("버그")) {
      const devProj = projects.find((p) => p.name.includes("개발"));
      if (devProj) return devProj.id;
    }
    if (lower.includes("개인") || lower.includes("병원") || lower.includes("치과") || lower.includes("장보기") || lower.includes("청소") || lower.includes("집안일")) {
      const personalProj = projects.find((p) => p.name.includes("개인"));
      if (personalProj) return personalProj.id;
    }
  }

  return undefined;
}

function normalizeMcpArgs(tool: string, rawArgs: Record<string, unknown> = {}): Record<string, unknown> {
  const args = { ...rawArgs };
  if (tool === "add-tasks") {
    let rawTasks = args.tasks;
    if (!Array.isArray(rawTasks)) {
      rawTasks = [args];
    }
    const tasks = (rawTasks as any[]).map((t: any) => {
      const p = t.priority;
      let priorityStr: "p1" | "p2" | "p3" | "p4" | undefined;
      if (typeof p === "string" && /^p[1-4]$/i.test(p)) {
        priorityStr = p.toLowerCase() as any;
      } else if (typeof p === "number") {
        if (p === 4) priorityStr = "p1";
        else if (p === 3) priorityStr = "p2";
        else if (p === 2) priorityStr = "p3";
        else priorityStr = "p4";
      }
      const due = t.dueString || t.due_string || t.dueDate || t.due_date || t.due_datetime || t.due;
      const proj = t.projectId || t.project_id || t.projectName || t.project || t.category;
      return {
        content: String(t.content || t.text || t.name || "새 작업"),
        ...(due ? { dueString: String(due) } : {}),
        ...(priorityStr ? { priority: priorityStr } : {}),
        ...(proj ? { projectId: String(proj) } : {}),
        ...(Array.isArray(t.labels) ? { labels: t.labels } : {}),
      };
    });
    return { tasks };
  }

  if (tool === "complete-tasks") {
    const rawIds = args.ids || args.task_ids || args.taskIds || (args.id ? [args.id] : []);
    const ids = (Array.isArray(rawIds) ? rawIds : [rawIds]).map(String);
    return { ids };
  }

  if (tool === "reschedule-tasks") {
    let rawTasks = args.tasks;
    if (!Array.isArray(rawTasks) && (args.id || args.task_id)) {
      rawTasks = [{ id: args.id || args.task_id, date: args.date || args.due_date || args.due_string || args.dueString }];
    }
    if (Array.isArray(rawTasks)) {
      return {
        tasks: rawTasks.map((t: any) => ({
          id: String(t.id || t.task_id),
          date: String(t.date || t.due_date || t.due_string || t.dueString),
        })),
      };
    }
  }

  return args;
}

async function executeAction(
  tool: string,
  args: Record<string, unknown>,
  token: string,
  projects: TodoistProject[],
  mcpClient?: Client,
): Promise<boolean> {
  const normArgs = normalizeMcpArgs(tool, args);

  // 1. MCP 클라이언트가 있는 경우에만 호출 시도
  if (mcpClient) {
    try {
      const out = await mcpClient.callTool({ name: tool, arguments: normArgs });
      if (!out.isError) return true;
      console.warn(`[MCP Tool ${tool} Warning]`, JSON.stringify(out.content));
    } catch (err) {
      console.warn(`[MCP Tool ${tool} Error]`, err);
    }
  }

  // 2. Todoist REST API 직접 호출 (무프로세스 / 빠른 응답)
  try {
    if (tool === "add-tasks") {
      const tasks = (normArgs.tasks as any[]) || [];
      for (const t of tasks) {
        const rawProj = t.projectId || t.project_id || t.projectName || t.project || t.category;
        const resolvedProjId = resolveProjectId(rawProj, t.content, projects);
        const body: Record<string, unknown> = {
          content: t.content,
          ...(t.dueString ? { due_string: t.dueString } : {}),
          ...(t.dueDate ? { due_date: t.dueDate } : {}),
          ...(t.priority ? { priority: t.priority === "p1" ? 4 : t.priority === "p2" ? 3 : t.priority === "p3" ? 2 : 1 } : {}),
          ...(resolvedProjId ? { project_id: resolvedProjId } : {}),
          ...(t.labels ? { labels: t.labels } : {}),
        };
        const res = await fetch("https://api.todoist.com/api/v1/tasks", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          console.error(`[REST add-tasks error ${res.status}]`, await res.text());
          return false;
        }
      }
      return true;
    }

    if (tool === "complete-tasks") {
      const ids = (normArgs.ids as string[]) || [];
      for (const id of ids) {
        const res = await fetch(`https://api.todoist.com/api/v1/tasks/${id}/close`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return false;
      }
      return true;
    }

    if (tool === "uncomplete-tasks") {
      const ids = (normArgs.ids as string[]) || [];
      for (const id of ids) {
        const res = await fetch(`https://api.todoist.com/api/v1/tasks/${id}/reopen`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return false;
      }
      return true;
    }

    if (tool === "reschedule-tasks" || tool === "update-tasks") {
      const tasks = (normArgs.tasks as any[]) || [];
      for (const t of tasks) {
        const id = t.id || t.taskId;
        if (!id) continue;
        const body: Record<string, unknown> = {};
        if (t.content) body.content = t.content;
        if (t.dueString) body.due_string = t.dueString;
        if (t.dueDate || t.date) body.due_date = t.dueDate || t.date;
        if (t.priority) body.priority = t.priority === "p1" ? 4 : t.priority === "p2" ? 3 : t.priority === "p3" ? 2 : 1;
        if (t.labels) body.labels = t.labels;
        if (Object.keys(body).length > 0) {
          const res = await fetch(`https://api.todoist.com/api/v1/tasks/${id}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) return false;
        }

        const rawProj = t.projectId || t.project_id || t.projectName || t.project || t.category;
        const resolvedProjId = resolveProjectId(rawProj, t.content || "", projects);
        if (resolvedProjId) {
          await fetch(`https://api.todoist.com/api/v1/tasks/${id}/move`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: resolvedProjId }),
          }).catch((err) => console.warn("[move task error]", err));
        }
      }
      return true;
    }

    if (tool === "move-task" || tool === "move-tasks") {
      const tasks = (normArgs.tasks as any[]) || [{ id: args.id || args.task_id, projectId: args.projectId || args.project_id || args.projectName || args.project || args.category }];
      for (const t of tasks) {
        const id = t.id || t.taskId;
        if (!id) continue;
        const rawProj = t.projectId || t.project_id || t.projectName || t.project || t.category;
        const resolvedProjId = resolveProjectId(rawProj, "", projects);
        if (resolvedProjId) {
          const res = await fetch(`https://api.todoist.com/api/v1/tasks/${id}/move`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: resolvedProjId }),
          });
          if (!res.ok) return false;
        }
      }
      return true;
    }

    if (tool === "delete-object" || tool === "delete-task") {
      const id = (args.id || args.task_id || (normArgs.ids as string[])?.[0]) as string;
      if (id) {
        const res = await fetch(`https://api.todoist.com/api/v1/tasks/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return false;
      }
      return true;
    }
  } catch (e) {
    console.error("[REST Execution Exception]", e);
  }

  return false;
}

async function runAgentAgy(
  history: AgentTurn[],
  now: string,
  tz: string,
  cfg: ReturnType<typeof loadConfig>,
): Promise<AgentResult> {
  const agyPath = detectAgy();
  if (!agyPath) throw new Error("시스템에 agy (Antigravity CLI)가 설치되어 있지 않습니다.");

  const projects = await getProjects(cfg.todoistToken!);
  const projectListStr = projects.length > 0
    ? projects.map((p) => `- ${p.name}${p.is_inbox_project ? " (기본 Inbox)" : ""} (ID: ${p.id})`).join("\n")
    : "- Inbox (기본값)";

  const model = cfg.model || "gemini-3.8-flash-low";
  const userTurns = history.map((t) => `${t.role === "user" ? "사용자" : "비서"}: ${t.text}`).join("\n");
  const last = history[history.length - 1];

  const prompt = `너는 Todoist 캘린더 비서다. 사용자의 지시를 분석하여 실행할 도구(JSON 객체)와 간결한 한국어 답변을 생성하라.
현재 시각: ${now} (${tz})

[사용자의 프로젝트(카테고리) 목록]
${projectListStr}

[도구 포맷]
- 할 일 추가 (add-tasks): { "tasks": [{ "content": "작업명", "dueString": "자연어 날짜/시간", "priority": "p1"|"p2"|"p3"|"p4", "projectId": "프로젝트ID" }] }
- 완료 (complete-tasks): { "ids": ["작업ID"] }
- 변경 (reschedule-tasks 또는 update-tasks): { "tasks": [{ "id": "작업ID", "date": "YYYY-MM-DD", "projectId": "프로젝트ID" }] }
- 카테고리 이동 (move-task): { "id": "작업ID", "projectId": "프로젝트ID" }

[필수 규칙]
1. 프로젝트/카테고리 분류:
   - 사용자가 "회사", "회사일", "업무", "보고서", "출근", "회의", "직장" 등을 언급하거나 특정 카테고리가 연상되는 작업을 지시하면, 반드시 위 목록에서 가장 일치하는 프로젝트의 ID를 찾아 projectId에 지정하라!
   - "공부", "강의", "독서" 등은 '공부' 프로젝트, "개발", "코딩", "배포" 등은 '개발' 프로젝트, "개인", "병원", "집안일" 등은 '개인' 프로젝트의 ID를 projectId에 지정하라.
   - 특정 프로젝트 언급이 없으면 projectId를 생략하거나 기본 Inbox로 지정한다.
2. 할 일 명칭(content) 정제:
   - "추가해줘", "등록해줘", "해줘" 같은 어미는 제거하고 순수한 할 일 명칭만 간결하게 남긴다. (예: "오늘 회사일로 보고서 작성하기 추가해줘" -> content: "보고서 작성하기")
3. 출력 형식:
   - 마크다운 코드블록 없이 순수 JSON 객체 하나만 출력하라:
   {"actions":[{"tool":"add-tasks","args":{"tasks":[{"content":"보고서 작성하기","dueString":"오늘","priority":"p2","projectId":"${projects.find(p => p.name.includes("회사"))?.id || ""}"}]}}],"reply":"오늘 회사 프로젝트에 '보고서 작성하기' 일정을 추가했습니다."}

[대화 기록]
${userTurns}

[현재 지시]
${last ? last.text : ""}`;

  const isWin = process.platform === "win32";
  const silentRunCandidate = path.resolve("server/silent_run.exe");
  const csSource = path.resolve("server/silent_run.cs");
  const cscPath = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";

  if (isWin && !fs.existsSync(silentRunCandidate) && fs.existsSync(csSource) && fs.existsSync(cscPath)) {
    try {
      execFileSync(cscPath, ["/target:winexe", `/out:${silentRunCandidate}`, csSource], { windowsHide: true });
    } catch (e) {
      console.warn("[silent_run compile warning]", e);
    }
  }

  const useSilentRun = isWin && fs.existsSync(silentRunCandidate);
  const bin = useSilentRun ? silentRunCandidate : agyPath;
  const args = useSilentRun
    ? [agyPath, "-p", prompt, "--model", model, "--effort", "low", "--dangerously-skip-permissions", "--disable-slash-commands"]
    : ["-p", prompt, "--model", model, "--effort", "low", "--dangerously-skip-permissions", "--disable-slash-commands"];

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      bin,
      args,
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, out, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(out);
      },
    );
  });

  let parsed: { actions?: { tool: string; args: Record<string, unknown> }[]; reply?: string };
  try {
    let clean = stdout.trim();
    const jsonMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) clean = jsonMatch[1].trim();
    const startIdx = clean.indexOf("{");
    const endIdx = clean.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      clean = clean.slice(startIdx, endIdx + 1);
    }
    parsed = JSON.parse(clean);
  } catch {
    return { text: stdout.trim() || "응답을 처리하지 못했습니다.", actions: [] };
  }

  const actions: AgentResult["actions"] = [];
  if (Array.isArray(parsed.actions)) {
    for (const act of parsed.actions) {
      const ok = await executeAction(act.tool, act.args, cfg.todoistToken!, projects);
      actions.push({ tool: act.tool, ok });
    }
  }

  return {
    text: parsed.reply || (actions.length > 0 ? "작업을 완료했습니다." : stdout.trim()),
    actions,
  };
}

async function runAgentGemini(
  history: AgentTurn[],
  now: string,
  tz: string,
  cfg: ReturnType<typeof loadConfig>,
): Promise<AgentResult> {
  const model = cfg.model || "gemini-2.5-flash";
  const projects = await getProjects(cfg.todoistToken!);
  const projectListStr = projects.length > 0
    ? projects.map((p) => `- ${p.name}${p.is_inbox_project ? " (기본 Inbox)" : ""} (ID: ${p.id})`).join("\n")
    : "- Inbox (기본값)";

  const userTurns = history.map((t) => `${t.role === "user" ? "사용자" : "비서"}: ${t.text}`).join("\n");
  const last = history[history.length - 1];

  const prompt = `너는 Todoist 캘린더 앱 안의 비서다. 사용자의 지시를 Todoist 도구로 실행할 JSON 액션 목록과 간결한 한국어 답변을 생성하라.
현재 시각: ${now}, 시간대: ${tz}

[사용자의 프로젝트(카테고리) 목록]
${projectListStr}

- 할 일 추가: add-tasks { "tasks": [{ "content": "작업명", "dueString": "...", "priority": "p1"|"p2"|"p3"|"p4", "projectId": "프로젝트ID" }] }
- 완료: complete-tasks { "ids": ["..."] }
- 일정/프로젝트 변경: reschedule-tasks { "tasks": [{ "id": "...", "date": "YYYY-MM-DD", "projectId": "프로젝트ID" }] }
- 카테고리 매핑: 사용자가 "회사", "업무", "보고서" 등을 언급하면 반드시 '회사' 프로젝트의 ID를 projectId에 지정한다.
- 작업명 정제: "추가해줘" 등의 명령어는 빼고 실제 할 일만 작성한다 (예: "보고서 작성하기").
- 답은 한국어로 한두 줄. 무엇을 했는지만 간결하게 말한다.

[대화 기록]
${userTurns}

[현재 사용자 지시]
${last ? last.text : ""}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              actions: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    tool: { type: "STRING" },
                    args: { type: "OBJECT" },
                  },
                  required: ["tool", "args"],
                },
              },
              reply: { type: "STRING" },
            },
            required: ["actions", "reply"],
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const parsed = JSON.parse(rawText);

  const actions: AgentResult["actions"] = [];
  if (Array.isArray(parsed.actions)) {
    for (const act of parsed.actions) {
      const ok = await executeAction(act.tool, act.args, cfg.todoistToken!, projects);
      actions.push({ tool: act.tool, ok });
    }
  }

  return {
    text: parsed.reply || (actions.length > 0 ? "작업을 완료했습니다." : "완료"),
    actions,
  };
}

export async function runAgent(history: AgentTurn[], now: string, tz: string): Promise<AgentResult> {
  const cfg = loadConfig();
  if (!cfg.todoistToken) throw new Error("Todoist 토큰이 없습니다");

  const agyPath = detectAgy();
  let provider = cfg.aiProvider;
  if (!provider) {
    if (cfg.anthropicKey) provider = "claude";
    else if (agyPath) provider = "agy";
    else if (cfg.geminiKey) provider = "gemini";
  }

  if (provider === "agy") {
    return runAgentAgy(history, now, tz, cfg);
  }

  if (provider === "gemini" && cfg.geminiKey) {
    return runAgentGemini(history, now, tz, cfg);
  }

  if (cfg.anthropicKey) {
    const { client: mcpClient, tools } = await getMcp(cfg.todoistToken);
    return runAgentClaude(history, now, tz, cfg, mcpClient, tools);
  }

  if (agyPath) {
    return runAgentAgy(history, now, tz, cfg);
  }

  throw new Error("AI 설정이 되어 있지 않습니다 (Anthropic API 키 또는 agy 설치 필요)");
}
