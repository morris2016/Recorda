export {};

type WidgetPhase =
  | { kind: "countdown"; n: number }
  | { kind: "recording"; startedAt: number };

declare global {
  interface Window {
    recordaWidget: {
      ready: () => void;
      onPhase: (cb: (p: WidgetPhase) => void) => void;
      stop: () => void;
    };
  }
}
