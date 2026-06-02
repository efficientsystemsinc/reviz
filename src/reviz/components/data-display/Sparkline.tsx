"use client";

import { max, min } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area as d3area, curveMonotoneX, line as d3line } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  VerticalFade,
  formatCompact,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

// A realistic ML metric trend: eval accuracy creeping up over training
// checkpoints, with the small wobble you'd actually see on a dashboard.
const DEFAULT_VALUES = [
  0.612, 0.634, 0.651, 0.648, 0.667, 0.689, 0.701, 0.698, 0.715, 0.733, 0.741,
  0.738, 0.752, 0.769, 0.781, 0.778, 0.793, 0.804, 0.811, 0.824,
];

export interface SparklineProps {
  values?: number[];
  type?: "line" | "area" | "bar";
  color?: string;
  showMarker?: boolean;
  label?: string;
  width?: number;
  height?: number;
  duration?: number;
  title?: string;
  caption?: string;
  source?: string;
}

export default function Sparkline({
  values = DEFAULT_VALUES,
  type = "line",
  color = "",
  showMarker = true,
  label = "Eval acc",
  width = 168,
  height = 44,
  duration = 1000,
  title = "",
  caption = "",
  source = "",
}: SparklineProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const gid = useMemo(() => uid("spark"), []);

  // Only finite values participate in the trace; we keep their original index
  // so the x-position stays faithful even if a sample is missing.
  const series = useMemo(
    () =>
      values
        .map((v, i) => ({ v, i }))
        .filter((d) => Number.isFinite(d.v)),
    [values],
  );

  const n = Math.max(2, values.length);
  const first = series[0]?.v ?? 0;
  const last = series[series.length - 1]?.v ?? 0;
  const delta = last - first;
  // Delta coloring: rising → ok, falling → bad. The explicit `color` prop (or
  // accent) always wins for the trace itself; delta tint only drives the label.
  const trend = delta > 0 ? p.ok : delta < 0 ? p.bad : p.inkMuted;
  const stroke = color || p.accent;

  const yDomain = useMemo(() => {
    const vals = series.map((d) => d.v);
    if (vals.length === 0) return [0, 1] as [number, number];
    const lo = min(vals) ?? 0;
    const hi = max(vals) ?? 1;
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.12 || 1;
    return [lo - pad, hi + pad] as [number, number];
  }, [series]);

  // Min / max extrema (first occurrence) for the highlight dots.
  const extrema = useMemo(() => {
    if (series.length === 0) return { lo: -1, hi: -1 };
    let lo = series[0].i;
    let hi = series[0].i;
    for (const d of series) {
      if (d.v < (values[lo] ?? Infinity)) lo = d.i;
      if (d.v > (values[hi] ?? -Infinity)) hi = d.i;
    }
    return { lo, hi };
  }, [series, values]);

  // Inner padding so strokes / dots never clip at the box edges.
  const padX = 4;
  const padTop = 5;
  const padBot = 5;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padTop - padBot);

  const x = useMemo(
    () => scaleLinear().domain([0, n - 1]).range([padX, padX + innerW]),
    [n, innerW],
  );
  const y = useMemo(
    () => scaleLinear().domain(yDomain).range([padTop + innerH, padTop]),
    [yDomain, innerH],
  );

  const isBar = type === "bar";
  const lineGen = d3line<{ v: number; i: number }>()
    .x((d) => x(d.i))
    .y((d) => y(d.v))
    .curve(curveMonotoneX);
  const areaGen = d3area<{ v: number; i: number }>()
    .x((d) => x(d.i))
    .y0(padTop + innerH)
    .y1((d) => y(d.v))
    .curve(curveMonotoneX);

  const linePath = lineGen(series) ?? "";
  const areaPath = areaGen(series) ?? "";

  const lastX = x(series[series.length - 1]?.i ?? n - 1);
  const lastY = y(last);

  const draw = reduced ? 1 : inView ? 1 : 0;
  const drawDur = (duration / 1000) * 0.82;

  // Bars: width derived from spacing, capped so dense series stay airy.
  const step = innerW / Math.max(1, n - 1);
  const barW = Math.max(1.5, Math.min(step * 0.62, 10));

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div className="flex w-full items-center justify-center">
      <div ref={ref} className="relative inline-flex items-center gap-3">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
          role="img"
          aria-label={label || "sparkline"}
        >
          <defs>
            <VerticalFade id={`${gid}-fade`} color={stroke} from={0.22} to={0} />
          </defs>

          {/* Baseline reference: only meaningful when the domain crosses 0. */}
          {yDomain[0] < 0 && yDomain[1] > 0 && (
            <line
              x1={padX}
              x2={padX + innerW}
              y1={y(0)}
              y2={y(0)}
              stroke={p.border}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          )}

          {isBar ? (
            // Bars rise from the baseline (0 if in-domain, else the floor).
            series.map((d, k) => {
              const base = yDomain[0] < 0 && yDomain[1] > 0 ? y(0) : padTop + innerH;
              const top = y(d.v);
              const barTop = Math.min(top, base); // y of the bar's upper edge
              const h = Math.max(0.5, Math.abs(base - top));
              const bx = x(d.i) - barW / 2;
              const isLast = k === series.length - 1;
              const isHi = d.i === extrema.hi;
              const isLo = d.i === extrema.lo;
              const fill =
                showMarker && isLast
                  ? trend
                  : isHi
                    ? stroke
                    : withAlpha(stroke, isLo ? 0.4 : 0.55);
              return (
                <motion.rect
                  key={`${gid}-bar-${d.i}-${token}`}
                  x={bx}
                  width={barW}
                  rx={Math.min(1.5, barW / 2)}
                  fill={fill}
                  // Grow upward: height fans out from 0 while y rises to barTop.
                  initial={{ height: 0, y: base, opacity: 0 }}
                  animate={{
                    height: draw ? h : 0,
                    y: draw ? barTop : base,
                    opacity: draw ? 1 : 0,
                  }}
                  transition={{
                    duration: reduced ? 0 : Math.max(0.18, drawDur * 0.5),
                    delay: reduced ? 0 : (k / Math.max(1, series.length)) * drawDur * 0.7,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              );
            })
          ) : (
            <>
              {type === "area" && areaPath && (
                <motion.path
                  key={`${gid}-area-${token}`}
                  d={areaPath}
                  fill={`url(#${gid}-fade)`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: draw ? 1 : 0 }}
                  transition={{
                    duration: reduced ? 0 : drawDur * 0.7,
                    delay: reduced ? 0 : drawDur * 0.45,
                    ease: "easeOut",
                  }}
                />
              )}
              {linePath && (
                <motion.path
                  key={`${gid}-line-${token}`}
                  d={linePath}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: draw, opacity: draw ? 1 : 0 }}
                  transition={{
                    pathLength: { duration: reduced ? 0 : drawDur, ease: [0.4, 0, 0.2, 1] },
                    opacity: { duration: reduced ? 0 : 0.2 },
                  }}
                />
              )}

              {/* Min / max extrema dots. */}
              {showMarker &&
                series.length > 1 &&
                ([extrema.hi, extrema.lo] as const).map((idx, k) =>
                  idx >= 0 && idx !== (series[series.length - 1]?.i ?? -2) ? (
                    <motion.circle
                      key={`${gid}-ex-${k}-${token}`}
                      cx={x(idx)}
                      cy={y(values[idx])}
                      r={2}
                      fill={k === 0 ? stroke : p.surface}
                      stroke={stroke}
                      strokeWidth={1.25}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: draw ? 1 : 0, scale: draw ? 1 : 0 }}
                      transition={{
                        duration: reduced ? 0 : 0.3,
                        delay: reduced ? 0 : drawDur * 0.9,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  ) : null,
                )}

              {/* Last-point marker, colored by trend. */}
              {showMarker && series.length > 0 && (
                <motion.g
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: draw ? 1 : 0, scale: draw ? 1 : 0 }}
                  transition={{
                    duration: reduced ? 0 : 0.34,
                    delay: reduced ? 0 : drawDur,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{ originX: `${lastX}px`, originY: `${lastY}px` }}
                >
                  <circle cx={lastX} cy={lastY} r={5} fill={withAlpha(trend, 0.18)} />
                  <circle cx={lastX} cy={lastY} r={2.75} fill={trend} stroke={p.surface} strokeWidth={1.4} />
                </motion.g>
              )}
            </>
          )}
        </svg>

        {/* End-value readout: the current value + delta vs. start. */}
        {label !== undefined && (label || showMarker) && (
          <motion.div
            className="flex flex-col items-start leading-none"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: draw ? 1 : 0, x: draw ? 0 : -4 }}
            transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : drawDur * 0.95 }}
          >
            {label && (
              <span className="font-mono uppercase tracking-label text-[9px] text-ink-faint">
                {label}
              </span>
            )}
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
                {formatCompact(last, 3)}
              </span>
              {series.length > 1 && delta !== 0 && (
                <span
                  className="font-mono text-[10px] font-medium tabular-nums"
                  style={{ color: trend }}
                >
                  {delta > 0 ? "▲" : "▼"} {formatCompact(Math.abs(delta), 3)}
                </span>
              )}
            </span>
          </motion.div>
        )}

        <ReplayButton
          onClick={replay}
          className="absolute -right-1 -top-1 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
      </div>
    </Figure>
  );
}

