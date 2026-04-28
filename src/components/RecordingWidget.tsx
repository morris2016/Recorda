import { useEffect, useState } from "react";
import { Square } from "lucide-react";

type Phase =
  | { kind: "countdown"; n: number }
  | { kind: "recording"; startedAt: number };

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
  const [phase, setPhase] = useState<Phase | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (window.recordaWidget) {
      window.recordaWidget.onPhase(setPhase);
      window.recordaWidget.ready();
    }
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2.5 rounded-xl bg-[#0b0d12]/95 border border-rec/40 px-3 py-1.5 backdrop-blur"
        style={{
          boxShadow:
            "0 0 0 1px rgba(239,68,68,0.35), 0 6px 24px rgba(0,0,0,0.55), 0 0 24px rgba(239,68,68,0.18)",
          animation: "widget-mount 0.25s ease-out",
        }}
      >
        {phase?.kind === "countdown" && <CountdownView n={phase.n} />}
        {phase?.kind === "recording" && (
          <RecordingView startedAt={phase.startedAt} now={now} />
        )}
      </div>

      <style>{`
        @keyframes widget-mount {
          0% { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes tick-pop {
          0%   { transform: scale(1.5); opacity: 0; }
          55%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes morph-in {
          0%   { transform: translateY(2px) scale(0.92); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function CountdownView({ n }: { n: number }) {
  return (
    <>
      <span className="h-2 w-2 rounded-full bg-rec animate-pulse-rec" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
        Starting in
      </span>
      <span
        key={n}
        className="font-mono text-[22px] font-bold tabular-nums w-7 text-center text-rec leading-none"
        style={{ animation: "tick-pop 0.4s ease-out" }}
      >
        {n}
      </span>
    </>
  );
}

function RecordingView({ startedAt, now }: { startedAt: number; now: number }) {
  const elapsed = now - startedAt;
  return (
    <div
      className="flex items-center gap-2.5"
      style={{ animation: "morph-in 0.35s ease-out" }}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-rec animate-pulse-rec" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-rec">
          REC
        </span>
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
  );
}
