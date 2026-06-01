"use client";

import { scaleBand, scaleLog } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Data shape                                                          */
/* ------------------------------------------------------------------ */

/**
 * Each row is one x-group. `values` holds one number per series (here: per
 * model variant in the toggle). `note` optionally pins an italic serif
 * annotation above the group. The component reads two variants from the
 * toggle, where each variant maps to one element of `values`.
 */
interface BarGroup {
  group: string;
  values: number[];
  note?: string;
}

export interface LogScaleBarsProps {
  data?: BarGroup[];
  seriesNames?: string[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  baseline?: number;
  baselineLabel?: string;
  unit?: string;
  colors?: string[];
  groupGap?: number;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Format a duration-style value with its unit, scaling ms vs s nicely. */
function fmtValue(v: number, unit: string): string {
  if (v <= 0) return `0${unit ? ` ${unit}` : ""}`;
  let s: string;
  if (v >= 100) s = v.toFixed(0);
  else if (v >= 10) s = v.toFixed(1);
  else if (v >= 1) s = v.toFixed(2);
  else if (v >= 0.01) s = v.toFixed(3);
  else s = v.toExponential(1);
  return `${s}${unit ? ` ${unit}` : ""}`;
}

/** Tick labels on the log axis: compact, decimal-aware. */
function fmtTick(v: number): string {
  if (v >= 1000) return `${v / 1000}k`;
  if (v >= 1) return `${v}`;
  // strip trailing zeros for sub-unit ticks (0.001 etc.)
  return `${parseFloat(v.toPrecision(2))}`;
}

export default function LogScaleBars({
  data = [
    { group: "Reach", values: [0.42, 0.41], note: "invariant" },
    { group: "Grasp", values: [0.86, 0.83] },
    { group: "Lift", values: [1.9, 1.85] },
    { group: "Reorient", values: [3.4, 0.62], note: "scales" },
    { group: "Insert", values: [6.8, 0.94] },
    { group: "Handover", values: [4.1, 0.71] },
  ],
  seriesNames = ["Reactive policy", "World-model policy"],
  title = "Time-to-first-action by skill",
  caption = "",
  source = "",
  yLabel = "Latency (s)",
  baseline = 1,
  baselineLabel = "commanded wait",
  unit = "s",
  colors = [],
  groupGap = 0.28,
  duration = 1000,
}: LogScaleBarsProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<{ gi: number; si: number; x: number; y: number } | null>(null);

  const rows = data.length ? data : [];
  const seriesCount = Math.max(1, Math.min(2, seriesNames.length || 1));

  // Resolve the two series colors: prefer the override array, else bad/ok tones
  // (the red/green "regressed vs improved" reading the spec calls for).
  const palCols = useMemo(
    () => [colors[0] || p.bad, colors[1] || p.ok, ...p.series],
    [colors, p.bad, p.ok, p.series],
  );

  // Log domain: pad below the min and above the max to a clean decade-ish range.
  const { domainMin, domainMax } = useMemo(() => {
    const all: number[] = [];
    for (const r of rows) for (let i = 0; i < seriesCount; i++) all.push(r.values[i] ?? 0);
    if (baseline > 0) all.push(baseline);
    const positives = all.filter((v) => v > 0);
    const lo = positives.length ? Math.min(...positives) : 0.001;
    const hi = positives.length ? Math.max(...positives) : 10;
    const min = Math.pow(10, Math.floor(Math.log10(lo)));
    const max = Math.pow(10, Math.ceil(Math.log10(hi)));
    return { domainMin: Math.max(min, 1e-6), domainMax: Math.max(max, min * 10) };
  }, [rows, seriesCount, baseline]);

  const gradIds = useMemo(() => [uid("logbar0"), uid("logbar1")], []);

  const legendItems: LegendItem[] = seriesNames.slice(0, seriesCount).map((name, i) => ({
    label: name,
    color: palCols[i],
    shape: "square",
  }));

  const showBaseline = baseline > 0 && baseline >= domainMin && baseline <= domainMax;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        {/* two-state variant toggle, top-right corner */}
        {seriesCount > 1 && (
          <div className="absolute right-0 top-0 z-20 flex items-center gap-px rounded-md border border-border bg-surface p-px shadow-float">
            {seriesNames.slice(0, seriesCount).map((name, i) => (
              <button
                key={name}
                type="button"
                onClick={() => setActive(i)}
                className="relative rounded-[5px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-label transition-colors"
                style={{ color: active === i ? p.canvas : p.inkMuted }}
              >
                {active === i && (
                  <motion.span
                    layoutId={`${gradIds[0]}-toggle`}
                    className="absolute inset-0 rounded-[5px]"
                    style={{ background: palCols[i] }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative whitespace-nowrap">{name}</span>
              </button>
            ))}
          </div>
        )}

        <ResponsiveSvg
          aspect={16 / 9}
          margin={{ top: 26, right: 24, bottom: 42, left: yLabel ? 62 : 48 }}
        >
          {({ inner, margin }) => {
            const y = scaleLog().domain([domainMin, domainMax]).range([inner.height, 0]).clamp(true);
            const xGroup = scaleBand<string>()
              .domain(rows.map((r) => r.group))
              .range([0, inner.width])
              .padding(groupGap);

            const inner2 = scaleBand<number>()
              .domain(Array.from({ length: seriesCount }, (_, i) => i))
              .range([0, xGroup.bandwidth()])
              .padding(0.16);

            const ticks = y.ticks(Math.max(3, Math.round(Math.log10(domainMax / domainMin)) + 1));
            const baseY = showBaseline ? y(baseline) : 0;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {gradIds.map((id, i) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palCols[i]} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={withAlpha(palCols[i], 0.6)} />
                    </linearGradient>
                  ))}
                </defs>

                {/* log gridlines + left ticks */}
                {ticks.map((t, i) => (
                  <g key={`grid-${i}`}>
                    <line
                      x1={0}
                      x2={inner.width}
                      y1={y(t)}
                      y2={y(t)}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      shapeRendering="crispEdges"
                    />
                    <text
                      x={-10}
                      y={y(t)}
                      dy="0.32em"
                      textAnchor="end"
                      fill={p.inkFaint}
                      className="font-mono tabular-nums"
                      style={{ fontSize: 10.5, letterSpacing: "0.04em" }}
                    >
                      {fmtTick(t)}
                    </text>
                  </g>
                ))}

                {/* y-axis label */}
                {yLabel && (
                  <text
                    transform={`translate(${-margin.left + 14}, ${inner.height / 2}) rotate(-90)`}
                    textAnchor="middle"
                    fill={p.inkMuted}
                    className="font-mono uppercase"
                    style={{ fontSize: 10, letterSpacing: "0.14em" }}
                  >
                    {yLabel}
                  </text>
                )}

                {/* baseline annotation (dashed horizontal) */}
                {showBaseline && (
                  <motion.g
                    initial={reduced ? false : { opacity: 0 }}
                    animate={inView || reduced ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.4, delay: reduced ? 0 : duration / 1000 + 0.1 }}
                    key={`base-${token}`}
                  >
                    <line
                      x1={0}
                      x2={inner.width}
                      y1={baseY}
                      y2={baseY}
                      stroke={p.accent}
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                    />
                    <text
                      x={inner.width}
                      y={baseY - 6}
                      textAnchor="end"
                      fill={p.accent}
                      className="font-mono uppercase"
                      style={{ fontSize: 9.5, letterSpacing: "0.1em" }}
                    >
                      {baselineLabel} · {fmtValue(baseline, unit)}
                    </text>
                  </motion.g>
                )}

                {/* grouped bars */}
                {rows.map((r, gi) => {
                  const gx = xGroup(r.group) ?? 0;
                  return (
                    <g key={`${r.group}-${gi}`} transform={`translate(${gx}, 0)`}>
                      {Array.from({ length: seriesCount }).map((_, si) => {
                        const raw = r.values[si] ?? 0;
                        const v = Math.max(raw, domainMin);
                        const bx = inner2(si) ?? 0;
                        const bw = inner2.bandwidth();
                        const top = y(v);
                        const h = Math.max(0, inner.height - top);
                        const dim = seriesCount > 1 && active !== si;
                        const isHovered = hover?.gi === gi && hover?.si === si;
                        const drawDelay = reduced ? 0 : gi * 0.07 + si * 0.04;

                        return (
                          <motion.g
                            key={si}
                            animate={{ opacity: dim ? 0.32 : 1 }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <motion.rect
                              x={bx}
                              width={bw}
                              rx={Math.min(3, bw / 2)}
                              fill={`url(#${gradIds[si] ?? gradIds[0]})`}
                              stroke={isHovered ? p.ink : "none"}
                              strokeWidth={isHovered ? 1 : 0}
                              initial={reduced ? false : { height: 0, y: inner.height }}
                              animate={
                                inView || reduced
                                  ? { height: h, y: top }
                                  : { height: 0, y: inner.height }
                              }
                              transition={{
                                duration: duration / 1000,
                                delay: drawDelay,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              style={{ cursor: "pointer" }}
                              onMouseMove={(e) => {
                                const rect = (
                                  e.currentTarget.ownerSVGElement as SVGSVGElement
                                ).getBoundingClientRect();
                                setHover({
                                  gi,
                                  si,
                                  x: e.clientX - rect.left,
                                  y: e.clientY - rect.top,
                                });
                              }}
                              onMouseLeave={() => setHover(null)}
                              key={`bar-${token}-${gi}-${si}`}
                            />
                            {/* value label atop the active series' bar */}
                            {(!dim || seriesCount === 1) && (
                              <motion.text
                                x={bx + bw / 2}
                                y={top - 6}
                                textAnchor="middle"
                                fill={p.inkMuted}
                                className="font-mono tabular-nums"
                                style={{ fontSize: 9.5, letterSpacing: "0.02em" }}
                                initial={reduced ? false : { opacity: 0 }}
                                animate={inView || reduced ? { opacity: 1 } : { opacity: 0 }}
                                transition={{
                                  duration: 0.3,
                                  delay: reduced ? 0 : drawDelay + duration / 1000,
                                }}
                                key={`val-${token}-${gi}-${si}`}
                              >
                                {fmtValue(raw, "")}
                              </motion.text>
                            )}
                          </motion.g>
                        );
                      })}

                      {/* italic serif annotation pinned above the group */}
                      {r.note && (
                        <motion.text
                          x={xGroup.bandwidth() / 2}
                          y={-12}
                          textAnchor="middle"
                          fill={p.inkMuted}
                          style={{
                            fontFamily: "var(--font-serif)",
                            fontStyle: "italic",
                            fontSize: 12.5,
                          }}
                          initial={reduced ? false : { opacity: 0, y: -6 }}
                          animate={
                            inView || reduced ? { opacity: 1, y: -12 } : { opacity: 0, y: -6 }
                          }
                          transition={{
                            duration: 0.4,
                            delay: reduced ? 0 : gi * 0.07 + duration / 1000 + 0.2,
                          }}
                          key={`note-${token}-${gi}`}
                        >
                          {r.note}
                        </motion.text>
                      )}
                    </g>
                  );
                })}

                {/* baseline / zero line */}
                <line
                  x1={0}
                  x2={inner.width}
                  y1={inner.height}
                  y2={inner.height}
                  stroke={p.borderStrong}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />

                {/* x-axis group labels */}
                <g transform={`translate(0, ${inner.height})`}>
                  {rows.map((r, gi) => {
                    const cx = (xGroup(r.group) ?? 0) + xGroup.bandwidth() / 2;
                    const dimmed = hover != null && hover.gi !== gi;
                    return (
                      <text
                        key={`xt-${gi}`}
                        x={cx}
                        y={18}
                        textAnchor="middle"
                        fill={dimmed ? p.inkFaint : p.inkMuted}
                        className="font-mono uppercase"
                        style={{ fontSize: 10, letterSpacing: "0.06em" }}
                      >
                        {r.group}
                      </text>
                    );
                  })}
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && rows[hover.gi] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {rows[hover.gi].group} · {seriesNames[hover.si] ?? `series ${hover.si + 1}`}
              </div>
              <TooltipRow label={yLabel || "value"} value={fmtValue(rows[hover.gi].values[hover.si] ?? 0, unit)} />
              {seriesCount > 1 && rows[hover.gi].values[1 - hover.si] != null && (
                <TooltipRow
                  label="vs other"
                  value={`${(
                    (rows[hover.gi].values[hover.si] ?? 0) /
                    Math.max(1e-6, rows[hover.gi].values[1 - hover.si] ?? 0)
                  ).toFixed(2)}×`}
                />
              )}
            </>
          )}
        </FloatingTooltip>

        <div className="mt-3 flex items-center justify-between gap-4">
          <Legend items={legendItems} align="left" />
          <ReplayButton
            onClick={replay}
            className="opacity-0 transition-opacity group-hover/figure:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "log-scale-bars",
  name: "Log-Scale Grouped Bars",
  category: "ml-eval",
  description:
    "Grouped bars on a log y-axis with a dashed baseline annotation, italic serif callouts, and a two-state model toggle — built for spans that cross orders of magnitude.",
  tags: ["log", "grouped", "bar", "latency", "baseline", "ablation", "orders-of-magnitude"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "LogScaleBars",
  sourcePath: "ml-eval/LogScaleBars",
  aspect: 16 / 9,
  controls: [
    {
      key: "data",
      label: "Groups",
      type: "json",
      group: "Data",
      help: "Each row: { group, values:[seriesA, seriesB], note? }. note pins an italic serif annotation.",
      default: [
        { group: "Reach", values: [0.42, 0.41], note: "invariant" },
        { group: "Grasp", values: [0.86, 0.83] },
        { group: "Lift", values: [1.9, 1.85] },
        { group: "Reorient", values: [3.4, 0.62], note: "scales" },
        { group: "Insert", values: [6.8, 0.94] },
        { group: "Handover", values: [4.1, 0.71] },
      ],
    },
    {
      key: "seriesNames",
      label: "Series names",
      type: "json",
      group: "Data",
      help: "One or two names; the toggle and legend read from these.",
      default: ["Reactive policy", "World-model policy"],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Time-to-first-action by skill" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Latency (s)" },
    { key: "unit", label: "Unit", type: "text", group: "Labels", default: "s" },
    { key: "baselineLabel", label: "Baseline label", type: "text", group: "Labels", default: "commanded wait" },
    {
      key: "baseline",
      label: "Baseline value",
      type: "number",
      group: "Layout",
      default: 1,
      min: 0,
      max: 10,
      step: 0.001,
    },
    {
      key: "groupGap",
      label: "Group gap",
      type: "number",
      group: "Layout",
      default: 0.28,
      min: 0.05,
      max: 0.7,
      step: 0.01,
    },
    { key: "colors", label: "Series colors", type: "colorArray", group: "Style", default: [] },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1000,
      min: 0,
      max: 2500,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "commanded-wait",
      name: "Commanded wait duration",
      props: {
        title: "Time-to-first-action by skill (log scale)",
        caption: "A world-model policy holds near the commanded wait where the reactive policy blows past it.",
        yLabel: "Latency (s)",
        unit: "s",
        baseline: 1,
        baselineLabel: "commanded wait",
        seriesNames: ["Reactive policy", "World-model policy"],
        data: [
          { group: "Reach", values: [0.42, 0.41], note: "invariant" },
          { group: "Grasp", values: [0.86, 0.83] },
          { group: "Lift", values: [1.9, 1.85] },
          { group: "Reorient", values: [3.4, 0.62], note: "scales" },
          { group: "Insert", values: [6.8, 0.94] },
          { group: "Handover", values: [4.1, 0.71] },
        ],
      },
    },
    {
      id: "throughput",
      name: "Throughput vs SLO",
      props: {
        title: "Request latency by route vs SLO (log ms)",
        yLabel: "Latency (ms)",
        unit: "ms",
        baseline: 200,
        baselineLabel: "p99 SLO",
        seriesNames: ["v1 serving", "v2 serving"],
        colors: [],
        data: [
          { group: "/embed", values: [44, 38] },
          { group: "/rerank", values: [330, 96], note: "regressed → fixed" },
          { group: "/chat", values: [1900, 410] },
          { group: "/tool", values: [820, 120] },
        ],
      },
    },
  ],
};
