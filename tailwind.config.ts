import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./region.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#0b0d12", soft: "#11141b", panel: "#161a23", panel2: "#1d2230" },
        border: { DEFAULT: "#262b39", soft: "#1f2330" },
        text: { DEFAULT: "#e7eaf2", dim: "#9aa3b8", faint: "#6b7385" },
        accent: { DEFAULT: "#3b82f6", hover: "#2563eb", soft: "#1e3a8a" },
        rec: { DEFAULT: "#ef4444", hover: "#dc2626", soft: "#7f1d1d" },
        ok: "#22c55e",
        warn: "#f59e0b",
      },
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Cascadia Mono"', "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(59,130,246,0.4), 0 0 24px rgba(59,130,246,0.15)",
        rec: "0 0 0 1px rgba(239,68,68,0.5), 0 0 28px rgba(239,68,68,0.3)",
      },
      animation: {
        "pulse-rec": "pulse-rec 1.6s ease-in-out infinite",
      },
      keyframes: {
        "pulse-rec": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.92)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
