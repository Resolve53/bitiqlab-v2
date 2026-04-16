/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
    colors: {
      white: "#ffffff",
      black: "#000000",
      transparent: "transparent",
      emerald: {
        300: "#6ee7b7",
        400: "#34d399",
        500: "#10b981",
        600: "#059669",
      },
      slate: {
        50: "#f8fafc",
        100: "#f1f5f9",
        400: "#78716c",
        500: "#64748b",
        600: "#475569",
        700: "#334155",
        800: "#1e293b",
        900: "#0f172a",
        950: "#020617",
      },
      red: {
        300: "#fca5a5",
        800: "#991b1b",
        900: "#7f1d1d",
      },
      gray: {
        50: "#f9fafb",
        100: "#f3f4f6",
        200: "#e5e7eb",
        300: "#d1d5db",
        400: "#9ca3af",
        500: "#6b7280",
        600: "#4b5563",
        900: "#111827",
      },
      blue: {
        500: "#3b82f6",
        600: "#2563eb",
        700: "#1d4ed8",
      },
    },
  },
  plugins: [],
};
