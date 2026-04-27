export {};

declare global {
  interface Window {
    recordaAudio: {
      onStart: (cb: (opts: { systemAudio: boolean; mic: boolean }) => void) => void;
      onStop: (cb: () => void) => void;
      reportStarted: () => void;
      reportError: (msg: string) => void;
      reportChunk: (buf: ArrayBuffer) => void;
      reportFinished: () => void;
    };
  }
}
