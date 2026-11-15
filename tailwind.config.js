/** Topline Solar brand tokens (from the brand guidelines) */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0A1F3C", 2: "#13294B", 3: "#1C3660" },
        orange: { DEFAULT: "#F58220", dark: "#D96D10", tint: "#FFF4EA" },
        blue: { DEFAULT: "#2D6CDF", tint: "#EEF3FC" },
        amber: { DEFAULT: "#FFB81C" },
        cloud: "#F4F6FA",
        ink: "#0A1F3C",
        body: "#3A4A63",
        muted: "#6B7A90",
        rule: "#DDE3EC",
        success: { DEFAULT: "#1F9D55", tint: "#E8F6EE" },
        danger: { DEFAULT: "#D93025", tint: "#FDECEA" },
      },
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans Devanagari"', "system-ui", "sans-serif"],
        display: ['"Inter"', "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: { card: "0 1px 2px rgba(10,31,60,.06), 0 1px 1px rgba(10,31,60,.04)", pop: "0 12px 32px rgba(10,31,60,.18)" },
    },
  },
  plugins: [],
};
