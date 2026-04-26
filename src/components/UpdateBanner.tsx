import { useEffect, useState } from "react";
import { ArrowUpRight, Download, X } from "lucide-react";
import type { UpdateInfo } from "../types";

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const r = await window.recorda.checkForUpdate();
        if (cancelled) return;
        setInfo(r);
      } catch {
        // silent
      }
    };
    // First check 4s after launch so we don't slow startup paint.
    const t = setTimeout(run, 4000);
    // Re-check every 6 hours.
    const i = setInterval(run, 6 * 60 * 60 * 1000);
    return () => { cancelled = true; clearTimeout(t); clearInterval(i); };
  }, []);

  if (!info || !info.available || dismissed) return null;

  return (
    <div className="mx-6 mt-3 mb-1 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 flex items-center gap-3">
      <div className="rounded-md bg-accent/20 text-accent p-1.5">
        <ArrowUpRight size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">
          <span className="font-medium text-text">recorda {info.latest} is available</span>
          <span className="text-text-faint ml-2">- you're on {info.current}</span>
        </div>
        {info.notes && (
          <div className="text-[11px] text-text-dim truncate mt-0.5">{info.notes}</div>
        )}
      </div>
      <button
        className="btn btn-primary text-xs"
        onClick={() => info.url && window.recorda.openDownload(info.url)}
        disabled={!info.url}
      >
        <Download size={13} /> Download
      </button>
      <button
        className="btn btn-ghost p-1.5"
        onClick={() => setDismissed(true)}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
