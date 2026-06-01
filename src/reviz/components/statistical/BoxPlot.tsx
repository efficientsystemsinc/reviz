"use client";

import { ascending, max as d3max, min as d3min, quantileSorted } from "d3-array";
import { scaleBand, scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/** A raw group: label + a sample array of observations. */
interface RawGroup {
  label: string;
  values: number[];
}

/** A precomputed group: label + five-number summary (+ optional outliers). */
interface StatGroup {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers?: number[];
}

type GroupInput = RawGroup | StatGroup;

/** Fully-resolved per-group statistics used to draw a box. */
interface BoxStats {
  label: string;
  q1: number;
  median: number;
  q3: number;
  /** Lower whisker end (smallest value within 1.5·IQR of Q1). */
  whiskerLow: number;
  /** Upper whisker end (largest value within 1.5·IQR of Q3). */
  whiskerHigh: number;
  outliers: number[];
  /** Raw sample count, if known. */
  n: number | null;
  mean: number | null;
}

export interface BoxPlotProps {
  data?: GroupInput[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  color?: string;
  showOutliers?: boolean;
  showGrid?: boolean;
  showMean?: boolean;
  boxGap?: number;
  duration?: number;
}

const DEFAULT_DATA: GroupInput[] = [
  {
    label: "B=1",
    values: [42, 44, 45, 46, 47, 47, 48, 49, 50, 51, 53, 55, 58, 71],
  },
  {
    label: "B=4",
    values: [58, 61, 62, 63, 64, 65, 66, 66, 67, 68, 70, 72, 75, 88],
  },
  {
    label: "B=16",
    values: [96, 99, 101, 103, 104, 105, 106, 107, 108, 110, 113, 117, 124, 152],
  },
  {
    label: "B=64",
    values: [188, 196, 201, 205, 208, 211, 213, 216, 219, 224, 231, 240, 258, 312],
  },
];

function isRaw(g: GroupInput): g is RawGroup {
  return Array.isArray((g as RawGroup).values);
}

/** Compute Tukey box statistics from a sample, or pass through precomputed stats. */
function computeStats(g: GroupInput, showOutliers: boolean): BoxStats {
  if (!isRaw(g)) {
    const s = g as StatGroup;
    const outliers = showOutliers ? s.outliers ?? [] : [];
    return {
      label: s.label,
      q1: s.q1,
      median: s.median,
      q3: s.q3,
      whiskerLow: s.min,
      whiskerHigh: s.max,
      outliers,
      n: null,
      mean: null,
    };
  }

  const sorted = [...g.values].filter((v) => Number.isFinite(v)).sort(ascending);
  if (sorted.length === 0) {
    return {
      label: g.label,
      q1: 0,
      median: 0,
      q3: 0,
      whiskerLow: 0,
      whiskerHigh: 0,
      outliers: [],
      n: 0,
      mean: null,
    };
  }
  const q1 = quantileSorted(sorted, 0.25) ?? sorted[0];
  const median = quantileSorted(sorted, 0.5) ?? sorted[0];
  const q3 = quantileSorted(sorted, 0.75) ?? sorted[sorted.length - 1];
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const inliers = sorted.filter((v) => v >= lowFence && v <= highFence);
  const whiskerLow = inliers.length ? (d3min(inliers) as number) : sorted[0];
  const whiskerHigh = inliers.length ? (d3max(inliers) as number) : sorted[sorted.length - 1];
  const outliers = showOutliers ? sorted.filter((v) => v < lowFence || v > highFence) : [];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;

  return {
    label: g.label,
    q1,
    median,
    q3,
    whiskerLow,
    whiskerHigh,
    outliers,
    n: sorted.length,
    mean,
  };
}

export default function BoxPlot({
  data = DEFAULT_DATA,
  title = "Inference latency by batch size",
  caption = "",
  source = "",
  yLabel = "Latency (ms)",
  color = "",
  showOutliers = true,
  showGrid = true,
  showMean = false,
  boxGap = 0.5,
  duration = 900,
}: BoxPlotProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const stats = useMemo(
    () => (data ?? []).map((g) => computeStats(g, showOutliers)),
    [data, showOutliers],
  );

  const domain = useMemo(() => {
    const lows: number[] = [];
    const highs: number[] = [];
    for (const s of stats) {
      lows.push(s.whiskerLow, s.q1, ...s.outliers);
      highs.push(s.whiskerHigh, s.q3, ...s.outliers);
    }
    const lo = lows.length ? Math.min(...lows) : 0;
    const hi = highs.length ? Math.max(...highs) : 1;
    const pad = (hi - lo) * 0.08 || 1;
    return [lo - pad, hi + pad] as [number, number];
  }, [stats]);

  const play = inView && !reduced;
  const sec = duration / 1000;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 16, right: 20, bottom: 38, left: yLabel ? 56 : 44 }}
        >
          {({ inner, margin }) => {
            const y = scaleLinear().domain(domain).range([inner.height, 0]).nice();
            const band = scaleBand<string>()
              .domain(stats.map((s) => s.label))
              .range([0, inner.width])
              .paddingInner(boxGap)
              .paddingOuter(boxGap / 2);
            const bw = band.bandwidth();
            const boxW = Math.min(bw, 76);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {showGrid && <GridLines scale={y as never} width={inner.width} />}

                {stats.map((s, i) => {
                  const cx = (band(s.label) ?? 0) + bw / 2;
                  const x0 = cx - boxW / 2;
                  const yQ1 = y(s.q1);
                  const yQ3 = y(s.q3);
                  const yMed = y(s.median);
                  const boxTop = Math.min(yQ1, yQ3);
                  const boxH = Math.abs(yQ1 - yQ3);
                  const active = hover?.i === i;
                  const delay = i * 0.1;
                  const capW = boxW * 0.46;

                  return (
                    <g
                      key={`${s.label}-${i}`}
                      onMouseMove={(e) => {
                        const r = (
                          e.currentTarget.ownerSVGElement as SVGSVGElement
                        ).getBoundingClientRect();
                        setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                    >
                      {/* hover hit area */}
                      <rect
                        x={x0}
                        y={Math.min(y(s.whiskerHigh), boxTop) - 4}
                        width={boxW}
                        height={Math.abs(y(s.whiskerLow) - y(s.whiskerHigh)) + 8}
                        fill="transparent"
                      />

                      {/* whisker stems (draw downward from box edges) */}
                      <motion.line
                        x1={cx}
                        x2={cx}
                        y1={yQ3}
                        stroke={p.borderStrong}
                        strokeWidth={1.5}
                        initial={{ y2: yQ3 }}
                        animate={{ y2: play ? y(s.whiskerHigh) : yQ3 }}
                        transition={{ duration: sec * 0.55, delay: delay + sec * 0.4, ease: [0.22, 1, 0.36, 1] }}
                        key={`${token}-wh-${i}`}
                      />
                      <motion.line
                        x1={cx}
                        x2={cx}
                        y1={yQ1}
                        stroke={p.borderStrong}
                        strokeWidth={1.5}
                        initial={{ y2: yQ1 }}
                        animate={{ y2: play ? y(s.whiskerLow) : yQ1 }}
                        transition={{ duration: sec * 0.55, delay: delay + sec * 0.4, ease: [0.22, 1, 0.36, 1] }}
                        key={`${token}-wl-${i}`}
                      />

                      {/* whisker caps */}
                      <motion.line
                        x1={cx - capW / 2}
                        x2={cx + capW / 2}
                        y1={y(s.whiskerHigh)}
                        y2={y(s.whiskerHigh)}
                        stroke={p.borderStrong}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: play ? 1 : 0 }}
                        transition={{ duration: sec * 0.25, delay: delay + sec * 0.9 }}
                        key={`${token}-ch-${i}`}
                      />
                      <motion.line
                        x1={cx - capW / 2}
                        x2={cx + capW / 2}
                        y1={y(s.whiskerLow)}
                        y2={y(s.whiskerLow)}
                        stroke={p.borderStrong}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: play ? 1 : 0 }}
                        transition={{ duration: sec * 0.25, delay: delay + sec * 0.9 }}
                        key={`${token}-cl-${i}`}
                      />

                      {/* the box: grows from the median outward */}
                      <motion.rect
                        x={x0}
                        width={boxW}
                        rx={3}
                        fill={withAlpha(fill, active ? 0.3 : 0.16)}
                        stroke={fill}
                        strokeWidth={1.5}
                        initial={{ y: yMed, height: 0 }}
                        animate={{
                          y: play ? boxTop : yMed,
                          height: play ? boxH : 0,
                        }}
                        transition={{ duration: sec * 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
                        key={`${token}-box-${i}`}
                      />

                      {/* median line */}
                      <motion.line
                        x1={x0}
                        x2={x0 + boxW}
                        y1={yMed}
                        y2={yMed}
                        stroke={fill}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: play ? 1 : 0, opacity: play ? 1 : 0 }}
                        transition={{ duration: sec * 0.4, delay: delay + sec * 0.45 }}
                        key={`${token}-med-${i}`}
                      />

                      {/* mean marker */}
                      {showMean && s.mean != null && (
                        <motion.path
                          d={`M ${cx - 4} ${y(s.mean) - 4} L ${cx + 4} ${y(s.mean) + 4} M ${cx - 4} ${y(s.mean) + 4} L ${cx + 4} ${y(s.mean) - 4}`}
                          stroke={p.ink}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: play ? 0.85 : 0 }}
                          transition={{ duration: sec * 0.3, delay: delay + sec }}
                          key={`${token}-mean-${i}`}
                        />
                      )}

                      {/* outliers */}
                      {s.outliers.map((o, k) => (
                        <motion.circle
                          key={`o-${k}`}
                          cx={cx}
                          cy={y(o)}
                          r={2.6}
                          fill={p.surface}
                          stroke={p.bad}
                          strokeWidth={1.25}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: play ? 1 : 0, scale: play ? 1 : 0 }}
                          transition={{
                            duration: sec * 0.3,
                            delay: delay + sec * (1 + k * 0.06),
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          style={{ transformOrigin: `${cx}px ${y(o)}px` }}
                        />
                      ))}
                    </g>
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label={yLabel}
                  format={(v) => formatCompact(v)}
                />
                <AxisBottom scale={band as never} y={inner.height} rotate={stats.length > 7 ? -28 : 0} />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && stats[hover.i] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {stats[hover.i].label}
                {stats[hover.i].n != null && (
                  <span className="ml-1 opacity-60">n={stats[hover.i].n}</span>
                )}
              </div>
              <TooltipRow label="max" value={formatCompact(stats[hover.i].whiskerHigh, 2)} />
              <TooltipRow label="q3" value={formatCompact(stats[hover.i].q3, 2)} />
              <TooltipRow label="median" value={formatCompact(stats[hover.i].median, 2)} />
              <TooltipRow label="q1" value={formatCompact(stats[hover.i].q1, 2)} />
              <TooltipRow label="min" value={formatCompact(stats[hover.i].whiskerLow, 2)} />
              {showMean && stats[hover.i].mean != null && (
                <TooltipRow label="mean" value={formatCompact(round(stats[hover.i].mean as number, 2), 2)} />
              )}
              {showOutliers && stats[hover.i].outliers.length > 0 && (
                <TooltipRow label="outliers" value={stats[hover.i].outliers.length} />
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

export const meta: RevizMeta = {
  id: "box-plot",
  name: "Box Plot",
  category: "statistical",
  description:
    "Box-and-whisker plots that distill each group's distribution into quartiles, whiskers, and outliers — perfect for comparing latency, scores, or noisy benchmark runs.",
  tags: ["box", "whisker", "distribution", "quartiles", "statistics", "outliers"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "BoxPlot",
  sourcePath: "statistical/BoxPlot",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Groups",
      type: "json",
      group: "Data",
      help: "Either [{label, values:number[]}] (quartiles computed via Tukey) or precomputed [{label, min, q1, median, q3, max, outliers?}].",
      default: DEFAULT_DATA,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Inference latency by batch size" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Latency (ms)" },
    { key: "color", label: "Box color", type: "color", group: "Style", default: "" },
    { key: "showOutliers", label: "Show outliers", type: "boolean", group: "Style", default: true },
    { key: "showMean", label: "Show mean", type: "boolean", group: "Style", default: false },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "boxGap", label: "Box gap", type: "number", group: "Layout", default: 0.5, min: 0.1, max: 0.85, step: 0.05 },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 900, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "latency",
      name: "Latency by batch size",
      props: {
        title: "Inference latency by batch size",
        yLabel: "Latency (ms)",
        showMean: true,
      },
    },
    {
      id: "scores",
      name: "Eval scores by model",
      props: {
        title: "Pass@1 across 30 seeds",
        yLabel: "Pass@1 (%)",
        color: "",
        data: [
          { label: "7B-base", values: [31, 33, 34, 34, 35, 36, 36, 37, 38, 39, 41, 44, 28] },
          { label: "7B-RLHF", values: [48, 50, 51, 52, 52, 53, 54, 54, 55, 56, 58, 61, 67] },
          { label: "34B-base", values: [55, 57, 58, 59, 60, 60, 61, 62, 63, 64, 66, 69] },
          { label: "34B-RLHF", values: [68, 70, 71, 72, 73, 73, 74, 75, 76, 78, 81, 85] },
        ],
      },
    },
    {
      id: "precomputed",
      name: "Precomputed quartiles",
      props: {
        title: "Reward distribution by policy",
        yLabel: "Episode reward",
        showOutliers: true,
        data: [
          { label: "PPO", min: 120, q1: 180, median: 220, q3: 265, max: 310, outliers: [40, 60] },
          { label: "SAC", min: 200, q1: 245, median: 280, q3: 318, max: 360, outliers: [410] },
          { label: "DreamerV3", min: 260, q1: 305, median: 340, q3: 372, max: 410, outliers: [] },
        ],
      },
    },
  ],
};
