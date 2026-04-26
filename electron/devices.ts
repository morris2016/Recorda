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

export async function detectEncoders(): Promise<EncoderInfo[]> {
  const ff = ffmpegPath();
  let stdout = "";
  try {
    const r = await exec(ff, ["-hide_banner", "-encoders"], {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    stdout = r.stdout;
  } catch {
    return [{ id: "libx264", label: "x264 (CPU)", hwAccel: "none" }];
  }
  const list: EncoderInfo[] = [];
  if (/h264_nvenc/.test(stdout)) list.push({ id: "h264_nvenc", label: "NVIDIA NVENC (H.264)", hwAccel: "nvenc" });
  if (/hevc_nvenc/.test(stdout)) list.push({ id: "hevc_nvenc", label: "NVIDIA NVENC (HEVC)", hwAccel: "nvenc" });
  if (/h264_qsv/.test(stdout)) list.push({ id: "h264_qsv", label: "Intel QuickSync (H.264)", hwAccel: "qsv" });
  if (/h264_amf/.test(stdout)) list.push({ id: "h264_amf", label: "AMD AMF (H.264)", hwAccel: "amf" });
  list.push({ id: "libx264", label: "x264 (CPU)", hwAccel: "none" });
  return list;
}
