import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "Manrope",
          "Avenir Next",
          "Segoe UI",
          "sans-serif",
        ],
      },
      colors: {
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          700: "#334155",
          900: "#0f172a",
        },
        brand: {
          50: "#eef4ff",
          100: "#dbe8ff",
          300: "#88a8ff",
          500: "#375dfb",
          600: "#2647d1",
          700: "#1d3cae",
        },
      },
      boxShadow: {
        card: "0 10px 30px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
