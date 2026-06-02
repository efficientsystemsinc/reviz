"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  Figure,
  FloatingTooltip,
  ResponsiveSvg,
  SoftShadow,
  uid,
  usePalette,
  usePrefersReducedMotion,
  useInView,
  useReplay,
  withAlpha,
  mix,
  type RevizMeta,
} from "@/reviz";

interface ForestStudy {
  /** Study / cohort label shown on the left gutter. */
  label: string;
  /** Point estimate (effect size, log-OR, mean diff, …). */
  estimate: number;
  /** Lower confidence bound. */
  lo: number;
  /** Upper confidence bound. */
  hi: number;
  /** Relative weight in the pooled estimate (drives marker size). */
  weight?: number;
  /** Optional sub-label (n, year, …) shown under the study name. */
  meta?: string;
}

export interface ForestPlotProps {
  rows?: ForestStudy[];
  nullLine?: number;
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  summaryLabel?: string;
  showSummary?: boolean;
  showGrid?: boolean;
  color?: string;
  duration?: number;
}

const DEFAULT_ROWS: ForestStudy[] = [
  { label: "RLHF-v1", meta: "n=4,200", estimate: 0.42, lo: 0.21, hi: 0.63, weight: 18 },
  { label: "DPO ablation", meta: "n=2,100", estimate: 0.31, lo: 0.05, hi: 0.57, weight: 11 },
  { label: "Constitutional AI", meta: "n=6,800", estimate: 0.55, lo: 0.38, hi: 0.72, weight: 24 },
  { label: "RLAIF", meta: "n=3,400", estimate: 0.28, lo: 0.02, hi: 0.54, weight: 14 },
  { label: "Process reward", meta: "n=1,500", estimate: 0.18, lo: -0.14, hi: 0.5, weight: 8 },
  { label: "Self-play distill", meta: "n=5,100", estimate: 0.47, lo: 0.27, hi: 0.67, weight: 20 },
  { label: "Heuristic baseline", meta: "n=900", estimate: -0.05, lo: -0.41, hi: 0.31, weight: 5 },
];

/** Inverse-variance style pooled estimate from per-row weights. */
function pool(rows: ForestStudy[]): { estimate: number; lo: number; hi: number } {
  const wts = rows.map((r) => r.weight ?? 1);
  const total = wts.reduce((a, b) => a + b, 0) || 1;
  const est = rows.reduce((a, r, i) => a + r.estimate * wts[i], 0) / total;
  // Half-width shrinks with sqrt of total weight (pooling tightens the interval).
  const meanHalf =
    rows.reduce((a, r, i) => a + ((r.hi - r.lo) / 2) * wts[i], 0) / total;
  const half = meanHalf / Math.sqrt(total / (wts[0] || 1));
  return { estimate: est, lo: est - half, hi: est + half };
}

