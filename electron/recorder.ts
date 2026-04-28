import { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { ffmpegPath } from "./paths";
import { startAudioCapture, stopAudioCapture } from "./audio-capture";

export type Mode = "fullscreen" | "region";
export type Quality = "low" | "medium" | "high" | "lossless";
export type Container = "mp4" | "mkv" | "webm";

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecordRequest {
  mode: Mode;
  display: { x: number; y: number; width: number; height: number };
  region?: CaptureRect;
  fps: number;
  encoder: string;             // e.g. "h264_nvenc" | "libx264"
  quality: Quality;
  container: Container;
  captureCursor: boolean;
  captureSystemAudio: boolean;
  captureMic: boolean;
  micDevice?: string;          // dshow device name
  outputDir: string;
  countdownSeconds?: number;   // 0 = no countdown
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

function timestampName(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// H.264 / HEVC require even width and height; libx264 will refuse odd dims
// outright. Round down to the nearest even pixel so any region or display
// with odd pixel counts captures cleanly.
function evenDown(n: number): number { return Math.max(2, Math.floor(n / 2) * 2); }

function buildArgs(req: RecordRequest, outputPath: string): string[] {
  const args: string[] = ["-hide_banner", "-loglevel", "info", "-y"];

  // Video input only — audio is handled by Chromium's WASAPI loopback in a
  // hidden renderer (audio-capture.ts), then muxed on stop. Keeping ffmpeg's
  // input simple gives us better video timing and avoids dshow's flakiness.
  args.push(
    "-f", "gdigrab",
    "-framerate", String(req.fps),
    "-draw_mouse", req.captureCursor ? "1" : "0",
    "-thread_queue_size", "1024",
  );

  if (req.mode === "region" && req.region) {
    const r = req.region;
    args.push(
      "-offset_x", String(r.x),
      "-offset_y", String(r.y),
      "-video_size", `${evenDown(r.width)}x${evenDown(r.height)}`,
      "-i", "desktop",
    );
  } else {
    args.push(
      "-offset_x", String(req.display.x),
      "-offset_y", String(req.display.y),
      "-video_size", `${evenDown(req.display.width)}x${evenDown(req.display.height)}`,
      "-i", "desktop",
    );
  }

  // Belt-and-braces: even if a future input source slips an odd dimension
  // through, this filter trims to even at the encoder boundary so x264 etc.
  // never sees an odd height.
  args.push("-vf", "crop=trunc(iw/2)*2:trunc(ih/2)*2");

  // ---- video encoder ----
  const enc = req.encoder;
  args.push("-c:v", enc);
  args.push("-pix_fmt", "yuv420p");

  switch (req.quality) {
    case "low":
      if (enc === "libx264") args.push("-preset", "veryfast", "-crf", "28");
      else args.push("-b:v", "3M", "-maxrate", "4M", "-bufsize", "8M");
      break;
    case "medium":
      if (enc === "libx264") args.push("-preset", "veryfast", "-crf", "23");
      else args.push("-b:v", "8M", "-maxrate", "10M", "-bufsize", "16M");
      break;
    case "high":
      if (enc === "libx264") args.push("-preset", "medium", "-crf", "18");
      else args.push("-b:v", "16M", "-maxrate", "20M", "-bufsize", "32M");
      break;
    case "lossless":
      if (enc === "libx264") args.push("-preset", "veryfast", "-qp", "0");
      else args.push("-b:v", "30M", "-maxrate", "40M", "-bufsize", "60M");
      break;
  }

  args.push("-movflags", "+faststart");
  args.push(outputPath);
  return args;
}

function buildMuxArgs(videoPath: string, audioPath: string, outputPath: string, container: Container): string[] {
  // Copy video, transcode the captured Opus/WebM audio into the target codec
  // for the chosen container. Use shortest=longest so the output spans both.
  const audioCodec = container === "webm" ? "libopus" : "aac";
  return [
    "-hide_banner",
    "-loglevel", "info",
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", audioCodec,
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  ];
}

class Recorder extends EventEmitter {
  private proc: ChildProcess | null = null;
  private state: RecordingState = { status: "idle" };
  private finalOutputPath = "";
  private videoTempPath = "";
  private audioRequested = false;
  private container: Container = "mp4";
  private logBuffer: string[] = [];

  getState(): RecordingState {
    return { ...this.state };
  }

  async start(req: RecordRequest): Promise<RecordingState> {
    if (this.state.status !== "idle") {
      return { ...this.state, errorMessage: "already recording" };
    }
    fs.mkdirSync(req.outputDir, { recursive: true });
    this.container = req.container;
    this.audioRequested = !!(req.captureSystemAudio || req.captureMic);
    this.finalOutputPath = path.join(req.outputDir, `recorda ${timestampName()}.${req.container}`);
    // If audio is on, video goes to a temp file first; mux step on stop produces
    // the final container with both streams. Without audio, ffmpeg writes the
    // final file directly.
    this.videoTempPath = this.audioRequested
      ? path.join(app.getPath("temp"), `recorda-video-${Date.now()}.${req.container}`)
      : this.finalOutputPath;

    this.logBuffer = [];
    this.state = {
      status: "starting",
      outputPath: this.finalOutputPath,
      startedAt: Date.now(),
      pausedDurationMs: 0,
    };
    this.emit("state", this.state);

    const args = buildArgs(req, this.videoTempPath);
    const ff = ffmpegPath();

    try {
      this.proc = spawn(ff, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      this.state = { status: "error", errorMessage: `failed to spawn ffmpeg: ${(e as Error).message}` };
      this.emit("state", this.state);
      return this.state;
    }

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      this.logBuffer.push(text);
      if (this.logBuffer.length > 500) this.logBuffer.shift();
      this.parseProgress(text);
    });
    this.proc.on("error", (err) => {
      this.state = { status: "error", errorMessage: err.message };
      this.emit("state", this.state);
    });
    this.proc.on("close", (code) => {
      this.handleVideoClose(code).catch((e) => {
        console.error("[recorda] post-record handler crashed:", e);
        this.state = { ...this.state, status: "error", errorMessage: (e as Error).message };
        this.emit("state", this.state);
      });
    });

    this.state = { ...this.state, status: "recording" };
    this.emit("state", this.state);

    // Audio capture in parallel. Best-effort: a failure here drops back to
    // video-only without breaking the recording.
    if (this.audioRequested) {
      const r = await startAudioCapture({
        systemAudio: req.captureSystemAudio,
        mic: req.captureMic,
      });
      if (!r.ok) {
        console.warn("[recorda] audio capture failed, continuing video-only:", r.error);
        this.audioRequested = false;
      }
    }

    return this.state;
  }

  stop(): RecordingState {
    if (!this.proc || this.state.status === "idle") return this.state;
    this.state = { ...this.state, status: "stopping" };
    this.emit("state", this.state);
    try {
      this.proc.stdin?.write("q");
      this.proc.stdin?.end();
    } catch {
      try { this.proc.kill("SIGINT"); } catch { /* ignore */ }
    }
    return this.state;
  }

  private async handleVideoClose(code: number | null) {
    const wasStopping = this.state.status === "stopping";
    this.proc = null;

    // Always stop the audio renderer regardless of code so it cleans up tracks.
    let audioFile: string | null = null;
    if (this.audioRequested) {
      audioFile = await stopAudioCapture();
    }

    if (code !== 0 && !wasStopping) {
      this.state = {
        ...this.state,
        status: "error",
        errorMessage: `ffmpeg exited with code ${code}\n\n${this.tailLog(20)}`,
      };
      this.emit("state", this.state);
      this.cleanupTemp(audioFile);
      this.emit("finalized", this.finalOutputPath, code);
      return;
    }

    // Mux video + audio into the final container, or promote the video temp.
    const wantMux = audioFile
      && fs.existsSync(audioFile)
      && fs.existsSync(this.videoTempPath)
      && this.videoTempPath !== this.finalOutputPath;

    if (wantMux) {
      try {
        await this.runMux(this.videoTempPath, audioFile!);
      } catch (e) {
        console.error("[recorda] mux failed, promoting video-only:", e);
        try { fs.copyFileSync(this.videoTempPath, this.finalOutputPath); } catch { /* ignore */ }
      }
      this.cleanupTemp(audioFile);
    } else if (this.videoTempPath !== this.finalOutputPath && fs.existsSync(this.videoTempPath)) {
      // Audio missing or failed — promote the video temp to final.
      try { fs.copyFileSync(this.videoTempPath, this.finalOutputPath); } catch { /* ignore */ }
      this.cleanupTemp(null);
    }

    this.state = { ...this.state, status: "idle", outputPath: this.finalOutputPath };
    this.emit("state", this.state);
    this.emit("finalized", this.finalOutputPath, code);
  }

  private runMux(videoPath: string, audioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = buildMuxArgs(videoPath, audioPath, this.finalOutputPath, this.container);
      const ff = ffmpegPath();
      const muxProc = spawn(ff, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      muxProc.stderr?.on("data", (b: Buffer) => { stderr += b.toString(); });
      muxProc.on("error", reject);
      muxProc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`mux exited ${code}: ${stderr.slice(-500)}`));
      });
    });
  }

  private cleanupTemp(audioFile: string | null) {
    if (this.videoTempPath && this.videoTempPath !== this.finalOutputPath) {
      try { fs.unlinkSync(this.videoTempPath); } catch { /* ignore */ }
    }
    if (audioFile) {
      try { fs.unlinkSync(audioFile); } catch { /* ignore */ }
    }
  }

  private parseProgress(text: string) {
    const fpsMatch = text.match(/fps=\s*([\d.]+)/);
    const bitrateMatch = text.match(/bitrate=\s*([\d.]+)kbits\/s/);
    const sizeMatch = text.match(/(?:size|Lsize)=\s*(\d+)kB/);
    const dropMatch = text.match(/drop=\s*(\d+)/);

    let changed = false;
    if (fpsMatch) { this.state.fps = parseFloat(fpsMatch[1]); changed = true; }
    if (bitrateMatch) { this.state.bitrateKbps = parseFloat(bitrateMatch[1]); changed = true; }
    if (sizeMatch) { this.state.totalSizeBytes = parseInt(sizeMatch[1], 10) * 1024; changed = true; }
    if (dropMatch) { this.state.droppedFrames = parseInt(dropMatch[1], 10); changed = true; }

    if (changed) this.emit("progress", { ...this.state });
  }

  private tailLog(lines: number): string {
    const all = this.logBuffer.join("");
    const arr = all.split(/\r?\n/);
    return arr.slice(-lines).join("\n");
  }
}

export const recorder = new Recorder();

export function defaultOutputDir(): string {
  return app.getPath("videos");
}
