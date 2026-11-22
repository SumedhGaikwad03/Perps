/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0b0e14",
        panel: "#121721",
        surface: "#18202f",
        surfaceHover: "#1f293d",
        borderDark: "#1e2638",
        bid: "#00e676",
        "bid-dim": "rgba(0, 230, 118, 0.15)",
        ask: "#ff3355",
        "ask-dim": "rgba(255, 51, 85, 0.15)",
        accent: "#2979ff",
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "SF Mono",
          "Roboto Mono",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
