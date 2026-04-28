import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("recordaWidget", {
  onStartedAt: (cb: (ms: number) => void) => {
    ipcRenderer.on("widget:started-at", (_e, ms: number) => cb(ms));
    ipcRenderer.send("widget:request-started-at");
  },
  stop: () => ipcRenderer.send("widget:stop"),
});
