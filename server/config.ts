import fs from "node:fs";
import path from "node:path";

export interface Config {
  todoistToken?: string;
  anthropicKey?: string;
  model?: string;
}

const DATA_DIR = path.resolve(process.env.TODOCAL_DATA ?? ".data");
const FILE = path.join(DATA_DIR, "config.json");

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
    model: fromFile.model || process.env.TODOCAL_MODEL || "claude-opus-5",
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
