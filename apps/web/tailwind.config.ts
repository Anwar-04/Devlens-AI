import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171229",
        graphite: "#5f5872",
        cloud: "#faf8ff",
        line: "#e8e1f2",
        signal: "#7c3aed",
        mint: "#0f9f7a",
        amber: "#c47f16"
      }
    }
  },
  plugins: []
};

export default config;
