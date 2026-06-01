"use client";

import { extent, max as d3max, min as d3min } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import { area as d3area, line as d3line, curveMonotoneX } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
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
  VerticalFade,
  formatCompact,
  usePalette,
  usePrefersReducedMotion,
  useInView,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface RunPoint {
  step: number;
  value: number;
}

interface Run {
  name: string;
  points: RunPoint[];
  color?: string;
}

export interface TrainingCurveProps {
  runs?: Run[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  xLabel?: string;
  smooth?: number;
  logY?: boolean;
  showBand?: boolean;
  showRaw?: boolean;
  duration?: number;
  color?: string;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_RUNS: Run[] = [
  {
    name: "train loss",
    points: [
      { step: 0, value: 4.62 },
      { step: 500, value: 3.41 },
      { step: 1000, value: 2.74 },
      { step: 1500, value: 2.39 },
      { step: 2000, value: 2.05 },
      { step: 2500, value: 1.88 },
      { step: 3000, value: 1.66 },
      { step: 3500, value: 1.57 },
      { step: 4000, value: 1.41 },
      { step: 4500, value: 1.34 },
      { step: 5000, value: 1.22 },
      { step: 5500, value: 1.18 },
      { step: 6000, value: 1.09 },
      { step: 6500, value: 1.04 },
      { step: 7000, value: 0.98 },
      { step: 7500, value: 0.94 },
      { step: 8000, value: 0.89 },
    ],
  },
  {
    name: "val loss",
    points: [
      { step: 0, value: 4.58 },
      { step: 500, value: 3.52 },
      { step: 1000, value: 2.91 },
      { step: 1500, value: 2.61 },
      { step: 2000, value: 2.34 },
      { step: 2500, value: 2.18 },
      { step: 3000, value: 2.02 },
      { step: 3500, value: 1.97 },
      { step: 4000, value: 1.86 },
      { step: 4500, value: 1.83 },
      { step: 5000, value: 1.76 },
      { step: 5500, value: 1.78 },
      { step: 6000, value: 1.72 },
      { step: 6500, value: 1.74 },
      { step: 7000, value: 1.71 },
      { step: 7500, value: 1.73 },
      { step: 8000, value: 1.7 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Math helpers                                                        */
/* ------------------------------------------------------------------ */

/** Exponential moving average. `smooth` in [0,1) — 0 = raw, →1 = heavy. */
function ema(values: number[], smooth: number): number[] {
  if (smooth <= 0 || values.length === 0) return values.slice();
  const a = 1 - smooth; // weight on the new sample
  const out: number[] = [];
  let acc = values[0];
  for (let i = 0; i < values.length; i++) {
    acc = i === 0 ? values[i] : acc * smooth + values[i] * a;
    out.push(acc);
  }
  return out;
}

/** Rolling local std around the smoothed value, used for the ±band. */
function rollingStd(raw: number[], smoothed: number[], window: number): number[] {
  const half = Math.max(1, Math.floor(window / 2));
  return raw.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(raw.length - 1, i + half); j++) {
      const d = raw[j] - smoothed[j];
      sum += d * d;
      n++;
    }
    return n > 0 ? Math.sqrt(sum / n) : 0;
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function TrainingCurve({
  runs = DEFAULT_RUNS,
  title = "Training & validation loss",
  caption = "",
  source = "",
  yLabel = "Loss",
  xLabel = "Step",
  smooth = 0.6,
  logY = false,
  showBand = true,
  showRaw = true,
  duration = 1100,
  color = "",
}: TrainingCurveProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const baseId = useId().replace(/:/g, "");
  const [hoverX, setHoverX] = useState<{ step: number; px: number; py: number } | null>(null);

  // Per-run resolved color + derived smoothed / band series.
  const series = useMemo(() => {
    const safeRuns = (runs ?? []).filter((r) => r && Array.isArray(r.points) && r.points.length > 0);
    return safeRuns.map((run, i) => {
      const pts = [...run.points].sort((a, b) => a.step - b.step);
      const rawVals = pts.map((d) => d.value);
      const smoothVals = ema(rawVals, smooth);
      const std = rollingStd(rawVals, smoothVals, 5);
      const c = run.color || (i === 0 && color ? color : p.series[i % p.series.length]);
      return {
        name: run.name ?? `run ${i + 1}`,
        color: c,
        steps: pts.map((d) => d.step),
        raw: pts.map((d, k) => ({ step: d.step, value: rawVals[k] })),
        smooth: pts.map((d, k) => ({ step: d.step, value: smoothVals[k] })),
        band: pts.map((d, k) => ({
          step: d.step,
          lo: smoothVals[k] - std[k],
          hi: smoothVals[k] + std[k],
        })),
      };
    });
  }, [runs, smooth, color, p.series]);

  // Domains across all runs.
  const { xDomain, yDomain } = useMemo(() => {
    const allSteps: number[] = [];
    const allValues: number[] = [];
    for (const s of series) {
      for (const d of s.smooth) {
        allSteps.push(d.step);
        allValues.push(d.value);
      }
      if (showRaw) for (const d of s.raw) allValues.push(d.value);
      if (showBand) for (const d of s.band) allValues.push(d.lo, d.hi);
    }
    const xExt = extent(allSteps) as [number, number];
    let lo = d3min(allValues) ?? 0;
    let hi = d3max(allValues) ?? 1;
    if (logY) lo = Math.max(lo, Math.min(...allValues.filter((v) => v > 0), hi || 1) * 0.85);
    else {
      const pad = (hi - lo) * 0.08 || 1;
      lo = lo - pad;
      hi = hi + pad;
      if (lo < 0 && (d3min(allValues) ?? 0) >= 0) lo = 0;
    }
    return {
      xDomain: (xExt[0] === undefined ? [0, 1] : xExt) as [number, number],
      yDomain: [lo, hi] as [number, number],
    };
  }, [series, showRaw, showBand, logY]);

  const legendItems: LegendItem[] = series.map((s) => ({
    label: s.name,
    color: s.color,
    shape: "line",
  }));

  const drawSpan = reduced ? 0 : Math.max(0.3, duration / 1000);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        {legendItems.length > 1 && <Legend items={legendItems} align="center" className="mb-3" />}

        <ResponsiveSvg
          aspect={16 / 9}
          margin={{ top: 14, right: 18, bottom: 42, left: yLabel ? 56 : 46 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]);
            const yLin = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();
            const yLogScale = scaleLog()
              .domain([Math.max(1e-6, yDomain[0]), yDomain[1]])
              .range([inner.height, 0]);
            // Active value scale — both linear and log expose ()(v), .ticks(), .domain().
            const yScale = logY ? yLogScale : yLin;
            const y = yScale as (v: number) => number;

            const lineGen = d3line<{ step: number; value: number }>()
              .x((d) => x(d.step))
              .y((d) => y(d.value))
              .curve(curveMonotoneX);

            const bandGen = d3area<{ step: number; lo: number; hi: number }>()
              .x((d) => x(d.step))
              .y0((d) => y(Math.max(logY ? 1e-6 : -Infinity, d.lo)))
              .y1((d) => y(d.hi))
              .curve(curveMonotoneX);

            // Hover: nearest step across the union of run steps.
            const allSteps = Array.from(new Set(series.flatMap((s) => s.steps))).sort((a, b) => a - b);
            const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
              const r = e.currentTarget.getBoundingClientRect();
              const localX = e.clientX - r.left;
              const stepVal = x.invert(localX);
              let nearest = allSteps[0];
              let best = Infinity;
              for (const s of allSteps) {
                const d = Math.abs(s - stepVal);
                if (d < best) {
                  best = d;
                  nearest = s;
                }
              }
              const svgRect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setHoverX({
                step: nearest,
                px: margin.left + x(nearest),
                py: e.clientY - svgRect.top,
              });
            };

            const hoverRows =
              hoverX != null
                ? series
                    .map((s) => {
                      const pt = s.smooth.find((d) => d.step === hoverX.step);
                      return pt ? { name: s.name, color: s.color, value: pt.value } : null;
                    })
                    .filter((v): v is { name: string; color: string; value: number } => v != null)
                : [];

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {series.map((s, i) => (
                    <VerticalFade key={i} id={`${baseId}-fade-${i}`} color={s.color} from={0.16} to={0.02} />
                  ))}
                </defs>

                <GridLines scale={yScale as never} width={inner.width} count={5} />

                {/* ± std bands (drawn behind lines) */}
                {showBand &&
                  series.map((s, i) => (
                    <motion.path
                      key={`band-${s.name}-${token}`}
                      d={bandGen(s.band) ?? undefined}
                      fill={`url(#${baseId}-fade-${i})`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: inView ? 1 : 0 }}
                      transition={{ duration: drawSpan * 0.6, delay: drawSpan * 0.4 + i * 0.08 }}
                    />
                  ))}

                {/* faint raw traces */}
                {showRaw &&
                  series.map((s, i) => (
                    <motion.path
                      key={`raw-${s.name}-${token}`}
                      d={lineGen(s.raw) ?? undefined}
                      fill="none"
                      stroke={withAlpha(s.color, 0.32)}
                      strokeWidth={1}
                      strokeLinejoin="round"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: inView ? 1 : 0 }}
                      transition={{ duration: drawSpan * 0.5, delay: drawSpan * 0.5 + i * 0.08 }}
                    />
                  ))}

                {/* bold smoothed traces (draw-in via pathLength) */}
                {series.map((s, i) => (
                  <motion.path
                    key={`smooth-${s.name}-${token}`}
                    d={lineGen(s.smooth) ?? undefined}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: reduced ? 1 : 0 }}
                    animate={{ pathLength: inView ? 1 : 0 }}
                    transition={{ duration: drawSpan, delay: i * 0.12, ease: [0.4, 0, 0.1, 1] }}
                  />
                ))}

