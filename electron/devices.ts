import { screen } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegPath } from "./paths";

const exec = promisify(execFile);

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

export function listDisplays(): DisplayInfo[] {
  const all = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  return all.map((d, i) => ({
    id: d.id,
    label: `Display ${i + 1}  -  ${d.size.width} x ${d.size.height}${d.id === primaryId ? "  (primary)" : ""}`,
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId,
  }));
}

export async function listAudioDevices(): Promise<AudioDevice[]> {
  // ffmpeg -list_devices true -f dshow -i dummy   (writes to stderr, returns nonzero — that's fine)
  const ff = ffmpegPath();
  let stderr = "";
  try {
    await exec(ff, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (e: unknown) {
    const err = e as { stderr?: string };
    stderr = err.stderr ?? "";
  }
  const devices: AudioDevice[] = [];
  let mode: "video" | "audio" | null = null;
  for (const raw of stderr.split(/\r?\n/)) {
    const line = raw.trim();
    if (/DirectShow video devices/i.test(line)) { mode = "video"; continue; }
    if (/DirectShow audio devices/i.test(line)) { mode = "audio"; continue; }
    if (mode !== "audio") continue;
    const m = line.match(/"([^"]+)"/);
    if (m && !line.includes("Alternative name")) {
      devices.push({ name: m[1], kind: "input", isDefault: false });
    }
  }
  return devices;
}

// Probe an encoder by running a 0.1 s dummy encode. Returns true only if
// ffmpeg actually opens the encoder + accepts at least one frame. Catches
// the "Cannot load nvcuda.dll" / "QSV not supported" / "AMF init failed"
// class of errors that don't show up in `ffmpeg -encoders`.
async function probeEncoder(encoder: string): Promise<boolean> {
  const ff = ffmpegPath();
  const args = [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc=duration=0.1:size=320x240:rate=30",
    "-c:v", encoder,
    "-pix_fmt", "yuv420p",
    "-f", "null", "-",
  ];
  try {
    await exec(ff, args, { windowsHide: true, timeout: 8000, maxBuffer: 1 * 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

let cachedEncoders: EncoderInfo[] | null = null;

export async function detectEncoders(): Promise<EncoderInfo[]> {
  if (cachedEncoders) return cachedEncoders;

  const ff = ffmpegPath();
  let stdout = "";
  try {
    const r = await exec(ff, ["-hide_banner", "-encoders"], {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    stdout = r.stdout;
  } catch {
    cachedEncoders = [{ id: "libx264", label: "x264 (CPU)", hwAccel: "none" }];
    return cachedEncoders;
  }

  const candidates: EncoderInfo[] = [];
  if (/h264_nvenc/.test(stdout)) candidates.push({ id: "h264_nvenc", label: "NVIDIA NVENC (H.264)", hwAccel: "nvenc" });
  if (/hevc_nvenc/.test(stdout)) candidates.push({ id: "hevc_nvenc", label: "NVIDIA NVENC (HEVC)", hwAccel: "nvenc" });
  if (/h264_qsv/.test(stdout)) candidates.push({ id: "h264_qsv", label: "Intel QuickSync (H.264)", hwAccel: "qsv" });
  if (/h264_amf/.test(stdout)) candidates.push({ id: "h264_amf", label: "AMD AMF (H.264)", hwAccel: "amf" });

  // Probe in parallel — typically completes in well under 2 s.
  const results = await Promise.all(candidates.map((c) => probeEncoder(c.id)));
  const working = candidates.filter((_c, i) => results[i]);

  // libx264 always works (it ships with FFmpeg essentials build).
  working.push({ id: "libx264", label: "x264 (CPU)", hwAccel: "none" });

  cachedEncoders = working;
  return working;
}
