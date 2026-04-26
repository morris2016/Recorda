import https from "node:https";
import { app, shell } from "electron";

export interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  url: string;
  notes: string;
  error?: string;
}

const MANIFEST_URL =
  "https://raw.githubusercontent.com/morris2016/Recorda/main/version.json";

export function getCurrentVersion(): string {
  return app.getVersion();
}

// strcmp-style: <0 / 0 / >0. Tolerant of "v" prefix and missing patch parts.
export function compareVersions(a: string, b: string): number {
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

function fetchJSON(url: string, timeoutMs = 6000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "recorda-updater" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJSON(res.headers.location, timeoutMs).then(resolve).catch(reject);
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

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = getCurrentVersion();
  try {
    const data = (await fetchJSON(MANIFEST_URL)) as { version?: string; url?: string; notes?: string };
    const latest = (data.version ?? "").trim();
    const url = (data.url ?? "").trim();
    const notes = (data.notes ?? "").trim();
    if (!latest) {
      return { available: false, current, latest: "", url: "", notes: "", error: "manifest missing 'version'" };
    }
    return {
      available: compareVersions(latest, current) > 0,
      current,
      latest,
      url,
      notes,
    };
  } catch (e) {
    return {
      available: false,
      current,
      latest: "",
      url: "",
      notes: "",
      error: (e as Error).message,
    };
  }
}

export function openDownloadInBrowser(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  shell.openExternal(url);
}
