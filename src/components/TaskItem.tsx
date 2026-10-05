import { useDraggable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { dueKey, dueTime, endTime, PRIORITY_COLOR } from "../lib";
import type { Task } from "../types";

interface Props {
  task: Task;
  color: string;
  subtasks?: Task[];
  done?: boolean;
  showDate?: boolean;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
}

export function TaskItem({ task, color, subtasks = [], done, showDate, onToggle, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task:${task.id}`, data: task, disabled: done });
  const time = dueTime(task);
  const end = endTime(task);
  const date = showDate ? dueKey(task) : null;

  return (
    <li className={`task-wrap${isDragging ? " dragging" : ""}`}>
      <div className={`task${done ? " done" : ""}`} ref={setNodeRef} {...listeners} {...attributes} role={undefined} tabIndex={-1}>
        <button
          className="check"
          aria-label={done ? "완료 취소" : "완료"}
          style={{ ["--pc" as string]: task.priority > 1 ? PRIORITY_COLOR[task.priority] : color }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task);
          }}
        >
          {done && (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
              <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <button className="body" onClick={() => onOpen(task)}>
          <span className="content">{stripMd(task.content)}</span>
          <span className="meta">
            {date && <span className="m-date">{format(parseISO(date), "M/d")}</span>}
            {time && (
              <span className="m-time">
                {time}
                {end && `–${end}`}
              </span>
            )}
            {task.due?.is_recurring && <span title={task.due.string}>↻</span>}
            {task.deadline && <span className="m-deadline">⚑ {format(parseISO(task.deadline.date), "M/d")}</span>}
            {task.labels.map((l) => (
              <span key={l} className="m-label">
                #{l}
              </span>
            ))}
            {task.description && <span title="메모">≡</span>}
            {subtasks.length > 0 && <span>☰ {subtasks.length}</span>}
          </span>
        </button>
      </div>
      {subtasks.length > 0 && (
        <ul className="subtasks">
          {subtasks.map((s) => (
            <TaskItem key={s.id} task={s} color={color} onToggle={onToggle} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

// Todoist 마크다운 링크 [text](url) 와 굵게 표시만 걷어 낸다
export const stripMd = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
