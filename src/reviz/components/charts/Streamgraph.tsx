"use client";

import { scaleLinear } from "d3-scale";
import {
  area,
  curveBasis,
  curveCardinal,
  curveLinear,
  stack,
  stackOffsetNone,
  stackOffsetSilhouette,
  stackOffsetWiggle,
  stackOrderInsideOut,
  stackOrderNone,
} from "d3-shape";
import { max as d3max, min as d3min, sum as d3sum } from "d3-array";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  Figure,
  FloatingTooltip,
  Legend,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
  mix,
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

type Offset = "wiggle" | "silhouette" | "zero";

export interface StreamgraphProps {
  series?: Series[];
  xLabels?: string[];
  offset?: Offset;
  title?: string;
  caption?: string;
  source?: string;
  colors?: string[];
  curve?: number;
  duration?: number;
}

export default function Streamgraph({
  series = [
    { name: "Diffusion", data: [4, 6, 9, 14, 22, 31, 38, 42, 44, 46, 48, 51] },
    { name: "Transformers", data: [32, 38, 44, 51, 57, 62, 66, 68, 69, 70, 71, 73] },
    { name: "RL agents", data: [8, 10, 13, 17, 21, 24, 28, 33, 39, 46, 53, 60] },
    { name: "World models", data: [1, 2, 3, 5, 8, 12, 17, 23, 30, 38, 47, 56] },
    { name: "Robotics", data: [6, 7, 9, 11, 14, 17, 20, 24, 28, 33, 39, 45] },
  ],
  xLabels = ["'19", "'20a", "'20b", "'21a", "'21b", "'22a", "'22b", "'23a", "'23b", "'24a", "'24b", "'25"],
  offset = "wiggle",
  title = "Topic volume over time",
  caption = "",
  source = "",
  colors = [],
  curve = 0.85,
  duration = 1300,
}: StreamgraphProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [active, setActive] = useState<number | null>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const gid = useMemo(() => uid("stream"), []);
  const clipId = useMemo(() => uid("streamclip"), []);

  const colorFor = (s: Series, i: number) =>
    s.color || colors[i] || p.series[i % p.series.length];

  // The number of time steps: longest series, but never shorter than the labels.
  const cols = useMemo(() => {
    const n = Math.max(0, ...series.map((s) => s.data.length));
    return Math.max(n, xLabels.length);
  }, [series, xLabels]);

  // d3 stack consumes row objects keyed by series name.
  const stacks = useMemo(() => {
    if (series.length === 0 || cols === 0) return null;
    const rows = Array.from({ length: cols }, (_, i) => {
      const row: Record<string, number> = { __i: i };
      series.forEach((s) => {
        row[s.name] = Math.max(0, s.data[i] ?? 0);
      });
      return row;
    });
    const off =
      offset === "wiggle"
        ? stackOffsetWiggle
        : offset === "silhouette"
          ? stackOffsetSilhouette
          : stackOffsetNone;
    const gen = stack<Record<string, number>>()
      .keys(series.map((s) => s.name))
      // insideOut ordering keeps the largest streams centered — the streamgraph look.
      .order(offset === "zero" ? stackOrderNone : stackOrderInsideOut)
      .offset(off);
    return gen(rows);
  }, [series, cols, offset]);

  // Vertical extent across every layer of the offset stack.
  const yExtent = useMemo<[number, number]>(() => {
    if (!stacks) return [0, 1];
    let lo = Infinity;
    let hi = -Infinity;
    stacks.forEach((layer) => {
      layer.forEach((d) => {
        lo = Math.min(lo, d3min(d as unknown as number[]) ?? 0);
        hi = Math.max(hi, d3max(d as unknown as number[]) ?? 0);
      });
    });
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [0, 1];
    const pad = (hi - lo) * 0.04;
    return [lo - pad, hi + pad];
  }, [stacks]);

  // Per-step totals for the tooltip.
  const totals = useMemo(
    () =>
      Array.from({ length: cols }, (_, i) =>
        d3sum(series, (s) => Math.max(0, s.data[i] ?? 0)),
      ),
    [series, cols],
  );

  const legendItems: LegendItem[] = series.map((s, i) => ({
    label: s.name,
    color: colorFor(s, i),
    shape: "square",
  }));

  const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];
  const drawDur = reduced ? 0 : duration / 1000;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        {series.length > 0 && (
          <div className="mb-3 flex items-start justify-between gap-3">
            <Legend
              items={legendItems}
              align="left"
              className="[&>div]:cursor-default"
            />
            <button
              type="button"
              onClick={replay}
              className="shrink-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
            >
              replay
            </button>
          </div>
        )}

        <ResponsiveSvg aspect={16 / 9} margin={{ top: 14, right: 16, bottom: 34, left: 16 }}>
          {({ inner, margin }) => {
            const x = scaleLinear()
              .domain([0, Math.max(1, cols - 1)])
              .range([0, inner.width]);
            const y = scaleLinear().domain(yExtent).range([inner.height, 0]);

            const indexFromX = (px: number) => {
              const t = inner.width > 0 ? px / inner.width : 0;
              const i = Math.round(t * Math.max(1, cols - 1));
              return Math.min(cols - 1, Math.max(0, i));
            };

            const tickFmt = (v: number) => xLabels[Math.round(v)] ?? "";

            // Smoothing: 0 → polyline, mid → a cardinal whose tension eases with
            // the slider, high → a flowing B-spline (the classic streamgraph look).
            const c = Math.max(0, Math.min(1, curve));
            const curveFn =
              c <= 0 ? curveLinear : c >= 0.9 ? curveBasis : curveCardinal.tension(1 - c);
            const areaGen = area<number[]>()
              .x((_d, j) => x(j))
              .y0((d) => y(d[0]))
              .y1((d) => y(d[1]))
              .curve(curveFn);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {series.map((s, i) => {
                    const c = colorFor(s, i);
                    // A soft top→bottom gradient: lighter at the crest, richer below.
                    const top = mix(c, p.surface, 0.32);
                    const bot = mix(c, p.canvas, 0.06);
                    return (
                      <linearGradient
                        key={i}
                        id={`${gid}-${i}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={top} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={bot} stopOpacity={0.95} />
                      </linearGradient>
                    );
                  })}
                  <clipPath id={clipId}>
                    <motion.rect
                      x={0}
                      y={-12}
                      height={inner.height + 24}
                      initial={{ width: reduced ? inner.width : 0 }}
                      animate={{ width: inView || reduced ? inner.width : 0 }}
                      transition={{ duration: drawDur, ease: easeOut }}
                      key={`${token}-clip`}
                    />
                  </clipPath>
                </defs>

                {/* Flowing bands */}
                <g clipPath={`url(#${clipId})`}>
                  {stacks?.map((layer, i) => {
                    const s = series[i];
                    const c = colorFor(s, i);
                    const dim = active != null && active !== i;
                    const pts = layer.map((d) => [d[0], d[1]] as number[]);
                    return (
                      <motion.path
                        key={s.name}
                        d={areaGen(pts) ?? ""}
                        fill={`url(#${gid}-${i})`}
                        stroke={mix(c, p.canvas, 0.15)}
                        strokeWidth={active === i ? 1.5 : 0.75}
                        strokeLinejoin="round"
                        animate={{
                          opacity: dim ? 0.22 : 1,
                          // gentle lift of the active band for emphasis
                          scale: active === i ? 1.002 : 1,
                        }}
                        transition={{ duration: reduced ? 0 : 0.28, ease: "easeOut" }}
                        style={{ transformOrigin: "center" }}
                        onMouseEnter={() => setActive(i)}
                      />
                    );
                  })}
                </g>

                {/* Hover guide */}
                {hover != null && cols > 0 && (
                  <line
                    pointerEvents="none"
                    x1={x(hover.i)}
                    x2={x(hover.i)}
                    y1={-4}
                    y2={inner.height + 4}
                    stroke={p.borderStrong}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                )}

                {/* Active band label, riding the centerline of the band */}
                {active != null && stacks?.[active] && cols > 0 && (
                  <ActiveLabel
                    layer={stacks[active]}
                    color={colorFor(series[active], active)}
                    name={series[active].name}
                    x={x}
                    y={y}
                    cols={cols}
                    innerWidth={inner.width}
                    ink={readableInk(colorFor(series[active], active), p.surface, p.ink)}
                  />
                )}

                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={tickFmt}
                  linearCount={Math.min(cols, 9)}
                />

                {/* Pointer capture */}
                <rect
                  x={0}
                  y={-12}
                  width={inner.width}
                  height={inner.height + 24}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                    const r = svg.getBoundingClientRect();
                    const px = e.clientX - r.left - margin.left;
                    const i = indexFromX(px);
                    setHover({ i, x: x(i) + margin.left, y: e.clientY - r.top });
                  }}
                  onMouseLeave={() => {
                    setHover(null);
                    setActive(null);
                  }}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {xLabels[hover.i] ?? `#${hover.i + 1}`}
              </div>
              {series
                .map((s, i) => ({ s, i, v: Math.max(0, s.data[hover.i] ?? 0) }))
                .sort((a, b) => b.v - a.v)
                .map(({ s, i, v }) => (
                  <div
                    key={s.name}
                    style={{ opacity: active != null && active !== i ? 0.45 : 1 }}
                  >
                    <TooltipRow
                      label={s.name}
                      value={
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-[2px]"
                            style={{ background: colorFor(s, i) }}
                          />
                          {formatCompact(v, 2)}
                        </span>
                      }
                    />
                  </div>
                ))}
              {series.length > 1 && (
                <div
                  className="mt-1 border-t pt-1"
                  style={{ borderColor: withAlpha(p.canvas, 0.25) }}
                >
                  <TooltipRow label="total" value={formatCompact(totals[hover.i] ?? 0, 2)} />
                </div>
              )}
            </>
          )}
        </FloatingTooltip>
      </div>
    </Figure>
  );
}

/** A label that sits at the vertical center of the active band's widest column. */
function ActiveLabel({
  layer,
  color,
  name,
  x,
  y,
  cols,
  innerWidth,
  ink,
}: {
  layer: { 0: number; 1: number }[];
  color: string;
  name: string;
  x: (i: number) => number;
  y: (v: number) => number;
  cols: number;
  innerWidth: number;
  ink: string;
}) {
  // Pick the column where the band is thickest to anchor the label.
  let best = 0;
  let bestThick = -Infinity;
  for (let i = 0; i < cols; i++) {
    const d = layer[i] as unknown as number[];
    if (!d) continue;
    const thick = Math.abs((d[1] ?? 0) - (d[0] ?? 0));
    if (thick > bestThick) {
      bestThick = thick;
      best = i;
    }
  }
  const d = layer[best] as unknown as number[];
  if (!d) return null;
  const cy = (y(d[0]) + y(d[1])) / 2;
  const cx = Math.min(Math.max(x(best), 40), innerWidth - 40);
  void color;
  return (
    <g pointerEvents="none">
      <motion.text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        className="font-mono uppercase"
        style={{ fontSize: 11, letterSpacing: "0.06em", fill: ink, fontWeight: 600 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {name}
      </motion.text>
    </g>
  );
}

/**
 * A readable label color for text sitting on top of a band's soft gradient.
 * The band reads as a desaturated mid-tone, so a band color pushed toward the
 * theme ink stays on-brand and legible on every palette.
 */
function readableInk(bandColor: string, _surface: string, ink: string): string {
  return mix(bandColor, ink, 0.62);
}

export const meta: RevizMeta = {
  id: "streamgraph",
  name: "Streamgraph",
  category: "charts",
  description:
    "A flowing, organically-stacked streamgraph of several series over time — wiggle/silhouette offsets, soft gradient bands, a left-to-right reveal, and hover-to-isolate.",
  tags: ["streamgraph", "stacked", "area", "flow", "time-series", "composition"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "Streamgraph",
  sourcePath: "charts/Streamgraph",
  aspect: 16 / 9,
  controls: [
    {
      key: "series",
      label: "Series",
      type: "series",
      group: "Data",
      default: [
        { name: "Diffusion", data: [4, 6, 9, 14, 22, 31, 38, 42, 44, 46, 48, 51] },
        { name: "Transformers", data: [32, 38, 44, 51, 57, 62, 66, 68, 69, 70, 71, 73] },
        { name: "RL agents", data: [8, 10, 13, 17, 21, 24, 28, 33, 39, 46, 53, 60] },
        { name: "World models", data: [1, 2, 3, 5, 8, 12, 17, 23, 30, 38, 47, 56] },
        { name: "Robotics", data: [6, 7, 9, 11, 14, 17, 20, 24, 28, 33, 39, 45] },
      ],
    },
    {
      key: "xLabels",
      label: "X labels",
      type: "json",
      group: "Data",
      default: ["'19", "'20a", "'20b", "'21a", "'21b", "'22a", "'22b", "'23a", "'23b", "'24a", "'24b", "'25"],
    },
    {
      key: "offset",
      label: "Offset",
      type: "select",
      group: "Layout",
      default: "wiggle",
      options: [
        { label: "Wiggle", value: "wiggle" },
        { label: "Silhouette", value: "silhouette" },
        { label: "Zero (stacked)", value: "zero" },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Topic volume over time" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "colors", label: "Colors", type: "colorArray", group: "Style", default: [] },
    { key: "curve", label: "Smoothing", type: "number", group: "Style", default: 0.85, min: 0, max: 1, step: 0.05 },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1300, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "research-topics",
      name: "Research topics",
      props: {
        offset: "wiggle",
        title: "ML research volume by topic",
        source: "arXiv cs.LG submissions, indexed",
        series: [
          { name: "Diffusion", data: [4, 6, 9, 14, 22, 31, 38, 42, 44, 46, 48, 51] },
          { name: "Transformers", data: [32, 38, 44, 51, 57, 62, 66, 68, 69, 70, 71, 73] },
          { name: "RL agents", data: [8, 10, 13, 17, 21, 24, 28, 33, 39, 46, 53, 60] },
          { name: "World models", data: [1, 2, 3, 5, 8, 12, 17, 23, 30, 38, 47, 56] },
          { name: "Robotics", data: [6, 7, 9, 11, 14, 17, 20, 24, 28, 33, 39, 45] },
        ],
        xLabels: ["'19", "'20a", "'20b", "'21a", "'21b", "'22a", "'22b", "'23a", "'23b", "'24a", "'24b", "'25"],
      },
    },
    {
      id: "silhouette-traffic",
      name: "Inference mix",
      props: {
        offset: "silhouette",
        curve: 1,
        title: "Inference traffic by endpoint",
        source: "Edge gateway, daily share",
        series: [
          { name: "Chat", data: [40, 44, 48, 52, 55, 58, 60, 61, 62, 63] },
          { name: "Code", data: [10, 14, 19, 26, 33, 40, 46, 51, 55, 58] },
          { name: "Vision", data: [6, 8, 11, 15, 20, 25, 30, 34, 38, 41] },
          { name: "Embed", data: [22, 24, 27, 29, 31, 32, 33, 33, 34, 34] },
          { name: "Audio", data: [3, 5, 8, 12, 17, 22, 27, 31, 35, 39] },
        ],
        xLabels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      },
    },
  ],
};
