/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Seline Analytics palette (synced with main app) ──
        primary: "#3ba6f1",
        "primary-hover": "#3398e1",
        "primary-fg": "#FFFFFF",
        ink: "#0c0a09",
        body: "#78716c",
        muted: "#78716c",
        subtle: "#a8a29e",
        canvas: "#fafaf9",
        surface: "#FFFFFF",
        "surface-subtle": "#fafaf9",
        "surface-hover": "#eff8ff",
        hairline: "#e8e6e5",
        "hairline-hover": "#d6d3d1",
        success: "#22c55e",
        "success-bg": "#f0fdf7",
        warning: "#f59e0b",
        "warning-bg": "#fffbf5",
        danger: "#ef4444",
        "danger-bg": "#fef2f2",
        info: "#3ba6f1",
        "info-bg": "#eff8ff",
        "info-text": "#3ba6f1",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        card: "24px",
        btn: "12px",
        input: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.08)",
        "primary-glow": "0 4px 16px rgba(68,122,252,0.3)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
