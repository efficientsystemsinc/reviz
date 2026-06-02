"use client";

import { ascending, max, min, quantile as d3quantile } from "d3-array";
import { scaleLinear } from "d3-scale";
import { curveStepAfter, line as d3line } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  formatCompact,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface Sample {
  name: string;
  values: number[];
  color?: string;
}

// Two inference-latency distributions (ms) for the same model on different
// serving stacks — the eternal "compare the tails" comparison. A vLLM-style
// continuous-batching stack vs. a naive per-request stack: similar medians,
// very different p90/p99 behaviour, which an ECDF reveals at a glance.
const VLLM_LATENCY = [
  38, 41, 42, 44, 45, 45, 46, 47, 48, 48, 49, 50, 51, 52, 52, 53, 54, 55, 56,
  57, 58, 59, 61, 63, 66, 71, 78, 88, 104, 131,
];
const NAIVE_LATENCY = [
  44, 49, 53, 57, 61, 64, 68, 71, 74, 78, 82, 86, 90, 95, 101, 108, 116, 126,
  138, 153, 171, 193, 220, 252, 291, 339, 398, 471, 562, 690,
];

const DEFAULT_SAMPLES: Sample[] = [
  { name: "vLLM (cont. batching)", values: VLLM_LATENCY },
  { name: "Naive per-request", values: NAIVE_LATENCY },
];

const DEFAULT_MARKERS = [0.5, 0.9];

export interface ECDFPlotProps {
  samples?: Sample[];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  markers?: number[];
  color?: string;
  duration?: number;
}

/** Sorted ascending, finite-only copy of a sample's raw values. */
function sortedFinite(values: number[]): number[] {
  return values.filter((v) => Number.isFinite(v)).slice().sort(ascending);
}

