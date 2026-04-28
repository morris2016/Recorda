import { useEffect, useState } from "react";
import { ArrowUpRight, Download, X, CheckCircle2, Loader2 } from "lucide-react";
import type { UpdateProgress } from "../types";

export function UpdateBanner() {
  const [state, setState] = useState<UpdateProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Initial state from main (the auto-check might have already run)
    window.recorda.getUpdateState().then((s) => { if (!cancelled) setState(s); });
    // Subscribe to live updates
    const off = window.recorda.onUpdateState((s) => { if (!cancelled) setState(s as UpdateProgress); });
    // Trigger a renderer-driven check too
    const t = setTimeout(() => window.recorda.checkForUpdate().catch(() => undefined), 4000);
    return () => { cancelled = true; off(); clearTimeout(t); };
  }, []);

  if (!state) return null;
  // Show ONLY for cases the user can act on. Successful auto-download +
  // install-on-quit happens silently — no banner spam.
  //   - "downloading": show progress so the user knows something's happening
  //   - "available": only if we can't auto-download (URL isn't a direct .exe)
  //   - "error": surface the failure
  // "ready" and "installing" are hidden — installer fires on next quit.
  const cantAutoDownload = state.phase === "available" && state.url && !/\.exe(\?|$)/i.test(state.url);
  const visible =
    state.phase === "downloading" ||
    cantAutoDownload ||
    state.phase === "error";
  if (!visible || dismissed) return null;

  const onInstall = async () => {
    const r = await window.recorda.downloadAndInstallUpdate();
    if (!r.ok && r.error) {
      // If the URL isn't a direct .exe (e.g. fall-back releases page), open it.
      if (state.url) window.recorda.openDownload(state.url);
    }
  };

  const isWorking = state.phase === "downloading" || state.phase === "installing";

  return (
    <div className="mx-6 mt-3 mb-1 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 flex items-center gap-3">
      <div className="rounded-md bg-accent/20 text-accent p-1.5">
        {state.phase === "ready" || state.phase === "installing" ? (
          <CheckCircle2 size={16} />
        ) : isWorking ? (
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
          {state.phase === "ready" && (
            <span className="font-medium text-text">recorda {state.latest} downloaded - ready to install</span>
          )}
          {state.phase === "installing" && (
            <span className="font-medium text-text">Launching installer...</span>
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
        {state.phase === "available" && state.notes && (
          <div className="text-[11px] text-text-dim truncate mt-0.5">{state.notes}</div>
        )}
      </div>

      {state.phase === "available" && (
        <button className="btn btn-primary text-xs" onClick={onInstall}>
          <Download size={13} /> Install update
        </button>
      )}
      {state.phase === "ready" && (
        <button className="btn btn-primary text-xs" onClick={onInstall}>
          <Download size={13} /> Install now
        </button>
      )}

      {!isWorking && (
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
