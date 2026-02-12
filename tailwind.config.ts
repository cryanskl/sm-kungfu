import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      'xs': '480px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ink: {
          deepest: "var(--ink-deepest)",
          deep: "var(--ink-deep)",
          dark: "var(--ink-dark)",
          medium: "var(--ink-medium)",
          light: "var(--ink-light)",
          faint: "var(--ink-faint)",
        },
        gold: {
          DEFAULT: "var(--gold)",
          bright: "var(--gold-bright)",
          dim: "var(--gold-dim)",
        },
        vermillion: {
          DEFAULT: "var(--vermillion)",
          bright: "var(--vermillion-bright)",
        },
        jade: "var(--jade)",
        rice: "var(--rice-paper)",
      },
      fontFamily: {
        display: ["'ZCOOL XiaoWei'", "'Noto Serif SC'", "serif"],
        body: ["'Noto Serif SC'", "'Source Han Serif CN'", "serif"],
      },
      boxShadow: {
        'gold-glow': '0 0 20px var(--gold-glow)',
        'vermillion-glow': '0 0 20px var(--vermillion-glow)',
        'ink': '0 8px 32px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};
export default config;
