import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { addDays, addMonths, addWeeks, format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, visibleRange, type DayStat } from "./components/Calendar";
import { CommandBar, type CommandBarHandle } from "./components/CommandBar";
import { DayPanel } from "./components/DayPanel";
import { Settings, type Prefs } from "./components/Settings";
import { TaskItem, stripMd } from "./components/TaskItem";
import { TaskSheet } from "./components/TaskSheet";
import {
  dismiss,
  toast,
  useCompleted,
  useComplete,
  useConfig,
  useLabels,
  useMove,
  useProjects,
  useReschedule,
  useTasks,
  useToasts,
} from "./data";
import { colorOf, dayKey, dueKey, loadPref, savePref, sortTasks } from "./lib";
import { useNotificationScheduler } from "./notifications";
import type { Task } from "./types";

const DEFAULT_PREFS: Prefs = {
  weekStartsOn: 1,
  theme: "system",
  hidden: [],
  showPreviews: true,
  notificationsEnabled: true,
  defaultReminderMinutes: 10,
  notificationSound: true,
};

export function App() {
  const config = useConfig();
  const ready = Boolean(config.data?.hasTodoist);
  const tasksQ = useTasks(ready);
  const projectsQ = useProjects(ready);
  const labelsQ = useLabels(ready);

  const [prefs, setPrefsState] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...loadPref("prefs", {}) }));
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    savePref("prefs", p);
  };

  useNotificationScheduler(
    tasksQ.data,
    prefs.notificationsEnabled ?? true,
    prefs.defaultReminderMinutes ?? 10,
    prefs.notificationSound ?? true,
  );
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<"month" | "week">(() => loadPref("view", "month"));
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [dragging, setDragging] = useState<Task | null>(null);
  const cmd = useRef<CommandBarHandle>(null);

  // 자정을 넘기면 "오늘"을 갱신한다
  useEffect(() => {
    const t = setInterval(() => setToday(dayKey(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  const { start, end } = visibleRange(cursor, view, prefs.weekStartsOn);
  const range = { since: dayKey(start), until: dayKey(end) };
  const completedQ = useCompleted(range.since, range.until, ready);
  const selCompletedQ = useCompleted(selected, selected, ready && (selected < range.since || selected > range.until));

  const projects = useMemo(
    () =>
      [...(projectsQ.data ?? [])]
        .filter((p) => !prefs.hidden.includes(p.id))
        .sort((a, b) => Number(b.inbox_project ?? 0) - Number(a.inbox_project ?? 0) || a.child_order - b.child_order),
    [projectsQ.data, prefs.hidden],
  );
  const projectMap = useMemo(() => new Map((projectsQ.data ?? []).map((p) => [p.id, p])), [projectsQ.data]);
  const visible = (t: Task) => !prefs.hidden.includes(t.project_id);
  const allTasks = tasksQ.data ?? [];

  const stats = useMemo(() => {
    const m = new Map<string, DayStat>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { open: [], done: [] }), m.get(k)!);
    for (const t of allTasks) {
      const k = dueKey(t);
      if (k && visible(t)) get(k).open.push(t);
    }
    const seen = new Set<string>();
    for (const t of [...(completedQ.data ?? []), ...(selCompletedQ.data ?? [])]) {
      const k = dueKey(t);
      if (k && visible(t) && !seen.has(t.id)) {
        seen.add(t.id);
        get(k).done.push(t);
      }
    }
    for (const s of m.values()) s.open.sort(sortTasks);
    return m;
  }, [allTasks, completedQ.data, selCompletedQ.data, prefs.hidden]);

  const overdue = useMemo(
    () => allTasks.filter((t) => visible(t) && !t.parent_id && (dueKey(t) ?? "9") < today),
    [allTasks, today, prefs.hidden],
  );
  const noDate = useMemo(() => allTasks.filter((t) => visible(t) && !t.due && !t.parent_id), [allTasks, prefs.hidden]);
  const monthDone = useMemo(() => {
    let done = 0;
    let perfect = 0;
    for (const [k, s] of stats) {
      if (k < range.since || k > range.until || k > today) continue;
      done += s.done.length;
      if (s.done.length > 0 && s.open.length === 0) perfect++;
    }
    return { done, perfect };
  }, [stats, range.since, range.until, today]);

  const select = (k: string) => {
    setSelected(k);
    setCursor(parseISO(k));
  };
  const step = (dir: -1 | 1) => setCursor((c) => (view === "month" ? addMonths(c, dir) : addWeeks(c, dir)));
  const setViewP = (v: "month" | "week") => {
    setView(v);
    savePref("view", v);
    setCursor(parseISO(selected));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        cmd.current?.focus();
        return;
      }
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || openId || settingsOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") select(dayKey(addDays(parseISO(selected), -1)));
      else if (e.key === "ArrowRight") select(dayKey(addDays(parseISO(selected), 1)));
      else if (e.key === "ArrowUp" && view === "month") select(dayKey(addDays(parseISO(selected), -7)));
      else if (e.key === "ArrowDown" && view === "month") select(dayKey(addDays(parseISO(selected), 7)));
      else if (e.key.toLowerCase() === "t") select(today);
      else if (e.key.toLowerCase() === "w") setViewP(view === "month" ? "week" : "month");
      else if (e.key.toLowerCase() === "i") setInboxOpen((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const reschedule = useReschedule();
  const complete = useComplete();
  const move = useMove();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = e.active.data.current as Task | undefined;
    const over = e.over?.id ? String(e.over.id) : null;
    if (!task || !over) return;
    if (over === "nodate") {
      if (task.due) reschedule.mutate({ task, date: null });
    } else if (over.startsWith("day:")) {
      const date = over.slice(4);
      if (dueKey(task) !== date) reschedule.mutate({ task, date });
    } else if (over.startsWith("project:")) {
      const [, targetProjectId, targetDay] = over.split(":");
      const targetProj = projectMap.get(targetProjectId);
      const projName = targetProj ? (targetProj.inbox_project ? "Inbox" : targetProj.name) : "프로젝트";

      // 1. 카테고리(프로젝트) 변경
      if (task.project_id !== targetProjectId) {
        move.mutate({ task, projectId: targetProjectId });
        toast(`"${stripMd(task.content)}" → ${projName}`);
      }
      // 2. 다른 날짜 또는 날짜 없음에서 끌어온 경우 해당 날짜로 이동
      if (targetDay && dueKey(task) !== targetDay) {
        reschedule.mutate({ task, date: targetDay });
      }
    }
  };

  if (config.isLoading) return <div className="splash">불러오는 중…</div>;
  if (config.isError)
    return (
      <div className="splash">
        <p>서버에 연결할 수 없습니다. <code>todocal.bat</code> 으로 서버를 켜세요.</p>
        <button
          className="primary"
          style={{ marginTop: "14px", padding: "8px 16px", borderRadius: "8px", cursor: "pointer" }}
          onClick={() => config.refetch()}
        >
          다시 연결 시도
        </button>
      </div>
    );
  if (!ready)
    return (
      <>
        <Settings config={config.data!} prefs={prefs} projects={[]} onPrefs={setPrefs} onboarding />
        <Toasts />
      </>
    );

  const sel = stats.get(selected) ?? { open: [], done: [] };
  const openTask = openId ? allTasks.find((t) => t.id === openId) : undefined;
  const title = view === "month" ? format(cursor, "yyyy년 M월") : `${format(start, "M월 d일")} – ${format(end, "M월 d일")}`;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragging((e.active.data.current as Task) ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className={`app${prefs.showPreviews ? " previews-on" : ""}`}>
        <header className="top">
          <div className="title">
            <h1>{title}</h1>
            <div className="nav">
              <button className="ghost icon" aria-label="이전" onClick={() => step(-1)}>
                ‹
              </button>
              <button className="ghost small" onClick={() => select(today)}>
                오늘
              </button>
              <button className="ghost icon" aria-label="다음" onClick={() => step(1)}>
                ›
              </button>
            </div>
          </div>
          <div className="tools">
            <span className="month-stat" title="이 기간 완료 / 다 끝낸 날">
              ✓ {monthDone.done} · 🌟 {monthDone.perfect}
            </span>
            <div className="seg">
              <button aria-pressed={view === "month"} onClick={() => setViewP("month")}>
                월
              </button>
              <button aria-pressed={view === "week"} onClick={() => setViewP("week")}>
                주
              </button>
            </div>
            <button className="ghost small" aria-pressed={inboxOpen} onClick={() => setInboxOpen((v) => !v)}>
              날짜 없음 {noDate.length > 0 && <b className="pill">{noDate.length}</b>}
            </button>
            <button
              className="ghost icon"
              aria-label="새로고침"
              onClick={() => {
                tasksQ.refetch();
                completedQ.refetch();
                projectsQ.refetch();
              }}
            >
              <span className={tasksQ.isFetching ? "spin-slow" : ""}>↻</span>
            </button>
            <button className="ghost icon" aria-label="설정" onClick={() => setSettingsOpen(true)}>
              ⚙
            </button>
          </div>
        </header>

        {config.data?.mock && <div className="mock-banner">목업 모드 — 실제 Todoist와 연결되지 않음</div>}

        <main className="layout">
          <div className="left">
            <Calendar
              cursor={cursor}
              view={view}
              selected={selected}
              today={today}
              weekStartsOn={prefs.weekStartsOn}
              stats={stats}
              projects={projectMap}
              onSelect={select}
              onSwipe={step}
            />
            {tasksQ.isError && <p className="err">할 일을 불러오지 못했습니다: {String(tasksQ.error)}</p>}
          </div>
          <div className="right">
            <DayPanel
              day={selected}
              today={today}
              open={sel.open}
              done={sel.done}
              overdue={overdue}
              projects={projects}
              onOpen={(t) => setOpenId(t.id)}
              draggingTask={dragging}
            />
          </div>
          {inboxOpen && (
            <NoDateDrawer
              tasks={noDate}
              projectColor={(id) => colorOf(projectMap.get(id)?.color)}
              onToggle={(t) => complete.mutate(t)}
              onOpen={(t) => setOpenId(t.id)}
              onClose={() => setInboxOpen(false)}
              onToDay={(t) => reschedule.mutate({ task: t, date: selected })}
              selected={selected}
            />
          )}
        </main>

        <CommandBar
          ref={cmd}
          aiEnabled={Boolean(config.data?.hasAi)}
          aiProvider={config.data?.aiProvider}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && <div className="drag-ghost">{stripMd(dragging.content)}</div>}
      </DragOverlay>

      {openTask && (
        <TaskSheet
          task={openTask}
          allTasks={allTasks}
          projects={projectsQ.data ?? []}
          labels={labelsQ.data ?? []}
          onClose={() => setOpenId(null)}
          onOpen={(t) => setOpenId(t.id)}
        />
      )}
      {settingsOpen && (
        <Settings
          config={config.data!}
          prefs={prefs}
          projects={projectsQ.data ?? []}
          onPrefs={setPrefs}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <Toasts />
    </DndContext>
  );
}

function NoDateDrawer(p: {
  tasks: Task[];
  selected: string;
  projectColor: (id: string) => string;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
  onToDay: (t: Task) => void;
  onClose: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "nodate" });
  return (
    <aside ref={setNodeRef} className={`drawer${isOver ? " drop" : ""}`} aria-label="날짜 없는 할 일">
      <div className="drawer-head">
        <h3>날짜 없음</h3>
        <span className="hint">캘린더로 끌어다 놓거나 → 를 누르면 {format(parseISO(p.selected), "M/d", { locale: ko })}로</span>
        <button className="ghost icon" aria-label="닫기" onClick={p.onClose}>
          ✕
        </button>
      </div>
      {p.tasks.length === 0 && <p className="hint">비어 있습니다. 할 일을 여기로 끌어오면 날짜가 빠집니다.</p>}
      <ul>
        {p.tasks.sort(sortTasks).map((t) => (
          <li key={t.id} className="drawer-item">
            <ul>
              <TaskItem task={t} color={p.projectColor(t.project_id)} onToggle={p.onToggle} onOpen={p.onOpen} />
            </ul>
            <button className="ghost icon" aria-label="선택한 날로" onClick={() => p.onToDay(t)}>
              →
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Toasts() {
  const list = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast${t.error ? " error" : ""}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
