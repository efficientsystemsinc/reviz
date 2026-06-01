"use client";

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
  Legend,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/** One category group: a label plus a value per series name. */
interface GroupDatum {
  label: string;
  values: Record<string, number>;
}

export interface GroupedBarChartProps {
  data: GroupDatum[];
  seriesNames: string[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  colors?: string[];
  cornerRadius?: number;
  groupGap?: number;
  barGap?: number;
  showValues?: boolean;
  showGrid?: boolean;
  duration?: number;
}

const DEFAULT_DATA: GroupDatum[] = [
  { label: "Stack Cubes", values: { "Base policy": 41, "+ RL finetune": 78 } },
  { label: "Open Drawer", values: { "Base policy": 56, "+ RL finetune": 88 } },
  { label: "Pour Cup", values: { "Base policy": 34, "+ RL finetune": 71 } },
  { label: "Fold Cloth", values: { "Base policy": 22, "+ RL finetune": 59 } },
  { label: "Insert Plug", values: { "Base policy": 48, "+ RL finetune": 83 } },
];

const DEFAULT_SERIES = ["Base policy", "+ RL finetune"];

export default function GroupedBarChart({
  data = DEFAULT_DATA,
  seriesNames = DEFAULT_SERIES,
  title = "Success rate by manipulation task",
  caption = "",
  source = "",
  yLabel = "Success rate (%)",
  colors = [],
  cornerRadius = 4,
  groupGap = 0.26,
  barGap = 0.16,
  showValues = true,
  showGrid = true,
  duration = 900,
}: GroupedBarChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ g: number; s: number; x: number; y: number } | null>(null);

  // Resolve series list: explicit prop, else derived from the data keys.
  const series = useMemo(() => {
    if (seriesNames.length) return seriesNames;
    const seen: string[] = [];
    for (const d of data) for (const k of Object.keys(d.values ?? {})) if (!seen.includes(k)) seen.push(k);
    return seen;
  }, [seriesNames, data]);

  const colorOf = (i: number) => colors[i] || p.series[i % p.series.length];

  const maxValue = useMemo(() => {
    let m = 0;
    for (const d of data) for (const s of series) m = Math.max(m, d.values?.[s] ?? 0);
    return Math.max(1, m);
  }, [data, series]);

  const legendItems: LegendItem[] = series.map((name, i) => ({
    label: name,
    color: colorOf(i),
    shape: "square",
  }));

