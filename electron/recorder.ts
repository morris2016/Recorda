import { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { ffmpegPath } from "./paths";

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

function buildArgs(req: RecordRequest, outputPath: string): string[] {
  const args: string[] = ["-hide_banner", "-loglevel", "info", "-y"];

  // ---- video input (gdigrab) ----
  args.push("-f", "gdigrab",
            "-framerate", String(req.fps),
            "-draw_mouse", req.captureCursor ? "1" : "0");

  if (req.mode === "region" && req.region) {
    const r = req.region;
    args.push(
      "-offset_x", String(r.x),
      "-offset_y", String(r.y),
      "-video_size", `${r.width}x${r.height}`,
      "-i", "desktop",
    );
  } else {
    args.push(
      "-offset_x", String(req.display.x),
      "-offset_y", String(req.display.y),
      "-video_size", `${req.display.width}x${req.display.height}`,
      "-i", "desktop",
    );
  }

  // ---- audio inputs ----
  // System audio via WASAPI loopback (FFmpeg's -f dshow + "audio=virtual-audio-capturer" used to be needed;
  // modern ffmpeg supports loopback via -f dshow on the default render device — but it's flaky.
  // Cleanest path on Win10/11 is `-f dshow -i audio="<output device>"` if a loopback driver is available,
  // OR bind to the system mixer via "-f dshow -i audio=Stereo Mix" if the user enabled it.
  // We provide the simplest reliable option: dshow microphone if requested. System audio via dshow uses
  // the user-provided device name (if any).
  let audioInputs = 0;
  if (req.captureSystemAudio) {
    // We'll try the WASAPI default render endpoint via "audio=@device_..." pattern.
    // To stay portable and simple: capture via dshow with the special "Stereo Mix"-style device the user picked,
    // OR fall back to none. The renderer offers a device picker for this.
    // Here we expect the caller to have stuffed a system-audio device name into micDevice if both are off, etc.
  }
  if (req.captureMic && req.micDevice) {
    args.push("-f", "dshow", "-i", `audio=${req.micDevice}`);
    audioInputs += 1;
  }

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

  // ---- audio encoder ----
  if (audioInputs > 0) {
    args.push("-c:a", req.container === "webm" ? "libopus" : "aac");
    args.push("-b:a", "192k");
  }

  args.push("-movflags", "+faststart");
  args.push(outputPath);
  return args;
}

class Recorder extends EventEmitter {
  private proc: ChildProcess | null = null;
  private state: RecordingState = { status: "idle" };
  private outputPath = "";
  private logBuffer: string[] = [];

  getState(): RecordingState {
    return { ...this.state };
  }

  start(req: RecordRequest): RecordingState {
    if (this.state.status !== "idle") {
      return { ...this.state, errorMessage: "already recording" };
    }
    fs.mkdirSync(req.outputDir, { recursive: true });
    const ext = req.container;
    this.outputPath = path.join(req.outputDir, `recorda ${timestampName()}.${ext}`);

    const args = buildArgs(req, this.outputPath);
    const ff = ffmpegPath();

    this.logBuffer = [];
    this.state = {
      status: "starting",
      outputPath: this.outputPath,
      startedAt: Date.now(),
      pausedDurationMs: 0,
    };
    this.emit("state", this.state);

    try {
      this.proc = spawn(ff, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      this.state = { status: "error", errorMessage: `failed to spawn ffmpeg: ${(e as Error).message}` };
      this.emit("state", this.state);
      return this.state;
    }

    this.state = { ...this.state, status: "recording" };
    this.emit("state", this.state);

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
      const wasStopping = this.state.status === "stopping";
      this.proc = null;
      if (code === 0 || wasStopping) {
        this.state = { ...this.state, status: "idle" };
      } else {
        this.state = {
          ...this.state,
          status: "error",
          errorMessage: `ffmpeg exited with code ${code}\n\n${this.tailLog(20)}`,
        };
      }
      this.emit("state", this.state);
      this.emit("finalized", this.outputPath, code);
    });

    return this.state;
  }

  stop(): RecordingState {
    if (!this.proc || this.state.status === "idle") return this.state;
    this.state = { ...this.state, status: "stopping" };
    this.emit("state", this.state);

    // Send 'q' to stdin for clean MP4 finalization. SIGTERM doesn't trailer-write on Windows.
    try {
      this.proc.stdin?.write("q");
      this.proc.stdin?.end();
    } catch {
      // fallback
      try { this.proc.kill("SIGINT"); } catch { /* ignore */ }
    }
    return this.state;
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
