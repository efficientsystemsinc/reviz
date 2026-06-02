"use client";

import { scaleBand } from "d3-scale";
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
  readableOn,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

type Cell = { token: string; prob: number };

// A logit-lens read of "The capital of France is ___" decoded at every layer.
// Early layers surface surface-form / frequency tokens; the answer sharpens late.
const DEFAULT_LAYERS = ["L0", "L4", "L8", "L12", "L16", "L20", "L24", "L28", "L32"];
const DEFAULT_POSITIONS = ["The", "capital", "of", "France", "is"];
const DEFAULT_CELLS: Cell[][] = [
  // L0 — almost pure embedding echo, near-uniform.
  [
    { token: " the", prob: 0.04 }, { token: " a", prob: 0.03 }, { token: " ,", prob: 0.03 },
    { token: " the", prob: 0.04 }, { token: " a", prob: 0.05 },
  ],
  [
    { token: " the", prob: 0.06 }, { token: " city", prob: 0.05 }, { token: " ,", prob: 0.04 },
    { token: ",", prob: 0.05 }, { token: " a", prob: 0.07 },
  ],
  [
    { token: " a", prob: 0.08 }, { token: " of", prob: 0.07 }, { token: " the", prob: 0.06 },
    { token: " is", prob: 0.06 }, { token: " the", prob: 0.1 },
  ],
  [
    { token: " a", prob: 0.11 }, { token: " city", prob: 0.12 }, { token: " the", prob: 0.09 },
    { token: " is", prob: 0.1 }, { token: " a", prob: 0.14 },
  ],
  [
    { token: " country", prob: 0.16 }, { token: " city", prob: 0.21 }, { token: " a", prob: 0.13 },
    { token: " is", prob: 0.17 }, { token: " the", prob: 0.22 },
  ],
  [
    { token: " country", prob: 0.24 }, { token: " region", prob: 0.28 }, { token: " a", prob: 0.18 },
    { token: " has", prob: 0.21 }, { token: " a", prob: 0.31 },
  ],
  [
    { token: " nation", prob: 0.31 }, { token: " city", prob: 0.4 }, { token: " a", prob: 0.22 },
    { token: " ,", prob: 0.27 }, { token: " Paris", prob: 0.39 },
  ],
  [
    { token: " nation", prob: 0.42 }, { token: " city", prob: 0.55 }, { token: " France", prob: 0.3 },
    { token: " ,", prob: 0.34 }, { token: " Paris", prob: 0.64 },
  ],
  [
    { token: " country", prob: 0.49 }, { token: " city", prob: 0.71 }, { token: " France", prob: 0.41 },
    { token: " ,", prob: 0.46 }, { token: " Paris", prob: 0.88 },
  ],
];
const DEFAULT_TITLE = "Logit lens · “The capital of France is ___”";

export interface LogitLensProps {
  /** Layer labels — one row per decoded layer, ordered shallow → deep. */
  layers: string[];
  /** Position labels — one column per token position in the prompt. */
  positions: string[];
  /** Top decoded token per [layer][position] with its probability in [0,1]. */
  cells: Cell[][];
  /** Show the per-cell probability under the token. */
  showProb: boolean;
  /** Draw a faint outline around each cell. */
  showGrid: boolean;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

export default function LogitLens({
  layers = DEFAULT_LAYERS,
  positions = DEFAULT_POSITIONS,
  cells = DEFAULT_CELLS,
  showProb = true,
  showGrid = true,
  title = DEFAULT_TITLE,
  caption = "",
  source = "",
  color = "",
  duration = 1200,
}: LogitLensProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token: replayToken, replay } = useReplay();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  const rows = layers;
  const cols = positions;

  // Clean, defensively-typed lookup of the decoded cell at [r][c].
  const cellAt = useMemo(() => {
    return (r: number, c: number): Cell => {
      const raw = cells[r]?.[c];
      const prob =
        raw && typeof raw.prob === "number" && Number.isFinite(raw.prob)
          ? clamp(raw.prob, 0, 1)
          : 0;
      const tk = raw && typeof raw.token === "string" ? raw.token : "";
      return { token: tk, prob };
    };
  }, [cells]);

  // Confidence → background tint (quiet near surface, saturating toward the accent).
  const bg = (prob: number) => mix(p.surface, fill, 0.04 + 0.92 * Math.pow(clamp(prob, 0, 1), 0.85));
  // Ink that stays legible as the tint darkens.
  const ink = (prob: number) => (prob > 0.46 ? readableOn(bg(prob)) : p.ink);

