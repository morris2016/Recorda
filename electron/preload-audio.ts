import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("recordaAudio", {
  onStart: (cb: (opts: { systemAudio: boolean; mic: boolean }) => void) => {
    ipcRenderer.on("audio:start", (_e, opts) => cb(opts));
  },
  onStop: (cb: () => void) => {
    ipcRenderer.on("audio:stop", () => cb());
  },
  reportStarted: () => ipcRenderer.send("audio:started"),
  reportError: (msg: string) => ipcRenderer.send("audio:error", msg),
  reportChunk: (buf: ArrayBuffer) => ipcRenderer.send("audio:chunk", buf),
  reportFinished: () => ipcRenderer.send("audio:finished"),
});
