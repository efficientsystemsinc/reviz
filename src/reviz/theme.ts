/**
 * reviz theming.
 *
 * A palette is a flat set of hex colors. The ThemeProvider exposes the resolved
 * palette through React context (so SVG components can read exact hex values for
 * gradients, scales, strokes) AND mirrors every color into a CSS custom property
 * as RGB channels (so Tailwind utilities + opacity modifiers work).
 *
 * All presets are tuned from real research-figure aesthetics: academic paper
 * creams, grayscale minimalism, robotics-orange, interpretability-gold,
 * midnight pearl, and electric dark.
 */

export type ThemeMode = "light" | "dark";

export interface RevizPalette {
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  /** Page / figure background. */
  canvas: string;
  /** Card / panel background. */
  surface: string;
  /** Secondary surface (insets, tracks, headers). */
  surfaceAlt: string;
  /** Hairline borders. */
  border: string;
  /** Stronger borders / dividers. */
  borderStrong: string;
  /** Primary text. */
  ink: string;
  /** Secondary text / labels. */
  inkMuted: string;
  /** Tertiary text / captions. */
  inkFaint: string;
  /** Primary brand / emphasis color. */
  accent: string;
  /** Soft accent (fills, halos). */
  accentSoft: string;
  /** Text/icon color that sits legibly on `accent`. */
  accentContrast: string;
  ok: string;
  warn: string;
  bad: string;
  /** Gridline color for charts. */
  grid: string;
  /** Shadow base color. */
  shadow: string;
  /** Categorical series ramp (8 colors), used by multi-series charts. */
  series: string[];
}

export const PALETTES: RevizPalette[] = [
  {
    id: "paper",
    name: "Paper",
    description: "Warm academic cream with terracotta + forest — built for print-quality figures.",
    mode: "light",
    canvas: "#F4F1E9",
    surface: "#FBFAF5",
    surfaceAlt: "#EDE9DD",
    border: "#DAD4C4",
    borderStrong: "#C3BBA6",
    ink: "#2B2A26",
    inkMuted: "#6B6657",
    inkFaint: "#9A937F",
    accent: "#A8432F",
    accentSoft: "#E7CFC6",
    accentContrast: "#FBFAF5",
    ok: "#3E6E50",
    warn: "#B5853A",
    bad: "#A8432F",
    grid: "#DAD4C4",
    shadow: "#3A3528",
    series: ["#A8432F", "#3E6E50", "#B5853A", "#4A6C8C", "#7A5A8C", "#8C6B4A", "#5C8C7A", "#A66A6A"],
  },
  {
    id: "mono",
    name: "Mono",
    description: "Pure grayscale minimalism — the lab-notebook look. Lets the data speak.",
    mode: "light",
    canvas: "#F6F6F5",
    surface: "#FFFFFF",
    surfaceAlt: "#EFEFEE",
    border: "#E0E0DE",
    borderStrong: "#C7C7C4",
    ink: "#1F1F1E",
    inkMuted: "#6E6E6B",
    inkFaint: "#A0A09C",
    accent: "#1F1F1E",
    accentSoft: "#D8D8D5",
    accentContrast: "#FFFFFF",
    ok: "#3F6D52",
    warn: "#8A6D2F",
    bad: "#9B3B2E",
    grid: "#E5E5E3",
    shadow: "#1F1F1E",
    series: ["#1F1F1E", "#5C5C59", "#8E8E8A", "#B6B6B2", "#3F3F3D", "#73736F", "#A0A09C", "#cccac6"],
  },
  {
    id: "ember",
    name: "Ember",
    description: "Crisp white with robotics-orange — high-energy eval and benchmark charts.",
    mode: "light",
    canvas: "#FAFAFA",
    surface: "#FFFFFF",
    surfaceAlt: "#F2F2F2",
    border: "#E6E6E6",
    borderStrong: "#D2D2D2",
    ink: "#1A1A1A",
    inkMuted: "#5F5F5F",
    inkFaint: "#9A9A9A",
    accent: "#F26B2B",
    accentSoft: "#FBD9C6",
    accentContrast: "#FFFFFF",
    ok: "#2E9E6B",
    warn: "#E0A53B",
    bad: "#E0483B",
    grid: "#ECECEC",
    shadow: "#7A3A18",
    series: ["#F26B2B", "#1A1A1A", "#F7A072", "#2E9E6B", "#4A8DD6", "#9B6BD6", "#E0A53B", "#5B5B5B"],
  },
  {
    id: "clay",
    name: "Clay",
    description: "Anthropic-style soft cream with gold + highlight — interpretability papers.",
    mode: "light",
    canvas: "#F6F4EE",
    surface: "#FFFFFF",
    surfaceAlt: "#EFEBE0",
    border: "#E2DCCD",
    borderStrong: "#CDC4AE",
    ink: "#2A2722",
    inkMuted: "#6A6456",
    inkFaint: "#9C9583",
    accent: "#B8860B",
    accentSoft: "#F2E6B8",
    accentContrast: "#2A2722",
    ok: "#4C7A53",
    warn: "#C79A2E",
    bad: "#B5503A",
    grid: "#E6E0D2",
    shadow: "#4A4128",
    series: ["#B8860B", "#4C7A53", "#B5503A", "#3E6E8C", "#8C5A8C", "#A07A3A", "#5C8C7A", "#C79A2E"],
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Near-black with pearl + silver — cinematic dark figures and particle fields.",
    mode: "dark",
    canvas: "#0B0B0C",
    surface: "#141416",
    surfaceAlt: "#1C1C1F",
    border: "#2A2A2E",
    borderStrong: "#3A3A40",
    ink: "#F3F2EF",
    inkMuted: "#A4A3A0",
    inkFaint: "#6C6B69",
    accent: "#E9E4D8",
    accentSoft: "#33312C",
    accentContrast: "#0B0B0C",
    ok: "#5FBF8F",
    warn: "#D6B25E",
    bad: "#E07A6B",
    grid: "#26262A",
    shadow: "#000000",
    series: ["#E9E4D8", "#9AA0A6", "#C9A86A", "#6FA8DC", "#B58FD6", "#7FC9A6", "#D69A6A", "#5E6166"],
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Deep slate with electric cyan — live dashboards, telemetry, agent consoles.",
    mode: "dark",
    canvas: "#08090C",
    surface: "#101319",
    surfaceAlt: "#171B23",
    border: "#232936",
    borderStrong: "#343D4F",
    ink: "#EAF1F7",
    inkMuted: "#9AA7B6",
    inkFaint: "#5E6B7C",
    accent: "#38BDF8",
    accentSoft: "#0E3A4F",
    accentContrast: "#04121A",
    ok: "#34D399",
    warn: "#FBBF24",
    bad: "#FB7185",
    grid: "#1B212C",
    shadow: "#000000",
    series: ["#38BDF8", "#34D399", "#FBBF24", "#FB7185", "#A78BFA", "#22D3EE", "#F472B6", "#94A3B8"],
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Cool white-blue with deep indigo — calm, data-dense scientific dashboards.",
    mode: "light",
    canvas: "#F5F8FB",
    surface: "#FFFFFF",
    surfaceAlt: "#EAF1F7",
    border: "#DCE6EF",
    borderStrong: "#C2D2E0",
    ink: "#10202E",
    inkMuted: "#516375",
    inkFaint: "#8FA0AF",
    accent: "#2563EB",
    accentSoft: "#D6E4FB",
    accentContrast: "#FFFFFF",
    ok: "#0E9F6E",
    warn: "#D98E04",
    bad: "#E02424",
    grid: "#E4ECF3",
    shadow: "#102A43",
    series: ["#2563EB", "#0E9F6E", "#D98E04", "#E02424", "#7C3AED", "#0891B2", "#DB2777", "#475569"],
  },
  {
    id: "botanic",
    name: "Botanic",
    description: "Soft ivory with deep forest green — ecology, biology, field-research reports.",
    mode: "light",
    canvas: "#F4F6F1",
    surface: "#FFFFFF",
    surfaceAlt: "#E9EDE3",
    border: "#D9E0CF",
    borderStrong: "#BECBAE",
    ink: "#1E2A1C",
    inkMuted: "#566150",
    inkFaint: "#8E9986",
    accent: "#2F6E4A",
    accentSoft: "#CFE6D7",
    accentContrast: "#FFFFFF",
    ok: "#2F6E4A",
    warn: "#C08A2E",
    bad: "#B5503A",
    grid: "#E3E8DC",
    shadow: "#1E2A1C",
    series: ["#2F6E4A", "#7BA05B", "#C08A2E", "#3E6E8C", "#8C5A6E", "#A0883A", "#5C8C7A", "#B5503A"],
  },
];

