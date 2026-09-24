/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Seline Analytics palette (synced with main app) ──
        primary: "#4278f5",
        "primary-hover": "#3268e5",
        "primary-fg": "#FFFFFF",
        ink: "#182740",
        body: "#66758e",
        muted: "#66758e",
        subtle: "#8491a6",
        canvas: "#f5f7fb",
        surface: "#FFFFFF",
        "surface-subtle": "#f8fafd",
        "surface-hover": "#eef3ff",
        hairline: "#e6ebf3",
        "hairline-hover": "#cdd7e6",
        success: "#16966c",
        "success-bg": "#f0fdf7",
        warning: "#b97812",
        "warning-bg": "#fffbf5",
        danger: "#dc5261",
        "danger-bg": "#fef2f2",
        info: "#4278f5",
        "info-bg": "#eef3ff",
        "info-text": "#4278f5",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        btn: "10px",
        input: "10px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.08)",
        "primary-glow": "0 4px 16px rgba(66,120,245,0.14)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
