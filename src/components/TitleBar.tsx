import { Minus, Square, X } from "lucide-react";

export function TitleBar() {
  return (
    <div className="drag h-9 flex items-center justify-between border-b border-border-soft bg-bg/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-3">
        <div className="h-2.5 w-2.5 rounded-full bg-rec shadow-rec animate-pulse-rec" />
        <span className="text-sm font-semibold tracking-tight">recorda</span>
        <span className="text-[11px] text-text-faint ml-1">v0.1</span>
      </div>
      <div className="no-drag flex h-full">
        <button
          className="px-4 hover:bg-bg-panel2 text-text-dim hover:text-text"
          onClick={() => window.recorda.minimize()}
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          className="px-4 hover:bg-bg-panel2 text-text-dim hover:text-text"
          onClick={() => window.recorda.maximizeToggle()}
          title="Maximize"
        >
          <Square size={11} />
        </button>
        <button
          className="px-4 hover:bg-rec text-text-dim hover:text-white"
          onClick={() => window.recorda.close()}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