  const leftPad = clamp(24 + Math.max(0, ...rows.map((t) => t.length)) * 6.4, 40, 96);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg
          aspect={cols.length / Math.max(rows.length, 1) > 1 ? 16 / 10 : 4 / 5}
          margin={{ top: 30, right: 16, bottom: 16, left: leftPad }}
        >
          {({ inner, margin }) => {
            const xs = scaleBand<number>()
              .domain(cols.map((_, i) => i))
              .range([0, inner.width])
              .paddingInner(0.07);
            const ys = scaleBand<number>()
              .domain(rows.map((_, i) => i))
              .range([0, inner.height])
              .paddingInner(0.07);
            const bw = xs.bandwidth();
            const bh = ys.bandwidth();
            const radius = Math.min(5, bw * 0.12, bh * 0.18);
            const cellCount = Math.max(rows.length * cols.length, 1);
            // Bottom-up wave: deep layers (the answer) resolve last.
            const perDelay = ((duration / 1000) * 0.6) / cellCount;

            const tokenSize = clamp(Math.min(bw, bh) * 0.3, 8.5, 14);
            const probSize = clamp(tokenSize * 0.72, 7, 10);

            const activeRow = hover?.r ?? -1;
            const activeCol = hover?.c ?? -1;
            const hasHover = hover != null;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {/* Position labels along the top. */}
                {cols.map((t, c) => {
                  const cx = (xs(c) ?? 0) + bw / 2;
                  const on = c === activeCol;
                  return (
                    <text
                      key={`col-${c}`}
                      x={cx}
                      y={-12}
                      textAnchor="middle"
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

                {/* Layer labels down the left edge. */}
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
                        fontSize: 10,
                        letterSpacing: "0.04em",
                        fontWeight: on ? 600 : 400,
                        transition: "fill 0.12s",
                      }}
                    >
                      {t}
                    </text>
                  );
                })}

