/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas:  "#F7F8FA",
        surface: "#FFFFFF",
        elevated:"#FFFFFF",
        ink:     "#0A0A0F",
        ink2:    "#3C3C43",
        ink3:    "#6E6E73",
        ink4:    "#AEAEB2",
        line:    "#E5E5EA",
        line2:   "#F2F2F7",
        blue:    "#0071E3",
        blue2:   "#0077ED",
        green:   "#30D158",
        red:     "#FF3B30",
        amber:   "#FF9F0A",
        purple:  "#BF5AF2",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      boxShadow: {
        card:  "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.06)",
        hover: "0 2px 8px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.08)",
        pop:   "0 4px 12px rgba(0,113,227,.25)",
        inset: "inset 0 0 0 1.5px rgba(0,0,0,.08)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        "fade-up":   "fadeUp .35s ease both",
        "scale-in":  "scaleIn .2s ease both",
        "spin-slow": "spin 1s linear infinite",
      },
      keyframes: {
        fadeUp:  { "0%": { opacity: 0, transform: "translateY(14px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        scaleIn: { "0%": { opacity: 0, transform: "scale(.88)" },        "100%": { opacity: 1, transform: "scale(1)" } },
      },
    },
  },
  plugins: [],
};
