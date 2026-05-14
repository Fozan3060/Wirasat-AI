import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: "#D4AF37",
        "gold-dim": "#B8962E",
        bg: "#0D0C0A",
        surface: "rgba(255,255,255,0.03)",
        textgold: "#E8D5A3",
        "text-muted": "#5A5040",
        conflict: "#E74C3C",
      },
      fontFamily: {
        heading: ["var(--font-cormorant)", "Georgia", "serif"],
        body: ["var(--font-crimson)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
