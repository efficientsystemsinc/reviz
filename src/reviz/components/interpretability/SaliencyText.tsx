"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  TooltipRow,
  clamp,
  mix,
  readableOn,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface SalToken {
  /** The token text as produced by the tokenizer (may begin with a space). */
  token: string;
  /** Attribution / saliency score. Sign is preserved; magnitude drives intensity. */
  score: number;
}

export interface SaliencyTextProps {
  /** Per-token attribution scores: [{ token, score }]. */
  tokens?: SalToken[];
  /** Heatmap color; overrides the palette accent. */
  color?: string;
  /** Render negative attributions in a contrasting hue (a diverging map). */
  signed?: boolean;
  /** Type scale of the prose in px. */
  fontSize?: number;
  /** Serif body for the reviz prose look. */
  serif?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  /** Total time (ms) for every token highlight to fade in, end to end. */
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                           */
/* ------------------------------------------------------------------ */

/**
 * Integrated-gradients attribution over a model output sentence. Tokens are
 * SentencePiece-style: a leading space marks a new word. Scores are normalized
 * attribution magnitudes — the evidence the model leaned on.
 */
const DEFAULT_TOKENS: SalToken[] = [
  { token: "The", score: 0.05 },
  { token: " patient", score: 0.71 },
  { token: " reported", score: 0.18 },
  { token: " severe", score: 0.94 },
  { token: " chest", score: 0.88 },
  { token: " pain", score: 0.62 },
  { token: " radiating", score: 0.41 },
  { token: " to", score: 0.04 },
  { token: " the", score: 0.03 },
  { token: " left", score: 0.36 },
  { token: " arm", score: 0.49 },
  { token: ",", score: 0.02 },
  { token: " so", score: 0.08 },
  { token: " the", score: 0.03 },
  { token: " model", score: 0.06 },
  { token: " flagged", score: 0.33 },
  { token: " cardiac", score: 0.97 },
  { token: " risk", score: 0.79 },
  { token: ".", score: 0.02 },
];

const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** A visible glyph for a leading-space token so word boundaries read clearly. */
function leadingSpace(token: string): boolean {
  return token.startsWith(" ") || token.startsWith("▁");
}

/** Strip the leading word-boundary marker for display. */
function displayText(token: string): string {
  return token.replace(/^[\s▁]+/, "");
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function SaliencyText({
  tokens = DEFAULT_TOKENS,
  color = "",
  signed = false,
  fontSize = 21,
  serif = false,
  title = "",
  caption = "",
  source = "",
  duration = 1400,
}: SaliencyTextProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const accent = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token: replayToken, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const clean = useMemo<SalToken[]>(
    () =>
      (Array.isArray(tokens) ? tokens : []).filter(
        (t) => t && typeof t.token === "string" && typeof t.score === "number",
      ),
    [tokens],
  );

  // Normalize magnitudes against the strongest absolute attribution so the
  // ramp always spans 0→1 regardless of the raw scale of the scores.
  const maxAbs = useMemo(
    () => Math.max(1e-6, ...clean.map((t) => Math.abs(t.score))),
    [clean],
  );

  // The cool (negative) end of the diverging map. Kept on-palette.
  const negColor = useMemo(() => mix(p.surface, p.series[3] || p.inkMuted, 1), [p]);

  // Sequential ramp endpoint for one token: from the surface (zero attribution)
  // toward the accent (max attribution), giving an integrated-gradients heatmap.
  function rampFor(score: number) {
    const t = clamp(Math.abs(score) / maxAbs, 0, 1);
    const target = signed && score < 0 ? negColor : accent;
    // A slight floor keeps near-zero tokens visually distinct from the page.
    const fill = mix(p.surface, target, 0.12 + t * 0.88);
    return { t, fill, target };
  }

  const dur = reduced ? 0 : duration / 1000;
  const per = reduced ? 0 : Math.min(0.5, dur * 0.45);
  const step = clean.length > 1 ? (dur - per) / (clean.length - 1) : 0;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/sal relative flex flex-col gap-5">
        {/* Heatmapped prose */}
        <p
          key={replayToken}
          className={`max-w-prose ${serif ? "font-serif" : "font-sans"} text-ink`}
          style={{ fontSize, lineHeight: 2.0 }}
          onMouseLeave={() => setHover(null)}
        >
          {clean.map((tk, i) => {
            const { t, fill } = rampFor(tk.score);
            const space = leadingSpace(tk.token);
            const text = displayText(tk.token);
            // Ink crossfades to a readable-on-fill color once the band is dense.
            const ink = t > 0.55 ? readableOn(fill) : p.ink;
            const shown = inView || reduced;
            const delay = reduced ? 0 : 0.1 + i * step;
            const active = hover?.i === i;

            return (
              <span key={i} style={{ whiteSpace: "pre-wrap" }}>
                {space ? " " : null}
                <motion.span
                  className="relative inline cursor-default rounded-[4px] px-[3px] py-[2px]"
                  style={{
                    WebkitBoxDecorationBreak: "clone",
                    boxDecorationBreak: "clone",
                  }}
                  initial={false}
                  animate={{
                    backgroundColor: shown ? fill : withAlpha(fill, 0),
                    color: shown ? ink : p.ink,
                    boxShadow: active
                      ? `inset 0 0 0 1.5px ${withAlpha(p.ink, 0.55)}`
                      : `inset 0 0 0 0px ${withAlpha(p.ink, 0)}`,
                  }}
                  transition={{
                    backgroundColor: { duration: per, delay, ease: EASE },
                    color: { duration: per * 0.7, delay: delay + per * 0.35 },
                    boxShadow: { duration: 0.14 },
                  }}
                  onMouseMove={(e) => {
                    const host = ref.current;
                    if (!host) return;
                    const base = host.getBoundingClientRect();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setHover({
                      i,
                      x: r.left - base.left + r.width / 2,
                      y: r.top - base.top,
                    });
                  }}
                >
                  {text}
                </motion.span>
              </span>
            );
          })}
        </p>

        {/* Legend + replay */}
        <div className="flex items-end justify-between gap-4">
          <SaliencyLegend
            accent={accent}
            negColor={negColor}
            surface={p.surface}
            ink={p.ink}
            border={p.border}
            inkFaint={p.inkFaint}
            signed={signed}
            inView={inView || reduced}
          />
          <ReplayButton
            onClick={replay}
            className="opacity-0 transition-opacity group-hover/sal:opacity-100"
          />
        </div>

        {/* Hover score */}
        <FloatingTooltip
          x={hover ? hover.x : 0}
          y={hover ? hover.y : 0}
          visible={!!hover}
          align="center"
        >
          {hover && (
            <div className="flex flex-col gap-1">
              <div className="mb-0.5 max-w-[200px] truncate font-mono text-[12px] font-medium">
                {displayText(clean[hover.i].token) || "·"}
              </div>
              <TooltipRow label="attribution" value={round(clean[hover.i].score, 3)} />
              <TooltipRow
                label="intensity"
                value={`${round(clamp(Math.abs(clean[hover.i].score) / maxAbs, 0, 1) * 100, 0)}%`}
              />
            </div>
          )}
        </FloatingTooltip>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Legend — a continuous low→high ramp                                 */
/* ------------------------------------------------------------------ */

function SaliencyLegend({
  accent,
  negColor,
  surface,
  ink,
  border,
  inkFaint,
  signed,
  inView,
}: {
  accent: string;
  negColor: string;
  surface: string;
  ink: string;
  border: string;
  inkFaint: string;
  signed: boolean;
  inView: boolean;
}) {
  // Build the gradient stops. Diverging: neg → surface → accent.
  const gradient = signed
    ? `linear-gradient(90deg, ${mix(surface, negColor, 0.95)}, ${mix(
        surface,
        negColor,
        0.4,
      )}, ${surface}, ${mix(surface, accent, 0.4)}, ${mix(surface, accent, 0.95)})`
    : `linear-gradient(90deg, ${mix(surface, accent, 0.12)}, ${mix(
        surface,
        accent,
        1,
      )})`;

  return (
    <motion.div
      className="flex items-center gap-2.5"
      initial={false}
      animate={{ opacity: inView ? 1 : 0 }}
      transition={{ duration: 0.4, delay: inView ? 0.15 : 0 }}
    >
      <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
        {signed ? "−attr" : "low"}
      </span>
      <div
        className="h-2.5 w-32 rounded-full"
        style={{ background: gradient, boxShadow: `inset 0 0 0 1px ${withAlpha(ink, 0.08)}`, border: `1px solid ${border}` }}
        aria-label="Saliency intensity scale"
      />
      <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
        {signed ? "+attr" : "high"}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "saliency-text",
  name: "Saliency Text",
  category: "interpretability",
  description:
    "Per-token attribution rendered as a heatmap over a sentence — each token's background intensity encodes its saliency, fading in token by token, with a low→high legend and on-hover scores. The integrated-gradients-over-text view.",
  tags: ["saliency", "attribution", "integrated-gradients", "tokens", "heatmap", "interpretability", "llm", "feature-importance"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "SaliencyText",
  sourcePath: "interpretability/SaliencyText",
  aspect: 16 / 8,
  controls: [
    {
      key: "tokens",
      label: "Tokens",
      type: "json",
      group: "Data",
      help: "Per-token attribution: [{ token, score }]. A leading space marks a new word.",
      default: DEFAULT_TOKENS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Heatmap color", type: "color", group: "Style", default: "" },
    {
      key: "signed",
      label: "Diverging (signed)",
      type: "boolean",
      group: "Style",
      help: "Render negative attributions in a contrasting hue.",
      default: false,
    },
    { key: "serif", label: "Serif body", type: "boolean", group: "Layout", default: false },
    {
      key: "fontSize",
      label: "Font size",
      type: "number",
      group: "Layout",
      default: 21,
      min: 14,
      max: 36,
      step: 1,
      unit: "px",
    },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1400,
      min: 0,
      max: 4000,
      step: 100,
    },
  ],
  presets: [
    {
      id: "clinical",
      name: "Clinical risk flag",
      props: {
        title: "Integrated gradients over model output",
        caption: "Token background intensity is the attribution magnitude behind the model's prediction.",
        source: "IG · 50 steps",
        tokens: DEFAULT_TOKENS,
      },
    },
    {
      id: "sentiment-signed",
      name: "Signed sentiment",
      props: {
        title: "Signed attributions for a sentiment classifier",
        caption: "Warm tokens push toward the predicted label; cool tokens push against it.",
        signed: true,
        tokens: [
          { token: "The", score: 0.04 },
          { token: " film", score: 0.21 },
          { token: " was", score: 0.06 },
          { token: " visually", score: 0.58 },
          { token: " stunning", score: 0.92 },
          { token: " but", score: -0.31 },
          { token: " the", score: -0.05 },
          { token: " plot", score: -0.44 },
          { token: " felt", score: -0.27 },
          { token: " painfully", score: -0.81 },
          { token: " slow", score: -0.69 },
          { token: " and", score: -0.08 },
          { token: " predictable", score: -0.74 },
          { token: ".", score: 0.02 },
        ],
      },
    },
    {
      id: "qa-evidence",
      name: "QA evidence span",
      props: {
        title: "What the reader attended to",
        caption: "Saliency over the passage explains which spans grounded the answer.",
        serif: true,
        fontSize: 20,
        tokens: [
          { token: "Marie", score: 0.83 },
          { token: " Curie", score: 0.91 },
          { token: " was", score: 0.07 },
          { token: " awarded", score: 0.55 },
          { token: " the", score: 0.04 },
          { token: " Nobel", score: 0.72 },
          { token: " Prize", score: 0.68 },
          { token: " in", score: 0.05 },
          { token: " Physics", score: 0.78 },
          { token: " in", score: 0.06 },
          { token: " 1903", score: 0.96 },
          { token: ",", score: 0.02 },
          { token: " sharing", score: 0.14 },
          { token: " it", score: 0.04 },
          { token: " with", score: 0.05 },
          { token: " her", score: 0.09 },
          { token: " husband", score: 0.22 },
          { token: ".", score: 0.02 },
        ],
      },
    },
  ],
};