                {/* endpoint dots */}
                {series.map((s, i) => {
                  const last = s.smooth[s.smooth.length - 1];
                  if (!last) return null;
                  return (
                    <motion.circle
                      key={`end-${s.name}-${token}`}
                      cx={x(last.step)}
                      cy={y(last.value)}
                      r={3}
                      fill={s.color}
                      stroke={p.surface}
                      strokeWidth={1.5}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                      transition={{ duration: 0.3, delay: drawSpan + i * 0.12 }}
                      style={{ transformOrigin: `${x(last.step)}px ${y(last.value)}px` }}
                    />
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={yScale as never}
                  height={inner.height}
                  label={yLabel}
                  count={5}
                  format={(v) => formatCompact(v, 2)}
                />
                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={(v) => formatCompact(v)}
                  linearCount={6}
                />
                <text
                  x={inner.width / 2}
                  y={inner.height + 36}
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

                {/* hover crosshair */}
                <AnimatePresence>
                  {hoverX != null && (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <line
                        x1={x(hoverX.step)}
                        x2={x(hoverX.step)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.borderStrong}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                      {hoverRows.map((row) => {
                        const sObj = series.find((s) => s.name === row.name);
                        const pt = sObj?.smooth.find((d) => d.step === hoverX.step);
                        if (!pt) return null;
                        return (
                          <circle
                            key={row.name}
                            cx={x(hoverX.step)}
                            cy={y(pt.value)}
                            r={3.5}
                            fill={p.surface}
                            stroke={row.color}
                            strokeWidth={2}
                          />
                        );
                      })}
                    </motion.g>
                  )}
                </AnimatePresence>

                {/* capture rect */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  fill="transparent"
                  onMouseMove={handleMove}
                  onMouseLeave={() => setHoverX(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip
          x={hoverX?.px ?? 0}
          y={hoverX?.py ?? 0}
          visible={hoverX != null}
        >
          {hoverX != null && (
            <>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {xLabel} {formatCompact(hoverX.step)}
              </div>
              <div className="flex flex-col gap-1">
                {series.map((s) => {
                  const pt = s.smooth.find((d) => d.step === hoverX.step);
                  if (!pt) return null;
                  return (
                    <div key={s.name} className="flex items-baseline justify-between gap-4">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-[2px] w-3 rounded-full"
                          style={{ background: s.color }}
                        />
                        <span className="font-mono text-[10px] uppercase tracking-wide opacity-80">
                          {s.name}
                        </span>
                      </span>
                      <span className="font-medium tabular-nums">{formatCompact(pt.value, 2)}</span>
                    </div>
                  );
                })}
              </div>
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

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "training-curve",
  name: "Training Curve",
  category: "ml-eval",
  description:
    "Loss or metric versus training step for one or more runs, with EMA smoothing over faint raw traces, an optional ±std band, log-y, and a hover crosshair.",
  tags: ["training", "loss", "curve", "line", "metric", "convergence"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "TrainingCurve",
  sourcePath: "ml-eval/TrainingCurve",
  aspect: 16 / 9,
  controls: [
    {
      key: "runs",
      label: "Runs",
      type: "json",
      group: "Data",
      help: "Array of { name, points: [{ step, value }], color? }.",
      default: DEFAULT_RUNS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Training & validation loss" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Loss" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Step" },
    {
      key: "smooth",
      label: "EMA smoothing",
      type: "number",
      group: "Style",
      default: 0.6,
      min: 0,
      max: 0.97,
      step: 0.01,
    },
    { key: "showRaw", label: "Show raw trace", type: "boolean", group: "Style", default: true },
    { key: "showBand", label: "Show ±std band", type: "boolean", group: "Style", default: true },
    { key: "logY", label: "Log Y-axis", type: "boolean", group: "Layout", default: false },
    { key: "color", label: "First-run color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1100,
      min: 0,
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "train-val",
      name: "Train vs val loss",
      props: {
        title: "Train vs validation loss",
        yLabel: "Cross-entropy loss",
        smooth: 0.6,
        showBand: true,
      },
    },
    {
      id: "recall",
      name: "recall@10 climbing to 0.88",
      props: {
        title: "Retrieval recall@10 over training",
        yLabel: "recall@10",
        xLabel: "Step",
        smooth: 0.5,
        showBand: false,
        runs: [
          {
            name: "recall@10",
            points: [
              { step: 0, value: 0.12 },
              { step: 1000, value: 0.31 },
              { step: 2000, value: 0.46 },
              { step: 3000, value: 0.58 },
              { step: 4000, value: 0.67 },
              { step: 5000, value: 0.73 },
              { step: 6000, value: 0.79 },
              { step: 7000, value: 0.83 },
              { step: 8000, value: 0.85 },
              { step: 9000, value: 0.87 },
              { step: 10000, value: 0.88 },
            ],
          },
        ],
      },
    },
    {
      id: "log-loss",
      name: "Log-scale loss",
      props: {
        title: "Pretraining loss (log scale)",
        yLabel: "Loss",
        logY: true,
        smooth: 0.7,
        showBand: false,
      },
    },
  ],
};
