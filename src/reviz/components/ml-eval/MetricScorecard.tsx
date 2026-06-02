"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useId, useMemo } from "react";
import {
  Figure,
  ReplayButton,
  clamp,
  round,
  useAnimatedNumber,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Metric {
  /** Mono label, e.g. "R@10". */
  label: string;
  /** The headline value. */
  value: number;
  /** Optional unit suffix, e.g. "ms" or "%". */
  unit?: string;
  /** Optional period-over-period delta (in value units). Sign drives the chip. */
  delta?: number;
  /** Optional recent history for the sparkline (oldest → newest). */
  spark?: number[];
  /** When true, a lower delta is the good outcome (e.g. latency). */
  lowerIsBetter?: boolean;
  /** Optional fixed decimal places for the big number (auto otherwise). */
  decimals?: number;
}

export interface MetricScorecardProps {
  metrics?: Metric[];
  columns?: number;
  color?: string;
  showSparkline?: boolean;
  showDelta?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

const DEFAULT_METRICS: Metric[] = [
  { label: "R@10", value: 0.882, delta: 0.041, spark: [0.79, 0.81, 0.8, 0.83, 0.85, 0.86, 0.882] },
  { label: "val-σ", value: 0.301, delta: -0.028, lowerIsBetter: true, spark: [0.39, 0.37, 0.36, 0.34, 0.33, 0.31, 0.301] },
  { label: "p50 latency", value: 650, unit: "ms", delta: -44, lowerIsBetter: true, decimals: 0, spark: [742, 728, 710, 695, 688, 671, 650] },
  { label: "stop accept", value: 0.74, delta: 0.06, spark: [0.61, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74] },
];

/* ------------------------------------------------------------------ */

function fmt(value: number, unit: string | undefined, decimals: number | undefined): string {
  const d = decimals ?? (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 2 : 3);
  const n = round(value, d).toFixed(d);
  return unit ? `${n}` : n;
}

function fmtDelta(delta: number, decimals: number | undefined): string {
  const d = decimals ?? (Math.abs(delta) >= 100 ? 0 : Math.abs(delta) >= 1 ? 2 : 3);
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${round(Math.abs(delta), d).toFixed(d)}`;
}

/* ------------------------------------------------------------------ */

function Sparkline({
  data,
  color,
  positive,
  inView,
  duration,
  delay,
  reduced,
  trigger,
}: {
  data: number[];
  color: string;
  positive: boolean;
  inView: boolean;
  duration: number;
  delay: number;
  reduced: boolean;
  trigger: number;
}) {
  const p = usePalette();
  const gradId = useId();
  const w = 96;
  const h = 30;
  const pad = 2;

  const { linePath, areaPath, lastPt } = useMemo(() => {
    const [lo = 0, hi = 1] = extent(data) as [number, number];
    const span = hi - lo || 1;
    const x = scaleLinear()
      .domain([0, Math.max(1, data.length - 1)])
      .range([pad, w - pad]);
    const y = scaleLinear()
      .domain([lo - span * 0.12, hi + span * 0.12])
      .range([h - pad, pad]);
    const ln = line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX);
    const ar = area<number>()
      .x((_, i) => x(i))
      .y0(h - pad)
      .y1((d) => y(d))
      .curve(curveMonotoneX);
    return {
      linePath: ln(data) ?? "",
      areaPath: ar(data) ?? "",
      lastPt: { x: x(data.length - 1), y: y(data[data.length - 1]) },
    };
  }, [data]);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: inView ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : duration / 1000, delay: reduced ? 0 : delay + 0.18 }}
      />
      <motion.path
        key={`${trigger}-line`}
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: inView ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : (duration / 1000) * 1.1, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.circle
        cx={lastPt.x}
        cy={lastPt.y}
        r={2.4}
        fill={positive ? p.ok : p.bad}
        stroke={p.surface}
        strokeWidth={1.2}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : delay + duration / 1000 }}
        style={{ transformOrigin: `${lastPt.x}px ${lastPt.y}px` }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

function Cell({
  metric,
  color,
  showSparkline,
  showDelta,
  inView,
  duration,
  index,
  reduced,
  trigger,
}: {
  metric: Metric;
  color: string;
  showSparkline: boolean;
  showDelta: boolean;
  inView: boolean;
  duration: number;
  index: number;
  reduced: boolean;
  trigger: number;
}) {
  const p = usePalette();
  const delay = index * 0.08;

  const animated = useAnimatedNumber(metric.value, {
    duration,
    delay: reduced ? 0 : delay * 1000 + 120,
    enabled: inView,
    easing: "easeOut",
    trigger,
  });

  const hasDelta = showDelta && metric.delta != null && metric.delta !== 0;
  const delta = metric.delta ?? 0;
  // "good" = the direction the team wants. lowerIsBetter flips it.
  const good = metric.lowerIsBetter ? delta < 0 : delta > 0;
  const deltaColor = hasDelta ? (good ? p.ok : p.bad) : p.inkFaint;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;

  // Spark trend positivity (last vs first), respecting lowerIsBetter.
  const sparkPositive = useMemo(() => {
    const s = metric.spark;
    if (!s || s.length < 2) return good;
    const rising = s[s.length - 1] >= s[0];
    return metric.lowerIsBetter ? !rising : rising;
  }, [metric.spark, metric.lowerIsBetter, good]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 14 }}
      transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      className="group/cell relative flex flex-col gap-3 rounded-reviz border border-border bg-surface px-4 py-3.5 transition-colors hover:border-border-strong"
    >
      {/* accent rule */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-3.5 h-[calc(100%-1.75rem)] w-[2px] rounded-full opacity-70"
        style={{ background: `linear-gradient(to bottom, ${color}, ${withAlpha(color, 0)})` }}
      />

      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-label text-ink-muted">
          {metric.label}
        </span>
        {hasDelta && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums leading-none"
            style={{ color: deltaColor, background: withAlpha(deltaColor, 0.12) }}
          >
            <DeltaIcon className="h-3 w-3" strokeWidth={2.4} />
            {fmtDelta(delta, metric.decimals)}
          </span>
        )}
      </div>

      <div className="flex items-end gap-1.5">
        <span className="font-sans text-[30px] font-semibold leading-none tracking-tight text-ink tabular-nums">
          {fmt(animated, metric.unit, metric.decimals)}
        </span>
        {metric.unit && (
          <span className="mb-0.5 font-mono text-[12px] lowercase text-ink-faint">{metric.unit}</span>
        )}
      </div>

      {showSparkline && metric.spark && metric.spark.length > 1 && (
        <div className="mt-0.5 -mb-1 self-stretch">
          <Sparkline
            data={metric.spark}
            color={color}
            positive={sparkPositive}
            inView={inView}
            duration={duration}
            delay={delay + 0.1}
            reduced={reduced}
            trigger={trigger}
          />
        </div>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

export default function MetricScorecard({
  metrics = DEFAULT_METRICS,
  columns = 4,
  color = "",
  showSparkline = true,
  showDelta = true,
  title = "",
  caption = "",
  source = "",
  duration = 1100,
}: MetricScorecardProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const cols = clamp(Math.round(columns), 2, 4);
  const list = Array.isArray(metrics) ? metrics : [];

  const gridCols =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/scorecard relative">
        <div className={`grid grid-cols-1 gap-3 ${gridCols}`}>
          {list.map((m, i) => (
            <Cell
              key={`${token}-${m.label}-${i}`}
              metric={m}
              color={fill}
              showSparkline={showSparkline}
              showDelta={showDelta}
              inView={inView}
              duration={duration}
              index={i}
              reduced={reduced}
              trigger={token}
            />
          ))}
        </div>

        <AnimatePresence>
          {inView && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: reduced ? 0 : 0.4 }}
              className="absolute -top-1 right-0 opacity-0 transition-opacity group-hover/scorecard:opacity-100"
            >
              <ReplayButton onClick={replay} label="Replay" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "metric-scorecard",
  name: "Metric Scorecard",
  category: "ml-eval",
  description:
    "A grid of headline eval metrics — each cell counts up a big animated number with a unit, a colored up/down delta chip, and a tiny trend sparkline.",
  tags: ["metrics", "kpi", "scorecard", "eval", "dashboard", "sparkline"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "MetricScorecard",
  sourcePath: "ml-eval/MetricScorecard",
  aspect: 16 / 6,
  controls: [
    {
      key: "metrics",
      label: "Metrics",
      type: "json",
      group: "Data",
      help: "Array of { label, value, unit?, delta?, spark?, lowerIsBetter?, decimals? }.",
      default: DEFAULT_METRICS,
    },
    { key: "columns", label: "Columns", type: "number", group: "Layout", default: 4, min: 2, max: 4, step: 1 },
    { key: "showSparkline", label: "Show sparkline", type: "boolean", group: "Style", default: true },
    { key: "showDelta", label: "Show delta chip", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "duration", label: "Count-up (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "perseus",
      name: "Latest checkpoint",
      props: {
        title: "Reference model · checkpoint 41k",
        source: "internal eval harness",
        columns: 4,
        metrics: [
          { label: "R@10", value: 0.882, delta: 0.041, spark: [0.79, 0.81, 0.8, 0.83, 0.85, 0.86, 0.882] },
          { label: "val-σ", value: 0.301, delta: -0.028, lowerIsBetter: true, spark: [0.39, 0.37, 0.36, 0.34, 0.33, 0.31, 0.301] },
          { label: "p50 latency", value: 650, unit: "ms", delta: -44, lowerIsBetter: true, decimals: 0, spark: [742, 728, 710, 695, 688, 671, 650] },
          { label: "balanced_acc", value: 0.74, delta: 0.06, spark: [0.61, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74] },
        ],
      },
    },
    {
      id: "serving",
      name: "Serving SLOs",
      props: {
        title: "Production serving · last 24h",
        columns: 3,
        metrics: [
          { label: "p99 latency", value: 1840, unit: "ms", delta: 120, lowerIsBetter: true, decimals: 0, spark: [1620, 1680, 1700, 1730, 1790, 1820, 1840] },
          { label: "throughput", value: 1240, unit: "tok/s", delta: 90, decimals: 0, spark: [1080, 1110, 1150, 1170, 1200, 1220, 1240] },
          { label: "error rate", value: 0.004, unit: "%", delta: -0.002, lowerIsBetter: true, spark: [0.009, 0.008, 0.007, 0.006, 0.005, 0.005, 0.004] },
        ],
      },
    },
  ],
};
