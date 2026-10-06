import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type AiProvider = "agy" | "claude" | "gemini";

export interface Config {
  todoistToken?: string;
  anthropicKey?: string;
  geminiKey?: string;
  aiProvider?: AiProvider;
  model?: string;
}

const DATA_DIR = path.resolve(process.env.TODOCAL_DATA ?? ".data");
const FILE = path.join(DATA_DIR, "config.json");

export function detectAgy(): string | null {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const defaultPath = path.join(localAppData, "agy", "bin", "agy.exe");
    if (fs.existsSync(defaultPath)) return defaultPath;
  }
  try {
    const out = execSync("where agy", { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" });
    const firstLine = out.split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch {}
  return null;
}

export function loadConfig(): Config {
  let fromFile: Config = {};
  try {
    fromFile = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    // 첫 실행이면 파일이 없다
  }
  return {
    todoistToken: fromFile.todoistToken || process.env.TODOIST_API_TOKEN,
    anthropicKey: fromFile.anthropicKey || process.env.ANTHROPIC_API_KEY,
    geminiKey: fromFile.geminiKey || process.env.GEMINI_API_KEY,
    aiProvider: fromFile.aiProvider || (process.env.TODOCAL_AI_PROVIDER as AiProvider | undefined),
    model: fromFile.model || process.env.TODOCAL_MODEL,
  };
}

export function saveConfig(patch: Partial<Config>) {
  let current: Config = {};
  try {
    current = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {}
  const next = { ...current, ...patch };
  for (const k of Object.keys(next) as (keyof Config)[]) if (next[k] === "") delete next[k];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}
