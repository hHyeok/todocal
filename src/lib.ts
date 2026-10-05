import { format } from "date-fns";
import type { Task } from "./types";

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/** due 를 로컬 날짜 키로. 고정 시간대(Z 접미) datetime 은 로컬로 변환해야 날짜가 맞다. */
export function dueKey(t: Task): string | null {
  if (!t.due) return null;
  const raw = t.due.datetime ?? t.due.date;
  if (/[zZ]|[+-]\d\d:\d\d$/.test(raw)) return dayKey(new Date(raw));
  return raw.slice(0, 10);
}

/** "HH:mm" 또는 null */
export function dueTime(t: Task): string | null {
  if (!t.due) return null;
  const raw = t.due.datetime ?? t.due.date;
  if (raw.length <= 10) return null;
  if (/[zZ]|[+-]\d\d:\d\d$/.test(raw)) return format(new Date(raw), "HH:mm");
  return raw.slice(11, 16);
}

export function endTime(t: Task): string | null {
  const start = dueTime(t);
  if (!start || !t.duration || t.duration.unit !== "minute") return null;
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + t.duration.amount;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Todoist 색 이름 → hex (공식 팔레트)
export const COLORS: Record<string, string> = {
  berry_red: "#b8255f",
  red: "#db4035",
  orange: "#ff9933",
  yellow: "#fad000",
  olive_green: "#afb83b",
  lime_green: "#7ecc49",
  green: "#299438",
  mint_green: "#6accbc",
  teal: "#158fad",
  sky_blue: "#14aaf5",
  light_blue: "#96c3eb",
  blue: "#4073ff",
  grape: "#884dff",
  violet: "#af38eb",
  lavender: "#eb96eb",
  magenta: "#e05194",
  salmon: "#ff8d85",
  charcoal: "#808080",
  grey: "#b8b8b8",
  taupe: "#ccac93",
};
export const colorOf = (name?: string) => (name && COLORS[name]) || "#b8b8b8";

// API priority 4 가 앱의 p1
export const PRIORITY_COLOR: Record<number, string> = { 4: "#d1453b", 3: "#eb8909", 2: "#246fe0", 1: "transparent" };
export const PRIORITY_LABEL: Record<number, string> = { 4: "P1", 3: "P2", 2: "P3", 1: "P4" };

export function sortTasks(a: Task, b: Task) {
  const ta = dueTime(a) ?? "99";
  const tb = dueTime(b) ?? "99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.child_order - b.child_order;
}

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`todocal.${key}`);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`todocal.${key}`, JSON.stringify(value));
  } catch {}
}
