import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Windows 알림 식별자 등록 (작업 표시줄 및 액션 센터에 Todocal 이름 표시)
if (process.platform === "win32") {
  app.setAppUserModelId("Todocal");
}

let mainWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;

const PORT = Number(process.env.TODOCAL_PORT) || 5180;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

/** 로컬 Hono 서버 응답 확인 */
async function isServerRunning() {
  try {
    const res = await fetch(`${SERVER_URL}/api/config`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** 서버가 안 켜져 있으면 자체 백그라운드 구동 */
function startServer() {
  const rootDir = path.resolve(__dirname, "..");
  const isWin = process.platform === "win32";
  const cmd = isWin ? "cmd.exe" : "pnpm";
  const args = isWin ? ["/c", "pnpm", "start"] : ["start"];

  serverProcess = spawn(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, TODOCAL_PORT: String(PORT), TODOCAL_OPEN: "0" },
    shell: true,
    windowsHide: true,
  });

  serverProcess.on("error", (err) => {
    console.error("[Electron Server Spawn Error]", err);
  });
}

/** 서버 준비 대기 */
async function waitForServer(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isServerRunning()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function createWindow() {
  const iconPath = path.join(__dirname, "../public/icon-512.png");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    title: "Todocal",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "../public/icon-192.png");
  if (!fs.existsSync(iconPath)) return;

  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Todocal - Todoist 캘린더");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "열기",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "새로고침",
      click: () => {
        if (mainWindow) mainWindow.reload();
      },
    },
    {
      label: "알림 테스트",
      click: () => {
        showNativeNotification("Todocal 테스트 알림", "데스크탑 네이티브 알림이 정상 작동합니다!");
      },
    },
    { type: "separator" },
    {
      label: "종료",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function showNativeNotification(title, body, tag) {
  if (!Notification.isSupported()) {
    console.warn("Notifications not supported on this platform.");
    return false;
  }
  const iconPath = path.join(__dirname, "../public/icon-192.png");
  const notif = new Notification({
    title,
    body,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    urgency: "normal",
    tag,
  });

  notif.on("click", () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  notif.show();
  return true;
}

ipcMain.handle("show-notification", (event, { title, body, tag }) => {
  return showNativeNotification(title, body, tag);
});

ipcMain.handle("get-env", () => {
  return {
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron,
  };
});

app.whenReady().then(async () => {
  const alreadyRunning = await isServerRunning();
  if (!alreadyRunning) {
    startServer();
    const ready = await waitForServer();
    if (!ready) {
      console.error("Server failed to start in time");
    }
  }

  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    app.quit();
  }
});
