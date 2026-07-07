/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Basedash palette ──
        void: "#000000",
        carbon: "#050607",
        graphite: "#333333",
        steel: "#808080",
        ash: "#b3b3b3",
        bone: "#e8eaee",
        ghost: "#ffffff",
        lavender: "#9984d8",
        mint: "#3fcb7f",
        danger: "#ef4444",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        serif: ['"EB Garamond"', '"Cormorant Garamond"', "Georgia", "serif"],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      borderRadius: {
        btn: "6px",
        card: "16px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
