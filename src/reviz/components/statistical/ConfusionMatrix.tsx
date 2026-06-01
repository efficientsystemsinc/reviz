"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
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

export interface ConfusionMatrixProps {
  matrix?: number[][];
  labels?: string[];
  normalize?: boolean;
  showValues?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

const FALLBACK_LABELS = (n: number) => Array.from({ length: n }, (_, i) => `C${i}`);

export default function ConfusionMatrix({
  matrix = [
    [142, 6, 3, 1],
    [5, 128, 9, 2],
    [4, 7, 137, 6],
    [2, 3, 8, 131],
  ],
  labels = ["Reach", "Grasp", "Lift", "Place"],
  normalize = false,
  showValues = true,
  xAxisLabel = "Predicted",
  yAxisLabel = "Actual",
  title = "",
  caption = "",
  source = "",
  color = "",
  duration = 900,
}: ConfusionMatrixProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  const n = matrix.length;
  const cls = useMemo(() => {
    const base = labels.length >= n ? labels.slice(0, n) : [...labels, ...FALLBACK_LABELS(n).slice(labels.length)];
    return base;
  }, [labels, n]);

  // Row sums for per-row normalization (recall view) and overall stats.
  const rowSums = useMemo(() => matrix.map((row) => row.reduce((a, b) => a + b, 0)), [matrix]);
  const grandTotal = useMemo(() => rowSums.reduce((a, b) => a + b, 0), [rowSums]);
  const correct = useMemo(() => matrix.reduce((acc, row, i) => acc + (row[i] ?? 0), 0), [matrix]);
  const accuracy = grandTotal > 0 ? correct / grandTotal : 0;

  // Normalized value used for both display and color intensity.
  const norm = useMemo(
    () => matrix.map((row, i) => row.map((v) => (rowSums[i] > 0 ? v / rowSums[i] : 0))),
    [matrix, rowSums],
  );

  // Color intensity is always driven by the row-normalized value so that
  // class imbalance never washes out a confident-but-small class.
  const intensity = (r: number, c: number) => norm[r]?.[c] ?? 0;

  const cellFill = (r: number, c: number) => {
    const t = intensity(r, c);
    // gentle non-linear ramp so faint off-diagonal confusions stay visible
    const eased = Math.pow(t, 0.72);
    return mix(p.surface, accent, eased);
  };

  const cellText = (r: number, c: number) => {
    const t = intensity(r, c);
    const eased = Math.pow(t, 0.72);
    // flip to a readable color once the fill gets dark enough
    return eased > 0.52 ? readableOn(mix(p.surface, accent, eased)) : p.inkMuted;
  };

  const display = (r: number, c: number) => {
    if (normalize) {
      const v = norm[r]?.[c] ?? 0;
      return `${round(v * 100, v >= 0.995 ? 0 : 1)}%`;
    }
    return String(matrix[r]?.[c] ?? 0);
  };

  const aspect = 1.18;
  const labelChars = Math.max(...cls.map((l) => l.length), 4);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={aspect}
          margin={{
            top: 30,
            right: 18,
            bottom: 44,
            left: Math.min(108, 30 + labelChars * 6.4),
          }}
        >
          {({ inner, margin }) => {
            const size = Math.min(inner.width, inner.height);
            const ox = (inner.width - size) / 2;
            const oy = (inner.height - size) / 2;
            const cell = n > 0 ? size / n : 0;
            const gap = Math.min(3, cell * 0.05);
            const fontSize = Math.max(8.5, Math.min(15, cell * 0.26));
            const tickFont = Math.max(8.5, Math.min(12, cell * 0.3));

            const orderDelay = (r: number, c: number) => {
              // diagonal-wavefront stagger: cells closer to the top-left fire first,
              // with the main diagonal emphasized
              const wave = (r + c) * 0.5 + Math.abs(r - c) * 0.18;
              return reduced ? 0 : (wave / (n * 1.6)) * (duration / 1000);
            };

            return (
              <g transform={`translate(${margin.left + ox}, ${margin.top + oy})`}>
                {/* Axis titles */}
                <text
                  x={size / 2}
                  y={-margin.top + 12}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  className="font-mono uppercase"
                  style={{ fontSize: 10, letterSpacing: "0.12em" }}
                >
                  {xAxisLabel}
                </text>
                <text
                  transform={`translate(${-margin.left + 12}, ${size / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  className="font-mono uppercase"
                  style={{ fontSize: 10, letterSpacing: "0.12em" }}
                >
                  {yAxisLabel}
                </text>

                {/* Predicted (x) tick labels along the top */}
                {cls.map((label, c) => {
                  const active = hover?.c === c;
                  return (
                    <text
                      key={`xt-${c}`}
                      x={c * cell + cell / 2}
                      y={-6}
                      textAnchor="middle"
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Actual (y) tick labels along the left */}
                {cls.map((label, r) => {
                  const active = hover?.r === r;
                  return (
                    <text
                      key={`yt-${r}`}
                      x={-8}
                      y={r * cell + cell / 2}
                      dy="0.32em"
                      textAnchor="end"
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Cells */}
                {matrix.map((row, r) =>
                  row.map((_, c) => {
                    const x = c * cell;
                    const y = r * cell;
                    const isDiag = r === c;
                    const rowCol = hover != null && (hover.r === r || hover.c === c);
                    const exact = hover != null && hover.r === r && hover.c === c;
                    const dimmed = hover != null && !rowCol;
                    const fill = cellFill(r, c);

                    return (
                      <g key={`cell-${token}-${r}-${c}`}>
                        <motion.rect
                          x={x + gap / 2}
                          y={y + gap / 2}
                          width={Math.max(0, cell - gap)}
                          height={Math.max(0, cell - gap)}
                          rx={Math.min(4, cell * 0.12)}
                          fill={fill}
                          stroke={exact ? accent : isDiag ? withAlpha(accent, 0.55) : p.border}
                          strokeWidth={exact ? 1.6 : isDiag ? 1.1 : 0.75}
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{
                            opacity: inView ? (dimmed ? 0.32 : 1) : 0,
                            scale: inView ? (exact ? 1.04 : 1) : 0.6,
                          }}
                          transition={{
                            opacity: { duration: reduced ? 0 : 0.45, delay: hover ? 0 : orderDelay(r, c) },
                            scale: {
                              duration: reduced ? 0 : exact ? 0.18 : 0.5,
                              delay: hover ? 0 : orderDelay(r, c),
                              ease: [0.22, 1, 0.36, 1],
                            },
                          }}
                          style={{ transformOrigin: `${x + cell / 2}px ${y + cell / 2}px`, cursor: "pointer" }}
                          onMouseMove={(e) => {
                            const r2 = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                            setHover({ r, c, x: e.clientX - r2.left, y: e.clientY - r2.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                        {showValues && cell > 18 && (
                          <motion.text
                            x={x + cell / 2}
                            y={y + cell / 2}
                            dy="0.34em"
                            textAnchor="middle"
                            fill={cellText(r, c)}
                            className="font-mono tabular-nums pointer-events-none"
                            style={{ fontSize, fontWeight: isDiag ? 600 : 400 }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: inView ? (dimmed ? 0.4 : 1) : 0 }}
                            transition={{
                              duration: reduced ? 0 : 0.4,
                              delay: hover ? 0 : orderDelay(r, c) + 0.18,
                            }}
                          >
                            {display(r, c)}
                          </motion.text>
                        )}
                      </g>
                    );
                  }),
                )}

                {/* Outer frame */}
                <rect
                  x={0}
                  y={0}
                  width={size}
                  height={size}
                  fill="none"
                  stroke={p.borderStrong}
                  strokeWidth={1}
                  rx={Math.min(5, cell * 0.12)}
                  className="pointer-events-none"
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* Accuracy readout */}
        <div className="mt-2 flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-label text-ink-faint">
          <span>
            accuracy <span className="tabular-nums text-ink-muted">{round(accuracy * 100, 1)}%</span>
          </span>
          <span className="text-border-strong">/</span>
          <span>
            n <span className="tabular-nums text-ink-muted">{grandTotal}</span>
          </span>
          <span className="text-border-strong">/</span>
          <span>{normalize ? "row-normalized" : "counts"}</span>
        </div>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {cls[hover.r]} {"→"} {cls[hover.c]}
              </div>
              <TooltipRow label="count" value={matrix[hover.r]?.[hover.c] ?? 0} />
              <TooltipRow label="of actual" value={`${round((norm[hover.r]?.[hover.c] ?? 0) * 100, 1)}%`} />
              <TooltipRow label={hover.r === hover.c ? "correct" : "confusion"} value={hover.r === hover.c ? "yes" : "no"} />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} label="replay" />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "confusion-matrix",
  name: "Confusion Matrix",
  category: "statistical",
  description:
    "An N×N classifier confusion matrix as a row-normalized heatmap with a diagonal-wavefront reveal, hover row/column crosshair, and a live accuracy readout.",
  tags: ["confusion", "classification", "heatmap", "evaluation", "accuracy", "recall"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ConfusionMatrix",
  sourcePath: "statistical/ConfusionMatrix",
  aspect: 1.18,
  controls: [
    {
      key: "matrix",
      label: "Matrix",
      type: "matrix",
      group: "Data",
      default: [
        [142, 6, 3, 1],
        [5, 128, 9, 2],
        [4, 7, 137, 6],
        [2, 3, 8, 131],
      ],
    },
    {
      key: "labels",
      label: "Class labels",
      type: "json",
      group: "Data",
      default: ["Reach", "Grasp", "Lift", "Place"],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xAxisLabel", label: "X-axis label", type: "text", group: "Labels", default: "Predicted" },
    { key: "yAxisLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Actual" },
    { key: "normalize", label: "Normalize (row %)", type: "boolean", group: "Style", default: false },
    { key: "showValues", label: "Show cell values", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Heat color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 900, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "manipulation",
      name: "Manipulation policy",
      props: {
        title: "Skill classifier confusion (n=608)",
        caption: "Row-normalized recall on a 4-skill manipulation benchmark.",
        xAxisLabel: "Predicted",
        yAxisLabel: "Actual",
        matrix: [
          [142, 6, 3, 1],
          [5, 128, 9, 2],
          [4, 7, 137, 6],
          [2, 3, 8, 131],
        ],
        labels: ["Reach", "Grasp", "Lift", "Place"],
      },
    },
    {
      id: "normalized",
      name: "Normalized intents",
      props: {
        normalize: true,
        title: "Intent classifier (row-normalized)",
        source: "val split",
        xAxisLabel: "Predicted intent",
        yAxisLabel: "True intent",
        matrix: [
          [488, 7, 3, 1, 1],
          [9, 421, 14, 4, 2],
          [3, 11, 467, 12, 7],
          [1, 5, 9, 503, 6],
          [2, 3, 8, 5, 472],
        ],
        labels: ["Search", "Compare", "Book", "Cancel", "Support"],
      },
    },
    {
      id: "binary",
      name: "Binary detector",
      props: {
        title: "Anomaly detector",
        caption: "Tuned for high recall on the positive class.",
        xAxisLabel: "Predicted",
        yAxisLabel: "Actual",
        matrix: [
          [904, 18],
          [12, 166],
        ],
        labels: ["Normal", "Anomaly"],
      },
    },
  ],
};
