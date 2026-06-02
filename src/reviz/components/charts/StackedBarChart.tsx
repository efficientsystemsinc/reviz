"use client";

import { scaleBand, scaleLinear } from "d3-scale";
import { stack as d3Stack, stackOrderNone, stackOffsetNone } from "d3-shape";
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
  formatCompact,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/** One series: a name, an ordered value per category, and an optional color. */
interface SeriesDatum {
  name: string;
  data: number[];
  color?: string;
}

export interface StackedBarChartProps {
  categories: string[];
  series: SeriesDatum[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  colors?: string[];
  cornerRadius?: number;
  barGap?: number;
  showValues?: boolean;
  showGrid?: boolean;
  duration?: number;
}

const DEFAULT_CATEGORIES = ["Perception", "Planning", "Control", "Recovery", "Idle"];

const DEFAULT_SERIES: SeriesDatum[] = [
  { name: "Reasoning", data: [38, 52, 21, 44, 9] },
  { name: "Retrieval", data: [27, 19, 12, 23, 6] },
  { name: "Tool calls", data: [18, 14, 31, 17, 4] },
  { name: "Idle wait", data: [11, 8, 22, 14, 38] },
];

export default function StackedBarChart({
  categories = DEFAULT_CATEGORIES,
  series = DEFAULT_SERIES,
  title = "Compute budget per agent phase",
  caption = "",
  source = "",
  yLabel = "Tokens (k)",
  colors = [],
  cornerRadius = 4,
  barGap = 0.38,
  showValues = true,
  showGrid = true,
  duration = 900,
}: StackedBarChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ c: number; s: number; x: number; y: number } | null>(null);

  const colorOf = (i: number) => series[i]?.color || colors[i] || p.series[i % p.series.length];

  // Build a row per category, keyed by series name, for d3.stack.
  const rows = useMemo(
    () =>
      categories.map((label, ci) => {
        const row: Record<string, number> = { __label: ci };
        for (const s of series) row[s.name] = s.data?.[ci] ?? 0;
        return row;
      }),
    [categories, series],
  );

  // Stacked layout: for each series, [y0, y1] offsets per category.
  const stacked = useMemo(() => {
    const gen = d3Stack<Record<string, number>>()
      .keys(series.map((s) => s.name))
      .order(stackOrderNone)
      .offset(stackOffsetNone);
    return gen(rows);
  }, [series, rows]);

  const totals = useMemo(
    () => categories.map((_, ci) => series.reduce((sum, s) => sum + (s.data?.[ci] ?? 0), 0)),
    [categories, series],
  );

  const maxTotal = useMemo(() => Math.max(1, ...totals), [totals]);

  const legendItems: LegendItem[] = series.map((s, i) => ({
    label: s.name,
    color: colorOf(i),
    shape: "square",
  }));