  const play = inView || reduced;
  // Honor reduced-motion: snap to the final state with no draw-in.
  const dur = reduced ? 0 : duration / 1000;
  const stagger = reduced ? 0 : 0.05;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 16, right: 18, bottom: 46, left: yLabel ? 54 : 42 }}
        >
          {({ inner, margin }) => {
            const y = scaleLinear().domain([0, maxValue]).range([inner.height, 0]).nice();
            const x0 = scaleBand<string>()
              .domain(data.map((d) => d.label))
              .range([0, inner.width])
              .paddingInner(groupGap)
              .paddingOuter(groupGap / 2);
            const x1 = scaleBand<string>()
              .domain(series.map((_, i) => String(i)))
              .range([0, x0.bandwidth()])
              .padding(barGap);

            const bw = x1.bandwidth();

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {showGrid && <GridLines scale={y as never} width={inner.width} count={5} />}

                {data.map((d, gi) => {
                  const gx = x0(d.label) ?? 0;
                  return (
                    <g key={d.label} transform={`translate(${gx}, 0)`}>
                      {series.map((name, si) => {
                        const v = d.values?.[name] ?? 0;
                        const bx = x1(String(si)) ?? 0;
                        const top = y(v);
                        const h = inner.height - top;
                        const fill = colorOf(si);
                        const active = hover?.g === gi && hover?.s === si;
                        const dim = hover != null && !active;
                        // Stagger: groups left→right, then series within a group.
                        const delay = (gi * series.length + si) * stagger;

                        return (
                          <g key={name}>
                            <motion.rect
                              x={bx}
                              width={bw}
                              rx={Math.min(cornerRadius, bw / 2)}
                              fill={fill}
                              initial={{ height: 0, y: inner.height }}
                              animate={{
                                height: play ? h : 0,
                                y: play ? top : inner.height,
                                opacity: dim ? 0.35 : 1,
                              }}
                              transition={{
                                height: { duration: dur, delay, ease: [0.22, 1, 0.36, 1] },
                                y: { duration: dur, delay, ease: [0.22, 1, 0.36, 1] },
                                opacity: { duration: reduced ? 0 : 0.18 },
                              }}
                              key={`${token}-${gi}-${si}`}
                              onMouseMove={(e) => {
                                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                                setHover({ g: gi, s: si, x: e.clientX - r.left, y: e.clientY - r.top });
                              }}
                              onMouseLeave={() => setHover(null)}
                            />
                            {active && (
                              <rect
                                x={bx}
                                y={top}
                                width={bw}
                                height={h}
                                rx={Math.min(cornerRadius, bw / 2)}
                                fill="none"
                                stroke={p.ink}
                                strokeWidth={1.25}
                                pointerEvents="none"
                              />
                            )}
                            {showValues && (
                              <motion.text
                                x={bx + bw / 2}
                                y={top - 6}
                                textAnchor="middle"
                                fill={p.inkMuted}
                                className="font-mono text-[9.5px] tabular-nums"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: play ? 1 : 0 }}
                                transition={{ delay: reduced ? 0 : delay + duration / 1400, duration: reduced ? 0 : 0.3 }}
                              >
                                {formatCompact(v)}
                              </motion.text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label={yLabel} />
                <AxisBottom scale={x0 as never} y={inner.height} rotate={data.length > 5 ? -28 : 0} />
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
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {data[hover.g].label}
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-[2px]"
                  style={{ background: colorOf(hover.s) }}
                />
                <div className="flex-1">
                  <TooltipRow
                    label={series[hover.s]}
                    value={formatCompact(data[hover.g].values?.[series[hover.s]] ?? 0, 2)}
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
  id: "grouped-bar-chart",
  name: "Grouped Bar Chart",
  category: "charts",
  description:
    "Clustered bars that line up multiple series per category, with a legend, staggered grow-in, and hover tooltips — the canonical A/B-across-tasks comparison.",
  tags: ["bar", "grouped", "clustered", "comparison", "ablation", "categorical"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "GroupedBarChart",
  sourcePath: "charts/GroupedBarChart",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Groups",
      type: "json",
      group: "Data",
      help: "Array of { label, values: { seriesName: number } }.",
      default: DEFAULT_DATA,
    },
    {
      key: "seriesNames",
      label: "Series names",
      type: "json",
      group: "Data",
      help: "Ordered list of series keys to draw. Empty = infer from data.",
      default: DEFAULT_SERIES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Success rate by manipulation task" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Success rate (%)" },
    { key: "colors", label: "Series colors", type: "colorArray", group: "Style", default: [] },
    { key: "showValues", label: "Show values", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "cornerRadius", label: "Corner radius", type: "number", group: "Style", default: 4, min: 0, max: 12, step: 1 },
    { key: "groupGap", label: "Group gap", type: "number", group: "Layout", default: 0.26, min: 0.05, max: 0.6, step: 0.01 },
    { key: "barGap", label: "Bar gap", type: "number", group: "Layout", default: 0.16, min: 0, max: 0.6, step: 0.01 },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 900, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "rl-finetune",
      name: "RL finetune vs base",
      props: {
        title: "Success rate by manipulation task",
        yLabel: "Success rate (%)",
        data: DEFAULT_DATA,
        seriesNames: DEFAULT_SERIES,
      },
    },
    {
      id: "ablation-3way",
      name: "3-way ablation",
      props: {
        title: "Accuracy across benchmarks",
        yLabel: "Accuracy (%)",
        seriesNames: ["No memory", "+ Retrieval", "+ Tools"],
        data: [
          { label: "MMLU", values: { "No memory": 71, "+ Retrieval": 76, "+ Tools": 79 } },
          { label: "GSM8K", values: { "No memory": 58, "+ Retrieval": 64, "+ Tools": 81 } },
          { label: "HumanEval", values: { "No memory": 62, "+ Retrieval": 67, "+ Tools": 88 } },
          { label: "ARC", values: { "No memory": 80, "+ Retrieval": 83, "+ Tools": 85 } },
        ],
      },
    },
    {
      id: "latency",
      name: "Latency by region",
      props: {
        title: "p95 latency by deployment region",
        yLabel: "Latency (ms)",
        showValues: true,
        seriesNames: ["v1 serving", "v2 serving"],
        data: [
          { label: "us-east", values: { "v1 serving": 184, "v2 serving": 121 } },
          { label: "us-west", values: { "v1 serving": 203, "v2 serving": 134 } },
          { label: "eu-west", values: { "v1 serving": 246, "v2 serving": 158 } },
          { label: "ap-south", values: { "v1 serving": 312, "v2 serving": 196 } },
        ],
      },
    },
  ],
};
