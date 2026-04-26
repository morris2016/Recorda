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
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { isDev, rendererURL, rendererFile, preloadPath, appIconPath } from "./paths";
import { listAudioDevices, listDisplays, detectEncoders } from "./devices";
import { recorder, RecordRequest, defaultOutputDir } from "./recorder";
import { checkForUpdate, getCurrentVersion, openDownloadInBrowser } from "./updater";

let mainWin: BrowserWindow | null = null;
let regionWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let regionResolver: ((rect: { x: number; y: number; width: number; height: number } | null) => void) | null = null;

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 980,
    height: 660,
    minWidth: 860,
    minHeight: 580,
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
        ? { label: "Stop recording  (Ctrl+R)", click: () => recorder.stop() }
        : { label: "Start recording  (Ctrl+R)", click: () => mainWin?.webContents.send("hotkey", "start"), enabled: !!mainWin },
      { type: "separator" },
      { label: "Quit", click: () => { tray?.destroy(); app.quit(); } },
    ]);
    tray?.setContextMenu(ctx);
  };
  refreshMenu();
  tray.on("click", () => { mainWin?.show(); mainWin?.focus(); });
  recorder.on("state", refreshMenu);
}

export const TOGGLE_HOTKEY = "CommandOrControl+R";

function registerHotkeys() {
  const ok = globalShortcut.register(TOGGLE_HOTKEY, () => {
    const s = recorder.getState();
    if (s.status === "recording") recorder.stop();
    else mainWin?.webContents.send("hotkey", "start");
  });
  if (!ok) console.warn(`[recorda] failed to register global hotkey ${TOGGLE_HOTKEY} - already in use?`);
}

function setupIpc() {
  ipcMain.handle("devices:list-displays", () => listDisplays());
  ipcMain.handle("devices:list-audio", () => listAudioDevices());
  ipcMain.handle("devices:detect-encoders", () => detectEncoders());

  ipcMain.handle("rec:start", (_e, req: RecordRequest) => recorder.start(req));
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
  ipcMain.handle("update:check", () => checkForUpdate());
  ipcMain.handle("update:current-version", () => getCurrentVersion());
  ipcMain.on("update:open-download", (_e, url: string) => openDownloadInBrowser(url));

  ipcMain.on("win:minimize", () => mainWin?.minimize());
  ipcMain.on("win:maximize-toggle", () => {
    if (!mainWin) return;
    if (mainWin.isMaximized()) mainWin.unmaximize();
    else mainWin.maximize();
  });
  ipcMain.on("win:hide", () => mainWin?.hide());
  ipcMain.on("win:close", () => mainWin?.close());

  let lastStatus: string | undefined;
  let mainWasVisibleBeforeRec = false;
  recorder.on("state", (s) => {
    mainWin?.webContents.send("rec:state-change", s);
    // Hide the main window once recording actually starts (so it isn't part of the capture).
    if (s.status === "recording" && lastStatus !== "recording") {
      mainWasVisibleBeforeRec = !!mainWin && mainWin.isVisible();
      if (mainWasVisibleBeforeRec) {
        // small delay so the click animation on the Record button finishes painting before we hide
        setTimeout(() => mainWin?.hide(), 80);
      }
    }
    // Recording finished (idle or error) → restore the window if we hid it.
    if ((s.status === "idle" || s.status === "error") && (lastStatus === "recording" || lastStatus === "stopping")) {
      if (mainWasVisibleBeforeRec) {
        mainWin?.show();
        mainWin?.focus();
        mainWasVisibleBeforeRec = false;
      }
    }
    lastStatus = s.status;
  });
  recorder.on("progress", (s) => mainWin?.webContents.send("rec:state-change", s));
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
  createMainWindow();
  createTray();
  registerHotkeys();
  setupIpc();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  // keep tray alive on Windows; quit only on explicit Quit
  if (process.platform !== "darwin" && !tray) app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
