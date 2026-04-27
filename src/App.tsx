import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { ModeTabs } from "./components/ModeTabs";
import { SettingsMenu } from "./components/SettingsMenu";
import { RecordPanel } from "./components/RecordPanel";
import { RecentList } from "./components/RecentList";
import { UpdateBanner } from "./components/UpdateBanner";
import { useStore } from "./store";

export default function App() {
  const {
    setDisplays, setAudioDevices, setEncoders, setRecents, setRecState,
    setSelectedDisplay, setEncoder, setOutputDir,
  } = useStore();

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const [displays, audio, encoders, dir, recents, st] = await Promise.all([
        window.recorda.listDisplays(),
        window.recorda.listAudioDevices(),
        window.recorda.detectEncoders(),
        window.recorda.defaultOutputDir(),
        window.recorda.listRecentRecordings(),
        window.recorda.getRecordingState(),
      ]);
      if (cancelled) return;
      setDisplays(displays);
      setAudioDevices(audio);
      setEncoders(encoders);
      setRecents(recents);
      setOutputDir(dir);
      setRecState(st);
      const primary = displays.find((d) => d.primary) ?? displays[0];
      if (primary) setSelectedDisplay(primary.id);
      const preferred = encoders.find((e) => e.hwAccel !== "none") ?? encoders[0];
      if (preferred) setEncoder(preferred.id);
    };
    init();
    return () => { cancelled = true; };
  }, [setDisplays, setAudioDevices, setEncoders, setRecents, setOutputDir, setRecState, setSelectedDisplay, setEncoder]);

  useEffect(() => {
    const off1 = window.recorda.onStateChange((s) => {
      setRecState(s);
      if (s.status === "idle" && s.outputPath) {
        window.recorda.listRecentRecordings().then(setRecents);
      }
    });
    const off2 = window.recorda.onHotkey((action) => {
      if (action === "start") {
        const s = useStore.getState();
        if (s.recState.status === "idle") {
          const display = s.displays.find((d) => d.id === s.selectedDisplayId) ?? s.displays[0];
          if (!display) return;
          window.recorda.startRecording({
            mode: s.mode,
            display: { x: display.x, y: display.y, width: display.width, height: display.height },
            region: s.mode === "region" ? s.region ?? undefined : undefined,
            fps: s.fps,
            encoder: s.encoderId,
            quality: s.quality,
            container: s.container,
            captureCursor: s.captureCursor,
            captureSystemAudio: s.captureSystemAudio,
            captureMic: s.captureMic,
            micDevice: s.micDevice ?? undefined,
            outputDir: s.outputDir,
            countdownSeconds: s.countdownSeconds,
          });
        }
      }
    });
    return () => { off1(); off2(); };
  }, [setRecState, setRecents]);

  return (
    <div className="flex flex-col h-full">
      <TitleBar />
      <UpdateBanner />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <ModeTabs />
            <SettingsMenu />
          </div>

          <RecordPanel />

          <details className="card group">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none list-none">
              <span className="text-xs font-medium text-text-dim">Recent recordings</span>
              <span className="text-text-faint text-xs group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="border-t border-border-soft">
              <RecentList />
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
