import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Devices / capabilities
  listDisplays: () => ipcRenderer.invoke("devices:list-displays"),
  listAudioDevices: () => ipcRenderer.invoke("devices:list-audio"),
  detectEncoders: () => ipcRenderer.invoke("devices:detect-encoders"),

  // Recording
  startRecording: (req: unknown) => ipcRenderer.invoke("rec:start", req),
  stopRecording: () => ipcRenderer.invoke("rec:stop"),
  getRecordingState: () => ipcRenderer.invoke("rec:state"),

  // Region selection
  pickRegion: () => ipcRenderer.invoke("region:pick"),

  // Filesystem helpers
  chooseFolder: () => ipcRenderer.invoke("fs:choose-folder"),
  showInExplorer: (filePath: string) => ipcRenderer.invoke("fs:reveal", filePath),
  defaultOutputDir: () => ipcRenderer.invoke("fs:default-output-dir"),
  listRecentRecordings: () => ipcRenderer.invoke("fs:recent"),

  // Updates
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  getCurrentVersion: () => ipcRenderer.invoke("update:current-version"),
  getUpdateState: () => ipcRenderer.invoke("update:state"),
  downloadAndInstallUpdate: () => ipcRenderer.invoke("update:download-and-install"),
  openDownload: (url: string) => ipcRenderer.send("update:open-download", url),
  onUpdateState: (cb: (s: unknown) => void) => {
    const handler = (_: unknown, s: unknown) => cb(s);
    ipcRenderer.on("update:state-change", handler);
    return () => ipcRenderer.removeListener("update:state-change", handler);
  },

  // Window
  minimize: () => ipcRenderer.send("win:minimize"),
  maximizeToggle: () => ipcRenderer.send("win:maximize-toggle"),
  hideToTray: () => ipcRenderer.send("win:hide"),
  close: () => ipcRenderer.send("win:close"),

  // Region overlay (used inside region.html only)
  regionConfirm: (rect: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.send("region:confirm", rect),
  regionCancel: () => ipcRenderer.send("region:cancel"),
  regionGetGeometry: () => ipcRenderer.invoke("region:geometry"),

  // Events from main
  onStateChange: (cb: (state: unknown) => void) => {
    const handler = (_: unknown, state: unknown) => cb(state);
    ipcRenderer.on("rec:state-change", handler);
    return () => ipcRenderer.removeListener("rec:state-change", handler);
  },
  onHotkey: (cb: (action: string) => void) => {
    const handler = (_: unknown, a: string) => cb(a);
    ipcRenderer.on("hotkey", handler);
    return () => ipcRenderer.removeListener("hotkey", handler);
  },
};

contextBridge.exposeInMainWorld("recorda", api);

export type RecordaApi = typeof api;
