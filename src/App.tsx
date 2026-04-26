import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { SourcePanel } from "./components/SourcePanel";
import { RecordPanel } from "./components/RecordPanel";
import { RecentList } from "./components/RecentList";
import { UpdateBanner } from "./components/UpdateBanner";
import { useStore } from "./store";

export default function App() {
  const {
    setDisplays, setAudioDevices, setEncoders, setRecents, setRecState,
    setSelectedDisplay, setEncoder, setOutputDir, displays,
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
      <div className="flex-1 overflow-hidden flex">
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
            <div>
              <h1 className="text-lg font-semibold mb-1">Capture</h1>
              <p className="text-xs text-text-faint mb-5">
                Configure what you want to record. {displays.length} {displays.length === 1 ? "display" : "displays"} detected.
              </p>
              <SourcePanel />
            </div>
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-3">Record</h2>
                <RecordPanel />
              </div>
              <div>
                <h3 className="text-sm font-medium text-text-dim mb-2">Recent</h3>
                <RecentList />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
