import { Monitor, Crop, MousePointer2, Volume2, Mic } from "lucide-react";
import { useStore } from "../store";
import { cn } from "../lib/cn";

function ModeCard({
  active,
  icon,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all",
        active
          ? "border-accent bg-accent/10 shadow-glow"
          : "border-border bg-bg-panel hover:bg-bg-panel2 hover:border-border"
      )}
    >
      <div className={cn("rounded-lg p-2", active ? "bg-accent/20 text-accent" : "bg-bg-panel2 text-text-dim")}>
        {icon}
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-text-faint">{hint}</div>
    </button>
  );
}

export function SourcePanel() {
  const {
    mode, setMode, displays, selectedDisplayId, setSelectedDisplay,
    region, fps, setFps, encoders, encoderId, setEncoder, quality, setQuality,
    container, setContainer, captureCursor, setCaptureCursor,
    captureSystemAudio, setCaptureSystemAudio, captureMic, setCaptureMic,
    audioDevices, micDevice, setMicDevice, recState,
  } = useStore();

  const isRecording = recState.status === "recording" || recState.status === "starting";
  const disabled = isRecording;

  const pickRegion = async () => {
    const r = await window.recorda.pickRegion();
    if (r) useStore.getState().setRegion(r);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="label mb-2">Capture mode</div>
        <div className="flex gap-3">
          <ModeCard
            active={mode === "fullscreen"}
            icon={<Monitor size={18} />}
            title="Full screen"
            hint="Capture an entire monitor"
            onClick={() => setMode("fullscreen")}
          />
          <ModeCard
            active={mode === "region"}
            icon={<Crop size={18} />}
            title="Region"
            hint={region ? `${region.width} x ${region.height}` : "Drag to select an area"}
            onClick={() => { setMode("region"); pickRegion(); }}
          />
        </div>
      </div>

      {mode === "fullscreen" && (
        <div>
          <div className="label mb-2">Monitor</div>
          <select
            className="field w-full"
            disabled={disabled}
            value={selectedDisplayId ?? ""}
            onChange={(e) => setSelectedDisplay(parseInt(e.target.value, 10))}
          >
            {displays.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
      )}

      {mode === "region" && (
        <div>
          <div className="label mb-2">Region</div>
          <div className="flex items-center gap-2">
            <div className="field flex-1 font-mono text-xs">
              {region
                ? `(${region.x}, ${region.y})  ${region.width} x ${region.height}`
                : "no region selected"}
            </div>
            <button className="btn btn-secondary" disabled={disabled} onClick={pickRegion}>
              <Crop size={14} />
              {region ? "Reselect" : "Select..."}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="label mb-2">FPS</div>
          <select
            className="field w-full"
            disabled={disabled}
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value, 10))}
          >
            {[24, 30, 48, 60, 120].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <div className="label mb-2">Quality</div>
          <select
            className="field w-full"
            disabled={disabled}
            value={quality}
            onChange={(e) => setQuality(e.target.value as never)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="lossless">Lossless</option>
          </select>
        </div>
        <div>
          <div className="label mb-2">Format</div>
          <select
            className="field w-full"
            disabled={disabled}
            value={container}
            onChange={(e) => setContainer(e.target.value as never)}
          >
            <option value="mp4">MP4</option>
            <option value="mkv">MKV</option>
            <option value="webm">WebM</option>
          </select>
        </div>
      </div>

      <div>
        <div className="label mb-2">Encoder</div>
        <select
          className="field w-full"
          disabled={disabled}
          value={encoderId}
          onChange={(e) => setEncoder(e.target.value)}
        >
          {encoders.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <div className="text-[11px] text-text-faint mt-1.5">
          Hardware encoders (NVENC / QuickSync / AMF) use much less CPU and battery.
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="label">Sources</div>

        <Toggle
          active={captureCursor}
          disabled={disabled}
          onClick={() => setCaptureCursor(!captureCursor)}
          icon={<MousePointer2 size={16} />}
          label="Cursor"
        />
        <Toggle
          active={captureSystemAudio}
          disabled={disabled}
          onClick={() => setCaptureSystemAudio(!captureSystemAudio)}
          icon={<Volume2 size={16} />}
          label="System audio"
          subtitle="WASAPI loopback (default playback device)"
        />
        <div>
          <Toggle
            active={captureMic}
            disabled={disabled}
            onClick={() => setCaptureMic(!captureMic)}
            icon={<Mic size={16} />}
            label="Microphone"
          />
          {captureMic && (
            <select
              className="field w-full mt-2 text-xs"
              disabled={disabled}
              value={micDevice ?? ""}
              onChange={(e) => setMicDevice(e.target.value || null)}
            >
              <option value="">- pick a microphone -</option>
              {audioDevices.map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  active,
  disabled,
  onClick,
  icon,
  label,
  subtitle,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center w-full gap-3 rounded-lg p-2 text-left transition-colors disabled:opacity-50",
        "hover:bg-bg-panel2"
      )}
    >
      <div className={cn("p-1.5 rounded-md", active ? "bg-accent/20 text-accent" : "bg-bg-panel2 text-text-faint")}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm">{label}</div>
        {subtitle && <div className="text-[11px] text-text-faint">{subtitle}</div>}
      </div>
      <div
        className={cn(
          "h-5 w-9 rounded-full p-0.5 transition-colors",
          active ? "bg-accent" : "bg-bg-panel2"
        )}
      >
        <div
          className={cn(
            "h-4 w-4 rounded-full bg-white shadow transition-transform",
            active ? "translate-x-4" : "translate-x-0"
          )}
        />
      </div>
    </button>
  );
}