                {/* "depth" axis cue along the left. */}
                <text
                  transform={`translate(${-leftPad + 9}, ${inner.height / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fill={p.inkFaint}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8.5,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  depth →
                </text>

                {/* Cells. */}
                {rows.map((_, r) =>
                  cols.map((_, c) => {
                    const x = xs(c) ?? 0;
                    const y = ys(r) ?? 0;
                    const cell = cellAt(r, c);
                    const idx = r * cols.length + c;
                    const isHover = activeRow === r && activeCol === c;
                    const inActiveLine = activeRow === r || activeCol === c;
                    const dim = hasHover && !inActiveLine;
                    const tx = x + bw / 2;
                    return (
                      <motion.g
                        key={`cell-${r}-${c}-${replayToken}`}
                        initial={{ opacity: 0, scale: reduced ? 1 : 0.7 }}
                        animate={{
                          opacity: inView ? (dim ? 0.32 : 1) : 0,
                          scale: inView ? 1 : reduced ? 1 : 0.7,
                        }}
                        transition={{
                          duration: reduced ? 0 : 0.4,
                          delay: reduced ? 0 : idx * perDelay,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ transformOrigin: `${tx}px ${y + bh / 2}px`, cursor: "pointer" }}
                        onMouseMove={(e) => {
                          const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                          const rect = svg.getBoundingClientRect();
                          setHover({ r, c, x: e.clientX - rect.left, y: e.clientY - rect.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      >
                        <rect
                          x={x}
                          y={y}
                          width={bw}
                          height={bh}
                          rx={radius}
                          fill={bg(cell.prob)}
                          stroke={showGrid ? withAlpha(p.borderStrong, 0.5) : "none"}
                          strokeWidth={showGrid ? 0.5 : 0}
                        />
                        {bw > 26 && (
                          <text
                            x={tx}
                            y={showProb ? y + bh / 2 - probSize * 0.4 : y + bh / 2}
                            dy={showProb ? 0 : "0.02em"}
                            textAnchor="middle"
                            fill={ink(cell.prob)}
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: tokenSize,
                              fontWeight: cell.prob > 0.5 ? 600 : 500,
                              pointerEvents: "none",
                            }}
                          >
                            {cell.token.trim() || "·"}
                          </text>
                        )}
                        {showProb && bw > 26 && bh > 26 && (
                          <text
                            x={tx}
                            y={y + bh / 2 + tokenSize * 0.7}
                            textAnchor="middle"
                            fill={withAlpha(ink(cell.prob), 0.66)}
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: probSize,
                              pointerEvents: "none",
                            }}
                          >
                            {round(cell.prob * 100, 0)}%
                          </text>
                        )}
                      </motion.g>
                    );
                  }),
                )}

                {/* Crisp ring on the focused cell. */}
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
                <span className="opacity-60">{rows[hover.r]}</span>
                <span className="opacity-50">·</span>
                <span className="font-semibold text-canvas">{cols[hover.c]}</span>
              </div>
              <TooltipRow
                label="top token"
                value={`"${cellAt(hover.r, hover.c).token}"`}
              />
              <TooltipRow
                label="prob"
                value={`${round(cellAt(hover.r, hover.c).prob * 100, 1)}%`}
              />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>

        {/* Confidence ramp. */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">unsure</span>
          <div
            className="h-2 w-28 rounded-full"
            style={{
              background: `linear-gradient(to right, ${mix(p.surface, fill, 0.04)}, ${fill})`,
              border: `0.5px solid ${withAlpha(p.borderStrong, 0.6)}`,
            }}
          />
          <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
            decoded confidence
          </span>
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "logit-lens",
  name: "Logit Lens",
  category: "interpretability",
  description:
    "A layers × positions grid decoding the top token at every layer of a transformer — confidence-tinted cells reveal how a prediction emerges and sharpens as it propagates through depth.",
  tags: ["logit-lens", "transformer", "interpretability", "tokens", "probing"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "LogitLens",
  sourcePath: "interpretability/LogitLens",
  aspect: 16 / 10,
  controls: [
    {
      key: "layers",
      label: "Layer labels (rows)",
      type: "json",
      group: "Data",
      default: DEFAULT_LAYERS,
      help: "One label per decoded layer, ordered shallow → deep.",
    },
    {
      key: "positions",
      label: "Position labels (columns)",
      type: "json",
      group: "Data",
      default: DEFAULT_POSITIONS,
    },
    {
      key: "cells",
      label: "Decoded cells",
      type: "json",
      group: "Data",
      default: DEFAULT_CELLS,
      help: "Matrix of { token, prob } — cells[layer][position].",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: DEFAULT_TITLE },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showProb", label: "Show probabilities", type: "boolean", group: "Layout", default: true },
    { key: "showGrid", label: "Cell outlines", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Confidence color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1200,
      min: 0,
      max: 2500,
      step: 50,
    },
  ],
  presets: [
    {
      id: "capital-of-france",
      name: "Answer emerging over layers",
      props: {
        title: "Logit lens · “The capital of France is ___”",
        caption:
          "Early layers echo frequent surface forms; the answer “Paris” crystallizes only in the deepest layers.",
        layers: DEFAULT_LAYERS,
        positions: DEFAULT_POSITIONS,
        cells: DEFAULT_CELLS,
      },
    },
    {
      id: "arithmetic",
      name: "Two-digit addition",
      props: {
        title: "Logit lens · “17 + 26 =”",
        caption: "The numeric answer “43” resolves abruptly in the final third of the network.",
        showProb: true,
        layers: ["L0", "L6", "L12", "L18", "L24", "L30"],
        positions: ["17", "+", "26", "="],
        cells: [
          [
            { token: " 1", prob: 0.05 }, { token: " ,", prob: 0.04 },
            { token: " 2", prob: 0.05 }, { token: " the", prob: 0.06 },
          ],
          [
            { token: " 7", prob: 0.08 }, { token: " and", prob: 0.07 },
            { token: " 6", prob: 0.09 }, { token: " a", prob: 0.11 },
          ],
          [
            { token: " number", prob: 0.14 }, { token: " plus", prob: 0.18 },
            { token: " number", prob: 0.16 }, { token: " 40", prob: 0.22 },
          ],
          [
            { token: " 17", prob: 0.27 }, { token: " plus", prob: 0.31 },
            { token: " 26", prob: 0.33 }, { token: " 41", prob: 0.39 },
          ],
          [
            { token: " 17", prob: 0.41 }, { token: " +", prob: 0.52 },
            { token: " 26", prob: 0.55 }, { token: " 43", prob: 0.71 },
          ],
          [
            { token: " 17", prob: 0.58 }, { token: " +", prob: 0.74 },
            { token: " 26", prob: 0.78 }, { token: " 43", prob: 0.93 },
          ],
        ],
      },
    },
  ],
};
