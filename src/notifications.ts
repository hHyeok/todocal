import { useEffect } from "react";
import { stripMd } from "./components/TaskItem";
import { dueKey, dueTime } from "./lib";
import type { Task } from "./types";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      showNotification: (opts: { title: string; body: string; tag?: string }) => Promise<boolean>;
      getEnv: () => Promise<{ isElectron: boolean; platform: string; version: string }>;
    };
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (isElectron()) return "granted";
  if (typeof window !== "undefined" && "Notification" in window) {
    return Notification.permission;
  }
  return "unsupported";
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (isElectron()) return "granted";
  if (typeof window !== "undefined" && "Notification" in window) {
    try {
      return await Notification.requestPermission();
    } catch {
      return "denied";
    }
  }
  return "unsupported";
}

/** 부드러운 2음 차임벨 (Web Audio API) */
export function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

/** 네이티브 (Electron) 및 브라우저 통합 알림 발송 */
export async function sendNotification(title: string, body: string, opts?: { tag?: string; sound?: boolean }): Promise<boolean> {
  if (opts?.sound !== false) {
    playChime();
  }

  // 1. Electron 환경인 경우 OS 네이티브 알림
  if (isElectron() && window.electronAPI?.showNotification) {
    return window.electronAPI.showNotification({ title, body, tag: opts?.tag });
  }

  // 2. 일반 웹 브라우저 환경인 경우 Web Notification API
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/icon-192.png",
        tag: opts?.tag,
      });
      return true;
    }
  }

  return false;
}

const TASK_REMINDERS_KEY = "todocal.taskReminders";
const ALERTED_KEY = "todocal.alertedReminders";

/** 태스크별 커스텀 알림 시간(분 전) 조회 (-2: 기본값, -1: 알림 없음, 0: 정각, 5: 5분전 ...) */
export function getTaskReminder(taskId: string): number {
  try {
    const map = JSON.parse(localStorage.getItem(TASK_REMINDERS_KEY) || "{}");
    return typeof map[taskId] === "number" ? map[taskId] : -2;
  } catch {
    return -2;
  }
}

/** 태스크별 커스텀 알림 시간 설정 */
export function setTaskReminder(taskId: string, minutes: number) {
  try {
    const map = JSON.parse(localStorage.getItem(TASK_REMINDERS_KEY) || "{}");
    if (minutes === -2) {
      delete map[taskId];
    } else {
      map[taskId] = minutes;
    }
    localStorage.setItem(TASK_REMINDERS_KEY, JSON.stringify(map));
  } catch {}
}

function getAlertedSet(): Set<string> {
  try {
    const arr = JSON.parse(sessionStorage.getItem(ALERTED_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markAsAlerted(key: string) {
  try {
    const set = getAlertedSet();
    set.add(key);
    sessionStorage.setItem(ALERTED_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

/** 알림 스케줄러 훅: 20초마다 등록된 할 일의 시간을 체크하여 알림 발송 */
export function useNotificationScheduler(
  tasks: Task[] | undefined,
  enabled: boolean = true,
  defaultMinutes: number = 10,
  sound: boolean = true,
) {
  useEffect(() => {
    if (!enabled || !tasks?.length) return;

    const check = () => {
      const now = new Date();
      const nowTime = now.getTime();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const alerted = getAlertedSet();

      for (const t of tasks) {
        if (t.checked) continue;
        const dKey = dueKey(t);
        const tTime = dueTime(t);
        if (!dKey || !tTime) continue;
        if (dKey !== todayStr) continue;

        // 알림 시간(분 전) 결정
        const customMin = getTaskReminder(t.id);
        const minBefore = customMin === -2 ? defaultMinutes : customMin;
        if (minBefore < 0) continue; // 알림 끔

        // 일정 시각 Date 계산
        const [hh, mm] = tTime.split(":").map(Number);
        const taskDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
        const triggerTime = taskDate.getTime() - minBefore * 60 * 1000;

        // 알림 고유 키 (태스크ID + 날짜 + 시간)
        const alertKey = `${t.id}:${dKey}:${tTime}:${minBefore}`;
        if (alerted.has(alertKey)) continue;

        // 현재 시각이 알림 시점 이후이고 3분 이내인 경우 알림 발송
        if (nowTime >= triggerTime && nowTime <= triggerTime + 3 * 60 * 1000) {
          markAsAlerted(alertKey);
          const leadText = minBefore === 0 ? "정각" : `${minBefore}분 전`;
          sendNotification(
            `[일정 알림] ${stripMd(t.content)}`,
            `${leadText} 알림 · ${tTime} 예정`,
            { tag: alertKey, sound },
          );
        }
      }
    };

    check();
    const interval = setInterval(check, 20000);
    return () => clearInterval(interval);
  }, [tasks, enabled, defaultMinutes, sound]);
}
