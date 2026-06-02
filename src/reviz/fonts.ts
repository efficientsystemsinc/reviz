/**
 * Curated typeface registry for per-figure typography.
 *
 * Fonts are loaded once in the root layout (next/font) and exposed as CSS
 * variables (--rzf-<id>). A figure's typography is applied by overriding the
 * three role variables the whole design system reads — --font-sans (display /
 * headings), --font-mono (labels, numbers, axes), --font-serif (captions) —
 * inside the preview scope. Components already use those roles, so changing a
 * font here re-typesets every component with no per-component code.
 */

export type FontRole = "display" | "mono" | "serif";

export interface FontDef {
  id: string;
  name: string;
  /** CSS var defined by next/font; null = the role's default (no override). */
  varName: string | null;
  /** Fallback stack appended after the variable. */
  fallback: string;
}

const SANS_FB = "ui-sans-serif, system-ui, sans-serif";
const MONO_FB = "ui-monospace, 'SF Mono', Menlo, monospace";
const SERIF_FB = "ui-serif, Georgia, serif";

export const FONTS: Record<FontRole, FontDef[]> = {
  display: [
    { id: "urbanist", name: "Urbanist", varName: null, fallback: SANS_FB },
    { id: "inter", name: "Inter", varName: "--rzf-inter", fallback: SANS_FB },
    { id: "space-grotesk", name: "Space Grotesk", varName: "--rzf-space-grotesk", fallback: SANS_FB },
    { id: "manrope", name: "Manrope", varName: "--rzf-manrope", fallback: SANS_FB },
    { id: "sora", name: "Sora", varName: "--rzf-sora", fallback: SANS_FB },
    { id: "jakarta", name: "Plus Jakarta Sans", varName: "--rzf-jakarta", fallback: SANS_FB },
    { id: "dmsans", name: "DM Sans", varName: "--rzf-dmsans", fallback: SANS_FB },
  ],
  mono: [
    { id: "jetbrains", name: "JetBrains Mono", varName: null, fallback: MONO_FB },
    { id: "ibm-plex-mono", name: "IBM Plex Mono", varName: "--rzf-ibm-plex-mono", fallback: MONO_FB },
    { id: "space-mono", name: "Space Mono", varName: "--rzf-space-mono", fallback: MONO_FB },
    { id: "spline-mono", name: "Spline Sans Mono", varName: "--rzf-spline-mono", fallback: MONO_FB },
  ],
  serif: [
    { id: "newsreader", name: "Newsreader", varName: null, fallback: SERIF_FB },
    { id: "fraunces", name: "Fraunces", varName: "--rzf-fraunces", fallback: SERIF_FB },
    { id: "source-serif", name: "Source Serif 4", varName: "--rzf-source-serif", fallback: SERIF_FB },
  ],
};

const ROLE_TO_VAR: Record<FontRole, string> = {
  display: "--font-sans",
  mono: "--font-mono",
  serif: "--font-serif",
};

export interface FontChoice {
  display?: string;
  mono?: string;
  serif?: string;
}

/** CSS-var overrides for the chosen fonts (only non-default selections emit a var). */
export function fontVars(choice: FontChoice | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!choice) return out;
  (Object.keys(FONTS) as FontRole[]).forEach((role) => {
    const id = choice[role];
    if (!id) return;
    const def = FONTS[role].find((f) => f.id === id);
    if (def && def.varName) out[ROLE_TO_VAR[role]] = `var(${def.varName}), ${def.fallback}`;
  });
  return out;
}

export function fontDef(role: FontRole, id: string | undefined): FontDef {
  return FONTS[role].find((f) => f.id === id) ?? FONTS[role][0];
}
