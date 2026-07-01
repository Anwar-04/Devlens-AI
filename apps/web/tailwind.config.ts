import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        graphite: "#2f3a45",
        cloud: "#f6f7f9",
        line: "#dde3ea",
        signal: "#2563eb",
        mint: "#0f9f7a",
        amber: "#c47f16"
      }
    }
  },
  plugins: []
};

export default config;

