import { useQueryClient } from "@tanstack/react-query";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { api } from "../api";
import { keys, toast } from "../data";

interface Turn {
  role: "user" | "assistant";
  text: string;
  actions?: { tool: string; ok: boolean }[];
}

export interface CommandBarHandle {
  focus: () => void;
}

export const CommandBar = forwardRef<CommandBarHandle, { aiEnabled: boolean }>(function CommandBar({ aiEnabled }, ref) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.tasks });
    qc.invalidateQueries({ queryKey: ["completed"] });
    qc.invalidateQueries({ queryKey: keys.projects });
    qc.invalidateQueries({ queryKey: keys.labels });
  };

  async function submit() {
    const msg = text.trim();
    if (!msg || busy) return;
    setText("");
    setBusy(true);
    if (!aiEnabled) {
      try {
        const t = await api.quickAdd(msg);
        toast(`추가: ${t.content}`);
        refresh();
      } catch (e) {
        toast(`추가 실패: ${e instanceof Error ? e.message : e}`, { error: true });
      } finally {
        setBusy(false);
      }
      return;
    }
    const next: Turn[] = [...turns, { role: "user", text: msg }];
    setTurns(next);
    setOpen(true);
    try {
      // 대화 맥락은 최근 6턴만 보낸다
      const res = await api.agent(next.slice(-6).map(({ role, text }) => ({ role, text })));
      setTurns([...next, { role: "assistant", text: res.text, actions: res.actions }]);
      if (res.actions.length) refresh();
    } catch (e) {
      setTurns([...next, { role: "assistant", text: `오류: ${e instanceof Error ? e.message : e}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cmd">
      {open && turns.length > 0 && (
        <div className="cmd-log" role="log" aria-live="polite">
          <div className="cmd-log-head">
            <span>AI 지시</span>
            <button className="ghost small" onClick={() => setTurns([])}>
              새 대화
            </button>
            <button className="ghost icon" aria-label="닫기" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          {turns.map((t, i) => (
            <div key={i} className={`turn ${t.role}`}>
              <p>{t.text}</p>
              {t.actions && t.actions.length > 0 && (
                <div className="acts">
                  {t.actions.map((a, j) => (
                    <span key={j} className={a.ok ? "" : "fail"}>
                      {a.tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="turn assistant typing">처리 중…</div>}
        </div>
      )}
      <form
        className="cmd-bar"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="cmd-badge">{aiEnabled ? "AI" : "빠른 추가"}</span>
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => turns.length && setOpen(true)}
          placeholder={
            aiEnabled ? "지시하기 — 예: 내일 3시 치과, 금요일까지 보고서 p1 #업무" : "예: 내일 오후 3시 치과 #개인 p1"
          }
          aria-label="지시 입력"
          enterKeyHint="send"
        />
        <kbd>⌘K</kbd>
        <button type="submit" disabled={busy || !text.trim()} aria-label="보내기">
          {busy ? <span className="spin" /> : "↑"}
        </button>
      </form>
    </div>
  );
});
