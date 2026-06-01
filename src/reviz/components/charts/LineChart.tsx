"use client";

import { max, min } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area as d3area, curveLinear, curveMonotoneX, line as d3line } from "d3-shape";
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
  VerticalFade,
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

interface Series {
  name: string;
  data: number[];
  color?: string;
}

const DEFAULT_SERIES: Series[] = [
  { name: "Pretrain", data: [1.92, 1.61, 1.4, 1.27, 1.18, 1.11, 1.06, 1.02, 0.99, 0.96, 0.94, 0.93] },
  { name: "Instruct", data: [1.88, 1.52, 1.29, 1.14, 1.04, 0.97, 0.92, 0.88, 0.85, 0.83, 0.81, 0.8] },
  { name: "RLHF", data: [1.85, 1.45, 1.2, 1.04, 0.93, 0.86, 0.81, 0.77, 0.74, 0.72, 0.7, 0.69] },
];

export interface LineChartProps {
  series: Series[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  smooth?: boolean;
  showArea?: boolean;
  showMarkers?: boolean;
  color?: string;
  duration?: number;
}

export default function LineChart({
  series = DEFAULT_SERIES,
  title = "Validation loss across training recipes",
  caption = "",
  source = "",
  yLabel = "Val loss",
  smooth = true,
  showArea = false,
  showMarkers = false,
  color = "",
  duration = 1100,
}: LineChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  // Hover state: `px` is the pixel x within the plot area (for crosshair +
  // tooltip placement); `idx` is the nearest data index (for the readout).
  const [hover, setHover] = useState<{ px: number; idx: number } | null>(null);
  const gid = useMemo(() => uid("line"), []);

  // Resolve a color per series: first series can be overridden by `color`.
  const colorOf = (i: number) =>
    i === 0 && color ? color : series[i]?.color || p.series[i % p.series.length];

  // Longest series defines the x-domain length.
  const span = useMemo(
    () => Math.max(2, ...series.map((s) => s.data.length)),
    [series],
  );

  const yDomain = useMemo(() => {
    const all = series.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
    if (all.length === 0) return [0, 1] as [number, number];
    const lo = Math.min(0, min(all) ?? 0);
    const hi = max(all) ?? 1;
    return [lo, hi === lo ? lo + 1 : hi] as [number, number];
  }, [series]);

  const legendItems: LegendItem[] = series.map((s, i) => ({
    label: s.name,
    color: colorOf(i),
    shape: "line",
  }));

  const draw = reduced ? 1 : inView ? 1 : 0;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        {series.length > 1 && <Legend items={legendItems} align="center" className="mb-3" />}

        <ResponsiveSvg
          aspect={16 / 9}
          margin={{ top: 14, right: 18, bottom: 30, left: yLabel ? 54 : 42 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain([0, span - 1]).range([0, inner.width]);
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();
            const curve = smooth ? curveMonotoneX : curveLinear;

            const lineGen = d3line<number>()
              .x((_, i) => x(i))
              .y((d) => y(d))
              .defined((d) => Number.isFinite(d))
              .curve(curve);

            const areaGen = d3area<number>()
              .x((_, i) => x(i))
              .y0(inner.height)
              .y1((d) => y(d))
              .defined((d) => Number.isFinite(d))
              .curve(curve);

            // Nearest x-index under the hovered cursor.
            const hoverIdx = hover == null ? null : hover.idx;

            const drawDur = (duration / 1000) * 0.78;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {series.map((_, i) => (
                    <VerticalFade key={i} id={`${gid}-fade-${i}`} color={colorOf(i)} from={0.26} to={0} />
                  ))}
                </defs>

                <GridLines scale={y as never} width={inner.width} count={5} />

                {/* Area fills (drawn behind lines), staggered fade-in. */}
                {showArea &&
                  series.map((s, i) => {
                    const d = areaGen(s.data);
                    if (!d) return null;
                    return (
                      <motion.path
                        key={`${gid}-area-${i}-${token}`}
                        d={d}
                        fill={`url(#${gid}-fade-${i})`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? 1 : 0 }}
                        transition={{
                          duration: reduced ? 0 : drawDur * 0.7,
                          delay: reduced ? 0 : drawDur * 0.55 + i * 0.08,
                          ease: "easeOut",
                        }}
                      />
                    );
                  })}

                {/* Lines: left-to-right draw via pathLength. */}
                {series.map((s, i) => {
                  const d = lineGen(s.data);
                  if (!d) return null;
                  const stroke = colorOf(i);
                  return (
                    <motion.path
                      key={`${gid}-line-${i}-${token}`}
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: draw, opacity: draw ? 1 : 0 }}
                      transition={{
                        pathLength: {
                          duration: reduced ? 0 : drawDur,
                          delay: reduced ? 0 : i * 0.12,
                          ease: [0.4, 0, 0.2, 1],
                        },
                        opacity: { duration: reduced ? 0 : 0.2, delay: reduced ? 0 : i * 0.12 },
                      }}
                    />
                  );
                })}

