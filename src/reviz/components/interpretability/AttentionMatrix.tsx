"use client";

import { scaleBand } from "d3-scale";
import { max as d3max } from "d3-array";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  clamp,
  mix,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

// A clean diagonal with a couple of long-range coreference links.
const SENTENCE_TOKENS = ["The", "robot", "picked", "up", "the", "red", "cube", "."];
const SENTENCE_WEIGHTS: number[][] = [
  [0.62, 0.14, 0.05, 0.03, 0.07, 0.02, 0.05, 0.02],
  [0.18, 0.55, 0.09, 0.04, 0.03, 0.02, 0.07, 0.02],
  [0.04, 0.31, 0.48, 0.08, 0.03, 0.02, 0.02, 0.02],
  [0.03, 0.06, 0.34, 0.45, 0.06, 0.02, 0.02, 0.02],
  [0.05, 0.04, 0.04, 0.05, 0.58, 0.08, 0.14, 0.02],
  [0.02, 0.03, 0.03, 0.02, 0.1, 0.55, 0.23, 0.02],
  [0.02, 0.28, 0.06, 0.03, 0.07, 0.2, 0.32, 0.02],
  [0.03, 0.04, 0.05, 0.03, 0.05, 0.06, 0.07, 0.67],
];
const DEFAULT_TITLE = "Self-attention, head 4 · layer 9";

