"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
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
  TooltipRow,
  formatCompact,
  round,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface Point {
  x: number;
  y: number;
  group?: string;
}

/** Default points: a positive correlation cloud (mirrors the `data` control default). */
const DEFAULT_DATA: Point[] = [
  { x: 8, y: 41 }, { x: 11, y: 47 }, { x: 14, y: 52 }, { x: 16, y: 50 },
  { x: 19, y: 58 }, { x: 22, y: 61 }, { x: 24, y: 59 }, { x: 27, y: 66 },
  { x: 30, y: 71 }, { x: 33, y: 69 }, { x: 36, y: 76 }, { x: 38, y: 74 },
  { x: 41, y: 81 }, { x: 44, y: 79 }, { x: 47, y: 85 }, { x: 50, y: 88 },
  { x: 53, y: 86 }, { x: 56, y: 91 }, { x: 60, y: 94 }, { x: 64, y: 92 },
];

export interface ScatterPlotProps {
  data: Point[];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  showTrend?: boolean;
  showGrid?: boolean;
  color?: string;
  pointRadius?: number;
  duration?: number;
}

/** Ordinary-least-squares fit + R² + a confidence-style band from the residual spread. */
function fitLine(pts: Point[]) {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of pts) {
    const pred = slope * p.x + intercept;
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - pred) ** 2;
  }
  const r2 = ssTot < 1e-9 ? 0 : 1 - ssRes / ssTot;
  const rmse = Math.sqrt(ssRes / Math.max(1, n - 2));
  return { slope, intercept, r2, rmse };
}

