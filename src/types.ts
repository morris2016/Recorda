export type Mode = "fullscreen" | "region";
export type Quality = "low" | "medium" | "high" | "lossless";
export type Container = "mp4" | "mkv" | "webm";

export interface DisplayInfo {
  id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
}

export interface AudioDevice {
  name: string;
  kind: "input" | "output";
  isDefault: boolean;
}

export interface EncoderInfo {
  id: string;
  label: string;
  hwAccel: "nvenc" | "qsv" | "amf" | "none";
}

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecordRequest {
  mode: Mode;
  display: { x: number; y: number; width: number; height: number };
  region?: RegionRect;
  fps: number;
  encoder: string;
  quality: Quality;
  container: Container;
  captureCursor: boolean;
  captureSystemAudio: boolean;
  captureMic: boolean;
  micDevice?: string;
  outputDir: string;
}

export interface RecordingState {
  status: "idle" | "starting" | "recording" | "paused" | "stopping" | "error";
  outputPath?: string;
  startedAt?: number;
  pausedDurationMs?: number;
  pausedAt?: number;
  errorMessage?: string;
  fps?: number;
  bitrateKbps?: number;
  totalSizeBytes?: number;
  droppedFrames?: number;
}

export interface RecentRecording {
  name: string;
  path: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  url: string;
  notes: string;
  error?: string;
}

export interface UpdateProgress {
  phase: "checking" | "available" | "downloading" | "ready" | "installing" | "idle" | "error";
  current?: string;
  latest?: string;
  notes?: string;
  url?: string;
  receivedBytes?: number;
  totalBytes?: number;
  percent?: number;
  errorMessage?: string;
  installerPath?: string;
}

declare global {
  interface Window {
    recorda: {
      listDisplays: () => Promise<DisplayInfo[]>;
      listAudioDevices: () => Promise<AudioDevice[]>;
      detectEncoders: () => Promise<EncoderInfo[]>;
      startRecording: (req: RecordRequest) => Promise<RecordingState>;
      stopRecording: () => Promise<RecordingState>;
      getRecordingState: () => Promise<RecordingState>;
      pickRegion: () => Promise<RegionRect | null>;
      chooseFolder: () => Promise<string | null>;
      showInExplorer: (filePath: string) => Promise<void>;
      defaultOutputDir: () => Promise<string>;
      listRecentRecordings: () => Promise<RecentRecording[]>;
      checkForUpdate: () => Promise<UpdateInfo>;
      getCurrentVersion: () => Promise<string>;
      getUpdateState: () => Promise<UpdateProgress>;
      downloadAndInstallUpdate: () => Promise<{ ok: boolean; error?: string }>;
      openDownload: (url: string) => void;
      onUpdateState: (cb: (s: UpdateProgress) => void) => () => void;
      minimize: () => void;
      maximizeToggle: () => void;
      hideToTray: () => void;
      close: () => void;
      regionConfirm: (rect: RegionRect) => void;
      regionCancel: () => void;
      regionGetGeometry: () => Promise<{ x: number; y: number; width: number; height: number; scaleFactor: number }>;
      onStateChange: (cb: (s: RecordingState) => void) => () => void;
      onHotkey: (cb: (action: string) => void) => () => void;
    };
  }
}
