import { Circle, Square, FolderOpen, FolderInput, MousePointer2, Timer } from "lucide-react";
import { useStore } from "../store";
import { useEffect, useState } from "react";
import { formatDuration } from "../lib/format";
import { cn } from "../lib/cn";

export function RecordPanel() {
  const {
    recState, displays, selectedDisplayId, mode, region,
    fps, encoderId, quality, container,
    captureCursor, setCaptureCursor,
    captureSystemAudio, captureMic, micDevice,
    outputDir, setOutputDir,
    countdownSeconds, setCountdownSeconds,
  } = useStore();

  const isRecording = recState.status === "recording";
  const isStarting = recState.status === "starting";
  const isStopping = recState.status === "stopping";
  const canRecord = recState.status === "idle" && (mode === "fullscreen" ? !!selectedDisplayId : !!region);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [isRecording]);
  const elapsed = isRecording && recState.startedAt ? now - recState.startedAt : 0;

  const start = async () => {
    const display = displays.find((d) => d.id === selectedDisplayId) ?? displays[0];
    if (!display) return;

    await window.recorda.startRecording({
      mode,
      display: { x: display.x, y: display.y, width: display.width, height: display.height },
      region: mode === "region" ? region ?? undefined : undefined,
      fps,
      encoder: encoderId,
      quality,
      container,
      captureCursor,
      captureSystemAudio,
      captureMic,
      micDevice: micDevice ?? undefined,
      outputDir,
      countdownSeconds,
    });
  };

  const stop = () => window.recorda.stopRecording();

  const browseFolder = async () => {
    const f = await window.recorda.chooseFolder();
    if (f) setOutputDir(f);
  };

  return (
    <div className="space-y-2.5">
      <div className="card px-5 py-4 flex flex-col items-center gap-3">
        <div className="flex items-baseline gap-3">
          <div
            className={cn(
              "text-[36px] font-mono tabular-nums tracking-tight font-semibold leading-none",
              isRecording ? "text-rec" : "text-text-dim"
            )}
          >
            {formatDuration(elapsed)}
          </div>
          {isRecording && (
            <span className="flex items-center gap-1.5 text-[10px] text-rec">
              <span className="h-1.5 w-1.5 rounded-full bg-rec animate-pulse-rec" />
              <span className="font-medium uppercase tracking-wider">Rec</span>
            </span>
          )}
          {isStarting && <span className="text-[11px] text-text-dim">Starting...</span>}
          {isStopping && <span className="text-[11px] text-text-dim">Finalizing...</span>}
          {recState.status === "idle" && <span className="text-[11px] text-text-faint">Ready</span>}
          {recState.status === "error" && <span className="text-[11px] text-rec">Error</span>}
        </div>

        {!isRecording && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setCaptureCursor(!captureCursor)}
              disabled={isStarting}
              className={cn(
                "btn py-1.5",
                captureCursor ? "btn-primary" : "btn-secondary"
              )}
              title={captureCursor ? "Cursor will be recorded" : "Cursor will NOT be recorded"}
            >
              <MousePointer2 size={13} />
              {captureCursor ? "Cursor: on" : "Cursor: off"}
            </button>

            <div className="flex items-center gap-1.5 bg-bg-panel border border-border rounded-lg px-2.5 py-1.5">
              <Timer size={13} className="text-text-faint" />
              <span className="text-text-faint">Countdown</span>
              <select
                className="bg-transparent text-text font-medium outline-none ml-1 cursor-pointer"
                value={countdownSeconds}
                onChange={(e) => setCountdownSeconds(parseInt(e.target.value, 10))}
                disabled={isStarting}
              >
                <option value={0}>Off</option>
                <option value={3}>3 s</option>
                <option value={5}>5 s</option>
                <option value={10}>10 s</option>
              </select>
            </div>
          </div>
        )}

        {isRecording ? (
          <button
            onClick={stop}
            className="btn btn-rec px-7 py-2.5 text-base shadow-rec"
          >
            <Square size={16} /> Stop  (Ctrl+R)
          </button>
        ) : (
          <button
            onClick={start}
            disabled={!canRecord || isStarting}
            className={cn(
              "btn px-7 py-2.5 text-base",
              canRecord ? "btn-rec shadow-rec" : "btn-secondary"
            )}
          >
            <Circle size={16} fill="currentColor" /> Record  (Ctrl+R)
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="field flex-1 truncate text-[11px] font-mono text-text-dim flex items-center gap-2">
          <FolderInput size={12} className="text-text-faint shrink-0" />
          <span className="truncate">{outputDir || "..."}</span>
        </div>
        <button className="btn btn-secondary text-xs py-1.5" onClick={browseFolder} disabled={isRecording}>
          Browse
        </button>
      </div>

      {recState.status === "error" && recState.errorMessage && (
        <div className="card border-rec/40 bg-rec/10 p-3 text-xs text-rec font-mono whitespace-pre-wrap">
          {recState.errorMessage}
        </div>
      )}

      {recState.outputPath && recState.status === "idle" && (
        <div className="card p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-text-dim truncate flex-1">
            <span className="text-text-faint">Saved: </span>
            <span className="text-text">{recState.outputPath}</span>
          </div>
          <button
            className="btn btn-secondary text-xs"
            onClick={() => window.recorda.showInExplorer(recState.outputPath!)}
          >
            <FolderOpen size={14} /> Show
          </button>
        </div>
      )}
    </div>
  );
}