export default function ScatterPlot({
  data = DEFAULT_DATA,
  title,
  caption,
  source,
  xLabel,
  yLabel,
  showTrend = true,
  showGrid = true,
  color = "",
  pointRadius = 5,
  duration = 1000,
}: ScatterPlotProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null);
  const ids = useMemo(() => ({ band: uid("band"), glow: uid("glow") }), []);

  // Stable color per group from the palette series ramp.
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const d of data) {
      const g = d.group ?? "";
      if (g && !seen.includes(g)) seen.push(g);
    }
    return seen;
  }, [data]);

  const grouped = groups.length > 0;
  const colorFor = (g: string | undefined) => {
    if (!g || !grouped) return accent;
    const idx = groups.indexOf(g);
    return p.series[idx % p.series.length];
  };

  const fit = useMemo(() => (showTrend ? fitLine(data) : null), [showTrend, data]);

  const xDomain = useMemo(() => {
    const e = extent(data, (d) => d.x) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const pad = (e[1] - e[0]) * 0.06 || 1;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [data]);

  const yDomain = useMemo(() => {
    const e = extent(data, (d) => d.y) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const pad = (e[1] - e[0]) * 0.08 || 1;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [data]);

  const legendItems: LegendItem[] = groups.map((g) => ({
    label: g,
    color: colorFor(g),
    shape: "circle",
  }));

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={16 / 11}
          margin={{ top: 18, right: 20, bottom: yLabel || xLabel ? 46 : 40, left: yLabel ? 56 : 46 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]).nice();
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();

            // Trend line endpoints across the (niced) x domain.
            const [x0, x1] = x.domain() as [number, number];
            const trend = fit
              ? {
                  x1: x(x0),
                  y1: y(fit.slope * x0 + fit.intercept),
                  x2: x(x1),
                  y2: y(fit.slope * x1 + fit.intercept),
                }
              : null;

            // Confidence-style band: trend line +/- rmse, as a filled polygon.
            const bandPath =
              fit && trend
                ? `M ${x(x0)} ${y(fit.slope * x0 + fit.intercept + fit.rmse)}` +
                  ` L ${x(x1)} ${y(fit.slope * x1 + fit.intercept + fit.rmse)}` +
                  ` L ${x(x1)} ${y(fit.slope * x1 + fit.intercept - fit.rmse)}` +
                  ` L ${x(x0)} ${y(fit.slope * x0 + fit.intercept - fit.rmse)} Z`
                : null;

            const baseDelay = showTrend && fit ? 0.35 : 0.1;
            const per = data.length > 0 ? Math.min(0.04, 0.7 / data.length) : 0;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <filter id={ids.glow} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="3.5" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {showGrid && <GridLines scale={y as never} width={inner.width} />}
                {showGrid && (
                  <g aria-hidden>
                    {(x as never as { ticks: (n: number) => number[] }).ticks(6).map((t, i) => (
                      <line
                        key={i}
                        x1={x(t)}
                        x2={x(t)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.grid}
                        strokeWidth={1}
                        strokeDasharray="2 4"
                        shapeRendering="crispEdges"
                      />
                    ))}
                  </g>
                )}

                {/* Trend band + line */}
                {fit && bandPath && (
                  <motion.path
                    d={bandPath}
                    fill={withAlpha(accent, 0.1)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: 0.5, delay: baseDelay * 0.4 }}
                    key={`${token}-band`}
                  />
                )}
                {fit && trend && (
                  <motion.line
                    x1={trend.x1}
                    y1={trend.y1}
                    x2={trend.x2}
                    y2={trend.y2}
                    stroke={accent}
                    strokeWidth={1.75}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 0.9 : 0 }}
                    transition={{
                      pathLength: { duration: reduced ? 0 : duration / 1400, delay: baseDelay * 0.5, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: 0.3, delay: baseDelay * 0.5 },
                    }}
                    key={`${token}-trend`}
                  />
                )}

                {/* Points */}
                {data.map((d, i) => {
                  const cx = x(d.x);
                  const cy = y(d.y);
                  const c = colorFor(d.group);
                  const active = hover?.i === i;
                  return (
                    <motion.circle
                      key={`${token}-${i}`}
                      cx={cx}
                      cy={cy}
                      r={active ? pointRadius + 2 : pointRadius}
                      fill={withAlpha(c, active ? 0.95 : 0.78)}
                      stroke={active ? c : withAlpha(c, 0.55)}
                      strokeWidth={active ? 1.5 : 1}
                      filter={active ? `url(#${ids.glow})` : undefined}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
                      transition={{
                        duration: reduced ? 0 : Math.min(0.5, duration / 1800),
                        delay: reduced ? 0 : baseDelay + i * per,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
                      onMouseEnter={() => setHover({ i, cx, cy })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label={yLabel} format={(v) => formatCompact(v)} />
                <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => formatCompact(v)} />

                {/* X-axis label */}
                {xLabel && (
                  <text
                    x={inner.width / 2}
                    y={inner.height + 38}
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

                {/* R² badge for the trend */}
                {fit && (
                  <motion.text
                    x={inner.width - 4}
                    y={6}
                    textAnchor="end"
                    fill={p.inkMuted}
                    className="tabular-nums"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.04em" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: 0.4, delay: baseDelay + 0.2 }}
                    key={`${token}-r2`}
                  >
                    {`R² = ${round(fit.r2, 3)}`}
                  </motion.text>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip
          x={hover ? hover.cx + (yLabel ? 56 : 46) : 0}
          y={hover ? hover.cy + 18 : 0}
          visible={hover != null}
        >
          {hover != null && (
            <>
              {data[hover.i].group && (
                <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-80">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: colorFor(data[hover.i].group) }}
                  />
                  {data[hover.i].group}
                </div>
              )}
              <TooltipRow label={xLabel || "x"} value={formatCompact(data[hover.i].x, 2)} />
              <TooltipRow label={yLabel || "y"} value={formatCompact(data[hover.i].y, 2)} />
            </>
          )}
        </FloatingTooltip>

        {grouped && <Legend items={legendItems} align="center" className="mt-3" />}

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "scatter-plot",
  name: "Scatter Plot",
  category: "charts",
  description:
    "An X/Y scatter with optional group coloring and a least-squares trend line plus residual band, points scaling in with a graceful stagger.",
  tags: ["scatter", "correlation", "regression", "points", "xy"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ScatterPlot",
  sourcePath: "charts/ScatterPlot",
  aspect: 16 / 11,
  controls: [
    {
      key: "data",
      label: "Points",
      type: "json",
      group: "Data",
      help: "Array of { x, y, group? }. Add a group to color & legend by category.",
      default: DEFAULT_DATA,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Model scale vs. benchmark accuracy" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Parameters (B)" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Accuracy (%)" },
    { key: "showTrend", label: "Trend line", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Gridlines", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Point color", type: "color", group: "Style", default: "" },
    { key: "pointRadius", label: "Point radius", type: "number", group: "Style", default: 5, min: 2, max: 12, step: 0.5, unit: "px" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1000, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "correlation",
      name: "Correlation cloud",
      props: {
        title: "Model scale vs. benchmark accuracy",
        xLabel: "Parameters (B)",
        yLabel: "Accuracy (%)",
        showTrend: true,
      },
    },
    {
      id: "two-group",
      name: "Two-group separation",
      props: {
        title: "Latent embedding by data regime",
        xLabel: "UMAP-1",
        yLabel: "UMAP-2",
        showTrend: false,
        pointRadius: 5.5,
        data: [
          { x: 12, y: 64, group: "in-distribution" }, { x: 15, y: 70, group: "in-distribution" },
          { x: 18, y: 61, group: "in-distribution" }, { x: 14, y: 75, group: "in-distribution" },
          { x: 21, y: 68, group: "in-distribution" }, { x: 17, y: 80, group: "in-distribution" },
          { x: 23, y: 73, group: "in-distribution" }, { x: 20, y: 84, group: "in-distribution" },
          { x: 26, y: 77, group: "in-distribution" }, { x: 16, y: 67, group: "in-distribution" },
          { x: 19, y: 72, group: "in-distribution" }, { x: 24, y: 81, group: "in-distribution" },
          { x: 58, y: 28, group: "out-of-distribution" }, { x: 62, y: 35, group: "out-of-distribution" },
          { x: 65, y: 24, group: "out-of-distribution" }, { x: 60, y: 41, group: "out-of-distribution" },
          { x: 68, y: 31, group: "out-of-distribution" }, { x: 71, y: 38, group: "out-of-distribution" },
          { x: 64, y: 45, group: "out-of-distribution" }, { x: 73, y: 29, group: "out-of-distribution" },
          { x: 67, y: 36, group: "out-of-distribution" }, { x: 70, y: 43, group: "out-of-distribution" },
          { x: 75, y: 33, group: "out-of-distribution" }, { x: 61, y: 27, group: "out-of-distribution" },
        ],
      },
    },
  ],
};