export interface AttentionMatrixProps {
  /** Key tokens — the columns. Also used for rows when `rowTokens` is empty. */
  tokens: string[];
  /** Attention weights[query row][key column]. */
  weights: number[][];
  /** Optional query tokens — the rows. Falls back to `tokens` when empty. */
  rowTokens: string[];
  /** Normalize each row so its weights sum to 1 (a true attention distribution). */
  rowNormalize: boolean;
  /** Draw a faint outline on each cell. */
  showGrid: boolean;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

export default function AttentionMatrix({
  tokens = SENTENCE_TOKENS,
  weights = SENTENCE_WEIGHTS,
  rowTokens = [],
  rowNormalize = false,
  showGrid = true,
  title = DEFAULT_TITLE,
  caption = "",
  source = "",
  color = "",
  duration = 1100,
}: AttentionMatrixProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  const cols = tokens;
  const rows = rowTokens.length ? rowTokens : tokens;

  // Normalized (optionally row-stochastic) weights + the value used for color mapping.
  const { matrix, scaleMax } = useMemo(() => {
    const m = rows.map((_, r) => {
      const raw = cols.map((_, c) => {
        const v = weights[r]?.[c];
        return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
      });
      if (rowNormalize) {
        const sum = raw.reduce((a, b) => a + b, 0);
        return sum > 0 ? raw.map((v) => v / sum) : raw;
      }
      return raw;
    });
    const top = d3max(m.flat()) ?? 1;
    return { matrix: m, scaleMax: top > 0 ? top : 1 };
  }, [rows, cols, weights, rowNormalize]);

  const cellColor = (v: number) => {
    const t = clamp(v / scaleMax, 0, 1);
    // Quiet cells stay near the surface; hot cells saturate toward the accent.
    return mix(p.surface, fill, 0.06 + 0.94 * Math.pow(t, 0.78));
  };
  const cellOpacity = (v: number) => 0.16 + 0.84 * clamp(v / scaleMax, 0, 1);

  const labelChars = Math.max(0, ...cols.map((t) => t.length));
  const leftPad = clamp(28 + Math.max(0, ...rows.map((t) => t.length)) * 6.6, 44, 132);
  const topPad = clamp(20 + labelChars * 5.6, 36, 110);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={cols.length / Math.max(rows.length, 1) > 1.4 ? 16 / 9 : 4 / 3}
          margin={{ top: topPad, right: 22, bottom: 14, left: leftPad }}
        >
          {({ inner, margin }) => {
            const xs = scaleBand<number>()
              .domain(cols.map((_, i) => i))
              .range([0, inner.width])
              .paddingInner(0.08);
            const ys = scaleBand<number>()
              .domain(rows.map((_, i) => i))
              .range([0, inner.height])
              .paddingInner(0.08);
            const bw = xs.bandwidth();
            const bh = ys.bandwidth();
            const radius = Math.min(4, bw * 0.16, bh * 0.16);
            const cellCount = Math.max(rows.length * cols.length, 1);
            const perDelay = (duration / 1000) * 0.55 / cellCount;

            const activeRow = hover?.r ?? -1;
            const activeCol = hover?.c ?? -1;
            const hasHover = hover != null;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {/* Column (key) token labels — rotated. */}
                {cols.map((t, c) => {
                  const cx = (xs(c) ?? 0) + bw / 2;
                  const on = c === activeCol;
                  return (
                    <text
                      key={`col-${c}`}
                      transform={`translate(${cx}, -10) rotate(-45)`}
                      textAnchor="start"
                      fill={on ? p.ink : p.inkFaint}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        letterSpacing: "0.02em",
                        fontWeight: on ? 600 : 400,
                        transition: "fill 0.12s",
                      }}
                    >
                      {t}
                    </text>
                  );
                })}

                {/* Row (query) token labels. */}
                {rows.map((t, r) => {
                  const cy = (ys(r) ?? 0) + bh / 2;
                  const on = r === activeRow;
                  return (
                    <text
                      key={`row-${r}`}
                      x={-10}
                      y={cy}
                      dy="0.32em"
                      textAnchor="end"
                      fill={on ? p.ink : p.inkFaint}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        letterSpacing: "0.02em",
                        fontWeight: on ? 600 : 400,
                        transition: "fill 0.12s",
                      }}
                    >
                      {t}
                    </text>
                  );
                })}

                {/* Row highlight band behind the hovered query distribution. */}
                {activeRow >= 0 && (
                  <rect
                    x={-leftPad + 6}
                    y={ys(activeRow) ?? 0}
                    width={inner.width + leftPad - 6}
                    height={bh}
                    fill={withAlpha(fill, 0.06)}
                    rx={radius}
                  />
                )}

                {/* Cells. */}
                {matrix.map((rowVals, r) =>
                  rowVals.map((v, c) => {
                    const x = xs(c) ?? 0;
                    const y = ys(r) ?? 0;
                    const idx = r * cols.length + c;
                    const isHover = activeRow === r && activeCol === c;
                    const inActiveRow = activeRow === r;
                    const dim = hasHover && !inActiveRow && !(activeCol === c);
                    return (
                      <motion.rect
                        key={`cell-${r}-${c}-${token}`}
                        x={x}
                        y={y}
                        width={bw}
                        height={bh}
                        rx={radius}
                        fill={cellColor(v)}
                        stroke={showGrid ? withAlpha(p.borderStrong, 0.5) : "none"}
                        strokeWidth={showGrid ? 0.5 : 0}
                        initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
                        animate={{
                          opacity: inView ? (dim ? cellOpacity(v) * 0.4 + 0.04 : 1) : 0,
                          scale: inView ? 1 : reduced ? 1 : 0.6,
                        }}
                        transition={{
                          duration: reduced ? 0 : 0.42,
                          delay: reduced ? 0 : idx * perDelay,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ transformOrigin: `${x + bw / 2}px ${y + bh / 2}px`, cursor: "pointer" }}
                        onMouseMove={(e) => {
                          const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                          const rect = svg.getBoundingClientRect();
                          setHover({ r, c, x: e.clientX - rect.left, y: e.clientY - rect.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      >
                        {isHover && <title>{`${rows[r]} → ${cols[c]}`}</title>}
                      </motion.rect>
                    );
                  }),
                )}

                {/* Crisp outline ring on the focused cell. */}
                {hasHover && (
                  <rect
                    x={xs(activeCol) ?? 0}
                    y={ys(activeRow) ?? 0}
                    width={bw}
                    height={bh}
                    rx={radius}
                    fill="none"
                    stroke={p.ink}
                    strokeWidth={1.25}
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1.5 flex items-baseline gap-1.5 font-mono text-[11px]">
                <span className="opacity-60">query</span>
                <span className="font-semibold text-canvas">{rows[hover.r]}</span>
                <span className="opacity-50">→</span>
                <span className="opacity-60">key</span>
                <span className="font-semibold text-canvas">{cols[hover.c]}</span>
              </div>
              <TooltipRow
                label={rowNormalize ? "weight" : "score"}
                value={round(matrix[hover.r]?.[hover.c] ?? 0, 3)}
              />
              {rowNormalize && (
                <TooltipRow
                  label="% of row"
                  value={`${round((matrix[hover.r]?.[hover.c] ?? 0) * 100, 1)}%`}
                />
              )}
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>

        {/* Color legend: a small weight ramp. */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">low</span>
          <div
            className="h-2 w-28 rounded-full"
            style={{
              background: `linear-gradient(to right, ${mix(p.surface, fill, 0.06)}, ${fill})`,
              border: `0.5px solid ${withAlpha(p.borderStrong, 0.6)}`,
            }}
          />
          <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
            {rowNormalize ? "attention weight" : "attention score"}
          </span>
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "attention-matrix",
  name: "Attention Matrix",
  category: "interpretability",
  description:
    "A token-by-token attention heatmap — query rows against key columns, where cell intensity reveals what the model looked at and a hovered row lights up its full attention distribution.",
  tags: ["attention", "transformer", "heatmap", "interpretability", "tokens"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "AttentionMatrix",
  sourcePath: "interpretability/AttentionMatrix",
  aspect: 4 / 3,
  controls: [
    {
      key: "tokens",
      label: "Key tokens (columns)",
      type: "json",
      group: "Data",
      default: SENTENCE_TOKENS,
    },
    {
      key: "weights",
      label: "Attention weights",
      type: "matrix",
      group: "Data",
      default: SENTENCE_WEIGHTS,
    },
    {
      key: "rowTokens",
      label: "Query tokens (rows)",
      type: "json",
      group: "Data",
      default: [],
      help: "Leave empty to reuse the key tokens (self-attention).",
    },
    {
      key: "rowNormalize",
      label: "Row-normalize",
      type: "boolean",
      group: "Data",
      default: false,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: DEFAULT_TITLE },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showGrid", label: "Cell outlines", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Heat color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "coreference",
      name: "Coreference links",
      props: {
        title: "Self-attention, head 4 · layer 9",
        caption: "A clean local diagonal, with 'cube' attending back to 'robot' and 'red'.",
        tokens: SENTENCE_TOKENS,
        weights: SENTENCE_WEIGHTS,
        rowNormalize: false,
      },
    },
    {
      id: "induction",
      name: "Induction head",
      props: {
        title: "Induction head · repeated-pattern copy",
        caption: "Each token attends to what followed the previous occurrence of itself.",
        rowNormalize: true,
        tokens: ["A", "B", "C", "A", "B", "C", "A", "B"],
        weights: [
          [0.8, 0.04, 0.04, 0.04, 0.02, 0.02, 0.02, 0.02],
          [0.1, 0.78, 0.04, 0.03, 0.02, 0.01, 0.01, 0.01],
          [0.05, 0.1, 0.75, 0.04, 0.03, 0.01, 0.01, 0.01],
          [0.02, 0.62, 0.04, 0.22, 0.04, 0.02, 0.02, 0.02],
          [0.02, 0.04, 0.6, 0.06, 0.22, 0.03, 0.02, 0.01],
          [0.55, 0.04, 0.05, 0.06, 0.06, 0.2, 0.03, 0.01],
          [0.02, 0.58, 0.04, 0.05, 0.06, 0.05, 0.18, 0.02],
          [0.02, 0.05, 0.55, 0.04, 0.05, 0.06, 0.05, 0.18],
        ],
      },
    },
    {
      id: "crossattn",
      name: "Cross-attention",
      props: {
        title: "Decoder cross-attention · EN → FR",
        rowNormalize: true,
        rowTokens: ["Le", "chat", "noir", "dort"],
        tokens: ["The", "black", "cat", "sleeps"],
        weights: [
          [0.78, 0.08, 0.1, 0.04],
          [0.06, 0.12, 0.78, 0.04],
          [0.05, 0.82, 0.09, 0.04],
          [0.05, 0.05, 0.08, 0.82],
        ],
      },
    },
  ],
};
