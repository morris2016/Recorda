import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        region: path.resolve(__dirname, "region.html"),
        countdown: path.resolve(__dirname, "countdown.html"),
        audio: path.resolve(__dirname, "audio.html"),
        widget: path.resolve(__dirname, "widget.html"),
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