/** F̂(x) for sorted data via binary search — fraction of points ≤ x. */
function ecdfAt(sorted: number[], x: number): number {
  if (sorted.length === 0) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

export default function ECDFPlot({
  samples = DEFAULT_SAMPLES,
  title = "Inference latency — empirical CDF",
  caption = "",
  source = "",
  xLabel = "Latency (ms)",
  markers = DEFAULT_MARKERS,
  color = "",
  duration = 1200,
}: ECDFPlotProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  // `px` is the pixel x within the plot area; `xv` is the data value there.
  const [hover, setHover] = useState<{ px: number; xv: number } | null>(null);
  const gid = useMemo(() => uid("ecdf"), []);

  const colorOf = (i: number) =>
    i === 0 && color ? color : samples[i]?.color || p.series[i % p.series.length];

  // Pre-sort every sample once; this is the staircase domain.
  const prepared = useMemo(
    () =>
      samples.map((s) => {
        const sorted = sortedFinite(s.values);
        // Step vertices: each observation lifts F̂ by 1/n. Prepend the floor
        // point at the minimum so the curve starts on the baseline.
        const n = sorted.length;
        const pts: { x: number; y: number }[] = [];
        if (n > 0) {
          pts.push({ x: sorted[0], y: 0 });
          sorted.forEach((v, k) => pts.push({ x: v, y: (k + 1) / n }));
        }
        return { name: s.name, sorted, n, pts };
      }),
    [samples],
  );

  const xDomain = useMemo(() => {
    const all = prepared.flatMap((s) => s.sorted);
    if (all.length === 0) return [0, 1] as [number, number];
    const lo = min(all) ?? 0;
    const hi = max(all) ?? 1;
    const pad = (hi - lo) * 0.02 || 1;
    return [lo - pad, hi + pad] as [number, number];
  }, [prepared]);

  // Clean percentile markers: clamp to (0,1), sorted, de-duped.
  const cleanMarkers = useMemo(
    () =>
      Array.from(new Set(markers.filter((m) => Number.isFinite(m) && m > 0 && m < 1)))
        .sort(ascending),
    [markers],
  );

  const legendItems: LegendItem[] = prepared.map((s, i) => ({
    label: s.name,
    color: colorOf(i),
    shape: "line",
  }));

  const draw = reduced ? 1 : inView ? 1 : 0;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative group/figure">
        {prepared.length > 1 && <Legend items={legendItems} align="center" className="mb-3" />}

        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 14, right: 18, bottom: 34, left: 52 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]).nice();
            const y = scaleLinear().domain([0, 1]).range([inner.height, 0]);

            const lineGen = d3line<{ x: number; y: number }>()
              .x((d) => x(d.x))
              .y((d) => y(d.y))
              .curve(curveStepAfter);

            const drawDur = (duration / 1000) * 0.78;

            const hoverXv = hover?.xv ?? null;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <GridLines scale={y as never} width={inner.width} count={5} />

                {/* Percentile reference lines (e.g. p50, p90) across the plot. */}
                {cleanMarkers.map((m) => (
                  <g key={`${gid}-m-${m}`} aria-hidden>
                    <line
                      x1={0}
                      x2={inner.width}
                      y1={y(m)}
                      y2={y(m)}
                      stroke={withAlpha(p.inkMuted, 0.5)}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      shapeRendering="crispEdges"
                    />
                    <text
                      x={inner.width}
                      y={y(m) - 4}
                      textAnchor="end"
                      fill={p.inkMuted}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9.5,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {`p${Math.round(m * 100)}`}
                    </text>
                  </g>
                ))}

                {/* Per-sample percentile crossings: a dot where F̂ hits the marker. */}
                {prepared.map((s, i) =>
                  s.n > 0
                    ? cleanMarkers.map((m) => {
                        const xv = d3quantile(s.sorted, m);
                        if (xv == null) return null;
                        return (
                          <motion.g
                            key={`${gid}-q-${i}-${m}-${token}`}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: draw ? 1 : 0, scale: draw ? 1 : 0 }}
                            transition={{
                              duration: reduced ? 0 : 0.32,
                              delay: reduced ? 0 : drawDur * m + i * 0.1,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                          >
                            <line
                              x1={x(xv)}
                              x2={x(xv)}
                              y1={y(m)}
                              y2={inner.height}
                              stroke={withAlpha(colorOf(i), 0.4)}
                              strokeWidth={1}
                              strokeDasharray="2 3"
                            />
                            <circle
                              cx={x(xv)}
                              cy={y(m)}
                              r={5.5}
                              fill={withAlpha(colorOf(i), 0.18)}
                            />
                            <circle
                              cx={x(xv)}
                              cy={y(m)}
                              r={3.2}
                              fill={colorOf(i)}
                              stroke={p.surface}
                              strokeWidth={1.5}
                            />
                          </motion.g>
                        );
                      })
                    : null,
                )}

                {/* The staircase ECDF curves: left→right draw via pathLength. */}
                {prepared.map((s, i) => {
                  const d = lineGen(s.pts);
                  if (!d) return null;
                  return (
                    <motion.path
                      key={`${gid}-curve-${i}-${token}`}
                      d={d}
                      fill="none"
                      stroke={colorOf(i)}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: draw, opacity: draw ? 1 : 0 }}
                      transition={{
                        pathLength: {
                          duration: reduced ? 0 : drawDur,
                          delay: reduced ? 0 : i * 0.1,
                          ease: [0.4, 0, 0.2, 1],
                        },
                        opacity: { duration: reduced ? 0 : 0.2, delay: reduced ? 0 : i * 0.1 },
                      }}
                    />
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label="F̂(x)"
                  format={(v) => v.toFixed(1)}
                />
                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={(v) => formatCompact(v)}
                  linearCount={7}
                />
                {xLabel && (
                  <text
                    x={inner.width / 2}
                    y={inner.height + 30}
                    textAnchor="middle"
                    fill={p.inkMuted}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    {xLabel}
                  </text>
                )}

                {/* Hover crosshair + per-sample F̂ readout dots. */}
                <AnimatePresence>
                  {hoverXv != null && (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <line
                        x1={x(hoverXv)}
                        x2={x(hoverXv)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.borderStrong}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        shapeRendering="crispEdges"
                      />
                      {prepared.map((s, i) => {
                        if (s.n === 0) return null;
                        const f = ecdfAt(s.sorted, hoverXv);
                        return (
                          <g key={`${gid}-hov-${i}`}>
                            <circle cx={x(hoverXv)} cy={y(f)} r={6} fill={withAlpha(colorOf(i), 0.18)} />
                            <circle
                              cx={x(hoverXv)}
                              cy={y(f)}
                              r={3.5}
                              fill={colorOf(i)}
                              stroke={p.surface}
                              strokeWidth={1.5}
                            />
                          </g>
                        );
                      })}
                    </motion.g>
                  )}
                </AnimatePresence>

                {/* Transparent capture overlay for hover tracking. */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const r = svg.getBoundingClientRect();
                    const px = e.clientX - r.left - margin.left;
                    const clamped = Math.max(0, Math.min(inner.width, px));
                    setHover({ px: clamped, xv: x.invert(clamped) });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip
          x={(hover?.px ?? 0) + 52}
          y={28}
          visible={hover != null}
        >
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {xLabel || "x"} = {formatCompact(hover.xv)}
              </div>
              {prepared.map((s, i) =>
                s.n > 0 ? (
                  <div key={s.name} className="flex items-baseline justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                      <span
                        className="inline-block h-[2px] w-3 rounded-full align-middle"
                        style={{ background: colorOf(i) }}
                      />
                      {s.name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {(ecdfAt(s.sorted, hover.xv) * 100).toFixed(0)}%
                    </span>
                  </div>
                ) : null,
              )}
            </>
          )}
        </FloatingTooltip>

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
    </Figure>
  );
}

