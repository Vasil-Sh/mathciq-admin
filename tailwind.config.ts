/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── MatchIQ palette (same as main app) ──
        primary: "#447afc",
        "primary-hover": "#5b8ffd",
        "primary-fg": "#FFFFFF",
        ink: "#111827",
        body: "#374151",
        muted: "#6B7280",
        subtle: "#9CA3AF",
        canvas: "#f3f3f3",
        surface: "#FFFFFF",
        "surface-subtle": "#F9FAFB",
        "surface-hover": "#EFF6FF",
        hairline: "#E5E7EB",
        "hairline-hover": "#D1D5DB",
        success: "#16A34A",
        "success-bg": "#F0FDF4",
        warning: "#D97706",
        "warning-bg": "#FFFBEB",
        danger: "#DC2626",
        "danger-bg": "#FEF2F2",
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
