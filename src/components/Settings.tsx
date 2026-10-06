import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { keys, toast } from "../data";
import { colorOf } from "../lib";
import type { AppConfig, Project } from "../types";

export interface Prefs {
  weekStartsOn: 0 | 1;
  theme: "system" | "light" | "dark";
  hidden: string[];
  showPreviews: boolean;
}

interface Props {
  config: AppConfig;
  prefs: Prefs;
  projects: Project[];
  onPrefs: (p: Prefs) => void;
  onClose?: () => void;
  onboarding?: boolean;
}

export function Settings({ config, prefs, projects, onPrefs, onClose, onboarding }: Props) {
  const qc = useQueryClient();
  const [todoist, setTodoist] = useState("");
  const [aiProvider, setAiProvider] = useState<"agy" | "claude" | "gemini">(
    config.aiProvider !== "none" ? (config.aiProvider as "agy" | "claude" | "gemini") : config.hasAgy ? "agy" : "claude",
  );
  const [anthropic, setAnthropic] = useState("");
  const [gemini, setGemini] = useState("");
  const [model, setModel] = useState(config.model);
  const [pass, setPass] = useState(() => {
    try {
      return localStorage.getItem("todocal.pass") ?? "";
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);

  async function saveKeys() {
    setSaving(true);
    try {
      try {
        if (pass) localStorage.setItem("todocal.pass", pass);
        else localStorage.removeItem("todocal.pass");
      } catch {}
      await api.saveConfig({
        ...(todoist && { todoistToken: todoist.trim() }),
        ...(anthropic && { anthropicKey: anthropic.trim() }),
        ...(gemini && { geminiKey: gemini.trim() }),
        aiProvider,
        ...(model !== config.model && { model }),
      });
      setTodoist("");
      setAnthropic("");
      setGemini("");
      await qc.invalidateQueries();
      toast("저장했습니다");
      if (!onboarding) onClose?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <>
      <h2>{onboarding ? "todocal 시작하기" : "설정"}</h2>
      {onboarding && <p className="hint">Todoist 개인 API 토큰을 넣으면 바로 캘린더가 열립니다. 토큰은 이 컴퓨터의 서버에만 저장됩니다.</p>}

      <section>
        <h3>연결</h3>
        <label className="field">
          <span>
            Todoist API 토큰 {config.hasTodoist && <em className="ok">연결됨</em>}
          </span>
          <input
            type="password"
            value={todoist}
            placeholder={config.hasTodoist ? "바꿀 때만 입력" : "설정 → 연동 → 개발자 → API 토큰"}
            onChange={(e) => setTodoist(e.target.value)}
            autoComplete="off"
          />
          <a href="https://app.todoist.com/app/settings/integrations/developer" target="_blank" rel="noreferrer">
            토큰 복사하러 가기 ↗
          </a>
        </label>

        <label className="field">
          <span>
            AI 엔진 {config.hasAi && <em className="ok">{config.aiProvider} 연결됨</em>}
          </span>
          <div className="seg">
            <button
              type="button"
              aria-pressed={aiProvider === "agy"}
              onClick={() => {
                setAiProvider("agy");
                if (!model || model.startsWith("claude")) setModel("gemini-3.8-flash-low");
              }}
            >
              agy (Antigravity){config.hasAgy ? " ✓" : " (미감지)"}
            </button>
            <button
              type="button"
              aria-pressed={aiProvider === "claude"}
              onClick={() => {
                setAiProvider("claude");
                if (!model || model.startsWith("gemini")) setModel("claude-opus-5");
              }}
            >
              Claude
            </button>
            <button
              type="button"
              aria-pressed={aiProvider === "gemini"}
              onClick={() => {
                setAiProvider("gemini");
                if (!model || model.startsWith("claude")) setModel("gemini-2.5-flash");
              }}
            >
              Gemini API
            </button>
          </div>
        </label>

        {aiProvider === "agy" && (
          <>
            <p className="hint">
              {config.hasAgy
                ? "로컬에 설치된 Antigravity CLI(agy)를 사용합니다. 별도 API 키 없이 즉시 동작합니다."
                : "시스템에 agy가 감지되지 않았습니다. agy가 설치되어 있으면 환경변수 PATH를 확인해주세요."}
            </p>
            <label className="field">
              <span>agy 모델</span>
              <input
                value={model}
                placeholder="gemini-3.8-flash-low"
                onChange={(e) => setModel(e.target.value)}
              />
              <span className="hint">추천: gemini-3.8-flash-low (빠름), gemini-3.8-flash-medium, gemini-3.1-pro-high</span>
            </label>
          </>
        )}

        {aiProvider === "claude" && (
          <>
            <label className="field">
              <span>
                Anthropic API 키 (AI 지시용) {config.hasAnthropic && <em className="ok">연결됨</em>}
              </span>
              <input
                type="password"
                value={anthropic}
                placeholder={config.hasAnthropic ? "바꿀 때만 입력" : "sk-ant-…"}
                onChange={(e) => setAnthropic(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Claude 모델</span>
              <input value={model} placeholder="claude-opus-5" onChange={(e) => setModel(e.target.value)} />
            </label>
          </>
        )}

        {aiProvider === "gemini" && (
          <>
            <label className="field">
              <span>
                Gemini API 키 (AI 지시용) {config.hasGemini && <em className="ok">연결됨</em>}
              </span>
              <input
                type="password"
                value={gemini}
                placeholder={config.hasGemini ? "바꿀 때만 입력" : "AIzaSy…"}
                onChange={(e) => setGemini(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Gemini 모델</span>
              <input value={model} placeholder="gemini-2.5-flash" onChange={(e) => setModel(e.target.value)} />
            </label>
          </>
        )}
        <label className="field">
          <span>서버 패스코드 (원격 접속 시)</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
        </label>
        <button className="primary" disabled={saving} onClick={saveKeys}>
          {saving ? "확인 중…" : "저장"}
        </button>
      </section>

      {!onboarding && (
        <>
          <section>
            <h3>보기</h3>
            <div className="row">
              <span className="row-label">주 시작</span>
              <div className="seg">
                {([1, 0] as const).map((d) => (
                  <button key={d} aria-pressed={prefs.weekStartsOn === d} onClick={() => onPrefs({ ...prefs, weekStartsOn: d })}>
                    {d === 1 ? "월요일" : "일요일"}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <span className="row-label">테마</span>
              <div className="seg">
                {(["system", "light", "dark"] as const).map((t) => (
                  <button key={t} aria-pressed={prefs.theme === t} onClick={() => onPrefs({ ...prefs, theme: t })}>
                    {{ system: "시스템", light: "라이트", dark: "다크" }[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <span className="row-label">칸에 제목</span>
              <div className="seg">
                {[true, false].map((v) => (
                  <button key={String(v)} aria-pressed={prefs.showPreviews === v} onClick={() => onPrefs({ ...prefs, showPreviews: v })}>
                    {v ? "보이기" : "숨기기"}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section>
            <h3>프로젝트 표시</h3>
            <div className="chips">
              {projects.map((p) => {
                const on = !prefs.hidden.includes(p.id);
                return (
                  <button
                    key={p.id}
                    className="chip"
                    aria-pressed={on}
                    style={{ ["--c" as string]: colorOf(p.color) }}
                    onClick={() =>
                      onPrefs({ ...prefs, hidden: on ? [...prefs.hidden, p.id] : prefs.hidden.filter((x) => x !== p.id) })
                    }
                  >
                    {p.inbox_project ? "Inbox" : p.name}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="hint">
            <h3>단축키</h3>
            <p>
              <kbd>⌘K</kbd> 지시 · <kbd>←</kbd>
              <kbd>→</kbd> 하루 이동 · <kbd>T</kbd> 오늘 · <kbd>W</kbd> 월/주 전환 · <kbd>I</kbd> 날짜 없음 · <kbd>Esc</kbd> 닫기
            </p>
          </section>
        </>
      )}
    </>
  );

  if (onboarding) return <div className="onboarding">{body}</div>;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet settings" role="dialog" aria-modal="true" aria-label="설정" onClick={(e) => e.stopPropagation()}>
        <button className="ghost icon close" aria-label="닫기" onClick={onClose}>
          ✕
        </button>
        {body}
      </div>
    </div>
  );
}
