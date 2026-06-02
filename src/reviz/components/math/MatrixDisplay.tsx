"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  MonoLabel,
  ReplayButton,
  clamp,
  formatCompact,
  mix,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/** A single [row, col] coordinate, zero-indexed. */
type Cell = [number, number];

export interface MatrixDisplayProps {
  /** The matrix values, row-major. */
  matrix?: number[][];
  /** Optional labels for each row (left of the matrix). */
  rowLabels?: string[];
  /** Optional labels for each column (above the matrix). */
  colLabels?: string[];
  /** Cells to emphasize as `[row, col]` pairs. A full row/col can be swept by listing each cell. */
  highlight?: Cell[];
  /** Decimal places shown per cell; `-1` formats compactly. */
  precision?: number;
  /** Symbol typeset to the left of the matrix (e.g. "W", "A", "Q"). */
  symbol?: string;
  /** Tint highlighted cells by magnitude instead of a flat accent fill. */
  shadeByValue?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  /** Overrides the palette accent used for highlights. */
  color?: string;
  /** Entrance duration in ms. */
  duration?: number;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function MatrixDisplay({
  matrix = [
    [0.81, 0.12, -0.34, 0.07],
    [-0.22, 0.64, 0.41, -0.18],
    [0.05, -0.29, 0.93, 0.36],
    [0.44, 0.18, -0.11, 0.72],
  ],
  rowLabels = [],
  colLabels = [],
  highlight = [],
  precision = 2,
  symbol = "W",
  shadeByValue = false,
  title = "",
  caption = "",
  source = "",
  color = "",
  duration = 900,
}: MatrixDisplayProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const rows = matrix.length;
  const cols = useMemo(() => matrix.reduce((m, r) => Math.max(m, r.length), 0), [matrix]);

  const highlightSet = useMemo(() => {
    const s = new Set<string>();
    for (const h of highlight) {
      if (Array.isArray(h) && h.length >= 2) s.add(`${h[0]},${h[1]}`);
    }
    return s;
  }, [highlight]);

  // Magnitude extent for value shading.
  const maxAbs = useMemo(() => {
    let m = 0;
    for (const row of matrix) for (const v of row) m = Math.max(m, Math.abs(v));
    return m || 1;
  }, [matrix]);

  const fmt = (v: number) => {
    if (precision < 0) return formatCompact(v, 2);
    return round(v, precision).toFixed(precision);
  };

  const cellCount = rows * cols || 1;
  // Stagger across cells reading order; keep total within ~80% of duration.
  const perCell = (duration / 1000) * 0.55;
  const stepDelay = (duration / 1000) * 0.45 / cellCount;

  const hasRowLabels = rowLabels.some((l) => l && l.length > 0);
  const hasColLabels = colLabels.some((l) => l && l.length > 0);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative flex flex-col items-center">
        <div className="flex items-stretch justify-center gap-3 py-2">
          {symbol ? (
            <motion.div
              className="flex items-center font-serif text-ink"
              style={{ fontSize: "clamp(20px, 4.5vw, 34px)" }}
              initial={false}
              animate={inView || reduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <span className="italic">{symbol}</span>
              <span className="mx-1 text-ink-faint">=</span>
            </motion.div>
          ) : null}

          {/* Column labels + bracketed grid */}
          <div className="flex flex-col">
            {hasColLabels ? (
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `${hasRowLabels ? "auto " : ""}repeat(${cols}, minmax(0,1fr))`,
                  marginLeft: BRACKET_W + GRID_PAD_X,
                  marginRight: BRACKET_W + GRID_PAD_X,
                }}
              >
                {hasRowLabels ? <span /> : null}
                {Array.from({ length: cols }).map((_, c) => (
                  <MonoLabel key={c} className="px-2.5 pb-1.5 text-right text-[10px]">
                    {colLabels[c] ?? ""}
                  </MonoLabel>
                ))}
              </div>
            ) : null}

