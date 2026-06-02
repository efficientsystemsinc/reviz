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
  useInView,
  useHoverIndex,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface TokenDatum {
  /** Token text (rendered mono). */
  token: string;
  /** Activation value. Positive fires the feature; negative suppresses it. */
  value: number;
}

export interface ActivationStripProps {
  tokens?: TokenDatum[];
  title?: string;
  caption?: string;
  source?: string;
  /** Diverging ramp (+/- around zero) vs. a single-sided magnitude ramp. */
  diverging?: boolean;
  /** Override the positive / accent color. */
  color?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                           */
/* ------------------------------------------------------------------ */

// A "Golden Gate Bridge" style feature firing across a sentence — strongest on
// the literal landmark phrase, with mild negative activation on filler tokens.
const DEFAULT_TOKENS: TokenDatum[] = [
  { token: "I", value: -0.12 },
  { token: "drove", value: 0.08 },
  { token: "across", value: 0.46 },
  { token: "the", value: 0.31 },
  { token: "Golden", value: 0.93 },
  { token: "Gate", value: 0.97 },
  { token: "Bridge", value: 0.88 },
  { token: "into", value: 0.22 },
  { token: "San", value: 0.41 },
  { token: "Francisco", value: 0.37 },
  { token: "this", value: -0.05 },
  { token: "morning", value: -0.18 },
];

/** Render a visible glyph for whitespace / newline tokens. */
function displayToken(t: string): string {
  if (t === " ") return "␣";
  if (t === "\n") return "\\n";
  if (t === "\t") return "\\t";
  if (t === "") return "∅";
  return t;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function ActivationStrip({
  tokens = DEFAULT_TOKENS,
  title = "",
  caption = "",
  source = "",
  diverging = true,
  color = "",
  duration = 1000,
}: ActivationStripProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token: replayToken, replay } = useReplay();
  const { index: hovered, setIndex, clear } = useHoverIndex();

  const pos = color || p.accent;
  // A perceptually distinct counter-color for negative activations.
  const neg = p.series.find((s) => s !== pos) ?? mix(pos, p.ink, 0.6);
  const zeroTint = mix(p.surfaceAlt, p.canvas, 0.4);

  const list = useMemo(
    () => (tokens ?? []).filter((t) => t && typeof t.value === "number"),
    [tokens],
  );

  // Normalize bar heights against the largest magnitude so the peak fills the cell.
  const maxAbs = useMemo(
    () => Math.max(1e-6, ...list.map((t) => Math.abs(t.value))),
    [list],
  );

  const rows = useMemo(
    () =>
      list.map((t, i) => {
        const v = t.value;
        const frac = clamp(Math.abs(v) / maxAbs, 0, 1);
        const signed = diverging ? v >= 0 : true;
        // Color intensity scales with magnitude; sign picks the ramp.
        const base = signed ? pos : neg;
        const tint = mix(zeroTint, base, 0.18 + frac * 0.82);
        return { ...t, i, v, frac, positive: v >= 0, tint };
      }),
    [list, maxAbs, diverging, pos, neg, zeroTint],
  );

  const animate = inView && !reduced;
  const dur = duration / 1000;
  const step = rows.length > 1 ? Math.min(0.06, (dur * 0.5) / rows.length) : 0;
  const cellH = 44;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/strip relative flex flex-col gap-4">
        {/* ---- Header / legend ---- */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            feature activation
          </span>
          <span className="h-px flex-1 bg-border" />
          <Ramp
            diverging={diverging}
            pos={pos}
            neg={neg}
            zeroTint={zeroTint}
            maxAbs={maxAbs}
            ring={withAlpha(p.ink, 0.08)}
          />
        </div>

        {/* ---- Token strip ---- */}
        <div
          className="relative flex flex-wrap items-end gap-x-[3px] gap-y-3"
          onMouseLeave={clear}
        >
          {rows.map((row) => {
            const isHover = hovered === row.i;
            const barH = Math.max(2, row.frac * (cellH - 6));
            const delay = animate ? row.i * step : 0;

            return (
              <div
                key={`${row.i}-${row.token}-${replayToken}`}
                className="relative flex flex-col items-stretch"
                onMouseEnter={() => setIndex(row.i)}
              >
                {/* Hover tooltip — anchored to this cell's center */}
                {isHover && (
                  <div className="pointer-events-none absolute left-1/2 top-0 h-0 w-0">
                    <FloatingTooltip x={0} y={0} visible align="center">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-[12px] font-semibold text-canvas">
                          {displayToken(row.token)}
                        </span>
                        <TooltipRow label="activation" value={fmt(row.v)} />
                        <TooltipRow
                          label="sign"
                          value={row.positive ? "excitatory" : "inhibitory"}
                        />
                        <TooltipRow label="of peak" value={`${(row.frac * 100).toFixed(0)}%`} />
                      </div>
                    </FloatingTooltip>
                  </div>
                )}

                {/* Token text */}
                <span
                  className="select-none whitespace-pre px-[3px] pb-[5px] text-center font-mono text-[13px] leading-none transition-colors"
                  style={{
                    color: isHover ? p.ink : row.frac > 0.5 ? p.ink : p.inkMuted,
                  }}
                >
                  {displayToken(row.token)}
                </span>

                {/* Activation cell */}
                <div
                  className="relative w-full overflow-hidden rounded-[4px]"
                  style={{
                    height: cellH,
                    minWidth: 14,
                    background: zeroTint,
                    boxShadow: isHover ? `0 0 0 1.5px ${withAlpha(row.tint, 0.9)}` : undefined,
                  }}
                >
                  {/* Diverging: zero baseline at mid; single-sided: grows from bottom. */}
                  {diverging ? (
                    <motion.div
                      className="absolute inset-x-0"
                      style={{
                        background: row.tint,
                        ...(row.positive
                          ? { bottom: "50%", borderRadius: "3px 3px 0 0" }
                          : { top: "50%", borderRadius: "0 0 3px 3px" }),
                      }}
                      initial={animate ? { height: 0 } : false}
                      animate={{ height: (row.frac * (cellH / 2 - 2)) || 0 }}
                      transition={{ duration: dur, delay, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : (
                    <motion.div
                      className="absolute inset-x-0 bottom-0 rounded-[3px]"
                      style={{ background: row.tint }}
                      initial={animate ? { height: 0 } : false}
                      animate={{ height: barH }}
                      transition={{ duration: dur, delay, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}

                  {/* Mid baseline for diverging mode */}
                  {diverging && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-1/2 h-px"
                      style={{ background: withAlpha(p.ink, 0.18) }}
                    />
                  )}

                  {/* Value chip on the peak token / hover */}
                  <motion.span
                    className="pointer-events-none absolute inset-x-0 text-center font-mono text-[8.5px] font-semibold tabular-nums"
                    style={{
                      [diverging && !row.positive ? "bottom" : "top"]: 4,
                      color:
                        row.frac > 0.55
                          ? readableOn(row.tint)
                          : withAlpha(p.ink, 0),
                    }}
                    initial={animate ? { opacity: 0 } : false}
                    animate={{ opacity: row.frac > 0.55 || isHover ? 1 : 0 }}
                    transition={{ delay: delay + dur * 0.6, duration: 0.3 }}
                  >
                    {fmt(row.v)}
                  </motion.span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ---- Footer ---- */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            {diverging
              ? "bar above midline excites · below suppresses"
              : "bar height ≡ activation magnitude"}
          </span>
          <ReplayButton
            onClick={replay}
            className="opacity-0 transition-opacity group-hover/strip:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Legend ramp                                                        */
/* ------------------------------------------------------------------ */

function Ramp({
  diverging,
  pos,
  neg,
  zeroTint,
  maxAbs,
  ring,
}: {
  diverging: boolean;
  pos: string;
  neg: string;
  zeroTint: string;
  maxAbs: number;
  ring: string;
}) {
  const gradient = diverging
    ? `linear-gradient(90deg, ${neg}, ${zeroTint} 50%, ${pos})`
    : `linear-gradient(90deg, ${zeroTint}, ${pos})`;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] tabular-nums text-ink-faint">
        {diverging ? fmt(-maxAbs) : "0"}
      </span>
      <span
        className="h-2 w-20 rounded-full"
        style={{ background: gradient, boxShadow: `inset 0 0 0 1px ${ring}` }}
      />
      <span className="font-mono text-[9px] tabular-nums text-ink-faint">{fmt(maxAbs)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(v: number): string {
  const s = v >= 0 ? "+" : "−";
  return `${s}${Math.abs(v).toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "activation-strip",
  name: "Activation Strip",
  category: "interpretability",
  description:
    "A line of tokens with a colored activation cell beneath each — a diverging ramp shows where a feature fires (and where it is suppressed) across a span of text, with bars drawing in left to right.",
  tags: ["interpretability", "activations", "features", "tokens", "saliency", "sae"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ActivationStrip",
  sourcePath: "interpretability/ActivationStrip",
  aspect: 16 / 7,
  controls: [
    {
      key: "tokens",
      label: "Tokens",
      type: "json",
      group: "Data",
      help: "Per-token activations: [{ token, value }]. Value sign drives the diverging ramp.",
      default: DEFAULT_TOKENS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "diverging",
      label: "Diverging ramp",
      type: "boolean",
      group: "Style",
      help: "On: signed bars around a midline. Off: magnitude-only bars from the floor.",
      default: true,
    },
    { key: "color", label: "Activation color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1000,
      min: 0,
      max: 2500,
      step: 50,
    },
  ],
  presets: [
    {
      id: "golden-gate",
      name: "Feature firing on a phrase",
      props: {
        title: "Golden Gate feature",
        caption:
          "A monosemantic feature peaks on the literal bridge name and stays warm across the surrounding place reference — quiet on the framing tokens.",
        source: "Anthropic · Scaling Monosemanticity",
        tokens: DEFAULT_TOKENS,
        diverging: true,
      },
    },
    {
      id: "sentiment-magnitude",
      name: "Sentiment saliency",
      props: {
        title: "Sentiment feature saliency",
        caption: "Magnitude-only view: how strongly each token drives the positive-sentiment readout.",
        diverging: false,
        tokens: [
          { token: "The", value: 0.04 },
          { token: "film", value: 0.12 },
          { token: "was", value: 0.06 },
          { token: "absolutely", value: 0.71 },
          { token: "stunning", value: 0.96 },
          { token: "and", value: 0.09 },
          { token: "deeply", value: 0.58 },
          { token: "moving", value: 0.83 },
        ],
      },
    },
    {
      id: "refusal-direction",
      name: "Refusal direction",
      props: {
        title: "Refusal-direction activation",
        caption:
          "Projection onto the refusal direction: harm-related tokens excite it, benign framing suppresses it.",
        source: "Interpretability team",
        diverging: true,
        tokens: [
          { token: "Please", value: -0.31 },
          { token: "explain", value: -0.14 },
          { token: "how", value: 0.05 },
          { token: "to", value: 0.11 },
          { token: "synthesize", value: 0.62 },
          { token: "a", value: 0.18 },
          { token: "dangerous", value: 0.95 },
          { token: "toxin", value: 0.88 },
          { token: "safely", value: -0.42 },
        ],
      },
    },
  ],
};
