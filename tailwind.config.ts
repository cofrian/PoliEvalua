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
        navy: { 900: "#1F2557", 700: "#2E3680" },
        orange: { 500: "#F08A2E", 100: "#FDE6CF" },
        sky: { 400: "#5AA9DE" },
        leaf: { 500: "#5FA463" },
        sun: { 300: "#F6D45E" },
        coral: { 400: "#F2846B" },
        peach: { 200: "#F5B59A" },
        ink: { 950: "#0B0B10" },
        paper: { 50: "#FFFBF5" },
        slate: { 500: "#6B6F86" },
        line: "#E7E2DA",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Fraunces", "serif"],
        sans: [
          "var(--font-montserrat)",
          "Montserrat",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        warm: "0 1px 2px rgb(31 37 87 / 0.06), 0 6px 20px rgb(31 37 87 / 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