export default function ForestPlot({
  rows = DEFAULT_ROWS,
  nullLine = 0,
  title = "Effect of preference optimization on helpfulness",
  caption = "",
  source = "",
  xLabel = "Standardized effect size (95% CI)",
  summaryLabel = "Pooled estimate",
  showSummary = true,
  showGrid = true,
  color = "",
  duration = 1000,
}: ForestPlotProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const shadowId = useMemo(() => uid("forest-shadow"), []);
  const summary = useMemo(() => pool(rows), [rows]);

  const { domainLo, domainHi, maxWeight } = useMemo(() => {
    const vals = rows.flatMap((r) => [r.lo, r.hi, r.estimate]);
    vals.push(nullLine);
    if (showSummary) vals.push(summary.lo, summary.hi);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || 0.1;
    return {
      domainLo: lo - pad,
      domainHi: hi + pad,
      maxWeight: Math.max(1, ...rows.map((r) => r.weight ?? 1)),
    };
  }, [rows, nullLine, showSummary, summary]);

  const play = inView && !reduced;
  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

  // Row geometry: fixed row height keeps spacing tight regardless of count.
  const rowH = 30;
  const summaryRows = showSummary ? 1.4 : 0;
  const plotH = (rows.length + summaryRows) * rowH;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          height={plotH + 78}
          minHeight={plotH + 78}
          margin={{ top: 18, right: 60, bottom: 48, left: 168 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain([domainLo, domainHi]).range([0, inner.width]).nice();
            const baseY = inner.height;
            const nullX = x(nullLine);
            const rowOf = (i: number) => i * rowH + rowH / 2;
            const summaryY = rows.length * rowH + rowH * 0.7;

            // Marker radius from weight (area-proportional feel).
            const rOf = (w: number) => 3.5 + 5.5 * Math.sqrt((w || 1) / maxWeight);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={2} blur={5} opacity={0.18} />
                </defs>

                {/* Vertical tick guides (x-axis gridlines). */}
                {showGrid &&
                  x.ticks(6).map((t, i) => (
                    <line
                      key={i}
                      x1={x(t)}
                      x2={x(t)}
                      y1={0}
                      y2={baseY}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      shapeRendering="crispEdges"
                    />
                  ))}

                {/* The null reference line */}
                <motion.line
                  x1={nullX}
                  x2={nullX}
                  y1={0}
                  y2={baseY}
                  stroke={p.borderStrong}
                  strokeWidth={1.5}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                />
                <motion.text
                  x={nullX}
                  y={-6}
                  textAnchor="middle"
                  fill={p.inkFaint}
                  className="font-mono text-[9.5px] uppercase"
                  style={{ letterSpacing: "0.1em" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  null {fmt(nullLine)}
                </motion.text>

                {rows.map((d, i) => {
                  const cy = rowOf(i);
                  const cx = x(d.estimate);
                  const xlo = x(d.lo);
                  const xhi = x(d.hi);
                  const r = rOf(d.weight ?? 1);
                  const active = hover?.i === i;
                  const crossesNull = d.lo <= nullLine && d.hi >= nullLine;
                  // Significant rows (CI excludes null) take the accent; others read neutral.
                  const rowColor = crossesNull ? p.inkMuted : fill;
                  const delay = play ? i * 0.09 : 0;

                  return (
                    <g key={`${d.label}-${i}`}>
                      {/* Hover hit row */}
                      <rect
                        x={-margin.left}
                        y={cy - rowH / 2}
                        width={inner.width + margin.left + margin.right}
                        height={rowH}
                        fill={active ? withAlpha(p.ink, 0.04) : "transparent"}
                        onMouseMove={(e) => {
                          const r2 = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ i, x: e.clientX - r2.left, y: e.clientY - r2.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      />

                      {/* Study label gutter */}
                      <text
                        x={-margin.left + 4}
                        y={cy}
                        dy={d.meta ? "-0.05em" : "0.32em"}
                        textAnchor="start"
                        fill={active ? p.ink : p.inkMuted}
                        className="font-mono text-[11px]"
                        pointerEvents="none"
                      >
                        {d.label}
                      </text>
                      {d.meta && (
                        <text
                          x={-margin.left + 4}
                          y={cy + 11}
                          textAnchor="start"
                          fill={p.inkFaint}
                          className="font-mono text-[9px] uppercase"
                          style={{ letterSpacing: "0.08em" }}
                          pointerEvents="none"
                        >
                          {d.meta}
                        </text>
                      )}

                      {/* CI whisker */}
                      <motion.g
                        stroke={rowColor}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        pointerEvents="none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                        transition={{ duration: 0.3, delay: delay + 0.15 }}
                        key={`ci-${token}-${i}`}
                      >
                        <motion.line
                          x1={nullX}
                          x2={nullX}
                          y1={cy}
                          y2={cy}
                          initial={{ x1: nullX, x2: nullX }}
                          animate={{ x1: play ? xlo : reduced ? xlo : nullX, x2: play ? xhi : reduced ? xhi : nullX }}
                          transition={{ duration: duration / 1000, delay, ease: [0.22, 1, 0.36, 1] }}
                        />
                        <line x1={xlo} x2={xlo} y1={cy - 4} y2={cy + 4} />
                        <line x1={xhi} x2={xhi} y1={cy - 4} y2={cy + 4} />
                      </motion.g>

                      {/* Point estimate marker (size = weight) */}
                      <motion.rect
                        x={cx - r}
                        y={cy - r}
                        width={r * 2}
                        height={r * 2}
                        rx={1.5}
                        transform={`rotate(45, ${cx}, ${cy})`}
                        fill={rowColor}
                        filter={active ? `url(#${shadowId})` : undefined}
                        pointerEvents="none"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{
                          scale: play ? 1 : reduced ? 1 : 0,
                          opacity: play ? 1 : reduced ? 1 : 0,
                        }}
                        transition={{
                          duration: 0.4,
                          delay: delay + 0.2,
                          ease: [0.34, 1.56, 0.64, 1],
                        }}
                        style={{ transformOrigin: `${cx}px ${cy}px` }}
                        key={`pt-${token}-${i}`}
                      />
                    </g>
                  );
                })}

                {/* Pooled summary diamond */}
                {showSummary && (
                  <g>
                    <motion.line
                      x1={0}
                      x2={inner.width}
                      y1={rows.length * rowH + 2}
                      y2={rows.length * rowH + 2}
                      stroke={p.border}
                      strokeWidth={1}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                      transition={{ duration: 0.3, delay: play ? rows.length * 0.09 : 0 }}
                    />
                    <text
                      x={-margin.left + 4}
                      y={summaryY}
                      dy="0.32em"
                      textAnchor="start"
                      fill={p.ink}
                      className="font-mono text-[11px] font-semibold uppercase"
                      style={{ letterSpacing: "0.04em" }}
                      pointerEvents="none"
                    >
                      {summaryLabel}
                    </text>
                    {(() => {
                      const dl = x(summary.lo);
                      const dr = x(summary.hi);
                      const dc = x(summary.estimate);
                      const half = 7;
                      const sumDelay = play ? rows.length * 0.09 + 0.2 : 0;
                      return (
                        <motion.path
                          d={`M ${dl} ${summaryY} L ${dc} ${summaryY - half} L ${dr} ${summaryY} L ${dc} ${summaryY + half} Z`}
                          fill={fill}
                          stroke={mix(fill, p.ink, 0.25)}
                          strokeWidth={1}
                          filter={`url(#${shadowId})`}
                          pointerEvents="none"
                          initial={{ opacity: 0, scaleX: 0 }}
                          animate={{ opacity: play ? 1 : reduced ? 1 : 0, scaleX: play ? 1 : reduced ? 1 : 0 }}
                          transition={{ duration: 0.5, delay: sumDelay, ease: [0.22, 1, 0.36, 1] }}
                          style={{ transformOrigin: `${dc}px ${summaryY}px` }}
                        />
                      );
                    })()}
                    <motion.text
                      x={x(summary.hi) + 10}
                      y={summaryY}
                      dy="0.32em"
                      textAnchor="start"
                      fill={p.ink}
                      className="font-mono text-[10px] tabular-nums"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                      transition={{ duration: 0.3, delay: play ? rows.length * 0.09 + 0.5 : 0 }}
                    >
                      {fmt(summary.estimate)}
                    </motion.text>
                  </g>
                )}

                {/* Estimate values in the right gutter for each row */}
                {rows.map((d, i) => {
                  const cy = rowOf(i);
                  const active = hover?.i === i;
                  return (
                    <motion.text
                      key={`rv-${token}-${i}`}
                      x={inner.width + 10}
                      y={cy}
                      dy="0.32em"
                      textAnchor="start"
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono text-[9.5px] tabular-nums"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                      transition={{ duration: 0.3, delay: play ? i * 0.09 + duration / 1000 * 0.6 : 0 }}
                      pointerEvents="none"
                    >
                      {fmt(d.estimate)}
                    </motion.text>
                  );
                })}

                {/* X axis */}
                <line x1={0} x2={inner.width} y1={baseY} y2={baseY} stroke={p.borderStrong} strokeWidth={1} shapeRendering="crispEdges" />
                <AxisBottom scale={x as never} y={baseY} linearFormat={(v) => fmt(v)} linearCount={6} />
                <text
                  x={inner.width / 2}
                  y={baseY + 40}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  className="font-mono text-[10px] uppercase"
                  style={{ letterSpacing: "0.14em" }}
                >
                  {xLabel}
                </text>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null} align="center">
          {hover != null && (
            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                {rows[hover.i].label}
                {rows[hover.i].meta ? ` · ${rows[hover.i].meta}` : ""}
              </div>
              <div className="font-semibold tabular-nums">
                {fmt(rows[hover.i].estimate)}
                <span className="font-normal opacity-70">
                  {" "}
                  [{fmt(rows[hover.i].lo)}, {fmt(rows[hover.i].hi)}]
                </span>
              </div>
              {rows[hover.i].weight != null && (
                <div className="font-mono text-[10px] tabular-nums opacity-70">
                  weight {rows[hover.i].weight}%
                </div>
              )}
            </div>
          )}
        </FloatingTooltip>

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
        >
          replay
        </button>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "forest-plot",
  name: "Forest Plot",
  category: "statistical",
  description:
    "Meta-analysis forest plot: per-study point estimates with 95% CI whiskers, weight-sized markers, a null reference line, and a pooled summary diamond.",
  tags: ["forest", "meta-analysis", "confidence-interval", "effect-size", "statistics"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ForestPlot",
  sourcePath: "statistical/ForestPlot",
  aspect: 16 / 10,
  controls: [
    {
      key: "rows",
      label: "Studies",
      type: "json",
      group: "Data",
      help: "Array of { label, estimate, lo, hi, weight?, meta? }.",
      default: DEFAULT_ROWS,
    },
    {
      key: "nullLine",
      label: "Null line",
      type: "number",
      group: "Layout",
      help: "Reference value of no effect (0 for differences, 1 for ratios).",
      default: 0,
      min: -2,
      max: 2,
      step: 0.1,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Effect of preference optimization on helpfulness" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Standardized effect size (95% CI)" },
    { key: "summaryLabel", label: "Summary label", type: "text", group: "Labels", default: "Pooled estimate" },
    { key: "showSummary", label: "Show summary diamond", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1000, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "rlhf",
      name: "RLHF effect sizes",
      props: {
        title: "Effect of preference optimization on helpfulness",
        xLabel: "Standardized effect size (95% CI)",
        nullLine: 0,
        summaryLabel: "Pooled estimate",
      },
    },
    {
      id: "odds-ratio",
      name: "Failure odds ratio",
      props: {
        title: "Hallucination odds ratio vs. retrieval-augmented baseline",
        xLabel: "Odds ratio (95% CI, log scale)",
        nullLine: 1,
        summaryLabel: "Random-effects pooled OR",
        rows: [
          { label: "Eval-A", meta: "n=1,319", estimate: 0.62, lo: 0.41, hi: 0.94, weight: 22 },
          { label: "Eval-B", meta: "n=817", estimate: 0.74, lo: 0.52, hi: 1.05, weight: 16 },
          { label: "Eval-C", meta: "n=1,400", estimate: 0.55, lo: 0.38, hi: 0.8, weight: 24 },
          { label: "Eval-D", meta: "n=500", estimate: 0.88, lo: 0.55, hi: 1.42, weight: 9 },
          { label: "Eval-E", meta: "n=1,100", estimate: 0.69, lo: 0.47, hi: 1.01, weight: 19 },
          { label: "Eval-F", meta: "n=600", estimate: 0.95, lo: 0.61, hi: 1.48, weight: 10 },
        ],
      },
    },
    {
      id: "speedup",
      name: "Inference speedup",
      props: {
        title: "Latency reduction from speculative decoding",
        xLabel: "Mean latency Δ (ms, 95% CI)",
        nullLine: 0,
        summaryLabel: "Fixed-effect pooled Δ",
        color: "",
        rows: [
          { label: "7B chat", meta: "GPU-A", estimate: -42, lo: -58, hi: -26, weight: 20 },
          { label: "13B code", meta: "GPU-A", estimate: -61, lo: -82, hi: -40, weight: 18 },
          { label: "34B reason", meta: "GPU-B", estimate: -88, lo: -120, hi: -56, weight: 14 },
          { label: "70B chat", meta: "GPU-B", estimate: -71, lo: -99, hi: -43, weight: 16 },
          { label: "MoE 8x7B", meta: "GPU-B", estimate: -34, lo: -70, hi: 2, weight: 12 },
        ],
      },
    },
  ],
};
