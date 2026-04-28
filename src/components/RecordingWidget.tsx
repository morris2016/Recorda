import { useEffect, useState } from "react";
import { Square } from "lucide-react";

function fmt(ms: number) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function RecordingWidget() {
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (window.recordaWidget) {
      window.recordaWidget.onStartedAt((ms: number) => setStartedAt(ms));
    }
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const elapsed = now - startedAt;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2.5 rounded-xl bg-[#0b0d12]/95 border border-rec/40 px-3 py-1.5 backdrop-blur"
        style={{ boxShadow: "0 0 0 1px rgba(239,68,68,0.35), 0 6px 24px rgba(0,0,0,0.55), 0 0 24px rgba(239,68,68,0.18)" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rec animate-pulse-rec" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-rec">REC</span>
        </span>

        <span className="font-mono tabular-nums text-sm text-text">
          {fmt(elapsed)}
        </span>

        <button
          onClick={() => window.recordaWidget?.stop()}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className="flex items-center gap-1 rounded-lg bg-rec hover:bg-rec-hover text-white text-xs font-medium px-2.5 py-1 ml-1"
          title="Stop recording"
        >
          <Square size={11} fill="currentColor" />
          Stop
        </button>
      </div>
    </div>
  );
}
