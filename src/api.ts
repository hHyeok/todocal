import type { AppConfig, Label, Project, Task, TaskPatch } from "./types";

function passHeader(): Record<string, string> {
  try {
    const p = localStorage.getItem("todocal.pass");
    return p ? { "x-todocal-pass": p } : {};
  } catch {
    return {};
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...passHeader(), ...(init.headers ?? {}) },
  });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const j = await r.json();
      msg = j.error ?? j.error_tag ?? JSON.stringify(j);
    } catch {}
    throw new ApiError(r.status, msg);
  }
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const td = <T>(path: string, init?: RequestInit) => req<T>(`/api/td${path}`, init);
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

async function paginate<T>(path: string, key: "results" | "items" = "results"): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  const sep = path.includes("?") ? "&" : "?";
  do {
    const page: Record<string, unknown> = await td(`${path}${sep}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    out.push(...((page[key] as T[]) ?? []));
    cursor = (page.next_cursor as string | null) ?? null;
  } while (cursor);
  return out;
}

export const api = {
  config: () => req<AppConfig>("/api/config"),
  saveConfig: (body: { todoistToken?: string; anthropicKey?: string; model?: string }) =>
    req<{ ok: true }>("/api/config", post(body)),

  tasks: () => paginate<Task>("/tasks"),
  projects: () => paginate<Project>("/projects"),
  labels: () => paginate<Label>("/labels"),
  completedByDue: (since: string, until: string) =>
    paginate<Task>(
      `/tasks/completed/by_due_date?since=${encodeURIComponent(since + "T00:00:00Z")}&until=${encodeURIComponent(until + "T23:59:59Z")}`,
      "items",
    ),

  addTask: (body: TaskPatch & { content: string; project_id?: string; parent_id?: string }) =>
    td<Task>("/tasks", post(body)),
  quickAdd: (text: string) => td<Task>("/tasks/quick", post({ text })),
  updateTask: (id: string, body: TaskPatch) => td<Task>(`/tasks/${id}`, post(body)),
  moveTask: (id: string, body: { project_id?: string; parent_id?: string }) => td<Task>(`/tasks/${id}/move`, post(body)),
  closeTask: (id: string) => td<void>(`/tasks/${id}/close`, { method: "POST" }),
  reopenTask: (id: string) => td<void>(`/tasks/${id}/reopen`, { method: "POST" }),
  deleteTask: (id: string) => td<void>(`/tasks/${id}`, { method: "DELETE" }),

  // REST로 due를 바꾸면 반복 규칙이 날아가므로 Sync item_update로 날짜만 바꾼다
  reschedule: (task: Task, date: string) => {
    const due = task.due!;
    const time = (due.datetime ?? due.date).slice(10);
    return td<unknown>(
      "/sync",
      post({
        commands: [
          {
            type: "item_update",
            uuid: crypto.randomUUID(),
            args: {
              id: task.id,
              due: {
                date: date + time,
                string: due.string,
                is_recurring: due.is_recurring,
                ...(due.timezone ? { timezone: due.timezone } : {}),
                ...(due.lang ? { lang: due.lang } : {}),
              },
            },
          },
        ],
      }),
    );
  },

  agent: (history: { role: "user" | "assistant"; text: string }[]) =>
    req<{ text: string; actions: { tool: string; ok: boolean }[] }>(
      "/api/agent",
      post({ history, now: new Date().toString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    ),
};
