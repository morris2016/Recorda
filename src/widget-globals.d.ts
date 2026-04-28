export {};

declare global {
  interface Window {
    recordaWidget: {
      onStartedAt: (cb: (ms: number) => void) => void;
      stop: () => void;
    };
  }
}