            <div className="flex items-stretch">
              {hasRowLabels ? (
                <div className="flex flex-col justify-around pr-2 text-right">
                  {matrix.map((_, r) => (
                    <MonoLabel key={r} className="text-[10px] leading-none">
                      {rowLabels[r] ?? ""}
                    </MonoLabel>
                  ))}
                </div>
              ) : null}

              <Bracket side="left" color={p.borderStrong} animate={inView || reduced} />

              <div
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(2.6rem, 1fr))`,
                  paddingLeft: GRID_PAD_X,
                  paddingRight: GRID_PAD_X,
                }}
              >
                {matrix.map((row, r) =>
                  Array.from({ length: cols }).map((_, c) => {
                    const v = row[c];
                    const present = v !== undefined && v !== null && !Number.isNaN(v);
                    const isHi = highlightSet.has(`${r},${c}`);
                    const order = r * cols + c;
                    const delay = order * stepDelay;

                    const shade =
                      isHi && shadeByValue && present
                        ? clamp(Math.abs(v) / maxAbs, 0.18, 1)
                        : 1;

                    const bg = isHi
                      ? present
                        ? withAlpha(accent, shadeByValue ? 0.1 + shade * 0.34 : 0.16)
                        : withAlpha(accent, 0.06)
                      : "transparent";
                    const ring = isHi ? withAlpha(accent, 0.55) : "transparent";
                    const textColor = isHi
                      ? mix(p.ink, accent, 0.4)
                      : present
                        ? p.ink
                        : p.inkFaint;

                    return (
                      <motion.div
                        key={`${token}-${r}-${c}`}
                        className="relative grid items-center justify-end rounded-[5px] px-2.5 tabular-nums"
                        style={{
                          minHeight: "2.1rem",
                          backgroundColor: bg,
                          boxShadow: isHi ? `inset 0 0 0 1px ${ring}` : "none",
                          fontFamily: "var(--font-mono, ui-monospace), monospace",
                          fontSize: "clamp(11px, 2.4vw, 14px)",
                          color: textColor,
                          fontVariantNumeric: "tabular-nums",
                          letterSpacing: "0.01em",
                        }}
                        initial={false}
                        animate={
                          inView || reduced
                            ? { opacity: 1, scale: 1, y: 0 }
                            : { opacity: 0, scale: 0.94, y: 4 }
                        }
                        transition={{ duration: perCell, delay, ease: EASE }}
                      >
                        <span className={isHi ? "font-medium" : undefined}>
                          {present ? fmt(v) : "·"}
                        </span>
                      </motion.div>
                    );
                  }),
                )}
              </div>

              <Bracket side="right" color={p.borderStrong} animate={inView || reduced} />
            </div>
          </div>
        </div>

        {/* Dimension annotation */}
        <motion.div
          className="mt-1.5"
          initial={false}
          animate={inView || reduced ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4, delay: (duration / 1000) * 0.6 }}
        >
          <MonoLabel className="text-[10px] text-ink-faint">
            {rows} × {cols}
            {highlightSet.size > 0 ? (
              <>
                {" · "}
                <span style={{ color: accent }}>{highlightSet.size} highlighted</span>
              </>
            ) : null}
          </MonoLabel>
        </motion.div>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

const BRACKET_W = 12;
const GRID_PAD_X = 8;

/** A tall square matrix bracket drawn as a thin SVG, scaling to the grid height. */
function Bracket({
  side,
  color,
  animate,
}: {
  side: "left" | "right";
  color: string;
  animate: boolean;
}) {
  const left = side === "left";
  // Path drawn in a 12x100 viewbox, stretched vertically to fill the grid.
  const d = left ? "M11 2 H3 V98 H11" : "M1 2 H9 V98 H1";
  return (
    <svg
      width={BRACKET_W}
      viewBox="0 0 12 100"
      preserveAspectRatio="none"
      className="self-stretch"
      style={{ height: "auto", overflow: "visible" }}
      aria-hidden
    >
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={false}
        animate={{ opacity: animate ? 1 : 0, pathLength: animate ? 1 : 0 }}
        transition={{ duration: 0.55, ease: EASE }}
      />
    </svg>
  );
}

export const meta: RevizMeta = {
  id: "matrix-display",
  name: "Matrix Display",
  category: "math",
  description:
    "A crisply typeset matrix with tall brackets, tabular numerals, optional row/column labels, and accent-highlighted cells that fade in one by one.",
  tags: ["matrix", "linear-algebra", "weights", "vector", "tensor", "equation"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "MatrixDisplay",
  sourcePath: "math/MatrixDisplay",
  aspect: 16 / 10,
  controls: [
    {
      key: "matrix",
      label: "Matrix",
      type: "matrix",
      group: "Data",
      default: [
        [0.81, 0.12, -0.34, 0.07],
        [-0.22, 0.64, 0.41, -0.18],
        [0.05, -0.29, 0.93, 0.36],
        [0.44, 0.18, -0.11, 0.72],
      ],
    },
    {
      key: "rowLabels",
      label: "Row labels",
      type: "json",
      group: "Labels",
      default: [],
    },
    {
      key: "colLabels",
      label: "Column labels",
      type: "json",
      group: "Labels",
      default: [],
    },
    {
      key: "symbol",
      label: "Symbol",
      type: "text",
      group: "Labels",
      default: "W",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "highlight",
      label: "Highlight cells [[r,c]…]",
      type: "json",
      group: "Style",
      default: [],
    },
    {
      key: "precision",
      label: "Decimals (-1 = compact)",
      type: "number",
      group: "Style",
      default: 2,
      min: -1,
      max: 4,
      step: 1,
    },
    {
      key: "shadeByValue",
      label: "Shade highlights by value",
      type: "boolean",
      group: "Style",
      default: false,
    },
    { key: "color", label: "Highlight color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 900,
      min: 0,
      max: 2500,
      step: 50,
    },
  ],
  presets: [
    {
      id: "weight-row",
      name: "Weight matrix, highlighted row",
      props: {
        symbol: "W",
        title: "Attention projection weights",
        caption: "Row 2 of the query projection, surfaced for inspection.",
        matrix: [
          [0.81, 0.12, -0.34, 0.07, 0.22],
          [-0.22, 0.64, 0.41, -0.18, 0.09],
          [0.05, -0.29, 0.93, 0.36, -0.4],
          [0.44, 0.18, -0.11, 0.72, 0.15],
        ],
        rowLabels: ["h₀", "h₁", "h₂", "h₃"],
        colLabels: ["q₀", "q₁", "q₂", "q₃", "q₄"],
        highlight: [
          [2, 0],
          [2, 1],
          [2, 2],
          [2, 3],
          [2, 4],
        ],
      },
    },
    {
      id: "rotation",
      name: "Rotation matrix",
      props: {
        symbol: "R",
        title: "2D rotation by θ",
        precision: 3,
        matrix: [
          [0.707, -0.707],
          [0.707, 0.707],
        ],
        highlight: [
          [0, 1],
        ],
      },
    },
    {
      id: "attention",
      name: "Attention weights, value-shaded",
      props: {
        symbol: "A",
        title: "Self-attention weights",
        caption: "Diagonal dominance under a causal mask.",
        precision: 2,
        shadeByValue: true,
        matrix: [
          [0.92, 0.05, 0.02, 0.01],
          [0.31, 0.6, 0.06, 0.03],
          [0.18, 0.22, 0.55, 0.05],
          [0.12, 0.16, 0.27, 0.45],
        ],
        rowLabels: ["t₀", "t₁", "t₂", "t₃"],
        colLabels: ["t₀", "t₁", "t₂", "t₃"],
        highlight: [
          [0, 0],
          [1, 0],
          [1, 1],
          [2, 0],
          [2, 1],
          [2, 2],
          [3, 0],
          [3, 1],
          [3, 2],
          [3, 3],
        ],
      },
    },
  ],
};
