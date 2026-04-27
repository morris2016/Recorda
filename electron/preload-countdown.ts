import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("recordaCountdown", {
  onTick: (cb: (n: number) => void) => {
    const handler = (_: unknown, n: number) => cb(n);
    ipcRenderer.on("countdown:tick", handler);
    return () => ipcRenderer.removeListener("countdown:tick", handler);
  },
});
