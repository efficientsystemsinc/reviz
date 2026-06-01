"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
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
  ResponsiveSvg,
  TooltipRow,
  VerticalFade,
  formatCompact,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface BandPoint {
  x: number;
  y: number;
  lo: number;
  hi: number;
}

interface BandSeries {
  name: string;
  points: BandPoint[];
  color?: string;
}

/* ------------------------------------------------------------------ */
/* Default data — realistic RL learning curves with ±1 SE bands.       */
/* ------------------------------------------------------------------ */

const DEFAULT_SERIES: BandSeries[] = [
  {
    name: "PPO",
    points: [
      { x: 0, y: 4.0, lo: -1.5, hi: 9.5 },
      { x: 2, y: 28.0, lo: 21.0, hi: 35.0 },
      { x: 4, y: 49.0, lo: 42.5, hi: 55.5 },
      { x: 6, y: 63.0, lo: 57.5, hi: 68.5 },
      { x: 8, y: 73.5, lo: 68.8, hi: 78.2 },
      { x: 10, y: 80.5, lo: 76.5, hi: 84.5 },
      { x: 12, y: 85.0, lo: 81.6, hi: 88.4 },
      { x: 14, y: 88.0, lo: 85.1, hi: 90.9 },
      { x: 16, y: 90.0, lo: 87.5, hi: 92.5 },
      { x: 18, y: 91.3, lo: 89.2, hi: 93.4 },
      { x: 20, y: 92.2, lo: 90.4, hi: 94.0 },
    ],
  },
  {
    name: "SAC",
    points: [
      { x: 0, y: 3.0, lo: -2.0, hi: 8.0 },
      { x: 2, y: 19.0, lo: 11.0, hi: 27.0 },
      { x: 4, y: 37.0, lo: 29.0, hi: 45.0 },
      { x: 6, y: 52.0, lo: 45.0, hi: 59.0 },
      { x: 8, y: 63.0, lo: 57.0, hi: 69.0 },
      { x: 10, y: 71.0, lo: 65.8, hi: 76.2 },
      { x: 12, y: 77.0, lo: 72.4, hi: 81.6 },
      { x: 14, y: 81.0, lo: 77.0, hi: 85.0 },
      { x: 16, y: 84.0, lo: 80.5, hi: 87.5 },
      { x: 18, y: 86.0, lo: 82.9, hi: 89.1 },
      { x: 20, y: 87.2, lo: 84.5, hi: 89.9 },
    ],
  },
];

const LEARNING_CURVE: BandSeries[] = [
  {
    name: "PPO agent",
    points: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((s) => {
      const y = 92 * (1 - Math.exp(-s / 6)) + 3;
      const se = 6 * Math.exp(-s / 9) + 1.5;
      return {
        x: s,
        y: Math.round(y * 10) / 10,
        lo: Math.round((y - se) * 10) / 10,
        hi: Math.round((y + se) * 10) / 10,
      };
    }),
  },
];

export interface ConfidenceBandProps {
  series: BandSeries[];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  bandOpacity?: number;
  lineWidth?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  smooth?: boolean;
  showPoints?: boolean;
  duration?: number;
}

