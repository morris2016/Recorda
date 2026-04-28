import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { app, dialog, shell, BrowserWindow } from "electron";
import { EventEmitter } from "node:events";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/morris2016/Recorda/main/version.json";

export interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  url: string;        // direct .exe download (preferred) OR releases page (fallback)
  notes: string;
  error?: string;
}

export interface UpdateProgress {
  phase: "checking" | "available" | "downloading" | "ready" | "installing" | "idle" | "error";
  current?: string;
  latest?: string;
  notes?: string;
  url?: string;
  // download progress
  receivedBytes?: number;
  totalBytes?: number;
  percent?: number;
  errorMessage?: string;
  // path of the downloaded installer once ready
  installerPath?: string;
}

export class Updater extends EventEmitter {
  private state: UpdateProgress = { phase: "idle" };
  private downloading = false;
  private cachedInstaller: string | null = null;
  private cachedFor: string | null = null; // version we cached for

  getState(): UpdateProgress {
    return { ...this.state };
  }

  private setState(s: UpdateProgress) {
    this.state = { ...s };
    this.emit("state", this.state);
  }

  getCurrentVersion(): string {
    return app.getVersion();
  }

  static compareVersions(a: string, b: string): number {
    const parse = (s: string) =>
      s.replace(/^v/i, "")
        .split(".")
        .map((p) => parseInt(p.replace(/[^0-9].*$/, ""), 10) || 0);
    const pa = parse(a);
    const pb = parse(b);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const da = pa[i] ?? 0;
      const db = pb[i] ?? 0;
      if (da !== db) return da - db;
    }
    return 0;
  }

  async check(silent = false): Promise<UpdateInfo> {
    const current = this.getCurrentVersion();
    this.setState({ phase: "checking", current });
    try {
      const data = (await fetchJSON(MANIFEST_URL)) as { version?: string; url?: string; notes?: string };
      const latest = (data.version ?? "").trim();
      const url = (data.url ?? "").trim();
      const notes = (data.notes ?? "").trim();
      if (!latest) {
        const info: UpdateInfo = { available: false, current, latest: "", url: "", notes: "", error: "manifest missing 'version'" };
        this.setState({ phase: "error", current, errorMessage: info.error });
        return info;
      }
      const available = Updater.compareVersions(latest, current) > 0;
      const info: UpdateInfo = { available, current, latest, url, notes };
      if (available) {
        this.setState({ phase: "available", current, latest, notes, url });
      } else {
        this.setState({ phase: "idle", current });
      }
      return info;
    } catch (e) {
      const msg = (e as Error).message;
      this.setState({ phase: "error", current, errorMessage: msg });
      return { available: false, current, latest: "", url: "", notes: "", error: msg };
    }
  }

  // Download the installer to TEMP. Resolves with the local path.
  async download(versionUrl: string, latest: string): Promise<string> {
    if (this.downloading) {
      // wait for it to finish if already in progress
      return new Promise((resolve, reject) => {
        const onState = (s: UpdateProgress) => {
          if (s.phase === "ready" && s.installerPath) { this.off("state", onState); resolve(s.installerPath); }
          else if (s.phase === "error") { this.off("state", onState); reject(new Error(s.errorMessage ?? "download failed")); }
        };
        this.on("state", onState);
      });
    }

    if (this.cachedInstaller && this.cachedFor === latest && fs.existsSync(this.cachedInstaller)) {
      this.setState({ phase: "ready", latest, installerPath: this.cachedInstaller, percent: 100 });
      return this.cachedInstaller;
    }

    if (!/^https?:\/\//i.test(versionUrl)) {
      throw new Error(`bad download URL: ${versionUrl}`);
    }
    if (!/\.exe(\?|$)/i.test(versionUrl)) {
      // URL is not a direct exe (e.g. it points to the releases page). Fall back to
      // opening it in the browser instead of trying to download a non-installer.
      throw new Error("URL is not a direct .exe; falling back to browser");
    }

    const filename = `recorda-Setup-${latest}.exe`;
    const dest = path.join(app.getPath("temp"), filename);
    if (fs.existsSync(dest)) {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }

    this.downloading = true;
    this.setState({ phase: "downloading", latest, percent: 0, receivedBytes: 0 });

    try {
      await downloadToFile(versionUrl, dest, (received, total) => {
        const percent = total > 0 ? Math.floor((received / total) * 100) : 0;
        this.setState({
          phase: "downloading",
          latest,
          receivedBytes: received,
          totalBytes: total,
          percent,
        });
      });
      this.cachedInstaller = dest;
      this.cachedFor = latest;
      this.setState({ phase: "ready", latest, installerPath: dest, percent: 100 });
      return dest;
    } catch (e) {
      const msg = (e as Error).message;
      this.setState({ phase: "error", errorMessage: msg, latest });
      try { fs.existsSync(dest) && fs.unlinkSync(dest); } catch { /* ignore */ }
      throw e;
    } finally {
      this.downloading = false;
    }
  }

  // Spawn the installer detached and quit recorda.
  async installAndQuit(installerPath?: string) {
    const exe = installerPath ?? this.cachedInstaller;
    if (!exe || !fs.existsSync(exe)) throw new Error("installer not downloaded");
    this.setState({ phase: "installing", installerPath: exe });
    // Brief delay so the dialog button can release before we exit.
    setTimeout(async () => {
      try {
        await shell.openPath(exe);
      } catch (e) {
        this.setState({ phase: "error", errorMessage: (e as Error).message });
        return;
      }
      // Quit so the installer can replace the running .exe.
      app.quit();
    }, 300);
  }

  // Background flow: check + download (no UI prompt). The installer is held
  // and run silently on app quit.
  async backgroundUpdate(): Promise<void> {
    const info = await this.check();
    if (!info.available || !info.url) return;
    if (!/\.exe(\?|$)/i.test(info.url)) return; // can't auto-install a page URL
    try {
      await this.download(info.url, info.latest);
      // state becomes "ready"; cachedInstaller is set; banner shows "ready"
    } catch (e) {
      // best-effort; user can still trigger manual install via banner
      this.setState({
        phase: "error",
        errorMessage: (e as Error).message,
        latest: info.latest,
        url: info.url,
      });
    }
  }

  // Detached silent install. Returns true if an installer was spawned.
  // The installer (NSIS /S) replaces the .exe in the background after we quit.
  installPendingSilent(): boolean {
    const exe = this.cachedInstaller;
    if (!exe || !fs.existsSync(exe)) return false;
    try {
      const child = spawn(exe, ["/S"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return true;
    } catch {
      return false;
    }
  }

  hasPendingInstall(): boolean {
    return !!this.cachedInstaller && fs.existsSync(this.cachedInstaller);
  }

  // Convenience: ask the user via native dialog (works even if renderer is broken).
  async promptInstall(parent?: BrowserWindow | null) {
    const s = this.state;
    if (s.phase !== "available" && s.phase !== "ready") return;
    const opts: Electron.MessageBoxOptions = {
      type: "info",
      buttons: ["Install now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "recorda update available",
      message: `recorda ${s.latest} is available.`,
      detail: `${s.notes ?? ""}\n\nYou're on ${s.current ?? this.getCurrentVersion()}.`,
      noLink: true,
    };
    const choice = parent
      ? await dialog.showMessageBox(parent, opts)
      : await dialog.showMessageBox(opts);
    if (choice.response !== 0) return;

    let installer = this.cachedInstaller;
    if (!installer) {
      try {
        installer = await this.download(s.url ?? "", s.latest ?? "");
      } catch (e) {
        // Direct download not possible — open the URL in a browser as a fallback.
        if (s.url) shell.openExternal(s.url);
        else {
          const errOpts: Electron.MessageBoxOptions = {
            type: "error",
            message: "Could not download the update.",
            detail: (e as Error).message,
          };
          if (parent) await dialog.showMessageBox(parent, errOpts);
          else await dialog.showMessageBox(errOpts);
        }
        return;
      }
    }
    await this.installAndQuit(installer);
  }
}

export const updater = new Updater();

export function openDownloadInBrowser(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  shell.openExternal(url);
}

// ----- helpers --------------------------------------------------------------

function fetchJSON(url: string, timeoutMs = 8000, redirects = 5): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error("too many redirects"));
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": "recorda-updater" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        fetchJSON(next, timeoutMs, redirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
  });
}

function downloadToFile(
  url: string,
  dest: string,
  onProgress: (received: number, total: number) => void,
  redirects = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error("too many redirects"));
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": "recorda-updater" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        downloadToFile(next, dest, onProgress, redirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const total = parseInt(res.headers["content-length"] ?? "0", 10) || 0;
      let received = 0;
      const out = fs.createWriteStream(dest);
      res.on("data", (chunk: Buffer) => {
        received += chunk.length;
        onProgress(received, total);
      });
      res.pipe(out);
      out.on("finish", () => out.close((err) => err ? reject(err) : resolve()));
      out.on("error", (err) => { out.close(); reject(err); });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(60_000, () => req.destroy(new Error("timeout")));
  });
}

// Convenience exports kept for backwards-compat with existing IPC.
export function getCurrentVersion(): string {
  return app.getVersion();
}
export function checkForUpdate(): Promise<UpdateInfo> {
  return updater.check();
}
