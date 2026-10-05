import { useDroppable } from "@dnd-kit/core";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useRef } from "react";
import { colorOf, dayKey } from "../lib";
import type { Project, Task } from "../types";

export interface DayStat {
  open: Task[];
  done: Task[];
}

interface Props {
  cursor: Date;
  view: "month" | "week";
  selected: string;
  today: string;
  weekStartsOn: 0 | 1;
  stats: Map<string, DayStat>;
  projects: Map<string, Project>;
  onSelect: (key: string) => void;
  onSwipe: (dir: -1 | 1) => void;
}

export function visibleRange(cursor: Date, view: "month" | "week", weekStartsOn: 0 | 1) {
  if (view === "week") {
    const s = startOfWeek(cursor, { weekStartsOn });
    return { start: s, end: addDays(s, 6) };
  }
  return {
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn }),
  };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function Calendar(p: Props) {
  const { start, end } = visibleRange(p.cursor, p.view, p.weekStartsOn);
  const days = eachDayOfInterval({ start, end });
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + p.weekStartsOn) % 7]);
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={`cal cal-${p.view}`}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) p.onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      <div className="cal-head">
        {heads.map((h) => (
          <div key={h} className={h === "일" ? "sun" : h === "토" ? "sat" : ""}>
            {h}
          </div>
        ))}
      </div>
      <div className="cal-grid" role="grid">
        {days.map((d) => {
          const key = dayKey(d);
          return (
            <DayCell
              key={key}
              date={d}
              dayKey={key}
              outside={p.view === "month" && !isSameMonth(d, p.cursor)}
              isToday={key === p.today}
              isPast={key < p.today}
              selected={key === p.selected}
              stat={p.stats.get(key)}
              projects={p.projects}
              onSelect={p.onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCell(props: {
  date: Date;
  dayKey: string;
  outside: boolean;
  isToday: boolean;
  isPast: boolean;
  selected: boolean;
  stat?: DayStat;
  projects: Map<string, Project>;
  onSelect: (key: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${props.dayKey}` });
  const open = props.stat?.open ?? [];
  const done = props.stat?.done ?? [];
  const total = open.length + done.length;
  const allDone = total > 0 && open.length === 0;
  const dow = props.date.getDay();
  // 도장 색은 그날 가장 많이 끝낸 프로젝트 색
  const stampColor = allDone ? colorOf(props.projects.get(mostCommon(done.map((t) => t.project_id)) ?? "")?.color) : undefined;
  const roots = open.filter((t) => !t.parent_id);
  const preview = roots.slice(0, 3);

  return (
    <button
      ref={setNodeRef}
      role="gridcell"
      aria-selected={props.selected}
      aria-label={`${format(props.date, "M월 d일")} 남은 ${open.length}개, 완료 ${done.length}개`}
      className={[
        "day",
        props.outside && "outside",
        props.isToday && "today",
        props.selected && "selected",
        isOver && "drop",
        dow === 0 && "sun",
        dow === 6 && "sat",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => props.onSelect(props.dayKey)}
    >
      <span className="stamp" style={stampColor ? { background: stampColor } : undefined}>
        {allDone ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : open.length > 0 ? (
          <b className={props.isPast ? "late" : ""}>{open.length}</b>
        ) : null}
      </span>
      <span className="num">{props.date.getDate()}</span>
      {total > 0 && (
        <span className="dots" aria-hidden>
          {uniq(open.map((t) => t.project_id))
            .slice(0, 4)
            .map((pid) => (
              <i key={pid} style={{ background: colorOf(props.projects.get(pid)?.color) }} />
            ))}
        </span>
      )}
      <span className="previews" aria-hidden>
        {preview.map((t) => (
          <span key={t.id} className="pv" style={{ borderColor: colorOf(props.projects.get(t.project_id)?.color) }}>
            {t.content}
          </span>
        ))}
        {roots.length > 3 && <span className="pv more">+{roots.length - 3}</span>}
      </span>
    </button>
  );
}

const uniq = <T,>(a: T[]) => [...new Set(a)];
function mostCommon(a: string[]) {
  const m = new Map<string, number>();
  for (const x of a) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
}
