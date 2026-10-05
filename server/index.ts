import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import fs from "node:fs";
import { runAgent, type AgentTurn } from "./agent.js";
import { loadConfig, saveConfig } from "./config.js";
import { mock } from "./mock.js";

const MOCK = process.env.TODOCAL_MOCK === "1";
const PORT = Number(process.env.PORT ?? 5180);
const HOST = process.env.HOST ?? "127.0.0.1";
const PASSCODE = process.env.TODOCAL_PASSCODE;

if (HOST !== "127.0.0.1" && HOST !== "localhost" && !PASSCODE) {
  // 프록시가 Todoist 전체 권한을 쥐고 있어서 외부 노출 시 잠금이 필수다
  console.error("HOST를 외부로 열려면 TODOCAL_PASSCODE를 설정하세요.");
  process.exit(1);
}

const app = new Hono();

app.use("/api/*", async (c, next) => {
  if (PASSCODE && c.req.header("x-todocal-pass") !== PASSCODE) return c.json({ error: "passcode" }, 401);
  await next();
});

app.get("/api/config", (c) => {
  const cfg = loadConfig();
  return c.json({
    hasTodoist: MOCK || Boolean(cfg.todoistToken),
    hasAnthropic: Boolean(cfg.anthropicKey),
    model: cfg.model,
    mock: MOCK,
  });
});

app.post("/api/config", async (c) => {
  const body = await c.req.json<{ todoistToken?: string; anthropicKey?: string; model?: string }>();
  if (body.todoistToken) {
    const r = await fetch("https://api.todoist.com/api/v1/projects?limit=1", {
      headers: { Authorization: `Bearer ${body.todoistToken}` },
    });
    if (!r.ok) return c.json({ error: "Todoist 토큰이 유효하지 않습니다" }, 400);
  }
  saveConfig(body);
  return c.json({ ok: true });
});

if (MOCK) app.route("/api/td", mock);
else
  app.all("/api/td/*", async (c) => {
    const { todoistToken } = loadConfig();
    if (!todoistToken) return c.json({ error: "Todoist 토큰이 없습니다" }, 401);
    const url = new URL(c.req.url);
    const target = "https://api.todoist.com/api/v1" + url.pathname.replace(/^\/api\/td/, "") + url.search;
    const hasBody = !["GET", "HEAD"].includes(c.req.method);
    const r = await fetch(target, {
      method: c.req.method,
      headers: {
        Authorization: `Bearer ${todoistToken}`,
        ...(hasBody ? { "Content-Type": c.req.header("content-type") ?? "application/json" } : {}),
      },
      body: hasBody ? await c.req.arrayBuffer() : undefined,
    });
    return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("content-type") ?? "application/json" } });
  });

app.post("/api/agent", async (c) => {
  const { history, now, tz } = await c.req.json<{ history: AgentTurn[]; now: string; tz: string }>();
  try {
    return c.json(await runAgent(history, now, tz));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

if (fs.existsSync("dist")) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`todocal → http://${HOST}:${info.port}${MOCK ? " (mock)" : ""}`);
});
