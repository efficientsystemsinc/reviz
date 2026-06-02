"use client";

import { extent } from "d3-array";
import { scaleLinear, scaleSqrt } from "d3-scale";
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
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface Bubble {
  x: number;
  y: number;
  size: number;
  group?: string;
  label?: string;
}

/**
 * Default data: a cost / accuracy / scale frontier across LLM families.
 * x = inference cost ($/1M tokens), y = benchmark accuracy (%), size = params (B).
 */
const DEFAULT_DATA: Bubble[] = [
  { x: 0.5, y: 71.2, size: 8, group: "open", label: "Vega-8B" },
  { x: 0.9, y: 79.5, size: 70, group: "open", label: "Vega-70B" },
  { x: 0.3, y: 68.4, size: 7, group: "open", label: "Lyra-7B" },
  { x: 2.4, y: 84.1, size: 141, group: "open", label: "Lyra-141B" },
  { x: 1.2, y: 82.7, size: 34, group: "open", label: "Orion-34B" },
  { x: 5.0, y: 88.9, size: 175, group: "frontier", label: "Atlas-4" },
  { x: 3.0, y: 87.4, size: 120, group: "frontier", label: "Aria-M" },
  { x: 15.0, y: 91.6, size: 400, group: "frontier", label: "Atlas-4 Pro" },
  { x: 8.0, y: 90.2, size: 280, group: "frontier", label: "Aria-L" },
  { x: 7.0, y: 86.0, size: 60, group: "frontier", label: "Nova-Pro" },
  { x: 0.15, y: 58.3, size: 3, group: "small", label: "Halo-3 mini" },
  { x: 0.2, y: 62.1, size: 4, group: "small", label: "Iris-2B" },
];

export interface BubbleChartProps {
  data: Bubble[];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  sizeLabel?: string;
  maxRadius?: number;
  showGrid?: boolean;
  color?: string;
  duration?: number;
}

const TICK_FONT = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
};

