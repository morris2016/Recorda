import { useEffect, useState } from "react";

declare global {
  interface Window {
    recordaCountdown: {
      onTick: (cb: (n: number) => void) => () => void;
    };
  }
}

export function CountdownOverlay() {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    if (!window.recordaCountdown) return;
    return window.recordaCountdown.onTick((value) => setN(value));
  }, []);

  // Big circle + number. Shows "GO" briefly when n == 0.
  const showGo = n === 0;
  const display = showGo ? "GO" : n != null ? String(n) : "";

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
      <div
        key={`${n ?? "i"}-${showGo ? "go" : "n"}`}
        className="relative flex items-center justify-center"
        style={{ width: 220, height: 220 }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(239,68,68,0.95) 0%, rgba(220,38,38,0.92) 55%, rgba(127,29,29,0.95) 100%)",
            boxShadow:
              "0 0 0 4px rgba(11,13,18,0.85), 0 0 32px rgba(239,68,68,0.55), inset 0 0 24px rgba(0,0,0,0.35)",
            animation: "pop 0.85s ease-out forwards",
          }}
        />
        <div
          className="relative font-bold tracking-tight"
          style={{
            color: "#ffffff",
            fontSize: showGo ? 76 : 120,
            textShadow: "0 6px 20px rgba(0,0,0,0.55)",
            lineHeight: 1,
          }}
        >
          {display}
        </div>
      </div>

      <style>{`
        @keyframes pop {
          0%   { transform: scale(0.8); opacity: 0.0; }
          25%  { transform: scale(1.05); opacity: 1; }
          70%  { transform: scale(1.00); opacity: 1; }
          100% { transform: scale(0.96); opacity: 0.92; }
        }
      `}</style>
    </div>
  );
}
