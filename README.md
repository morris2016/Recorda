# recorda

A modern Windows screen recorder with a polished dark UI.

**Stack:** Electron 33 + React 18 + TypeScript + Vite + Tailwind. FFmpeg is bundled as a sidecar for capture and encoding (`gdigrab` for video, `dshow` for mic, NVENC / QuickSync / AMF / x264 for encode).

## Features

- Full-screen and region recording (drag-to-select overlay)
- Multi-monitor display picker
- Hardware encoders auto-detected (NVENC / QSV / AMF) with x264 fallback
- MP4 / MKV / WebM containers, quality presets (low / med / high / lossless)
- 24-120 fps
- Cursor capture toggle
- Microphone capture (dshow device picker)
- Live recording stats: fps, bitrate, file size, dropped frames
- Tray icon + global F9 hotkey
- Recent recordings list with one-click "Show in Explorer"

## First-time setup

```cmd
npm install
npm run fetch-ffmpeg     :: downloads ffmpeg/ffprobe into resources\bin
```

## Run (production preview)

```cmd
npm run start
```

Builds renderer + main and launches Electron loading the static `dist/`.

## Develop (hot reload)

```cmd
npm run dev:electron
```

Vite serves the renderer at http://localhost:5173 and Electron loads it. DevTools open automatically.

## Heads up

If you're in a shell that exports `ELECTRON_RUN_AS_NODE=1` (some terminal setups do), Electron will silently run as a plain Node binary and the app won't launch. The npm scripts clear it via `cross-env`. If you launch the binary manually, run `set ELECTRON_RUN_AS_NODE=` first.

## Build & package

```cmd
npm run build            :: tsc + vite build + electron compile
npm run package          :: NSIS installer + portable .exe in release\
```

## Project layout

```
recorda/
├─ electron/                     TypeScript main-process code
│  ├─ main.ts                    window, tray, IPC, hotkeys
│  ├─ preload.ts                 contextBridge API surface
│  ├─ recorder.ts                FFmpeg sidecar runner + state machine
│  ├─ devices.ts                 display/audio/encoder enumeration
│  └─ paths.ts                   binary + resource path resolution
├─ src/                          React renderer
│  ├─ App.tsx                    main layout
│  ├─ store.ts                   Zustand state
│  ├─ types.ts                   shared types incl. window.recorda
│  ├─ components/
│  │  ├─ TitleBar.tsx
│  │  ├─ SourcePanel.tsx         mode/monitor/encoder/sources controls
│  │  ├─ RecordPanel.tsx         big record button, timer, stats
│  │  ├─ RegionOverlay.tsx       drag-to-select overlay
│  │  └─ RecentList.tsx
│  └─ region-main.tsx            entry for region overlay window
├─ scripts/fetch-ffmpeg.ps1      bundles ffmpeg.exe + ffprobe.exe
├─ resources/
│  ├─ bin/                       (ffmpeg/ffprobe live here)
│  └─ icons/
├─ index.html                    main window
└─ region.html                   region overlay window
```

## Architecture notes

- The renderer is sandboxed; it only reaches the main process through `window.recorda.*` exposed by [preload.ts](electron/preload.ts).
- The recorder is a small state machine wrapping a single FFmpeg child process. To finalize an MP4 cleanly we send `q` to ffmpeg's stdin; killing the process truncates the moov atom.
- Region selection opens a frameless transparent always-on-top window covering the entire virtual desktop. Coordinates returned to the main window are in screen pixels (multiplied by `scaleFactor` for HiDPI).
- Encoder list is populated from `ffmpeg -encoders`. We prefer the first hardware option but the user can override.
- Audio: the renderer offers any DirectShow audio input devices (microphones, virtual cables, Stereo Mix). For pure system audio without a capture driver, install something like VB-CABLE or use the Stereo Mix endpoint.

## Hotkeys

- **Ctrl+R** - start / stop recording (registered globally; takes precedence over browser reload while recorda is running)
