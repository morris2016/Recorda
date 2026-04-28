import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  screen,
  session,
  desktopCapturer,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { isDev, rendererURL, rendererFile, preloadPath, countdownPreloadPath, widgetPreloadPath, appIconPath } from "./paths";
import { listAudioDevices, listDisplays, detectEncoders } from "./devices";
import { recorder, RecordRequest, defaultOutputDir } from "./recorder";
import { setupAudioCaptureIpc } from "./audio-capture";
import { updater, getCurrentVersion, openDownloadInBrowser } from "./updater";

// Single-instance lock — second launches just focus the existing window
// instead of spawning a duplicate. Bail out IMMEDIATELY if we lost the
// race so no tray icon, no window, no IPC handlers get registered.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  app.exit(0);
}

let mainWin: BrowserWindow | null = null;
let regionWin: BrowserWindow | null = null;
let countdownWin: BrowserWindow | null = null;
let widgetWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let regionResolver: ((rect: { x: number; y: number; width: number; height: number } | null) => void) | null = null;
let mainHiddenForRec = false;
let recStartedAt = 0;
let widgetReadyResolve: (() => void) | null = null;

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 600,
    height: 540,
    minWidth: 480,
    minHeight: 460,
    backgroundColor: "#0b0d12",
    show: false,
    autoHideMenuBar: true,
    frame: false,
    title: "recorda",
    icon: appIconPath() || undefined,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  if (isDev()) mainWin.loadURL(rendererURL("index.html"));
  else mainWin.loadFile(rendererFile("index.html"));
  mainWin.once("ready-to-show", () => mainWin?.show());

  mainWin.on("close", (e) => {
    if (recorder.getState().status === "recording") {
      e.preventDefault();
      mainWin?.hide();
    }
  });

  mainWin.on("closed", () => {
    mainWin = null;
  });

  if (isDev()) mainWin.webContents.openDevTools({ mode: "detach" });
}

function createTray() {
  const icon = appIconPath()
    ? nativeImage.createFromPath(appIconPath())
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("recorda");
  const refreshMenu = () => {
    const recState = recorder.getState();
    const isRecording = recState.status === "recording";
    const ctx = Menu.buildFromTemplate([
      { label: "Show recorda", click: () => { mainWin?.show(); mainWin?.focus(); } },
      { type: "separator" },
      isRecording
        ? { label: "Stop recording  (Ctrl+R / F9)", click: () => recorder.stop() }
        : { label: "Start recording  (Ctrl+R / F9)", click: () => mainWin?.webContents.send("hotkey", "start"), enabled: !!mainWin },
      { type: "separator" },
      { label: "Quit", click: () => { tray?.destroy(); app.quit(); } },
    ]);
    tray?.setContextMenu(ctx);
  };
  refreshMenu();
  tray.on("click", () => { mainWin?.show(); mainWin?.focus(); });
  recorder.on("state", refreshMenu);
}

export const TOGGLE_HOTKEYS = ["CommandOrControl+R", "F9", "CommandOrControl+Shift+R"];

function registerHotkeys() {
  const handler = () => {
    const s = recorder.getState();
    if (s.status === "recording") recorder.stop();
    else mainWin?.webContents.send("hotkey", "start");
  };
  const failed: string[] = [];
  for (const accel of TOGGLE_HOTKEYS) {
    let ok = false;
    try { ok = globalShortcut.register(accel, handler); } catch { ok = false; }
    if (!ok) failed.push(accel);
  }
  // If at least one of the variants registered, we still have a hotkey path —
  // we silently ignore the others. If ALL failed, warn loudly so the user knows
  // they must use the floating widget or tray to stop.
  if (failed.length === TOGGLE_HOTKEYS.length) {
    console.warn(`[recorda] all global hotkeys failed: ${failed.join(", ")}`);
  } else {
    console.log(`[recorda] hotkeys registered (${TOGGLE_HOTKEYS.filter((h) => !failed.includes(h)).join(", ")})`);
  }
}

