import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        izana: {
          dark: "#212121",
          light: "#f9f9f9",
          primary: "#3231b1",
          indigo: "#230871",
          coral: "#ff7a55",
          teal: "#86eae9",
        },
      },
    },
  },
  plugins: [],
};
export default config;
