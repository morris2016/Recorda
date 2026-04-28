import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("recordaWidget", {
  ready: () => ipcRenderer.send("widget:ready"),
  onPhase: (
    cb: (
      payload:
        | { kind: "countdown"; n: number }
        | { kind: "recording"; startedAt: number }
    ) => void,
  ) => {
    ipcRenderer.on("widget:phase", (_e, payload) => cb(payload));
  },
  stop: () => ipcRenderer.send("widget:stop"),
});