function setupIpc() {
  ipcMain.handle("devices:list-displays", () => listDisplays());
  ipcMain.handle("devices:list-audio", () => listAudioDevices());
  ipcMain.handle("devices:detect-encoders", () => detectEncoders());

  ipcMain.handle("rec:start", async (_e, req: RecordRequest) => {
    // Hide the recorda window first so the countdown widget never overlaps
    // the disappearing main window.
    if (mainWin && mainWin.isVisible()) {
      mainHiddenForRec = true;
      try { mainWin.setOpacity(0); } catch { /* ignore */ }
      mainWin.hide();
    }
    const seconds = Math.max(0, Math.min(10, Math.floor(req.countdownSeconds ?? 0)));
    await sleep(seconds > 0 ? 220 : 600);

    // Open the unified widget upfront. It runs the countdown phase AND the
    // recording phase in the same window — one floating element, no flicker
    // between two separate windows.
    openRecordingWidget(seconds > 0 ? { kind: "countdown", n: seconds } : null);
    await widgetReady();

    if (seconds > 0) {
      for (let n = seconds; n >= 1; n--) {
        widgetWin?.webContents.send("widget:phase", { kind: "countdown", n });
        await sleep(1000);
      }
    }

    recStartedAt = Date.now();
    const result = await recorder.start(req);
    widgetWin?.webContents.send("widget:phase", { kind: "recording", startedAt: recStartedAt });
    return result;
  });
  ipcMain.handle("rec:stop", () => recorder.stop());
  ipcMain.handle("rec:state", () => recorder.getState());

  ipcMain.handle("fs:default-output-dir", () => defaultOutputDir());
  ipcMain.handle("fs:choose-folder", async () => {
    if (!mainWin) return null;
    const r = await dialog.showOpenDialog(mainWin, { properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle("fs:reveal", (_e, filePath: string) => {
    if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  });
  ipcMain.handle("fs:recent", () => {
    const dir = defaultOutputDir();
    if (!fs.existsSync(dir)) return [];
    const items = fs.readdirSync(dir)
      .filter((n) => /^recorda .+\.(mp4|mkv|webm)$/.test(n))
      .map((n) => {
        const full = path.join(dir, n);
        const st = fs.statSync(full);
        return { name: n, path: full, sizeBytes: st.size, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 8);
    return items;
  });

  ipcMain.handle("region:pick", () => openRegionWindow());
  ipcMain.handle("region:geometry", () => {
    const v = screen.getPrimaryDisplay();
    const all = screen.getAllDisplays();
    const minX = Math.min(...all.map((d) => d.bounds.x));
    const minY = Math.min(...all.map((d) => d.bounds.y));
    const maxX = Math.max(...all.map((d) => d.bounds.x + d.bounds.width));
    const maxY = Math.max(...all.map((d) => d.bounds.y + d.bounds.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, scaleFactor: v.scaleFactor };
  });
  ipcMain.on("region:confirm", (_e, rect) => {
    regionResolver?.(rect);
    regionResolver = null;
    regionWin?.close();
  });
  ipcMain.on("region:cancel", () => {
    regionResolver?.(null);
    regionResolver = null;
    regionWin?.close();
  });

  // Updates
  ipcMain.handle("update:check", () => updater.check());
  ipcMain.handle("update:current-version", () => getCurrentVersion());
  ipcMain.handle("update:state", () => updater.getState());
  ipcMain.handle("update:download-and-install", async () => {
    const s = updater.getState();
    if (!s.url || !s.latest) return { ok: false, error: "no update info" };
    try {
      await updater.download(s.url, s.latest);
      await updater.installAndQuit();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
  ipcMain.on("update:open-download", (_e, url: string) => openDownloadInBrowser(url));

  updater.on("state", (s) => {
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("update:state-change", s));
  });

  ipcMain.on("win:minimize", () => mainWin?.minimize());
  ipcMain.on("win:maximize-toggle", () => {
    if (!mainWin) return;
    if (mainWin.isMaximized()) mainWin.unmaximize();
    else mainWin.maximize();
  });
  ipcMain.on("win:hide", () => mainWin?.hide());
  ipcMain.on("win:close", () => mainWin?.close());

  let lastStatus: string | undefined;
  recorder.on("state", (s) => {
    mainWin?.webContents.send("rec:state-change", s);

    // Recording finished → close widget + restore main window.
    if (
      (s.status === "idle" || s.status === "error") &&
      (lastStatus === "recording" || lastStatus === "stopping" || lastStatus === "starting")
    ) {
      closeRecordingWidget();
      if (mainHiddenForRec && mainWin) {
        try { mainWin.setOpacity(1); } catch { /* ignore */ }
        mainWin.show();
        mainWin.focus();
        mainHiddenForRec = false;
      }
    }
    lastStatus = s.status;
  });
  recorder.on("progress", (s) => mainWin?.webContents.send("rec:state-change", s));

  // Widget IPC
  ipcMain.on("widget:ready", () => {
    if (widgetReadyResolve) {
      const r = widgetReadyResolve;
      widgetReadyResolve = null;
      r();
    }
  });
  ipcMain.on("widget:stop", () => {
    if (recorder.getState().status === "recording") recorder.stop();
  });
}

type WidgetPhase = { kind: "countdown"; n: number } | { kind: "recording"; startedAt: number };

function widgetReady(): Promise<void> {
  return new Promise((resolve) => {
    widgetReadyResolve = resolve;
    setTimeout(() => {
      if (widgetReadyResolve) {
        widgetReadyResolve = null;
        resolve();
      }
    }, 1500);
  });
}

function openRecordingWidget(initialPhase: WidgetPhase | null) {
  closeRecordingWidget();
  const w = 260;
  const h = 48;
  const primary = screen.getPrimaryDisplay();
  // Bottom-right of the primary display, with a 24px margin.
  const x = primary.bounds.x + primary.bounds.width - w - 24;
  const y = primary.bounds.y + primary.bounds.height - h - 60;

  widgetWin = new BrowserWindow({
    x, y, width: w, height: h,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreenable: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: widgetPreloadPath(),
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Critical: exclude this window from screen capture so the gdigrab feed
  // never sees the recording widget. Uses Windows' WDA_EXCLUDEFROMCAPTURE.
  try { widgetWin.setContentProtection(true); } catch { /* ignore */ }

  if (isDev()) widgetWin.loadURL(rendererURL("widget.html"));
  else widgetWin.loadFile(rendererFile("widget.html"));

  widgetWin.once("ready-to-show", () => {
    widgetWin?.showInactive();
    widgetWin?.setAlwaysOnTop(true, "screen-saver");
    widgetWin?.setVisibleOnAllWorkspaces(true);
    if (initialPhase) widgetWin?.webContents.send("widget:phase", initialPhase);
  });
  widgetWin.webContents.once("did-finish-load", () => {
    if (initialPhase) widgetWin?.webContents.send("widget:phase", initialPhase);
  });
  widgetWin.on("closed", () => { widgetWin = null; });
}

function closeRecordingWidget() {
  if (widgetWin) {
    try { widgetWin.close(); } catch { /* ignore */ }
    widgetWin = null;
  }
}

async function openRegionWindow(): Promise<{ x: number; y: number; width: number; height: number } | null> {
  if (regionWin) {
    regionWin.focus();
    return null;
  }

  // Hide the main window so the user can see what they're selecting.
  const mainWasVisible = !!mainWin && mainWin.isVisible();
  if (mainWasVisible) mainWin?.hide();
  // Tiny delay to let the OS finish the hide animation before painting the overlay.
  await new Promise((r) => setTimeout(r, 120));

  // Cover the entire virtual desktop.
  const all = screen.getAllDisplays();
  const minX = Math.min(...all.map((d) => d.bounds.x));
  const minY = Math.min(...all.map((d) => d.bounds.y));
  const maxX = Math.max(...all.map((d) => d.bounds.x + d.bounds.width));
  const maxY = Math.max(...all.map((d) => d.bounds.y + d.bounds.height));

  regionWin = new BrowserWindow({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreenable: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: false,
    },
  });

  regionWin.setIgnoreMouseEvents(false);
  if (isDev()) regionWin.loadURL(rendererURL("region.html"));
  else regionWin.loadFile(rendererFile("region.html"));
  regionWin.once("ready-to-show", () => {
    regionWin?.show();
    regionWin?.setAlwaysOnTop(true, "screen-saver");
    regionWin?.focus();
  });
  regionWin.on("closed", () => {
    regionWin = null;
    if (mainWasVisible) {
      mainWin?.show();
      mainWin?.focus();
    }
  });

  return new Promise((resolve) => {
    regionResolver = resolve;
  });
}

app.whenReady().then(() => {
  // Provide system audio loopback to the hidden audio renderer when it calls
  // navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }).
  // No driver / Stereo Mix required.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      callback({ video: sources[0], audio: "loopback" });
    }).catch(() => {
      callback({});
    });
  }, { useSystemPicker: false });

  setupAudioCaptureIpc();
  createMainWindow();
  createTray();
  registerHotkeys();
  setupIpc();

  // Background update flow: check + download silently. The installer is then
  // held and runs silently (NSIS /S) on app quit, replacing the binary in
  // the background. The renderer banner shows progress + a "Install now"
  // button for impatient users.
  setTimeout(async () => {
    try { await updater.backgroundUpdate(); } catch { /* best-effort */ }
  }, 5_000);
  setInterval(async () => {
    try { await updater.backgroundUpdate(); } catch { /* ignore */ }
  }, 6 * 60 * 60 * 1000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });

  app.on("second-instance", () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });
});

app.on("window-all-closed", () => {
  // keep tray alive on Windows; quit only on explicit Quit
  if (process.platform !== "darwin" && !tray) app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  // Destroy the tray immediately so the system tray doesn't leave a ghost
  // icon behind after the process exits.
  try { tray?.destroy(); tray = null; } catch { /* ignore */ }
  // Run the silent NSIS installer detached if an update was downloaded
  // during this session. NSIS replaces the .exe in the background while we
  // exit; user reopens recorda on the new version next launch.
  try {
    if (updater.hasPendingInstall()) {
      updater.installPendingSilent();
    }
  } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function captureCenter(req: RecordRequest): { x: number; y: number } {
  if (req.mode === "region" && req.region) {
    return {
      x: Math.round(req.region.x + req.region.width / 2),
      y: Math.round(req.region.y + req.region.height / 2),
    };
  }
  return {
    x: Math.round(req.display.x + req.display.width / 2),
    y: Math.round(req.display.y + req.display.height / 2),
  };
}

function countdownDataURL(initial: number): string {
  // Self-contained HTML — no Vite, no React, no CSS bundles. Renders just a
  // giant red number, no badge, no background. Window is transparent.
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;padding:0;height:100%;width:100%;background:transparent;overflow:hidden;
    font-family:"Segoe UI",system-ui,sans-serif;-webkit-user-select:none;user-select:none;}
  #wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}
  #num{
    color:#ef4444;
    font-size:240px;font-weight:900;line-height:1;
    text-shadow:0 0 28px rgba(239,68,68,0.55), 0 8px 22px rgba(0,0,0,0.55);
    transform:scale(0.85);opacity:0;animation:pop 0.4s ease-out forwards;
  }
  @keyframes pop {
    0%   {transform:scale(0.55);opacity:0;}
    55%  {transform:scale(1.1);opacity:1;}
    100% {transform:scale(1);opacity:1;}
  }
  #num.tick {animation:pop 0.4s ease-out forwards;}
</style></head>
<body>
<div id="wrap"><div id="num">${initial}</div></div>
<script>
  const num = document.getElementById('num');
  function setN(n){
    num.textContent = String(n);
    num.classList.remove('tick'); void num.offsetWidth; num.classList.add('tick');
  }
  if (window.recordaCountdown && window.recordaCountdown.onTick) {
    window.recordaCountdown.onTick(setN);
  }
</script>
</body></html>`;
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

async function runCountdown(seconds: number, req: RecordRequest): Promise<void> {
  if (countdownWin) {
    try { countdownWin.close(); } catch { /* ignore */ }
    countdownWin = null;
  }

  // Solid (non-transparent) small window centred on capture target. Transparent
  // layered windows have proven flaky on this machine; solid windows always paint.
  const center = captureCenter(req);
  const size = 300;
  console.log("[recorda countdown] opening at", center, "size", size);

  countdownWin = new BrowserWindow({
    x: Math.round(center.x - size / 2),
    y: Math.round(center.y - size / 2),
    width: size,
    height: size,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreenable: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: countdownPreloadPath(),
      contextIsolation: true,
      sandbox: false,
    },
  });
  countdownWin.setIgnoreMouseEvents(true);
  countdownWin.loadURL(countdownDataURL(seconds));
  countdownWin.setAlwaysOnTop(true, "screen-saver");
  countdownWin.moveTop();

  countdownWin.webContents.once("did-finish-load", () => {
    console.log("[recorda countdown] did-finish-load");
  });
  countdownWin.webContents.on("console-message", (_e, _level, msg) => {
    console.log("[recorda countdown renderer]", msg);
  });

  // Initial digit was painted via the data URL itself. Wait, then tick.
  await sleep(700);
  for (let n = seconds - 1; n >= 1; n--) {
    countdownWin?.webContents.send("countdown:tick", n);
    await sleep(1000);
  }
  await sleep(800);
  try { countdownWin?.close(); } catch { /* ignore */ }
  countdownWin = null;
  console.log("[recorda countdown] closed");
}
