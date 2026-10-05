import { Hono } from "hono";

// Todoist API v1 의 일부를 흉내 내는 메모리 목업. UI 검증용이라 실제 API와 동작 차이가 있다.

type Due = { date: string; string: string; is_recurring: boolean; timezone?: string | null; lang?: string };
type Task = {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  labels: string[];
  priority: number;
  due: Due | null;
  deadline: { date: string } | null;
  duration: { amount: number; unit: string } | null;
  checked: boolean;
  child_order: number;
  day_order: number;
  added_at: string;
  completed_at: string | null;
  note_count: number;
};

let seq = 1000;
const nid = () => String(++seq);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

const projects = [
  { id: "p1", name: "Inbox", color: "grey", inbox_project: true, child_order: 0, is_favorite: false, parent_id: null },
  { id: "p2", name: "업무", color: "blue", inbox_project: false, child_order: 1, is_favorite: true, parent_id: null },
  { id: "p3", name: "운동", color: "green", inbox_project: false, child_order: 2, is_favorite: false, parent_id: null },
  { id: "p4", name: "공부", color: "violet", inbox_project: false, child_order: 3, is_favorite: false, parent_id: null },
];
const labels = [
  { id: "l1", name: "집중", color: "red", order: 1, is_favorite: false },
  { id: "l2", name: "짧게", color: "teal", order: 2, is_favorite: false },
];

const tasks: Task[] = [];
function mk(content: string, project_id: string, date: string | null, extra: Partial<Task> = {}): Task {
  const t: Task = {
    id: nid(),
    content,
    description: "",
    project_id,
    section_id: null,
    parent_id: null,
    labels: [],
    priority: 1,
    due: date ? { date, string: date, is_recurring: false, lang: "ko" } : null,
    deadline: null,
    duration: null,
    checked: false,
    child_order: tasks.length,
    day_order: -1,
    added_at: new Date().toISOString(),
    completed_at: null,
    note_count: 0,
    ...extra,
  };
  tasks.push(t);
  return t;
}
mk("주간 보고서 작성", "p2", addDays(0), { priority: 4, labels: ["집중"] });
mk("디자인 리뷰 미팅", "p2", `${addDays(0)}T15:00:00`, { duration: { amount: 60, unit: "minute" } });
const parent = mk("스프린트 정리", "p2", addDays(1));
mk("티켓 상태 업데이트", "p2", addDays(1), { parent_id: parent.id });
mk("헬스 하체", "p3", addDays(0), { due: { date: addDays(0), string: "every day", is_recurring: true, lang: "en" } });
mk("러닝 5km", "p3", addDays(2));
mk("영단어 30개", "p4", addDays(0), { labels: ["짧게"] });
mk("알고리즘 2문제", "p4", addDays(-2), { priority: 3 });
mk("장보기", "p1", addDays(-1));
mk("책 반납", "p1", null);
mk("아이디어 메모 정리", "p1", null, { priority: 2 });
mk("치과 예약", "p1", addDays(5));
mk("이력서 업데이트", "p2", addDays(9), { deadline: { date: addDays(12) } });
const done = mk("어제 끝낸 일", "p4", addDays(-1));
done.checked = true;
done.completed_at = new Date().toISOString();

function applyUpdate(t: Task, b: Record<string, any>) {
  for (const k of ["content", "description", "labels", "priority", "project_id", "section_id", "parent_id"]) {
    if (k in b) (t as any)[k] = b[k];
  }
  if ("due_string" in b) {
    const s = String(b.due_string);
    if (s === "no date" || s === "") t.due = null;
    else {
      const recurring = /^(every|매)/i.test(s);
      t.due = { date: t.due?.date ?? addDays(0), string: s, is_recurring: recurring, lang: "ko" };
    }
  }
  if ("due_date" in b) t.due = { date: b.due_date, string: b.due_date, is_recurring: false, lang: "ko" };
  if ("due_datetime" in b) t.due = { date: String(b.due_datetime).replace("Z", ""), string: b.due_datetime, is_recurring: false };
  if ("duration" in b) t.duration = b.duration ? { amount: Number(b.duration), unit: b.duration_unit ?? "minute" } : null;
  if ("deadline_date" in b) t.deadline = b.deadline_date ? { date: b.deadline_date } : null;
}

export const mock = new Hono();

mock.get("/tasks", (c) => c.json({ results: tasks.filter((t) => !t.checked), next_cursor: null }));
mock.get("/projects", (c) => c.json({ results: projects, next_cursor: null }));
mock.get("/labels", (c) => c.json({ results: labels, next_cursor: null }));
mock.get("/sections", (c) => c.json({ results: [], next_cursor: null }));
mock.get("/tasks/completed/by_due_date", (c) => {
  const since = c.req.query("since")!.slice(0, 10);
  const until = c.req.query("until")!.slice(0, 10);
  const items = tasks.filter((t) => t.checked && t.due && t.due.date.slice(0, 10) >= since && t.due.date.slice(0, 10) <= until);
  return c.json({ items, next_cursor: null });
});
mock.post("/tasks", async (c) => {
  const b = await c.req.json();
  const t = mk(b.content, b.project_id ?? "p1", null);
  applyUpdate(t, b);
  return c.json(t);
});
mock.post("/tasks/quick", async (c) => {
  const { text } = await c.req.json();
  return c.json(mk(String(text), "p1", addDays(0)));
});
mock.post("/tasks/:id/close", (c) => {
  const t = tasks.find((x) => x.id === c.req.param("id"));
  if (!t) return c.json({ error: "not found" }, 404);
  if (t.due?.is_recurring) {
    const d = new Date(t.due.date.slice(0, 10) + "T00:00:00");
    d.setDate(d.getDate() + 1);
    t.due.date = iso(d) + t.due.date.slice(10);
  } else {
    t.checked = true;
    t.completed_at = new Date().toISOString();
  }
  return c.body(null, 204);
});
mock.post("/tasks/:id/reopen", (c) => {
  const t = tasks.find((x) => x.id === c.req.param("id"));
  if (t) {
    t.checked = false;
    t.completed_at = null;
  }
  return c.body(null, 204);
});
mock.post("/tasks/:id/move", async (c) => {
  const t = tasks.find((x) => x.id === c.req.param("id"));
  if (t) applyUpdate(t, await c.req.json());
  return c.json(t);
});
mock.post("/tasks/:id", async (c) => {
  const t = tasks.find((x) => x.id === c.req.param("id"));
  if (!t) return c.json({ error: "not found" }, 404);
  applyUpdate(t, await c.req.json());
  return c.json(t);
});
mock.delete("/tasks/:id", (c) => {
  const i = tasks.findIndex((x) => x.id === c.req.param("id"));
  if (i >= 0) tasks.splice(i, 1);
  return c.body(null, 204);
});
mock.post("/sync", async (c) => {
  const { commands } = await c.req.json();
  const status: Record<string, string> = {};
  for (const cmd of commands) {
    if (cmd.type === "item_update") {
      const t = tasks.find((x) => x.id === cmd.args.id);
      if (t && cmd.args.due) t.due = { ...t.due, ...cmd.args.due };
    }
    status[cmd.uuid] = "ok";
  }
  return c.json({ sync_status: status });
});
