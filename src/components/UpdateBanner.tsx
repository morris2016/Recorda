import { useEffect, useState } from "react";
import { ArrowUpRight, Download, X, CheckCircle2, Loader2 } from "lucide-react";
import type { UpdateProgress } from "../types";

export function UpdateBanner() {
  const [state, setState] = useState<UpdateProgress | null>(null);
  const [autoInstallMs, setAutoInstallMs] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.recorda.getUpdateState().then((s) => { if (!cancelled) setState(s); });
    const off1 = window.recorda.onUpdateState((s) => { if (!cancelled) setState(s as UpdateProgress); });
    const off2 = window.recorda.onAutoInstallTick(({ remainingMs }) => {
      if (!cancelled) setAutoInstallMs(remainingMs);
    });
    const t = setTimeout(() => window.recorda.checkForUpdate().catch(() => undefined), 4000);
    return () => { cancelled = true; off1(); off2(); clearTimeout(t); };
  }, []);

  if (!state) return null;

  const isAutoInstalling = state.phase === "ready" && autoInstallMs > 0;
  const cantAutoDownload = state.phase === "available" && state.url && !/\.exe(\?|$)/i.test(state.url);
  const visible =
    state.phase === "downloading" ||
    isAutoInstalling ||
    cantAutoDownload ||
    state.phase === "error";
  if (!visible || dismissed) return null;

  const onInstall = async () => {
    const r = await window.recorda.downloadAndInstallUpdate();
    if (!r.ok && r.error && state.url) window.recorda.openDownload(state.url);
  };

  return (
    <div className="mx-6 mt-3 mb-1 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 flex items-center gap-3">
      <div className="rounded-md bg-accent/20 text-accent p-1.5">
        {state.phase === "ready" ? (
          <CheckCircle2 size={16} />
        ) : state.phase === "downloading" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ArrowUpRight size={16} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm">
          {state.phase === "downloading" && (
            <>
              <span className="font-medium text-text">Downloading recorda {state.latest}</span>
              <span className="text-text-faint ml-2">
                {state.percent ?? 0}%
                {state.totalBytes ? `  (${formatBytes(state.receivedBytes)} / ${formatBytes(state.totalBytes)})` : ""}
              </span>
            </>
          )}
          {isAutoInstalling && (
            <>
              <span className="font-medium text-text">recorda {state.latest} ready</span>
              <span className="text-text-faint ml-2">
                installing in {Math.ceil(autoInstallMs / 1000)} s
              </span>
            </>
          )}
          {state.phase === "available" && (
            <>
              <span className="font-medium text-text">recorda {state.latest} is available</span>
              <span className="text-text-faint ml-2">- you're on {state.current}</span>
            </>
          )}
          {state.phase === "error" && (
            <span className="font-medium text-rec">Update error: {state.errorMessage}</span>
          )}
        </div>
        {state.phase === "downloading" && (
          <div className="mt-1.5 h-1 rounded-full bg-bg-panel2 overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{ width: `${state.percent ?? 0}%` }}
            />
          </div>
        )}
        {isAutoInstalling && (
          <div className="mt-1.5 h-1 rounded-full bg-bg-panel2 overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-1000 linear"
              style={{ width: `${100 - Math.min(100, (autoInstallMs / 15000) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {isAutoInstalling && (
        <button
          className="btn btn-secondary text-xs"
          onClick={() => window.recorda.cancelAutoInstall()}
          title="Cancel auto-install (will install on quit instead)"
        >
          Cancel
        </button>
      )}
      {state.phase === "available" && cantAutoDownload && (
        <button className="btn btn-primary text-xs" onClick={onInstall}>
          <Download size={13} /> Install update
        </button>
      )}

      {!isAutoInstalling && state.phase !== "downloading" && (
        <button
          className="btn btn-ghost p-1.5"
          onClick={() => setDismissed(true)}
          title="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function formatBytes(b?: number): string {
  if (!b || b <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}