                {/* Point markers, fading in after the line lands. */}
                {showMarkers &&
                  series.map((s, i) =>
                    s.data.map((v, j) =>
                      Number.isFinite(v) ? (
                        <motion.circle
                          key={`${gid}-pt-${i}-${j}-${token}`}
                          cx={x(j)}
                          cy={y(v)}
                          r={2.6}
                          fill={p.surface}
                          stroke={colorOf(i)}
                          strokeWidth={1.6}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: draw ? 1 : 0, scale: draw ? 1 : 0 }}
                          transition={{
                            duration: reduced ? 0 : 0.28,
                            delay: reduced ? 0 : drawDur * (j / Math.max(1, span - 1)) + i * 0.12,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                      ) : null,
                    ),
                  )}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label={yLabel} format={(v) => formatCompact(v)} />
                <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => formatCompact(v)} linearCount={Math.min(8, span)} />

                {/* Hover crosshair + per-series readout dots. */}
                <AnimatePresence>
                  {hoverIdx != null && (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <line
                        x1={x(hoverIdx)}
                        x2={x(hoverIdx)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.borderStrong}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        shapeRendering="crispEdges"
                      />
                      {series.map((s, i) => {
                        const v = s.data[hoverIdx];
                        if (!Number.isFinite(v)) return null;
                        return (
                          <g key={`${gid}-hov-${i}`}>
                            <circle cx={x(hoverIdx)} cy={y(v)} r={6} fill={withAlpha(colorOf(i), 0.18)} />
                            <circle cx={x(hoverIdx)} cy={y(v)} r={3.5} fill={colorOf(i)} stroke={p.surface} strokeWidth={1.5} />
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
                    const idx = Math.max(0, Math.min(span - 1, Math.round(x.invert(px))));
                    setHover({ px, idx });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        {(() => {
          const hi = hover == null ? null : hover.idx;
          return (
            <FloatingTooltip
              x={(hover?.px ?? 0) + (yLabel ? 54 : 42)}
              y={28}
              visible={hi != null}
            >
              {hi != null && (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    step {hi}
                  </div>
                  {series.map((s, i) =>
                    Number.isFinite(s.data[hi]) ? (
                      <div key={s.name} className="flex items-baseline justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                          <span
                            className="inline-block h-[2px] w-3 rounded-full align-middle"
                            style={{ background: colorOf(i) }}
                          />
                          {s.name}
                        </span>
                        <span className="font-medium tabular-nums">{formatCompact(s.data[hi], 2)}</span>
                      </div>
                    ) : null,
                  )}
                </>
              )}
            </FloatingTooltip>
          );
        })()}

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
    </Figure>
  );
}

const TRAIN_LOSS = Array.from({ length: 40 }, (_, i) => {
  const t = i / 39;
  return Number((3.4 * Math.exp(-3.1 * t) + 0.32 + 0.05 * Math.cos(i * 0.9) * (1 - t)).toFixed(3));
});

export const meta: RevizMeta = {
  id: "line-chart",
  name: "Line Chart",
  category: "charts",
  description:
    "A multi-series line chart that draws on left-to-right with optional area fills, point markers, and a hover crosshair reading every series at once.",
  tags: ["line", "trend", "time-series", "training-curve", "comparison"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "LineChart",
  sourcePath: "charts/LineChart",
  aspect: 16 / 9,
  controls: [
    {
      key: "series",
      label: "Series",
      type: "series",
      group: "Data",
      default: DEFAULT_SERIES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Validation loss across training recipes" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Val loss" },
    { key: "smooth", label: "Smooth curve", type: "boolean", group: "Style", default: true },
    { key: "showArea", label: "Area fill", type: "boolean", group: "Style", default: false },
    { key: "showMarkers", label: "Point markers", type: "boolean", group: "Style", default: false },
    { key: "color", label: "First series color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "training-loss",
      name: "Training loss",
      props: {
        title: "Training loss",
        yLabel: "Loss",
        showArea: true,
        smooth: true,
        series: [{ name: "Loss", data: TRAIN_LOSS }],
        caption: "Cross-entropy loss decays smoothly over 40k optimizer steps.",
      },
    },
    {
      id: "comparison",
      name: "Recipe comparison",
      props: {
        title: "Validation loss across training recipes",
        yLabel: "Val loss",
        showMarkers: true,
        smooth: true,
      },
    },
  ],
};
