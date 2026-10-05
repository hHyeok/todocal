import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api } from "./api";
import { dueTime } from "./lib";
import type { Task, TaskPatch } from "./types";

export const keys = {
  config: ["config"] as const,
  tasks: ["tasks"] as const,
  projects: ["projects"] as const,
  labels: ["labels"] as const,
  completed: (since: string, until: string) => ["completed", since, until] as const,
};

export const useConfig = () => useQuery({ queryKey: keys.config, queryFn: api.config });

export const useTasks = (enabled: boolean) =>
  useQuery({ queryKey: keys.tasks, queryFn: api.tasks, enabled, refetchInterval: 60_000 });
export const useProjects = (enabled: boolean) =>
  useQuery({ queryKey: keys.projects, queryFn: api.projects, enabled, staleTime: 5 * 60_000 });
export const useLabels = (enabled: boolean) =>
  useQuery({ queryKey: keys.labels, queryFn: api.labels, enabled, staleTime: 5 * 60_000 });
export const useCompleted = (since: string, until: string, enabled: boolean) =>
  useQuery({ queryKey: keys.completed(since, until), queryFn: () => api.completedByDue(since, until), enabled });

// ---------- 토스트 ----------
export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  error?: boolean;
}
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let tid = 0;
export function toast(text: string, opts: Omit<Toast, "id" | "text"> = {}) {
  const t = { id: ++tid, text, ...opts };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => dismiss(t.id), opts.action ? 6000 : 3000);
}
export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
export const useToasts = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => toasts,
  );

// ---------- 변경 ----------
function patchTasks(qc: QueryClient, fn: (tasks: Task[]) => Task[]) {
  const prev = qc.getQueryData<Task[]>(keys.tasks);
  if (prev) qc.setQueryData(keys.tasks, fn(prev));
  return prev;
}

function useTaskMutation<V>(
  mutationFn: (v: V) => Promise<unknown>,
  optimistic: (tasks: Task[], v: V) => Task[],
  opts: { onDone?: (v: V) => void; errorText?: string } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      return { prev: patchTasks(qc, (t) => optimistic(t, v)) };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.tasks, ctx.prev);
      toast(`${opts.errorText ?? "실패했습니다"}: ${e instanceof Error ? e.message : e}`, { error: true });
    },
    onSuccess: (_r, v) => opts.onDone?.(v),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.tasks });
      qc.invalidateQueries({ queryKey: ["completed"] });
    },
  });
}

export function useComplete() {
  const reopen = useReopen();
  return useTaskMutation(
    (t: Task) => api.closeTask(t.id),
    // 반복 할 일은 서버가 다음 날짜로 옮기므로 낙관적으로 지우지 않는다
    (tasks, t) => (t.due?.is_recurring ? tasks : tasks.filter((x) => x.id !== t.id && x.parent_id !== t.id)),
    {
      onDone: (t) =>
        toast(t.due?.is_recurring ? `"${t.content}" 완료 · 다음 반복으로` : `"${t.content}" 완료`, {
          action: t.due?.is_recurring ? undefined : { label: "실행 취소", run: () => reopen.mutate(t) },
        }),
    },
  );
}

export function useReopen() {
  return useTaskMutation(
    (t: Task) => api.reopenTask(t.id),
    (tasks, t) => [...tasks, { ...t, checked: false, completed_at: null }],
  );
}

export function useUpdate() {
  return useTaskMutation(
    ({ task, patch }: { task: Task; patch: TaskPatch }) => api.updateTask(task.id, patch),
    (tasks, { task, patch }) =>
      tasks.map((x) =>
        x.id === task.id
          ? {
              ...x,
              ...(patch.content != null && { content: patch.content }),
              ...(patch.description != null && { description: patch.description }),
              ...(patch.labels && { labels: patch.labels }),
              ...(patch.priority && { priority: patch.priority }),
            }
          : x,
      ),
  );
}

export function useMove() {
  return useTaskMutation(
    ({ task, projectId }: { task: Task; projectId: string }) => api.moveTask(task.id, { project_id: projectId }),
    (tasks, { task, projectId }) => tasks.map((x) => (x.id === task.id ? { ...x, project_id: projectId } : x)),
  );
}

/** 날짜 이동. 기존 due가 있으면 반복·시간을 유지한다. date=null 이면 날짜 제거. */
export function useReschedule() {
  return useTaskMutation(
    async ({ task, date }: { task: Task; date: string | null }) => {
      if (date === null) return api.updateTask(task.id, { due_string: "no date" });
      if (!task.due) return api.updateTask(task.id, { due_date: date });
      if (!task.due.is_recurring) {
        const time = dueTime(task);
        return api.updateTask(task.id, time ? { due_datetime: `${date}T${time}:00` } : { due_date: date });
      }
      const res = (await api.reschedule(task, date)) as { sync_status?: Record<string, unknown> };
      const bad = Object.values(res?.sync_status ?? {}).find((s) => s !== "ok");
      if (bad) throw new Error(JSON.stringify(bad));
    },
    (tasks, { task, date }) =>
      tasks.map((x) => {
        if (x.id !== task.id) return x;
        if (date === null) return { ...x, due: null };
        const time = x.due ? (x.due.datetime ?? x.due.date).slice(10) : "";
        return {
          ...x,
          due: x.due
            ? { ...x.due, date: date + time, datetime: x.due.datetime ? date + time : x.due.datetime }
            : { date, string: date, is_recurring: false },
        };
      }),
    { errorText: "일정 변경 실패" },
  );
}

export function useDelete() {
  return useTaskMutation(
    (t: Task) => api.deleteTask(t.id),
    (tasks, t) => tasks.filter((x) => x.id !== t.id && x.parent_id !== t.id),
    { onDone: (t) => toast(`"${t.content}" 삭제됨`) },
  );
}

export function useAdd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.addTask,
    onSuccess: (task) => {
      patchTasks(qc, (t) => [...t, task]);
      qc.invalidateQueries({ queryKey: keys.tasks });
    },
    onError: (e) => toast(`추가 실패: ${e instanceof Error ? e.message : e}`, { error: true }),
  });
}
