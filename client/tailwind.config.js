const theme = (primary) => ({
  primary,
  "primary-content": "#ffffff",
  secondary: "#0ea5e9",
  accent: "#14b8a6",
  neutral: "#334155",
  "base-100": "#ffffff",
  "base-200": "#f8fafc",
  "base-300": "#e2e8f0",
  info: "#0284c7",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
});

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    // Status colours (attendance, fees) are defined here as class names.
    "./constants/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [require("daisyui")],
  daisyui: {
    // One theme per role so people can tell at a glance whose view this is.
    themes: [
      { edupro: theme("#4f46e5") }, // admin: indigo
      { "edupro-principal": theme("#0f766e") }, // principal: teal
      { "edupro-teacher": theme("#15803d") }, // teacher: green
      { "edupro-parent": theme("#c2410c") }, // parent: orange
      { "edupro-student": theme("#7c3aed") }, // student: violet
      { "edupro-librarian": theme("#a16207") }, // librarian: amber
    ],
  },
};
