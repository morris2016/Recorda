import { useEffect, useRef, useState } from "react";
import { Settings, Monitor, Film, Cpu, Volume2, Mic } from "lucide-react";
import { useStore } from "../store";
import { cn } from "../lib/cn";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const {
    displays, selectedDisplayId, setSelectedDisplay,
    encoders, encoderId, setEncoder,
    fps, setFps, quality, setQuality, container, setContainer,
    captureSystemAudio, setCaptureSystemAudio,
    captureMic, setCaptureMic, audioDevices, micDevice, setMicDevice,
    recState, mode,
  } = useStore();

  const disabled = recState.status === "recording" || recState.status === "starting";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "btn",
          open ? "btn-primary" : "btn-secondary"
        )}
        title="Settings"
      >
        <Settings size={15} />
        Settings
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-80 z-30 rounded-xl border border-border bg-bg-soft shadow-2xl"
          style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)" }}
        >
          <div className="p-4 space-y-4 max-h-[68vh] overflow-y-auto">
            <Section icon={<Monitor size={13} />} title="Display">
              <select
                className="field w-full"
                disabled={disabled || mode === "region"}
                value={selectedDisplayId ?? ""}
                onChange={(e) => setSelectedDisplay(parseInt(e.target.value, 10))}
              >
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
              {mode === "region" && (
                <div className="text-[10px] text-text-faint mt-1.5">
                  Display picker is disabled in Region mode.
                </div>
              )}
            </Section>

            <Section icon={<Film size={13} />} title="Video">
              <Row label="FPS">
                <select
                  className="field"
                  disabled={disabled}
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value, 10))}
                >
                  {[24, 30, 48, 60, 120].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Row>
              <Row label="Quality">
                <select
                  className="field"
                  disabled={disabled}
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as never)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="lossless">Lossless</option>
                </select>
              </Row>
              <Row label="Format">
                <select
                  className="field"
                  disabled={disabled}
                  value={container}
                  onChange={(e) => setContainer(e.target.value as never)}
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                  <option value="webm">WebM</option>
                </select>
              </Row>
            </Section>

            <Section icon={<Cpu size={13} />} title="Encoder">
              <select
                className="field w-full"
                disabled={disabled}
                value={encoderId}
                onChange={(e) => setEncoder(e.target.value)}
              >
                {encoders.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
              <div className="text-[10px] text-text-faint mt-1.5">
                Hardware encoders use much less CPU.
              </div>
            </Section>

            <Section icon={<Volume2 size={13} />} title="Audio">
              <SmallToggle
                active={captureSystemAudio}
                disabled={disabled}
                onClick={() => setCaptureSystemAudio(!captureSystemAudio)}
                icon={<Volume2 size={13} />}
                label="System audio"
                hint="loopback (default playback device)"
              />
              <SmallToggle
                active={captureMic}
                disabled={disabled}
                onClick={() => setCaptureMic(!captureMic)}
                icon={<Mic size={13} />}
                label="Microphone"
              />
              {captureMic && (
                <select
                  className="field w-full mt-1 text-xs"
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
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
        <span className="text-accent">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-text-dim">{label}</span>
      <div className="min-w-[55%]">{children}</div>
    </div>
  );
}

function SmallToggle({
  active, disabled, onClick, icon, label, hint,
}: {
  active: boolean; disabled?: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center w-full gap-2.5 rounded-lg p-2 text-left transition-colors",
        "hover:bg-bg-panel2 disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      <div className={cn(
        "p-1 rounded-md",
        active ? "bg-accent/20 text-accent" : "bg-bg-panel2 text-text-faint"
      )}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-xs">{label}</div>
        {hint && <div className="text-[10px] text-text-faint">{hint}</div>}
      </div>
      <div className={cn(
        "h-4 w-7 rounded-full p-0.5 transition-colors",
        active ? "bg-accent" : "bg-bg-panel2"
      )}>
        <div className={cn(
          "h-3 w-3 rounded-full bg-white shadow transition-transform",
          active ? "translate-x-3" : "translate-x-0"
        )} />
      </div>
    </button>
  );
}