// A volatile latency microchart: p99 inference latency (ms) drifting up — the
// kind of signal you'd glance at as a bar sparkline on a serving dashboard.
const LATENCY = [42, 38, 45, 51, 47, 58, 49, 63, 71, 66, 74, 82, 78, 91, 88, 97];

// GPU utilization dipping then recovering — a delta-down scenario.
const GPU_UTIL = [0.94, 0.92, 0.88, 0.81, 0.76, 0.72, 0.69, 0.74, 0.79, 0.83, 0.86];

export const meta: RevizMeta = {
  id: "sparkline",
  name: "Sparkline",
  category: "data-display",
  description:
    "A compact inline sparkline — line, area, or bar — with an optional last-point marker, min/max dots, and an end-value readout tinted by the trend direction. Draws in left-to-right.",
  tags: ["sparkline", "microchart", "trend", "inline", "metric", "kpi"],
  badges: ["animated", "themed", "responsive", "exportable"],
  exportName: "Sparkline",
  sourcePath: "data-display/Sparkline",
  aspect: 16 / 5,
  controls: [
    {
      key: "values",
      label: "Values",
      type: "json",
      group: "Data",
      default: DEFAULT_VALUES,
      help: "A flat array of numbers; the trace is drawn in order.",
    },
    {
      key: "type",
      label: "Type",
      type: "select",
      group: "Style",
      default: "line",
      options: [
        { value: "line", label: "Line" },
        { value: "area", label: "Area" },
        { value: "bar", label: "Bar" },
      ],
    },
    { key: "color", label: "Color", type: "color", group: "Style", default: "" },
    { key: "showMarker", label: "Markers & dots", type: "boolean", group: "Style", default: true },
    { key: "label", label: "Label", type: "text", group: "Labels", default: "Eval acc" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "width", label: "Width", type: "number", group: "Layout", default: 168, min: 64, max: 480, step: 4, unit: "px" },
    { key: "height", label: "Height", type: "number", group: "Layout", default: 44, min: 20, max: 160, step: 2, unit: "px" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1000, min: 0, max: 3000, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "metric-trend",
      name: "Metric trend",
      props: {
        type: "area",
        label: "Eval acc",
        values: DEFAULT_VALUES,
        showMarker: true,
        width: 200,
        height: 48,
      },
    },
    {
      id: "latency-bars",
      name: "Latency microchart",
      props: {
        type: "bar",
        label: "p99 ms",
        values: LATENCY,
        showMarker: true,
        width: 188,
        height: 46,
      },
    },
    {
      id: "gpu-util",
      name: "GPU util (falling)",
      props: {
        type: "line",
        label: "GPU util",
        values: GPU_UTIL,
        showMarker: true,
        width: 176,
        height: 44,
      },
    },
  ],
};
