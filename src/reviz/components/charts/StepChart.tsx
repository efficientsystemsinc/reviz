"use client";

import { max, min } from "d3-array";
import { scaleLinear } from "d3-scale";
import {
  area as d3area,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  line as d3line,
} from "d3-shape";
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

type StepType = "before" | "after" | "middle";

// A learning-rate warmup + cosine-decay-with-restarts schedule, quantized into
// discrete phases — the canonical use case for a staircase chart.
const LR_SCHEDULE = [
  0.0, 0.0003, 0.0006, 0.001, 0.001, 0.001, 0.00092, 0.00078, 0.0006, 0.00042,
  0.00028, 0.0002, 0.001, 0.00088, 0.0007, 0.0005, 0.00034, 0.00022, 0.00014, 0.0001,
];

const DEFAULT_SERIES: Series[] = [{ name: "LR", data: LR_SCHEDULE }];

export interface StepChartProps {
  series?: Series[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  stepType?: StepType;
  showArea?: boolean;
  color?: string;
  duration?: number;
}

export default function StepChart({
  series = DEFAULT_SERIES,
  title = "Learning-rate schedule",
  caption = "",
  source = "",
  yLabel = "LR",
  stepType = "after",
  showArea = true,
  color = "",
  duration = 1100,
}: StepChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  // `px` is the pixel x within the plot area (for crosshair + tooltip
  // placement); `idx` is the nearest data index (for the readout).
  const [hover, setHover] = useState<{ px: number; idx: number } | null>(null);
  const gid = useMemo(() => uid("step"), []);

  // Resolve a color per series: the first can be overridden by `color`.
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

  const curve =
    stepType === "before"
      ? curveStepBefore
      : stepType === "middle"
        ? curveStep
        : curveStepAfter;

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

            const hoverIdx = hover == null ? null : hover.idx;
            const drawDur = (duration / 1000) * 0.78;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {series.map((_, i) => (
                    <VerticalFade key={i} id={`${gid}-fade-${i}`} color={colorOf(i)} from={0.24} to={0} />
                  ))}
                </defs>

                <GridLines scale={y as never} width={inner.width} count={5} />

                {/* Area fills (drawn behind the steps), staggered fade-in. */}
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

                {/* Staircase paths: left-to-right draw via pathLength. */}
                {series.map((s, i) => {
                  const d = lineGen(s.data);
                  if (!d) return null;
                  return (
                    <motion.path
                      key={`${gid}-step-${i}-${token}`}
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
                          delay: reduced ? 0 : i * 0.12,
                          ease: [0.4, 0, 0.2, 1],
                        },
                        opacity: { duration: reduced ? 0 : 0.2, delay: reduced ? 0 : i * 0.12 },
                      }}
                    />
                  );
                })}

                {/* Vertex dots at each quantized sample, landing after the steps. */}
                {series.map((s, i) =>
                  s.data.map((v, j) =>
                    Number.isFinite(v) ? (
                      <motion.circle
                        key={`${gid}-pt-${i}-${j}-${token}`}
                        cx={x(j)}
                        cy={y(v)}
                        r={2.4}
                        fill={p.surface}
                        stroke={colorOf(i)}
                        strokeWidth={1.5}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: draw ? 1 : 0, scale: draw ? 1 : 0 }}
                        transition={{
                          duration: reduced ? 0 : 0.26,
                          delay: reduced ? 0 : drawDur * (j / Math.max(1, span - 1)) + i * 0.12,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    ) : null,
                  ),
                )}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label={yLabel} format={(v) => formatCompact(v, 3)} />
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
                        <span className="font-medium tabular-nums">{formatCompact(s.data[hi], 4)}</span>
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

// A staircase reward curve for staged RL training — discrete reward thresholds.
const RL_REWARD = [
  0.12, 0.12, 0.31, 0.31, 0.31, 0.48, 0.48, 0.48, 0.48, 0.63, 0.63, 0.63, 0.74,
  0.74, 0.74, 0.74, 0.81, 0.81, 0.86, 0.86,
];

export const meta: RevizMeta = {
  id: "step-chart",
  name: "Step Chart",
  category: "charts",
  description:
    "A staircase (step) line chart for discrete or quantized series — learning-rate schedules, staged rewards, piecewise constants — with optional area fill, animated draw-on, and a hover crosshair.",
  tags: ["step", "staircase", "schedule", "quantized", "piecewise", "learning-rate"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "StepChart",
  sourcePath: "charts/StepChart",
  aspect: 16 / 9,
  controls: [
    {
      key: "series",
      label: "Series",
      type: "series",
      group: "Data",
      default: DEFAULT_SERIES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Learning-rate schedule" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "LR" },
    {
      key: "stepType",
      label: "Step placement",
      type: "select",
      group: "Layout",
      default: "after",
      options: [
        { label: "Before", value: "before" },
        { label: "After", value: "after" },
        { label: "Middle", value: "middle" },
      ],
    },
    { key: "showArea", label: "Area fill", type: "boolean", group: "Style", default: true },
    { key: "color", label: "First series color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "lr-schedule",
      name: "LR schedule",
      props: {
        title: "Learning-rate schedule",
        yLabel: "LR",
        stepType: "after",
        showArea: true,
        series: DEFAULT_SERIES,
        caption: "Warmup, cosine decay, and a mid-run restart — held constant within each phase.",
      },
    },
    {
      id: "staged-reward",
      name: "Staged reward",
      props: {
        title: "Curriculum reward thresholds",
        yLabel: "Reward",
        stepType: "after",
        showArea: false,
        series: [{ name: "Reward", data: RL_REWARD }],
      },
    },
    {
      id: "midstep",
      name: "Mid-step quantiles",
      props: {
        title: "Quantized policy entropy",
        yLabel: "H(π)",
        stepType: "middle",
        showArea: true,
        series: [
          { name: "Entropy", data: [1.8, 1.8, 1.55, 1.55, 1.32, 1.32, 1.14, 1.14, 1.0, 1.0, 0.9, 0.9, 0.84, 0.84] },
        ],
      },
    },
  ],
};
