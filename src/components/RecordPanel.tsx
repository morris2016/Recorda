import { Circle, Square, FolderOpen, FolderInput } from "lucide-react";
import { useStore } from "../store";
import { useEffect, useState } from "react";
import { formatDuration } from "../lib/format";
import { cn } from "../lib/cn";

export function RecordPanel() {
  const {
    recState, displays, selectedDisplayId, mode, region,
    fps, encoderId, quality, container,
    captureCursor, captureSystemAudio, captureMic, micDevice,
    outputDir, setOutputDir,
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
    });
  };

  const stop = () => window.recorda.stopRecording();

  const browseFolder = async () => {
    const f = await window.recorda.chooseFolder();
    if (f) setOutputDir(f);
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-col items-center justify-center min-h-[200px] gap-4">
        <div
          className={cn(
            "text-[44px] font-mono tabular-nums tracking-tight font-semibold",
            isRecording ? "text-rec" : "text-text-dim"
          )}
        >
          {formatDuration(elapsed)}
        </div>

        <div className="flex items-center gap-2">
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs text-rec">
              <span className="h-2 w-2 rounded-full bg-rec animate-pulse-rec" />
              <span className="font-medium uppercase tracking-wider">Recording</span>
            </span>
          )}
          {isStarting && <span className="text-xs text-text-dim">Starting...</span>}
          {isStopping && <span className="text-xs text-text-dim">Finalizing file...</span>}
          {recState.status === "idle" && <span className="text-xs text-text-faint">Ready</span>}
          {recState.status === "error" && <span className="text-xs text-rec">Error</span>}
        </div>

        {isRecording ? (
          <button
            onClick={stop}
            className="btn btn-rec px-8 py-3 text-base shadow-rec"
          >
            <Square size={18} /> Stop  (Ctrl+R)
          </button>
        ) : (
          <button
            onClick={start}
            disabled={!canRecord || isStarting}
            className={cn(
              "btn px-8 py-3 text-base",
              canRecord ? "btn-rec shadow-rec" : "btn-secondary"
            )}
          >
            <Circle size={18} fill="currentColor" /> Record  (Ctrl+R)
          </button>
        )}

      </div>

      <div>
        <div className="label mb-2">Save to</div>
        <div className="flex items-center gap-2">
          <div className="field flex-1 truncate text-xs font-mono text-text-dim">{outputDir || "..."}</div>
          <button className="btn btn-secondary" onClick={browseFolder} disabled={isRecording}>
            <FolderInput size={14} /> Browse
          </button>
        </div>
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
