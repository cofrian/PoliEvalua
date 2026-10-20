import type { Config } from "tailwindcss";

const config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        upv: {
          ink: "#111111",
          900: "#3F4444",
          700: "#424A50",
          500: "#5C6368",
          300: "#AEB2B4",
          100: "#F1F1F1",
          yellow: "#FFD100",
          blue: "#59CBE8",
          red: "#D73333",
        },
        navy: { 900: "#3F4444", 700: "#424A50" },
        orange: { 500: "#FFD100", 100: "#FFF5BD" },
        sky: { 400: "#59CBE8" },
        leaf: { 500: "#2E7D32" },
        sun: { 300: "#FFD100" },
        coral: { 400: "#D73333" },
        peach: { 200: "#F1F1F1" },
        ink: { 950: "#111111" },
        paper: { 50: "#F8F8F7" },
        slate: { 500: "#5C6368" },
        line: "#D9DADA",
      },
      fontFamily: {
        display: ["var(--font-poppins)", "Poppins", "sans-serif"],
        heading: ["var(--font-poppins)", "Poppins", "sans-serif"],
        sans: [
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        warm:
          "0 1px 2px rgb(17 17 17 / 0.06), 0 10px 28px rgb(63 68 68 / 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
