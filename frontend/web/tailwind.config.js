/** @type {import('tailwindcss').Config} */

// Semantic colour tokens are wired to CSS variables so the entire app can
// switch palettes via `data-theme="dark|light"` on the <html> element.
// Values are stored as `R G B` triplets in :root/[data-theme="dark"] so
// Tailwind opacity modifiers (e.g. `bg-blue/20`) keep working through the
// `<alpha-value>` placeholder.
const themeColor = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas:   themeColor("canvas"),
        surface:  themeColor("surface"),
        elevated: themeColor("elevated"),
        ink:      themeColor("ink"),
        ink2:     themeColor("ink2"),
        ink3:     themeColor("ink3"),
        ink4:     themeColor("ink4"),
        line:     themeColor("line"),
        line2:    themeColor("line2"),
        blue:     themeColor("blue"),
        blue2:    themeColor("blue2"),
        green:    themeColor("green"),
        red:      themeColor("red"),
        amber:    themeColor("amber"),
        purple:   themeColor("purple"),
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
        card:  "var(--shadow-card)",
        hover: "var(--shadow-hover)",
        pop:   "var(--shadow-pop)",
        inset: "var(--shadow-inset)",
      },
      borderRadius: {
        "4xl": "2rem",
        card: "1rem",
        sheet: "1.5rem",
        control: "0.75rem",
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