export const DEFAULT_PALETTE_ID = "paper";

export function getPalette(id: string): RevizPalette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Convert "#RRGGBB" to space-separated RGB channels "r g b". */
export function hexToChannels(hex: string): string {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `${r} ${g} ${b}`;
}

/** Add an alpha to a hex color, returning rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToChannels(hex).split(" ").map(Number);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mix two hex colors by t in [0,1]. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToChannels(a).split(" ").map(Number);
  const cb = hexToChannels(b).split(" ").map(Number);
  const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance, for picking legible text on arbitrary fills. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToChannels(hex)
    .split(" ")
    .map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Best-contrast text color (black/white) for a given background hex. */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.45 ? "#111111" : "#FFFFFF";
}

/** Map a palette to the full set of CSS custom-property channel values. */
export function paletteToCssVars(p: RevizPalette): Record<string, string> {
  const vars: Record<string, string> = {
    "--rz-canvas": hexToChannels(p.canvas),
    "--rz-surface": hexToChannels(p.surface),
    "--rz-surface-alt": hexToChannels(p.surfaceAlt),
    "--rz-border": hexToChannels(p.border),
    "--rz-border-strong": hexToChannels(p.borderStrong),
    "--rz-ink": hexToChannels(p.ink),
    "--rz-ink-muted": hexToChannels(p.inkMuted),
    "--rz-ink-faint": hexToChannels(p.inkFaint),
    "--rz-accent": hexToChannels(p.accent),
    "--rz-accent-soft": hexToChannels(p.accentSoft),
    "--rz-accent-contrast": hexToChannels(p.accentContrast),
    "--rz-ok": hexToChannels(p.ok),
    "--rz-warn": hexToChannels(p.warn),
    "--rz-bad": hexToChannels(p.bad),
    "--rz-grid": hexToChannels(p.grid),
    "--rz-shadow": hexToChannels(p.shadow),
    "--rz-radius": "10px",
  };
  p.series.forEach((c, i) => {
    vars[`--rz-series-${i + 1}`] = hexToChannels(c);
  });
  return vars;
}
