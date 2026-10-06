import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  showNotification: (opts) => ipcRenderer.invoke("show-notification", opts),
  getEnv: () => ipcRenderer.invoke("get-env"),
});
