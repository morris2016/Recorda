// Hidden audio renderer. Captures system audio via getDisplayMedia (Chromium
// uses WASAPI loopback under the hood — no drivers/Stereo Mix needed) and/or
// the default microphone via getUserMedia, mixes them with Web Audio, and
// streams Opus/WebM chunks to the main process via the preload bridge.

interface Opts { systemAudio: boolean; mic: boolean }

let recorder: MediaRecorder | null = null;
let context: AudioContext | null = null;
const sourceStreams: MediaStream[] = [];

async function start(opts: Opts) {
  try {
    sourceStreams.length = 0;

    if (opts.systemAudio) {
      // setDisplayMediaRequestHandler in main supplies the system audio source
      // so this resolves without showing a picker.
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      // We only want audio — drop video tracks immediately so no compositor work.
      ds.getVideoTracks().forEach((t) => t.stop());
      // Some Chromium builds drop the audio track if it never sees video used.
      // Keep the underlying stream alive by keeping the reference.
      sourceStreams.push(ds);
    }

    if (opts.mic) {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2,
        },
      });
      sourceStreams.push(mic);
    }

    if (sourceStreams.length === 0) {
      window.recordaAudio.reportError("no audio sources requested");
      return;
    }

    context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    const dest = context.createMediaStreamDestination();
    for (const s of sourceStreams) {
      const tracks = s.getAudioTracks();
      if (tracks.length === 0) continue;
      const node = context.createMediaStreamSource(new MediaStream(tracks));
      const gain = context.createGain();
      gain.gain.value = 1.0;
      node.connect(gain).connect(dest);
    }

    const mime = pickMime();
    if (!mime) {
      window.recordaAudio.reportError("no supported audio mime type");
      return;
    }

    recorder = new MediaRecorder(dest.stream, {
      mimeType: mime,
      audioBitsPerSecond: 192_000,
    });

    recorder.ondataavailable = async (ev) => {
      if (ev.data && ev.data.size > 0) {
        const buf = await ev.data.arrayBuffer();
        window.recordaAudio.reportChunk(buf);
      }
    };
    recorder.onstop = () => {
      window.recordaAudio.reportFinished();
      teardown();
    };
    recorder.onerror = (e) => {
      window.recordaAudio.reportError(`recorder error: ${(e as Event).type}`);
    };

    recorder.start(500); // emit chunks every 500 ms
    window.recordaAudio.reportStarted();
  } catch (e) {
    window.recordaAudio.reportError((e as Error).message);
    teardown();
  }
}

function pickMime(): string {
  const candidates = [
    "audio/webm; codecs=opus",
    "audio/webm",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function stop() {
  try {
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      window.recordaAudio.reportFinished();
      teardown();
    }
  } catch (e) {
    window.recordaAudio.reportError((e as Error).message);
  }
}

function teardown() {
  for (const s of sourceStreams) {
    s.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
  }
  sourceStreams.length = 0;
  if (context) {
    try { context.close(); } catch { /* ignore */ }
    context = null;
  }
  recorder = null;
}

window.recordaAudio.onStart(start);
window.recordaAudio.onStop(stop);