export default function BubbleChart({
  data = DEFAULT_DATA,
  title = "Cost vs. accuracy vs. scale",
  caption = "",
  source = "",
  xLabel = "Inference cost ($/1M tok)",
  yLabel = "Accuracy (%)",
  sizeLabel = "Params (B)",
  maxRadius = 34,
  showGrid = true,
  color = "",
  duration = 1100,
}: BubbleChartProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null);
  const hoverI = hover?.i ?? null;

  // Stable group ordering → palette series ramp.
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

  const xDomain = useMemo(() => {
    const e = extent(data, (d) => d.x) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const pad = (e[1] - e[0]) * 0.08 || 1;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [data]);

  const yDomain = useMemo(() => {
    const e = extent(data, (d) => d.y) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const pad = (e[1] - e[0]) * 0.1 || 1;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [data]);

  const sizeDomain = useMemo(() => {
    const e = extent(data, (d) => d.size) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    return [0, e[1]] as [number, number];
  }, [data]);

  // Radius scale: area-proportional (sqrt) so perception matches magnitude.
  const minRadius = Math.max(3, Math.min(6, maxRadius * 0.18));
  const r = useMemo(
    () => scaleSqrt().domain(sizeDomain).range([minRadius, maxRadius]),
    [sizeDomain, minRadius, maxRadius],
  );

  // Render largest bubbles first so small ones stay clickable on top.
  const order = useMemo(
    () => data.map((_, i) => i).sort((a, b) => data[b].size - data[a].size),
    [data],
  );

  const legendItems: LegendItem[] = groups.map((g) => ({
    label: g,
    color: colorFor(g),
    shape: "circle",
  }));

  // Size legend: three reference radii (max, mid, small).
  const sizeTicks = useMemo(() => {
    const max = sizeDomain[1];
    if (max <= 0) return [] as number[];
    const niceMax = niceRound(max);
    return [niceMax, niceRound(niceMax / 2), niceRound(niceMax / 8)].filter(
      (v, i, arr) => v > 0 && arr.indexOf(v) === i,
    );
  }, [sizeDomain]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={16 / 11}
          margin={{ top: 18, right: 22, bottom: xLabel || yLabel ? 46 : 40, left: yLabel ? 56 : 46 }}
        >
          {({ inner, margin }) => {
            const leftPad = margin.left;
            const topPad = margin.top;
            const x = scaleLinear().domain(xDomain).range([0, inner.width]).nice();
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();

            const baseDelay = 0.12;
            const per = data.length > 0 ? Math.min(0.05, 0.85 / data.length) : 0;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <filter id={`${token}-glow`} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="4" result="b" />
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

                {/* Bubbles — drawn largest-first, scale-in with stagger. */}
                {order.map((i) => {
                  const d = data[i];
                  const cx = x(d.x);
                  const cy = y(d.y);
                  const rad = r(d.size);
                  const c = colorFor(d.group);
                  const active = hoverI === i;
                  const dim = hoverI != null && !active;
                  // Stagger by visual order index, not data index.
                  const orderIdx = order.indexOf(i);
                  return (
                    <motion.circle
                      key={`${token}-${i}`}
                      cx={cx}
                      cy={cy}
                      r={rad}
                      fill={withAlpha(c, active ? 0.42 : dim ? 0.12 : 0.24)}
                      stroke={c}
                      strokeWidth={active ? 2 : 1.4}
                      filter={active ? `url(#${token}-glow)` : undefined}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: inView ? (dim ? 0.5 : 1) : 0,
                        scale: inView ? 1 : 0,
                      }}
                      transition={{
                        opacity: { duration: 0.25 },
                        scale: {
                          duration: reduced ? 0 : Math.min(0.6, duration / 1600),
                          delay: reduced ? 0 : baseDelay + orderIdx * per,
                          ease: [0.34, 1.56, 0.64, 1],
                        },
                      }}
                      style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
                      onMouseEnter={() =>
                        setHover({ i, cx: cx + leftPad, cy: cy + topPad - rad })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}

                {/* Inline label for the hovered bubble. */}
                {hoverI != null && data[hoverI].label && (
                  <text
                    x={x(data[hoverI].x)}
                    y={y(data[hoverI].y) - r(data[hoverI].size) - 6}
                    textAnchor="middle"
                    fill={p.ink}
                    className="tabular-nums"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em" }}
                  >
                    {data[hoverI].label}
                  </text>
                )}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label={yLabel} format={(v) => formatCompact(v)} />
                <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => formatCompact(v)} />

                {xLabel && (
                  <text
                    x={inner.width / 2}
                    y={inner.height + 38}
                    textAnchor="middle"
                    fill={p.inkMuted}
                    style={TICK_FONT}
                  >
                    {xLabel}
                  </text>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.cx ?? 0} y={hover?.cy ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              {data[hover.i].label && (
                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-90">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: colorFor(data[hover.i].group) }}
                  />
                  {data[hover.i].label}
                </div>
              )}
              <TooltipRow label={xLabel || "x"} value={formatCompact(data[hover.i].x, 2)} />
              <TooltipRow label={yLabel || "y"} value={formatCompact(data[hover.i].y, 2)} />
              <TooltipRow label={sizeLabel || "size"} value={formatCompact(data[hover.i].size, 2)} />
              {data[hover.i].group && (
                <TooltipRow label="group" value={data[hover.i].group} />
              )}
            </>
          )}
        </FloatingTooltip>

        {/* Legends: color groups + size reference. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {grouped && <Legend items={legendItems} align="center" />}
          {sizeTicks.length > 0 && (
            <SizeLegend ticks={sizeTicks} r={r} label={sizeLabel} inkColor={p.inkMuted} swatch={p.inkFaint} />
          )}
        </div>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

/** Nested-circle size legend (Bostock-style), area-proportional. */
function SizeLegend({
  ticks,
  r,
  label,
  inkColor,
  swatch,
}: {
  ticks: number[];
  r: (v: number) => number;
  label?: string;
  inkColor: string;
  swatch: string;
}) {
  const maxR = Math.max(...ticks.map((t) => r(t)));
  const w = maxR * 2 + 4;
  const h = maxR * 2 + 14;
  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h} aria-hidden style={{ overflow: "visible" }}>
        {ticks.map((t, i) => {
          const rr = r(t);
          return (
            <g key={i}>
              <circle
                cx={w / 2}
                cy={h - rr - 2}
                r={rr}
                fill="none"
                stroke={swatch}
                strokeWidth={1}
              />
              <text
                x={w / 2}
                y={h - 2 * rr - 4}
                textAnchor="middle"
                fill={inkColor}
                className="tabular-nums"
                style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.04em" }}
              >
                {formatCompact(t)}
              </text>
            </g>
          );
        })}
      </svg>
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">{label}</span>
      )}
    </div>
  );
}

/** Round to a clean 1/2/5 × 10^k magnitude for legend ticks. */
function niceRound(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return nice * mag;
}

export const meta: RevizMeta = {
  id: "bubble-chart",
  name: "Bubble Chart",
  category: "charts",
  description:
    "A scatter where bubble area encodes a third variable and color a category, with size + color legends and bubbles that spring in with a graceful stagger.",
  tags: ["bubble", "scatter", "encoding", "size", "multivariate"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "BubbleChart",
  sourcePath: "charts/BubbleChart",
  aspect: 16 / 11,
  controls: [
    {
      key: "data",
      label: "Bubbles",
      type: "json",
      group: "Data",
      help: "Array of { x, y, size, group?, label? }. size sets bubble area; group colors & legends by category.",
      default: DEFAULT_DATA,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Cost vs. accuracy vs. scale" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Inference cost ($/1M tok)" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Accuracy (%)" },
    { key: "sizeLabel", label: "Size label", type: "text", group: "Labels", default: "Params (B)" },
    {
      key: "maxRadius",
      label: "Max radius",
      type: "number",
      group: "Layout",
      default: 34,
      min: 12,
      max: 60,
      step: 1,
      unit: "px",
    },
    { key: "showGrid", label: "Gridlines", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Bubble color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1100,
      min: 0,
      max: 2500,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "cost-accuracy-params",
      name: "Cost vs. accuracy vs. params",
      props: {
        title: "Cost vs. accuracy vs. scale",
        xLabel: "Inference cost ($/1M tok)",
        yLabel: "Accuracy (%)",
        sizeLabel: "Params (B)",
        maxRadius: 34,
      },
    },
    {
      id: "datasets",
      name: "Dataset scale vs. quality",
      props: {
        title: "Pretraining corpora: size, quality & duplication",
        xLabel: "Tokens (T)",
        yLabel: "Quality score",
        sizeLabel: "Dup rate (%)",
        maxRadius: 40,
        data: [
          { x: 1.4, y: 62, size: 18, group: "web", label: "CommonCrawl" },
          { x: 0.8, y: 71, size: 9, group: "web", label: "C4" },
          { x: 0.3, y: 88, size: 3, group: "curated", label: "Wikipedia" },
          { x: 0.2, y: 91, size: 2, group: "curated", label: "Books" },
          { x: 0.6, y: 84, size: 5, group: "curated", label: "ArXiv" },
          { x: 0.4, y: 79, size: 6, group: "code", label: "GitHub" },
          { x: 0.15, y: 86, size: 4, group: "code", label: "StackEx" },
          { x: 2.1, y: 58, size: 24, group: "web", label: "RefinedWeb" },
        ],
      },
    },
    {
      id: "robots",
      name: "Robot policies: speed vs. success",
      props: {
        title: "Manipulation policies: throughput vs. success vs. demos",
        xLabel: "Steps / sec",
        yLabel: "Task success (%)",
        sizeLabel: "Demos (k)",
        maxRadius: 38,
        data: [
          { x: 12, y: 91, size: 120, group: "diffusion", label: "Diffusion Policy" },
          { x: 30, y: 78, size: 40, group: "transformer", label: "ACT" },
          { x: 45, y: 72, size: 25, group: "transformer", label: "RT-1" },
          { x: 22, y: 85, size: 90, group: "transformer", label: "RT-2" },
          { x: 8, y: 88, size: 60, group: "diffusion", label: "BC-Z" },
          { x: 55, y: 64, size: 15, group: "mlp", label: "MLP-BC" },
        ],
      },
    },
  ],
};