  const play = inView || reduced;
  // Honor reduced-motion: snap to the final state with no draw-in.
  const dur = reduced ? 0 : duration / 1000;
  const stagger = reduced ? 0 : 0.06;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 16, right: 18, bottom: 46, left: yLabel ? 54 : 42 }}
        >
          {({ inner, margin }) => {
            const y = scaleLinear().domain([0, maxTotal]).range([inner.height, 0]).nice();
            const x = scaleBand<string>()
              .domain(categories)
              .range([0, inner.width])
              .padding(barGap);

            const bw = x.bandwidth();
            const radius = Math.min(cornerRadius, bw / 2);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {showGrid && <GridLines scale={y as never} width={inner.width} count={5} />}

                {categories.map((label, ci) => {
                  const cx = x(label) ?? 0;
                  // Index of the topmost non-zero segment, so only it gets rounded top corners.
                  let topSeg = -1;
                  for (let si = series.length - 1; si >= 0; si--) {
                    if ((series[si]?.data?.[ci] ?? 0) > 0) {
                      topSeg = si;
                      break;
                    }
                  }

                  return (
                    <g key={label} transform={`translate(${cx}, 0)`}>
                      {series.map((s, si) => {
                        const seg = stacked[si]?.[ci];
                        if (!seg) return null;
                        const [y0, y1] = seg;
                        const v = y1 - y0;
                        if (v <= 0) return null;

                        const top = y(y1);
                        const h = Math.max(0, y(y0) - y(y1));
                        const fill = colorOf(si);
                        const active = hover?.c === ci && hover?.s === si;
                        const dim = hover != null && !active;
                        const isTop = si === topSeg;
                        // Stack from the bottom up, then advance to the next category.
                        const delay = (ci * series.length + si) * stagger;

                        return (
                          <g key={s.name}>
                            {/* Rounded-top topmost segment, square interior segments. */}
                            <motion.rect
                              x={0}
                              width={bw}
                              rx={isTop ? radius : 0}
                              fill={fill}
                              initial={{ height: 0, y: inner.height }}
                              animate={{
                                height: play ? h : 0,
                                y: play ? top : inner.height,
                                opacity: dim ? 0.32 : 1,
                              }}
                              transition={{
                                height: { duration: dur, delay, ease: [0.22, 1, 0.36, 1] },
                                y: { duration: dur, delay, ease: [0.22, 1, 0.36, 1] },
                                opacity: { duration: reduced ? 0 : 0.18 },
                              }}
                              key={`${token}-${ci}-${si}`}
                              onMouseMove={(e) => {
                                const r = (
                                  e.currentTarget.ownerSVGElement as SVGSVGElement
                                ).getBoundingClientRect();
                                setHover({ c: ci, s: si, x: e.clientX - r.left, y: e.clientY - r.top });
                              }}
                              onMouseLeave={() => setHover(null)}
                            />
                            {/* Hairline divider above each interior segment for crisp banding. */}
                            {!isTop && h > 0 && (
                              <motion.line
                                x1={0}
                                x2={bw}
                                y1={top}
                                y2={top}
                                stroke={p.surface}
                                strokeWidth={1}
                                shapeRendering="crispEdges"
                                pointerEvents="none"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: play ? 0.6 : 0 }}
                                transition={{ delay: reduced ? 0 : delay + dur * 0.6, duration: reduced ? 0 : 0.2 }}
                              />
                            )}
                            {active && (
                              <rect
                                x={0}
                                y={top}
                                width={bw}
                                height={h}
                                rx={isTop ? radius : 0}
                                fill="none"
                                stroke={p.ink}
                                strokeWidth={1.25}
                                pointerEvents="none"
                              />
                            )}
                            {/* In-segment value label, shown when the segment is tall enough. */}
                            {showValues && h > 16 && (
                              <motion.text
                                x={bw / 2}
                                y={top + h / 2}
                                dy="0.32em"
                                textAnchor="middle"
                                fill={withAlpha(p.canvas, 0.92)}
                                className="font-mono text-[9.5px] tabular-nums"
                                pointerEvents="none"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: play ? 1 : 0 }}
                                transition={{
                                  delay: reduced ? 0 : delay + duration / 1400,
                                  duration: reduced ? 0 : 0.3,
                                }}
                              >
                                {formatCompact(v)}
                              </motion.text>
                            )}
                          </g>
                        );
                      })}

                      {/* Stack total above each bar. */}
                      {showValues && (
                        <motion.text
                          x={bw / 2}
                          y={y(totals[ci]) - 7}
                          textAnchor="middle"
                          fill={p.inkMuted}
                          className="font-mono text-[10px] tabular-nums"
                          pointerEvents="none"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: play ? 1 : 0 }}
                          transition={{
                            delay: reduced ? 0 : (ci * series.length + series.length) * stagger + duration / 1400,
                            duration: reduced ? 0 : 0.3,
                          }}
                        >
                          {formatCompact(totals[ci])}
                        </motion.text>
                      )}
                    </g>
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label={yLabel} />
                <AxisBottom scale={x as never} y={inner.height} rotate={categories.length > 6 ? -28 : 0} />
              </g>
            );
          }}
        </ResponsiveSvg>

        <div className="mt-3">
          <Legend items={legendItems} align="center" />
        </div>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1.5 flex items-baseline justify-between gap-4 font-mono text-[10px] uppercase tracking-wide opacity-70">
                <span>{categories[hover.c]}</span>
                <span className="tabular-nums">Σ {formatCompact(totals[hover.c], 2)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-[2px]"
                  style={{ background: colorOf(hover.s) }}
                />
                <div className="flex-1">
                  <TooltipRow
                    label={series[hover.s]?.name ?? ""}
                    value={formatCompact(series[hover.s]?.data?.[hover.c] ?? 0, 2)}
                  />
                </div>
              </div>
            </>
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
  id: "stacked-bar-chart",
  name: "Stacked Bar Chart",
  category: "charts",
  description:
    "Vertical bars where each category is a stack of series segments — composition and total at a glance, with bottom-up grow-in and per-segment hover tooltips.",
  tags: ["bar", "stacked", "composition", "categorical", "breakdown", "part-to-whole"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "StackedBarChart",
  sourcePath: "charts/StackedBarChart",
  aspect: 16 / 10,
  controls: [
    {
      key: "categories",
      label: "Categories",
      type: "json",
      group: "Data",
      help: "Ordered category labels (one bar each).",
      default: DEFAULT_CATEGORIES,
    },
    {
      key: "series",
      label: "Series",
      type: "series",
      group: "Data",
      help: "Each series stacks bottom→top; data[i] aligns with categories[i].",
      default: DEFAULT_SERIES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Compute budget per agent phase" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Tokens (k)" },
    { key: "colors", label: "Series colors", type: "colorArray", group: "Style", default: [] },
    { key: "showValues", label: "Show values", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "cornerRadius", label: "Corner radius", type: "number", group: "Style", default: 4, min: 0, max: 12, step: 1 },
    { key: "barGap", label: "Bar gap", type: "number", group: "Layout", default: 0.38, min: 0.05, max: 0.8, step: 0.01 },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 900, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "compute-budget",
      name: "Compute budget by phase",
      props: {
        title: "Compute budget per agent phase",
        yLabel: "Tokens (k)",
        categories: DEFAULT_CATEGORIES,
        series: DEFAULT_SERIES,
      },
    },
    {
      id: "error-breakdown",
      name: "Error composition by model",
      props: {
        title: "Failure composition across models",
        yLabel: "Failures (per 1k)",
        categories: ["Atlas-3", "Aria-L", "Nova-2", "Vega-4", "Lyra-L"],
        series: [
          { name: "Hallucination", data: [22, 14, 19, 31, 28] },
          { name: "Refusal", data: [9, 12, 7, 6, 11] },
          { name: "Format error", data: [14, 8, 12, 21, 17] },
          { name: "Timeout", data: [5, 4, 9, 13, 8] },
        ],
      },
    },
    {
      id: "dataset-mix",
      name: "Pretraining data mix",
      props: {
        title: "Pretraining token mix by corpus",
        yLabel: "Tokens (B)",
        showValues: false,
        cornerRadius: 6,
        categories: ["v1", "v2", "v3", "v4"],
        series: [
          { name: "Web", data: [420, 510, 640, 720] },
          { name: "Code", data: [80, 140, 230, 360] },
          { name: "Books", data: [60, 70, 90, 110] },
          { name: "Math", data: [20, 45, 90, 160] },
          { name: "Multilingual", data: [40, 80, 150, 240] },
        ],
      },
    },
  ],
};
