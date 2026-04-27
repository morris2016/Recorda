import { create } from "zustand";
import {
  AudioDevice,
  Container,
  DisplayInfo,
  EncoderInfo,
  Mode,
  Quality,
  RecentRecording,
  RecordingState,
  RegionRect,
} from "./types";

interface State {
  // capability info
  displays: DisplayInfo[];
  audioDevices: AudioDevice[];
  encoders: EncoderInfo[];
  recents: RecentRecording[];

  // user choices
  mode: Mode;
  selectedDisplayId: number | null;
  region: RegionRect | null;
  fps: number;
  encoderId: string;
  quality: Quality;
  container: Container;
  captureCursor: boolean;
  captureSystemAudio: boolean;
  captureMic: boolean;
  micDevice: string | null;
  outputDir: string;
  countdownSeconds: number;

  // runtime
  recState: RecordingState;
  elapsedMs: number;

  // setters
  setMode: (m: Mode) => void;
  setSelectedDisplay: (id: number) => void;
  setRegion: (r: RegionRect | null) => void;
  setFps: (n: number) => void;
  setEncoder: (id: string) => void;
  setQuality: (q: Quality) => void;
  setContainer: (c: Container) => void;
  setCaptureCursor: (b: boolean) => void;
  setCaptureSystemAudio: (b: boolean) => void;
  setCaptureMic: (b: boolean) => void;
  setMicDevice: (n: string | null) => void;
  setOutputDir: (s: string) => void;
  setCountdownSeconds: (n: number) => void;

  setDisplays: (d: DisplayInfo[]) => void;
  setAudioDevices: (d: AudioDevice[]) => void;
  setEncoders: (e: EncoderInfo[]) => void;
  setRecents: (r: RecentRecording[]) => void;
  setRecState: (s: RecordingState) => void;
  setElapsed: (ms: number) => void;
}

export const useStore = create<State>((set) => ({
  displays: [],
  audioDevices: [],
  encoders: [],
  recents: [],

  mode: "fullscreen",
  selectedDisplayId: null,
  region: null,
  fps: 30,
  encoderId: "libx264",
  quality: "high",
  container: "mp4",
  captureCursor: true,
  captureSystemAudio: true,
  captureMic: false,
  micDevice: null,
  outputDir: "",
  countdownSeconds: 3,

  recState: { status: "idle" },
  elapsedMs: 0,

  setMode: (m) => set({ mode: m }),
  setSelectedDisplay: (id) => set({ selectedDisplayId: id }),
  setRegion: (r) => set({ region: r, mode: r ? "region" : "fullscreen" }),
  setFps: (n) => set({ fps: n }),
  setEncoder: (id) => set({ encoderId: id }),
  setQuality: (q) => set({ quality: q }),
  setContainer: (c) => set({ container: c }),
  setCaptureCursor: (b) => set({ captureCursor: b }),
  setCaptureSystemAudio: (b) => set({ captureSystemAudio: b }),
  setCaptureMic: (b) => set({ captureMic: b }),
  setMicDevice: (n) => set({ micDevice: n }),
  setOutputDir: (s) => set({ outputDir: s }),
  setCountdownSeconds: (n) => set({ countdownSeconds: n }),

  setDisplays: (d) => set({ displays: d }),
  setAudioDevices: (d) => set({ audioDevices: d }),
  setEncoders: (e) => set({ encoders: e }),
  setRecents: (r) => set({ recents: r }),
  setRecState: (s) => set({ recState: s }),
  setElapsed: (ms) => set({ elapsedMs: ms }),
}));