export default function ConfidenceBand({
  series = DEFAULT_SERIES,
  title = "Success rate vs. training steps",
  caption = "Shaded region is ±1 standard error across 5 seeds.",
  source = "",
  xLabel = "Steps (M)",
  yLabel = "Success rate (%)",
  bandOpacity = 0.16,
  lineWidth = 2,
  showGrid = true,
  showLegend = true,
  smooth = true,
  showPoints = false,
  duration = 1100,
}: ConfidenceBandProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ x: number; y: number; xv: number } | null>(null);

  const clean = useMemo(
    () =>
      series
        .filter((s) => s.points && s.points.length > 0)
        .map((s) => ({
          ...s,
          points: [...s.points].sort((a, b) => a.x - b.x),
        })),
    [series],
  );

  const colorOf = (s: BandSeries, i: number) => s.color || p.series[i % p.series.length];

  const { xDomain, yDomain } = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of clean) {
      for (const pt of s.points) {
        xs.push(pt.x);
        ys.push(pt.lo, pt.hi, pt.y);
      }
    }
    const xe = extent(xs);
    const ye = extent(ys);
    return {
      xDomain: [xe[0] ?? 0, xe[1] ?? 1] as [number, number],
      yDomain: [ye[0] ?? 0, ye[1] ?? 1] as [number, number],
    };
  }, [clean]);

  const legendItems: LegendItem[] = clean.map((s, i) => ({
    label: s.name,
    color: colorOf(s, i),
    shape: "line",
  }));

  // Union of all x positions for the hover crosshair.
  const xTicks = useMemo(() => {
    const set = new Set<number>();
    for (const s of clean) for (const pt of s.points) set.add(pt.x);
    return [...set].sort((a, b) => a - b);
  }, [clean]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        {showLegend && legendItems.length > 1 && (
          <Legend items={legendItems} align="center" className="mb-3" />
        )}

        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 14, right: 18, bottom: xLabel ? 44 : 32, left: yLabel ? 54 : 44 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]);
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();
            const curve = smooth ? curveMonotoneX : undefined;

            const makeArea = d3Area<BandPoint>()
              .x((d) => x(d.x))
              .y0((d) => y(d.lo))
              .y1((d) => y(d.hi));
            const makeLine = d3Line<BandPoint>()
              .x((d) => x(d.x))
              .y((d) => y(d.y));
            if (curve) {
              makeArea.curve(curve);
              makeLine.curve(curve);
            }

            const dur = duration / 1000;
            const shown = inView || reduced;

            // Nearest x for hover crosshair.
            let hoverX: number | null = null;
            if (hover && xTicks.length) {
              const xv = hover.xv;
              hoverX = xTicks.reduce((best, t) =>
                Math.abs(t - xv) < Math.abs(best - xv) ? t : best,
              );
            }

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {clean.map((s, i) => (
                    <VerticalFade
                      key={i}
                      id={`cb-fade-${token}-${i}`}
                      color={colorOf(s, i)}
                      from={bandOpacity * 1.7}
                      to={bandOpacity * 0.4}
                    />
                  ))}
                </defs>

                {showGrid && <GridLines scale={y as never} width={inner.width} />}

                {/* Hover crosshair */}
                {hoverX != null && (
                  <line
                    x1={x(hoverX)}
                    x2={x(hoverX)}
                    y1={0}
                    y2={inner.height}
                    stroke={p.borderStrong}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}

                {/* Bands */}
                {clean.map((s, i) => {
                  const d = makeArea(s.points) ?? "";
                  return (
                    <motion.path
                      key={`band-${token}-${i}`}
                      d={d}
                      fill={`url(#cb-fade-${token}-${i})`}
                      stroke={withAlpha(colorOf(s, i), 0.35)}
                      strokeWidth={0.75}
                      initial={reduced ? false : { opacity: 0, scaleY: 0.6 }}
                      animate={{ opacity: shown ? 1 : 0, scaleY: shown ? 1 : 0.6 }}
                      style={{ transformOrigin: `${x(s.points[0].x)}px ${y(yDomain[0])}px` }}
                      transition={{ duration: dur * 0.8, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    />
                  );
                })}

                {/* Center lines */}
                {clean.map((s, i) => {
                  const d = makeLine(s.points) ?? "";
                  return (
                    <motion.path
                      key={`line-${token}-${i}`}
                      d={d}
                      fill="none"
                      stroke={colorOf(s, i)}
                      strokeWidth={lineWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={reduced ? false : { pathLength: 0 }}
                      animate={{ pathLength: shown ? 1 : 0 }}
                      transition={{
                        duration: dur,
                        delay: i * 0.12 + 0.15,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  );
                })}

                {/* Points + hover dots */}
                {clean.map((s, i) => (
                  <g key={`pts-${token}-${i}`}>
                    {s.points.map((pt, j) => {
                      const isHover = hoverX != null && pt.x === hoverX;
                      if (!showPoints && !isHover) return null;
                      return (
                        <motion.circle
                          key={j}
                          cx={x(pt.x)}
                          cy={y(pt.y)}
                          r={isHover ? 4 : 2.5}
                          fill={isHover ? colorOf(s, i) : p.surface}
                          stroke={colorOf(s, i)}
                          strokeWidth={1.5}
                          initial={reduced ? false : { opacity: 0 }}
                          animate={{ opacity: shown ? 1 : 0 }}
                          transition={{ delay: i * 0.12 + 0.15 + dur * 0.6 }}
                        />
                      );
                    })}
                  </g>
                ))}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label={yLabel}
                  format={(v) => formatCompact(v)}
                />
                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={(v) => formatCompact(v)}
                />
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

                {/* Hover capture overlay */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                    const r = svg.getBoundingClientRect();
                    const localX = e.clientX - r.left - margin.left;
                    setHover({
                      x: e.clientX - r.left,
                      y: e.clientY - r.top,
                      xv: x.invert(localX),
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null &&
            (() => {
              const xv = hover.xv;
              const nearest =
                xTicks.length > 0
                  ? xTicks.reduce((best, t) =>
                      Math.abs(t - xv) < Math.abs(best - xv) ? t : best,
                    )
                  : null;
              if (nearest == null) return null;
              return (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {(xLabel || "x")}: {formatCompact(nearest, 2)}
                  </div>
                  {clean.map((s, i) => {
                    const pt = s.points.find((q) => q.x === nearest);
                    if (!pt) return null;
                    return (
                      <TooltipRow
                        key={i}
                        label={s.name}
                        value={
                          <span className="tabular-nums">
                            {formatCompact(pt.y, 2)}
                            <span className="opacity-60">
                              {" "}
                              [{formatCompact(pt.lo, 2)}, {formatCompact(pt.hi, 2)}]
                            </span>
                          </span>
                        }
                      />
                    );
                  })}
                </>
              );
            })()}
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
  id: "confidence-band",
  name: "Confidence Band",
  category: "statistical",
  description:
    "A central trend line wrapped in a shaded confidence/standard-error band, with multiple series and a smooth reveal of band then line.",
  tags: ["confidence", "uncertainty", "standard-error", "learning-curve", "line", "area"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ConfidenceBand",
  sourcePath: "statistical/ConfidenceBand",
  aspect: 16 / 10,
  controls: [
    {
      key: "series",
      label: "Series",
      type: "json",
      group: "Data",
      help: "Array of { name, points: [{ x, y, lo, hi }], color? }.",
      default: DEFAULT_SERIES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Success rate vs. training steps" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "Shaded region is ±1 standard error across 5 seeds." },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Steps (M)" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Success rate (%)" },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Layout", default: true },
    { key: "showLegend", label: "Show legend", type: "boolean", group: "Layout", default: true },
    { key: "showPoints", label: "Show points", type: "boolean", group: "Layout", default: false },
    { key: "smooth", label: "Smooth curve", type: "boolean", group: "Style", default: true },
    { key: "bandOpacity", label: "Band opacity", type: "number", group: "Style", default: 0.16, min: 0.03, max: 0.5, step: 0.01 },
    { key: "lineWidth", label: "Line width", type: "number", group: "Style", default: 2, min: 1, max: 5, step: 0.5 },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "learning-curve",
      name: "Learning curve (±1 SE)",
      props: {
        title: "Sample efficiency, ±1 SE over 5 seeds",
        xLabel: "Steps (M)",
        yLabel: "Success rate (%)",
        caption: "Shaded region is ±1 standard error across 5 seeds.",
        series: LEARNING_CURVE,
        showPoints: true,
      },
    },
    {
      id: "two-method",
      name: "Method comparison",
      props: {
        title: "PPO vs. SAC on dexterous manipulation",
        xLabel: "Steps (M)",
        yLabel: "Success rate (%)",
        caption: "Mean and ±1 SE bands across 5 random seeds.",
        series: DEFAULT_SERIES,
      },
    },
    {
      id: "tight",
      name: "Tight band, no smoothing",
      props: {
        title: "Validation loss with bootstrap CI",
        xLabel: "Epoch",
        yLabel: "Loss",
        caption: "",
        smooth: false,
        bandOpacity: 0.22,
        showPoints: true,
        series: [
          {
            name: "loss",
            points: [
              { x: 1, y: 2.41, lo: 2.34, hi: 2.49 },
              { x: 2, y: 1.78, lo: 1.7, hi: 1.86 },
              { x: 3, y: 1.39, lo: 1.32, hi: 1.46 },
              { x: 4, y: 1.12, lo: 1.06, hi: 1.19 },
              { x: 5, y: 0.95, lo: 0.89, hi: 1.01 },
              { x: 6, y: 0.84, lo: 0.79, hi: 0.9 },
              { x: 7, y: 0.77, lo: 0.72, hi: 0.83 },
              { x: 8, y: 0.73, lo: 0.68, hi: 0.79 },
              { x: 9, y: 0.71, lo: 0.66, hi: 0.77 },
              { x: 10, y: 0.7, lo: 0.64, hi: 0.76 },
            ],
          },
        ],
      },
    },
  ],
};
