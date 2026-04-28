import path from "node:path";
import fs from "node:fs";

// Lazy accessors so we never touch electron's `app` at module-load time
// (it can be undefined depending on the load order).
function getApp() {
  // Late require so we don't hit the namespace before electron's loader is ready.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron");
  return app;
}

export function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

function isPackaged(): boolean {
  try { return !!getApp().isPackaged; } catch { return false; }
}

export function projectRoot(): string {
  // Unpackaged dev or "preview" mode → use the repo root.
  if (!isPackaged()) return path.resolve(__dirname, "..");
  return path.resolve(process.resourcesPath, "..");
}

export function ffmpegPath(): string {
  const candidates = !isPackaged()
    ? [path.join(projectRoot(), "resources", "bin", "ffmpeg.exe")]
    : [
        path.join(process.resourcesPath, "bin", "ffmpeg.exe"),
        path.join(process.resourcesPath, "app.asar.unpacked", "resources", "bin", "ffmpeg.exe"),
      ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return "ffmpeg";
}

export function ffprobePath(): string {
  const candidates = !isPackaged()
    ? [path.join(projectRoot(), "resources", "bin", "ffprobe.exe")]
    : [path.join(process.resourcesPath, "bin", "ffprobe.exe")];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return "ffprobe";
}

export function rendererURL(htmlFile: "index.html" | "region.html" | "countdown.html" | "audio.html" | "widget.html"): string {
  // Used only in dev; in prod we go through loadFile with rendererFile().
  const base = "http://localhost:5173";
  return htmlFile === "index.html" ? base : `${base}/${htmlFile}`;
}

export function rendererFile(htmlFile: "index.html" | "region.html" | "countdown.html" | "audio.html" | "widget.html"): string {
  // dist-electron/main.js -> ../dist/<htmlFile>. Works inside app.asar too.
  return path.join(__dirname, "..", "dist", htmlFile);
}

export function preloadPath(): string {
  return path.join(__dirname, "preload.js");
}

export function countdownPreloadPath(): string {
  return path.join(__dirname, "preload-countdown.js");
}

export function widgetPreloadPath(): string {
  return path.join(__dirname, "preload-widget.js");
}

export function appIconPath(): string {
  const dev = path.join(projectRoot(), "resources", "icons", "recorda.ico");
  if (fs.existsSync(dev)) return dev;
  if (process.resourcesPath) {
    const prod = path.join(process.resourcesPath, "icons", "recorda.ico");
    if (fs.existsSync(prod)) return prod;
  }
  return "";
}