// A single-sample accuracy distribution across random seeds — handy for the
// "single-distribution ECDF" preset.
const SEED_ACCURACY = [
  0.812, 0.819, 0.823, 0.827, 0.829, 0.831, 0.834, 0.836, 0.838, 0.84, 0.841,
  0.843, 0.844, 0.846, 0.848, 0.85, 0.852, 0.855, 0.858, 0.863,
];

// Reward-shaping ablation: three reward variants' episode returns.
const REWARD_DENSE = [
  0.41, 0.48, 0.52, 0.55, 0.58, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74,
  0.76, 0.79, 0.82, 0.85, 0.88, 0.91, 0.95,
];
const REWARD_SPARSE = [
  0.08, 0.12, 0.18, 0.24, 0.31, 0.38, 0.44, 0.5, 0.55, 0.6, 0.64, 0.68, 0.72,
  0.76, 0.8, 0.84, 0.88, 0.91, 0.94, 0.97,
];

export const meta: RevizMeta = {
  id: "ecdf-plot",
  name: "ECDF Plot",
  category: "statistical",
  description:
    "An empirical cumulative distribution function (step) for one or more samples — F̂(x) climbs from 0 to 1 — with optional percentile markers (p50/p90) that reveal where distributions cross and how their tails diverge.",
  tags: ["ecdf", "cdf", "distribution", "percentile", "quantile", "latency", "step"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ECDFPlot",
  sourcePath: "statistical/ECDFPlot",
  aspect: 16 / 10,
  controls: [
    {
      key: "samples",
      label: "Samples",
      type: "json",
      group: "Data",
      default: DEFAULT_SAMPLES,
    },
    {
      key: "markers",
      label: "Percentile markers",
      type: "json",
      group: "Data",
      default: DEFAULT_MARKERS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Inference latency — empirical CDF" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Latency (ms)" },
    { key: "color", label: "First sample color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1200, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "latency-compare",
      name: "Latency compare",
      props: {
        title: "Inference latency — empirical CDF",
        xLabel: "Latency (ms)",
        markers: [0.5, 0.9, 0.99],
        samples: DEFAULT_SAMPLES,
        caption:
          "Two serving stacks with near-identical medians; the ECDF exposes how much heavier the naive stack's tail is past p90.",
      },
    },
    {
      id: "seed-accuracy",
      name: "Seed accuracy",
      props: {
        title: "Validation accuracy across seeds",
        xLabel: "Accuracy",
        markers: [0.5],
        samples: [{ name: "Run accuracy", values: SEED_ACCURACY }],
        caption: "Empirical distribution of final accuracy over 20 random seeds.",
      },
    },
    {
      id: "reward-ablation",
      name: "Reward ablation",
      props: {
        title: "Episode return by reward shaping",
        xLabel: "Episode return",
        markers: [0.25, 0.5, 0.75],
        samples: [
          { name: "Dense reward", values: REWARD_DENSE },
          { name: "Sparse reward", values: REWARD_SPARSE },
        ],
      },
    },
  ],
};
