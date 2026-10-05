import { addDays, format, nextMonday, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { useAdd, useComplete, useDelete, useMove, useReschedule, useUpdate } from "../data";
import { colorOf, dayKey, dueKey, dueTime, PRIORITY_COLOR, PRIORITY_LABEL, sortTasks } from "../lib";
import type { Label, Project, Task } from "../types";
import { TaskItem } from "./TaskItem";

interface Props {
  task: Task;
  allTasks: Task[];
  projects: Project[];
  labels: Label[];
  onClose: () => void;
  onOpen: (t: Task) => void;
}

export function TaskSheet({ task, allTasks, projects, labels, onClose, onOpen }: Props) {
  const update = useUpdate();
  const reschedule = useReschedule();
  const move = useMove();
  const del = useDelete();
  const complete = useComplete();
  const add = useAdd();

  const [content, setContent] = useState(task.content);
  const [desc, setDesc] = useState(task.description);
  const [repeat, setRepeat] = useState(repeatOf(task));
  const [sub, setSub] = useState("");
  useEffect(() => {
    setContent(task.content);
    setDesc(task.description);
    setRepeat(repeatOf(task));
  }, [task.id, task.content, task.description, task.due?.string]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const date = dueKey(task);
  const time = dueTime(task);
  const today = dayKey(new Date());
  const subtasks = allTasks.filter((t) => t.parent_id === task.id).sort(sortTasks);
  const project = projects.find((p) => p.id === task.project_id);
  const color = colorOf(project?.color);
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ task, patch });
  const moveTo = (d: string | null) => reschedule.mutate({ task, date: d });

  const setTime = (t: string) => {
    if (!date) return;
    if (task.due?.is_recurring) {
      // 반복 할 일의 시간은 반복 문구 안에 들어 있어서 문구로 바꿔야 한다
      const base = task.due.string.replace(/\s*(at|@)\s*\d{1,2}(:\d\d)?\s*(am|pm)?/i, "");
      const s = t ? `${base} at ${t}` : base;
      setRepeat(s);
      save({ due_string: s });
      return;
    }
    save(t ? { due_datetime: `${date}T${t}:00` } : { due_date: date });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="할 일 편집" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-top">
          <button
            className="check big"
            aria-label="완료"
            style={{ ["--pc" as string]: task.priority > 1 ? PRIORITY_COLOR[task.priority] : color }}
            onClick={() => {
              complete.mutate(task);
              onClose();
            }}
          />
          <textarea
            className="title-input"
            value={content}
            rows={1}
            onChange={(e) => setContent(e.target.value)}
            onBlur={() => content.trim() && content !== task.content && save({ content: content.trim() })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
          <button className="ghost icon" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="quick-dates">
          <button onClick={() => moveTo(today)}>오늘</button>
          <button onClick={() => moveTo(format(addDays(new Date(), 1), "yyyy-MM-dd"))}>내일</button>
          <button onClick={() => moveTo(format(nextMonday(new Date()), "yyyy-MM-dd"))}>다음 주</button>
          {date && <button onClick={() => moveTo(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}>하루 미루기</button>}
          {date && <button onClick={() => moveTo(null)}>날짜 없음</button>}
        </div>

        <div className="fields">
          <label>
            <span>날짜</span>
            <input type="date" value={date ?? ""} onChange={(e) => e.target.value && moveTo(e.target.value)} />
          </label>
          <label>
            <span>시간</span>
            <input type="time" value={time ?? ""} disabled={!date} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label>
            <span>소요(분)</span>
            <input
              type="number"
              min={0}
              step={15}
              defaultValue={task.duration?.unit === "minute" ? task.duration.amount : ""}
              key={`dur-${task.id}-${task.duration?.amount}`}
              disabled={!time}
              title={time ? "" : "시간을 먼저 정하세요"}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v === (task.duration?.amount ?? 0)) return;
                save(v > 0 ? { duration: v, duration_unit: "minute" } : { duration: null });
              }}
            />
          </label>
          <label>
            <span>마감일</span>
            <input
              type="date"
              value={task.deadline?.date ?? ""}
              onChange={(e) => save({ deadline_date: e.target.value || null })}
            />
          </label>
          <label className="wide">
            <span>반복 / 자연어 일정</span>
            <input
              value={repeat}
              placeholder="예: every monday at 9am, 매일 오후 3시"
              onChange={(e) => setRepeat(e.target.value)}
              onBlur={() => repeat.trim() !== repeatOf(task) && repeat.trim() && save({ due_string: repeat.trim() })}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.target as HTMLInputElement).blur()}
            />
          </label>
        </div>

        <div className="row">
          <span className="row-label">우선순위</span>
          <div className="seg">
            {[4, 3, 2, 1].map((p) => (
              <button
                key={p}
                aria-pressed={task.priority === p}
                style={{ ["--c" as string]: p === 1 ? "var(--muted)" : PRIORITY_COLOR[p] }}
                onClick={() => save({ priority: p })}
              >
                ⚑ {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <span className="row-label">프로젝트</span>
          <select value={task.project_id} onChange={(e) => move.mutate({ task, projectId: e.target.value })}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.inbox_project ? "Inbox" : p.name}
              </option>
            ))}
          </select>
        </div>

        {labels.length > 0 && (
          <div className="row">
            <span className="row-label">라벨</span>
            <div className="chips">
              {labels.map((l) => {
                const on = task.labels.includes(l.name);
                return (
                  <button
                    key={l.id}
                    className="chip"
                    aria-pressed={on}
                    style={{ ["--c" as string]: colorOf(l.color) }}
                    onClick={() =>
                      save({ labels: on ? task.labels.filter((x) => x !== l.name) : [...task.labels, l.name] })
                    }
                  >
                    #{l.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <textarea
          className="desc"
          placeholder="메모"
          value={desc}
          rows={3}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== task.description && save({ description: desc })}
        />

        <div className="subs">
          <h3>하위 할 일</h3>
          <ul>
            {subtasks.map((s) => (
              <TaskItem key={s.id} task={s} color={color} onToggle={(x) => complete.mutate(x)} onOpen={onOpen} />
            ))}
          </ul>
          <input
            value={sub}
            placeholder="+ 하위 할 일 추가"
            onChange={(e) => setSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && sub.trim()) {
                add.mutate({ content: sub.trim(), parent_id: task.id, ...(date ? { due_date: date } : {}) });
                setSub("");
              }
            }}
          />
        </div>

        <div className="sheet-foot">
          <a href={`https://app.todoist.com/app/task/${task.id}`} target="_blank" rel="noreferrer" className="ghost small">
            Todoist에서 열기 ↗
          </a>
          <button
            className="danger small"
            onClick={() => {
              if (confirm(`"${task.content}" 를 삭제할까요?`)) {
                del.mutate(task);
                onClose();
              }
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// 일회성 일정의 string 은 날짜 문자열이라 보여 줘도 의미가 없다
const repeatOf = (t: Task) => (t.due?.is_recurring ? t.due.string : "");
