import type { Config } from "tailwindcss";

/**
 * reviz design tokens.
 *
 * Every color is wired to a CSS custom property holding *space-separated RGB
 * channels* (e.g. `--rz-accent: 234 88 12`). This lets Tailwind opacity
 * modifiers keep working (`bg-accent/20`) while the ThemeProvider swaps the
 * underlying channels at runtime for live theming. SVG-heavy components read
 * the resolved hex values straight from the React theme context instead.
 */
const channel = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: channel("--rz-canvas"),
        surface: channel("--rz-surface"),
        "surface-alt": channel("--rz-surface-alt"),
        border: channel("--rz-border"),
        "border-strong": channel("--rz-border-strong"),
        ink: channel("--rz-ink"),
        "ink-muted": channel("--rz-ink-muted"),
        "ink-faint": channel("--rz-ink-faint"),
        accent: channel("--rz-accent"),
        "accent-soft": channel("--rz-accent-soft"),
        "accent-contrast": channel("--rz-accent-contrast"),
        ok: channel("--rz-ok"),
        warn: channel("--rz-warn"),
        bad: channel("--rz-bad"),
        grid: channel("--rz-grid"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
      letterSpacing: {
        label: "0.14em",
        wide: "0.08em",
      },
      borderRadius: {
        reviz: "var(--rz-radius)",
      },
      boxShadow: {
        float:
          "0 1px 2px rgb(var(--rz-shadow) / 0.06), 0 8px 24px -8px rgb(var(--rz-shadow) / 0.18)",
        "float-lg":
          "0 2px 4px rgb(var(--rz-shadow) / 0.06), 0 24px 56px -16px rgb(var(--rz-shadow) / 0.28)",
        ring: "0 0 0 1px rgb(var(--rz-border) / 1)",
      },
      keyframes: {
        "reviz-fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "reviz-draw": {
          "0%": { strokeDashoffset: "var(--rz-dash, 1000)" },
          "100%": { strokeDashoffset: "0" },
        },
        "reviz-shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "reviz-pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-up": "reviz-fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "reviz-shimmer 2.4s linear infinite",
        "pulse-soft": "reviz-pulse-soft 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
