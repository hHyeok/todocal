import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";
import { useAdd, useComplete, useReopen, useReschedule } from "../data";
import { colorOf, loadPref, savePref, sortTasks } from "../lib";
import type { Project, Task } from "../types";
import { TaskItem } from "./TaskItem";

interface Props {
  day: string;
  today: string;
  open: Task[];
  done: Task[];
  overdue: Task[];
  projects: Project[];
  onOpen: (t: Task) => void;
}

export function DayPanel({ day, today, open, done, overdue, projects, onOpen }: Props) {
  const complete = useComplete();
  const reopen = useReopen();
  const reschedule = useReschedule();
  const [adding, setAdding] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(true);
  const [overdueCollapsed, setOverdueCollapsed] = useState<boolean>(() => loadPref("overdueCollapsed", false));

  const toggleOverdue = () => {
    setOverdueCollapsed((prev) => {
      const next = !prev;
      savePref("overdueCollapsed", next);
      return next;
    });
  };

  const date = parseISO(day);
  const total = open.length + done.length;
  const pct = total ? Math.round((done.length / total) * 100) : 0;
  const rel = day === today ? "오늘" : relLabel(day, today);

  const ids = new Set(open.map((t) => t.id));
  // 같은 날 부모가 있으면 부모 밑에, 아니면 따로 보인다
  const roots = open.filter((t) => !t.parent_id || !ids.has(t.parent_id));
  const childrenOf = (id: string) => open.filter((t) => t.parent_id === id).sort(sortTasks);

  return (
    <section className="day-panel" aria-label={`${format(date, "M월 d일")} 할 일`}>
      <header className="dp-head">
        <div>
          <h2>
            {format(date, "M월 d일 EEEE", { locale: ko })}
            {rel && <span className="rel">{rel}</span>}
          </h2>
          <div className="progress" aria-label={`진행률 ${pct}%`}>
            <div className="bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <span>
              {done.length}/{total}
            </span>
          </div>
        </div>
        {done.length > 0 && (
          <button className="ghost small" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "완료 숨기기" : "완료 보기"}
          </button>
        )}
      </header>

      {day === today && overdue.length > 0 && (
        <div className={`overdue${overdueCollapsed ? " collapsed" : ""}`}>
          <div
            className="overdue-head"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={toggleOverdue}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  display: "inline-block",
                  transform: overdueCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  transition: "transform 0.15s ease",
                  fontSize: "11px",
                }}
              >
                ▼
              </span>
              <span>밀린 할 일 {overdue.length}개</span>
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                className="small"
                onClick={(e) => {
                  e.stopPropagation();
                  overdue.forEach((t) => reschedule.mutate({ task: t, date: today }));
                }}
              >
                모두 오늘로
              </button>
              <button
                type="button"
                className="ghost small"
                style={{ padding: "2px 6px", fontSize: "11px", color: "var(--sun)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOverdue();
                }}
              >
                {overdueCollapsed ? "펼치기" : "접기"}
              </button>
            </div>
          </div>
          {!overdueCollapsed && (
            <ul>
              {overdue.sort(sortTasks).map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  color={colorOf(projects.find((p) => p.id === t.project_id)?.color)}
                  showDate
                  onToggle={(x) => complete.mutate(x)}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {projects.map((p) => {
        const items = roots.filter((t) => t.project_id === p.id).sort(sortTasks);
        const doneItems = showDone ? done.filter((t) => t.project_id === p.id) : [];
        const color = colorOf(p.color);
        const empty = items.length === 0 && doneItems.length === 0;
        return (
          <div key={p.id} className={`group${empty ? " empty" : ""}`}>
            <div className="group-head">
              <span className="goal" style={{ background: `${color}22`, color }}>
                <i style={{ background: color }} />
                {p.inbox_project ? "Inbox" : p.name}
              </span>
              <button className="add" aria-label={`${p.name}에 추가`} onClick={() => setAdding(p.id)}>
                +
              </button>
            </div>
            <ul>
              {items.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  color={color}
                  subtasks={childrenOf(t.id)}
                  onToggle={(x) => complete.mutate(x)}
                  onOpen={onOpen}
                />
              ))}
              {adding === p.id && <InlineAdd day={day} projectId={p.id} onClose={() => setAdding(null)} />}
              {doneItems.map((t) => (
                <TaskItem key={t.id} task={t} color={color} done onToggle={(x) => reopen.mutate(x)} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function InlineAdd({ day, projectId, onClose }: { day: string; projectId: string; onClose: () => void }) {
  const add = useAdd();
  const [text, setText] = useState("");
  const submit = () => {
    const content = text.trim();
    if (!content) return onClose();
    add.mutate({ content, project_id: projectId, due_date: day });
    setText("");
  };
  return (
    <li className="inline-add">
      <span className="check ghost-check" />
      <input
        autoFocus
        value={text}
        placeholder="할 일 입력 후 Enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          if (e.key === "Escape") onClose();
        }}
        onBlur={() => {
          if (text.trim()) submit();
          onClose();
        }}
      />
    </li>
  );
}

function relLabel(day: string, today: string) {
  const diff = Math.round((parseISO(day).getTime() - parseISO(today).getTime()) / 86_400_000);
  if (diff === 1) return "내일";
  if (diff === -1) return "어제";
  if (diff > 1 && diff < 31) return `D-${diff}`;
  return "";
}
