"use client";

import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line, stack, stackOffsetNone, stackOrderNone } from "d3-shape";
import { max as d3max, sum as d3sum } from "d3-array";
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

export interface AreaChartProps {
  series: Series[];
  xLabels: string[];
  stacked?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  showGrid?: boolean;
  showDots?: boolean;
  duration?: number;
}

export default function AreaChart({
  series = [
    { name: "Pretrain", data: [12, 18, 27, 38, 46, 52, 58, 63, 67, 70] },
    { name: "SFT", data: [4, 9, 16, 24, 31, 37, 43, 48, 52, 55] },
    { name: "RLHF", data: [1, 3, 7, 13, 20, 27, 34, 41, 47, 52] },
  ],
  xLabels = ["1k", "2k", "5k", "10k", "20k", "50k", "100k", "200k", "500k", "1M"],
  stacked = false,
  title = "Capability by training tokens",
  caption = "",
  source = "",
  yLabel = "Eval score",
  showGrid = true,
  showDots = false,
  duration = 1100,
}: AreaChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const gid = useMemo(() => uid("area"), []);
  const clipId = useMemo(() => uid("clip"), []);

  const colorFor = (s: Series, i: number) => s.color || p.series[i % p.series.length];

  // Length of the x-domain: the longest series, but never shorter than labels.
  const cols = useMemo(() => {
    const n = Math.max(0, ...series.map((s) => s.data.length));
    return Math.max(n, xLabels.length);
  }, [series, xLabels]);

  // Stacked layout (d3 stack expects an array of row objects keyed by series name).
  const stacks = useMemo(() => {
    if (!stacked || series.length === 0 || cols === 0) return null;
    const rows = Array.from({ length: cols }, (_, i) => {
      const row: Record<string, number> = { __i: i };
      series.forEach((s) => {
        row[s.name] = Math.max(0, s.data[i] ?? 0);
      });
      return row;
    });
    const gen = stack<Record<string, number>>()
      .keys(series.map((s) => s.name))
      .order(stackOrderNone)
      .offset(stackOffsetNone);
    return gen(rows);
  }, [stacked, series, cols]);

  const maxY = useMemo(() => {
    if (cols === 0) return 1;
    if (stacked) {
      const totals = Array.from({ length: cols }, (_, i) =>
        d3sum(series, (s) => Math.max(0, s.data[i] ?? 0)),
      );
      return Math.max(1, d3max(totals) ?? 1);
    }
    return Math.max(1, d3max(series, (s) => d3max(s.data) ?? 0) ?? 1);
  }, [stacked, series, cols]);

  const legendItems: LegendItem[] = series.map((s, i) => ({
    label: s.name,
    color: colorFor(s, i),
    shape: stacked ? "square" : "line",
  }));

  const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];
  const drawDur = reduced ? 0 : duration / 1000;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        {series.length > 1 && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <Legend items={legendItems} align="left" />
            <button
              type="button"
              onClick={replay}
              className="shrink-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
            >
              replay
            </button>
          </div>
        )}

        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 16, right: 18, bottom: 38, left: yLabel ? 54 : 44 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear()
              .domain([0, Math.max(1, cols - 1)])
              .range([0, inner.width]);
            const y = scaleLinear().domain([0, maxY]).range([inner.height, 0]).nice();

            const xAt = (i: number) => x(i);

            // Hover index from pointer x.
            const indexFromX = (px: number) => {
              const t = inner.width > 0 ? px / inner.width : 0;
              const i = Math.round(t * Math.max(1, cols - 1));
              return Math.min(cols - 1, Math.max(0, i));
            };

            const tickFmt = (i: number) => xLabels[Math.round(i)] ?? "";

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {series.map((s, i) => {
                    const c = colorFor(s, i);
                    return (
                      <VerticalFade
                        key={i}
                        id={`${gid}-${i}`}
                        color={c}
                        from={stacked ? 0.62 : 0.34}
                        to={stacked ? 0.28 : 0.02}
                      />
                    );
                  })}
                  <clipPath id={clipId}>
                    <motion.rect
                      x={0}
                      y={-8}
                      height={inner.height + 16}
                      initial={{ width: reduced ? inner.width : 0 }}
                      animate={{ width: inView || reduced ? inner.width : 0 }}
                      transition={{ duration: drawDur, ease: easeOut }}
                      key={`${token}-clip`}
                    />
                  </clipPath>
                </defs>

                {showGrid && (
                  <GridLines scale={y as never} width={inner.width} count={5} />
                )}

                {/* Areas */}
                <g clipPath={`url(#${clipId})`}>
                  {stacked && stacks
                    ? stacks.map((layer, i) => {
                        const s = series[i];
                        const c = colorFor(s, i);
                        const areaGen = area<[number, number]>()
                          .x((_d, j) => xAt(j))
                          .y0((d) => y(d[0]))
                          .y1((d) => y(d[1]))
                          .curve(curveMonotoneX);
                        const topGen = line<[number, number]>()
                          .x((_d, j) => xAt(j))
                          .y((d) => y(d[1]))
                          .curve(curveMonotoneX);
                        const pts = layer.map((d) => [d[0], d[1]] as [number, number]);
                        return (
                          <g key={s.name}>
                            <path d={areaGen(pts) ?? ""} fill={`url(#${gid}-${i})`} />
                            <path
                              d={topGen(pts) ?? ""}
                              fill="none"
                              stroke={c}
                              strokeWidth={1.75}
                              strokeLinejoin="round"
                            />
                          </g>
                        );
                      })
                    : series.map((s, i) => {
                        const c = colorFor(s, i);
                        const data = Array.from({ length: cols }, (_, j) =>
                          Math.max(0, s.data[j] ?? 0),
                        );
                        const areaGen = area<number>()
                          .x((_d, j) => xAt(j))
                          .y0(inner.height)
                          .y1((d) => y(d))
                          .curve(curveMonotoneX);
                        const lineGen = line<number>()
                          .x((_d, j) => xAt(j))
                          .y((d) => y(d))
                          .curve(curveMonotoneX);
                        return (
                          <g key={s.name}>
                            <path d={areaGen(data) ?? ""} fill={`url(#${gid}-${i})`} />
                            <path
                              d={lineGen(data) ?? ""}
                              fill="none"
                              stroke={c}
                              strokeWidth={2}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                            />
                          </g>
                        );
                      })}
                </g>

                {/* Dots */}
                {showDots &&
                  !stacked &&
                  series.map((s, i) => {
                    const c = colorFor(s, i);
                    return (
                      <g key={`dot-${s.name}`} clipPath={`url(#${clipId})`}>
                        {Array.from({ length: cols }, (_, j) => {
                          const v = Math.max(0, s.data[j] ?? 0);
                          return (
                            <motion.circle
                              key={`${token}-${j}`}
                              cx={xAt(j)}
                              cy={y(v)}
                              r={2.6}
                              fill={p.surface}
                              stroke={c}
                              strokeWidth={1.5}
                              initial={{ opacity: reduced ? 1 : 0 }}
                              animate={{ opacity: inView || reduced ? 1 : 0 }}
                              transition={{
                                delay: drawDur * (j / Math.max(1, cols - 1)) * 0.9,
                                duration: reduced ? 0 : 0.3,
                              }}
                            />
                          );
                        })}
                      </g>
                    );
                  })}

                {/* Hover guide + markers */}
                {hover != null && cols > 0 && (
                  <g pointerEvents="none">
                    <line
                      x1={xAt(hover.i)}
                      x2={xAt(hover.i)}
                      y1={0}
                      y2={inner.height}
                      stroke={p.borderStrong}
                      strokeWidth={1}
                      strokeDasharray="2 3"
                    />
                    {stacked && stacks
                      ? stacks.map((layer, i) => {
                          const c = colorFor(series[i], i);
                          const d = layer[hover.i];
                          if (!d) return null;
                          return (
                            <circle
                              key={i}
                              cx={xAt(hover.i)}
                              cy={y(d[1])}
                              r={3.2}
                              fill={p.surface}
                              stroke={c}
                              strokeWidth={1.75}
                            />
                          );
                        })
                      : series.map((s, i) => {
                          const c = colorFor(s, i);
                          const v = Math.max(0, s.data[hover.i] ?? 0);
                          return (
                            <circle
                              key={i}
                              cx={xAt(hover.i)}
                              cy={y(v)}
                              r={3.2}
                              fill={p.surface}
                              stroke={c}
                              strokeWidth={1.75}
                            />
                          );
                        })}
                  </g>
                )}

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
                  linearFormat={(v) => tickFmt(v)}
                  linearCount={Math.min(cols, 8)}
                />

                {/* Pointer capture */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                    const r = svg.getBoundingClientRect();
                    const px = e.clientX - r.left - margin.left;
                    const i = indexFromX(px);
                    setHover({ i, x: xAt(i) + margin.left, y: e.clientY - r.top });
                  }}
                  onMouseLeave={() => setHover(null)}
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
              {series.map((s, i) => (
                <TooltipRow
                  key={s.name}
                  label={s.name}
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-[2px]"
                        style={{ background: colorFor(s, i) }}
                      />
                      {formatCompact(Math.max(0, s.data[hover.i] ?? 0), 2)}
                    </span>
                  }
                />
              ))}
              {stacked && series.length > 1 && (
                <div
                  className="mt-1 border-t pt-1"
                  style={{ borderColor: withAlpha(p.canvas, 0.25) }}
                >
                  <TooltipRow
                    label="total"
                    value={formatCompact(
                      series.reduce((acc, s) => acc + Math.max(0, s.data[hover.i] ?? 0), 0),
                      2,
                    )}
                  />
                </div>
              )}
            </>
          )}
        </FloatingTooltip>

        {series.length <= 1 && (
          <button
            type="button"
            onClick={replay}
            className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
          >
            replay
          </button>
        )}
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "area-chart",
  name: "Area Chart",
  category: "charts",
  description:
    "A silky stacked or overlapping area chart with gradient fills and a left-to-right grow-in — perfect for compositions and densities over time.",
  tags: ["area", "stacked", "trend", "composition", "time-series"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "AreaChart",
  sourcePath: "charts/AreaChart",
  aspect: 16 / 10,
  controls: [
    {
      key: "series",
      label: "Series",
      type: "series",
      group: "Data",
      default: [
        { name: "Pretrain", data: [12, 18, 27, 38, 46, 52, 58, 63, 67, 70] },
        { name: "SFT", data: [4, 9, 16, 24, 31, 37, 43, 48, 52, 55] },
        { name: "RLHF", data: [1, 3, 7, 13, 20, 27, 34, 41, 47, 52] },
      ],
    },
    {
      key: "xLabels",
      label: "X labels",
      type: "json",
      group: "Data",
      default: ["1k", "2k", "5k", "10k", "20k", "50k", "100k", "200k", "500k", "1M"],
    },
    { key: "stacked", label: "Stacked", type: "boolean", group: "Layout", default: false },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Capability by training tokens" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Eval score" },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "showDots", label: "Show points", type: "boolean", group: "Style", default: false },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "stacked-composition",
      name: "Stacked composition",
      props: {
        stacked: true,
        title: "Token budget by stage",
        yLabel: "Tokens (B)",
        showDots: false,
        series: [
          { name: "Pretrain", data: [120, 180, 240, 300, 360, 420, 480, 540] },
          { name: "Midtrain", data: [20, 40, 70, 110, 150, 190, 230, 270] },
          { name: "Posttrain", data: [5, 12, 22, 38, 60, 88, 120, 160] },
        ],
        xLabels: ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"],
      },
    },
    {
      id: "overlapping-densities",
      name: "Overlapping densities",
      props: {
        stacked: false,
        showDots: true,
        title: "Latency density by model",
        yLabel: "Requests",
        series: [
          { name: "Haiku", data: [2, 8, 24, 52, 78, 64, 38, 18, 8, 3] },
          { name: "Sonnet", data: [1, 4, 12, 30, 55, 72, 60, 36, 16, 6] },
          { name: "Opus", data: [0, 2, 6, 16, 34, 58, 70, 54, 28, 10] },
        ],
        xLabels: ["50", "100", "150", "200", "250", "300", "350", "400", "450", "500"],
      },
    },
  ],
};
