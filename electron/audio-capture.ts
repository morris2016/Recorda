// Manages a hidden BrowserWindow that captures system audio + mic via Chromium's
// getDisplayMedia/getUserMedia, encodes Opus/WebM in MediaRecorder, and writes
// chunks to a temp file. The recorder.ts mux step then combines this with
// the gdigrab video into the final container.
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { rendererURL, rendererFile, isDev } from "./paths";

let win: BrowserWindow | null = null;
let outFile: string | null = null;
let outStream: fs.WriteStream | null = null;
let pendingResolveStart: ((ok: boolean, err?: string) => void) | null = null;
let pendingResolveStop: ((path: string | null) => void) | null = null;

function preloadPath(): string {
  return path.join(__dirname, "preload-audio.js");
}

function audioRendererURL(): string {
  if (isDev()) return "http://localhost:5173/audio.html";
  return ""; // unused in prod, we use loadFile
}

export function setupAudioCaptureIpc() {
  // Renderer → main events
  ipcMain.on("audio:started", () => {
    if (pendingResolveStart) {
      const r = pendingResolveStart;
      pendingResolveStart = null;
      r(true);
    }
  });
  ipcMain.on("audio:error", (_e, msg: string) => {
    if (pendingResolveStart) {
      const r = pendingResolveStart;
      pendingResolveStart = null;
      r(false, msg);
    }
    if (pendingResolveStop) {
      const r = pendingResolveStop;
      pendingResolveStop = null;
      r(null);
    }
  });
  ipcMain.on("audio:chunk", (_e, buf: ArrayBuffer | Buffer) => {
    if (!outStream) return;
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    outStream.write(b);
  });
  ipcMain.on("audio:finished", () => {
    if (outStream) {
      outStream.end(() => {
        const finalPath = outFile;
        outFile = null;
        outStream = null;
        if (pendingResolveStop) {
          const r = pendingResolveStop;
          pendingResolveStop = null;
          r(finalPath);
        }
      });
    } else if (pendingResolveStop) {
      const r = pendingResolveStop;
      pendingResolveStop = null;
      r(null);
    }
  });
}

export async function startAudioCapture(opts: { systemAudio: boolean; mic: boolean }): Promise<{ ok: boolean; error?: string }> {
  if (win) return { ok: false, error: "audio capture already running" };
  if (!opts.systemAudio && !opts.mic) return { ok: false, error: "no audio sources" };

  outFile = path.join(app.getPath("temp"), `recorda-audio-${Date.now()}.webm`);
  outStream = fs.createWriteStream(outFile);

  win = new BrowserWindow({
    width: 200,
    height: 100,
    show: false,                    // never visible
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,  // keep capture running when window hidden
      offscreen: false,
    },
  });

  if (isDev()) {
    await win.loadURL(audioRendererURL());
  } else {
    await win.loadFile(rendererFile("audio.html"));
  }

  // Wait for renderer to ack started, with a timeout.
  const startPromise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
    pendingResolveStart = (ok, err) => resolve({ ok, error: err });
    setTimeout(() => {
      if (pendingResolveStart) {
        const r = pendingResolveStart;
        pendingResolveStart = null;
        r(false, "audio renderer did not report started in time");
      }
    }, 8000);
  });

  win.webContents.send("audio:start", opts);
  const result = await startPromise;
  if (!result.ok) {
    try { win?.close(); } catch { /* ignore */ }
    win = null;
    if (outStream) { try { outStream.close(); } catch { /* ignore */ } outStream = null; }
    if (outFile) { try { fs.unlinkSync(outFile); } catch { /* ignore */ } outFile = null; }
  }
  return result;
}

export function stopAudioCapture(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!win) {
      resolve(null);
      return;
    }
    pendingResolveStop = (filePath) => {
      try { win?.close(); } catch { /* ignore */ }
      win = null;
      resolve(filePath);
    };
    win.webContents.send("audio:stop");
    // Hard timeout in case the renderer never reports
    setTimeout(() => {
      if (pendingResolveStop) {
        const r = pendingResolveStop;
        pendingResolveStop = null;
        try { win?.close(); } catch { /* ignore */ }
        win = null;
        if (outStream) { try { outStream.end(); } catch { /* ignore */ } outStream = null; }
        const f = outFile;
        outFile = null;
        r(f && fs.existsSync(f) ? f : null);
      }
    }, 5000);
  });
}
