"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { line as d3line, curveMonotoneX } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  Glow,
  GridLines,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface ParetoPoint {
  x: number;
  y: number;
  label?: string;
}

/**
 * Default data: a model-selection sweep trading off inference latency (x, lower
 * is better) against benchmark accuracy (y, higher is better). The frontier is
 * the set of checkpoints no other checkpoint strictly beats on both axes.
 */
const DEFAULT_POINTS: ParetoPoint[] = [
  { x: 8, y: 71.2, label: "Distil-S" },
  { x: 12, y: 78.4, label: "Lite-B" },
  { x: 14, y: 74.0 },
  { x: 19, y: 82.1, label: "Base" },
  { x: 23, y: 79.5 },
  { x: 27, y: 81.0 },
  { x: 31, y: 85.3, label: "Base+RL" },
  { x: 38, y: 83.2 },
  { x: 44, y: 87.6, label: "Large" },
  { x: 52, y: 85.9 },
  { x: 58, y: 86.4 },
  { x: 66, y: 89.1, label: "Large-MoE" },
  { x: 74, y: 87.0 },
  { x: 83, y: 88.2 },
  { x: 95, y: 90.0, label: "XL" },
  { x: 110, y: 89.4 },
];

export interface ParetoFrontierProps {
  points: ParetoPoint[];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  maximizeX?: boolean;
  maximizeY?: boolean;
  color?: string;
  duration?: number;
}

interface RankedPoint extends ParetoPoint {
  i: number;
  onFrontier: boolean;
}

/**
 * Compute the Pareto-optimal set. A point dominates another when it is at least
 * as good on both objectives and strictly better on one. `maximizeX/Y` flip the
 * preferred direction of each axis. The returned frontier is sorted by x so it
 * can be drawn as a single monotone path.
 */
function computeFrontier(
  points: ParetoPoint[],
  maxX: boolean,
  maxY: boolean,
): { ranked: RankedPoint[]; frontier: RankedPoint[] } {
  const sx = maxX ? 1 : -1;
  const sy = maxY ? 1 : -1;
  const ranked: RankedPoint[] = points.map((pt, i) => {
    const dominated = points.some((o) => {
      if (o === pt) return false;
      const geX = sx * o.x >= sx * pt.x;
      const geY = sy * o.y >= sy * pt.y;
      const strictly = sx * o.x > sx * pt.x || sy * o.y > sy * pt.y;
      return geX && geY && strictly;
    });
    return { ...pt, i, onFrontier: !dominated };
  });
  const frontier = ranked
    .filter((d) => d.onFrontier)
    .sort((a, b) => a.x - b.x || (maxY ? b.y - a.y : a.y - b.y));
  return { ranked, frontier };
}

export default function ParetoFrontier({
  points = DEFAULT_POINTS,
  title = "Accuracy vs. latency trade-off",
  caption = "",
  source = "",
  xLabel = "Latency (ms)",
  yLabel = "Accuracy (%)",
  maximizeX = false,
  maximizeY = true,
  color = "",
  duration = 1100,
}: ParetoFrontierProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null);
  const ids = useMemo(() => ({ glow: uid("pf-glow"), front: uid("pf-front") }), []);

  const { ranked, frontier } = useMemo(
    () => computeFrontier(points, maximizeX, maximizeY),
    [points, maximizeX, maximizeY],
  );

  const xDomain = useMemo(() => {
    const e = extent(points, (d) => d.x) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const pad = (e[1] - e[0]) * 0.08 || 1;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [points]);

  const yDomain = useMemo(() => {
    const e = extent(points, (d) => d.y) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const pad = (e[1] - e[0]) * 0.12 || 1;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [points]);

  const dominatedColor = p.inkFaint;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={16 / 11}
          margin={{ top: 20, right: 24, bottom: xLabel ? 48 : 40, left: yLabel ? 58 : 48 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]).nice();
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();

            // Smooth frontier line through the Pareto-optimal points.
            const frontierPath =
              frontier.length >= 2
                ? d3line<RankedPoint>()
                    .x((d) => x(d.x))
                    .y((d) => y(d.y))
                    .curve(curveMonotoneX)(frontier) ?? ""
                : "";

            // A soft fill under the frontier toward the un-preferred corner, to
            // visually separate "achievable" from "dominated" regions.
            const cornerY = maximizeY ? inner.height : 0;
            const fillPath =
              frontier.length >= 2 && frontierPath
                ? `${frontierPath} L ${x(frontier[frontier.length - 1].x)} ${cornerY}` +
                  ` L ${x(frontier[0].x)} ${cornerY} Z`
                : "";

            const baseDelay = 0.12;
            const per = ranked.length > 0 ? Math.min(0.045, 0.7 / ranked.length) : 0;
            const drawDur = reduced ? 0 : duration / 1400;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <Glow id={ids.glow} blur={4} />
                  <linearGradient id={ids.front} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <GridLines scale={y as never} width={inner.width} />
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

                {/* Achievable region under the frontier */}
                {fillPath && (
                  <motion.path
                    d={fillPath}
                    fill={`url(#${ids.front})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: 0.6, delay: baseDelay + drawDur * 0.5 }}
                    key={`${token}-fill`}
                  />
                )}

                {/* The Pareto frontier line */}
                {frontierPath && (
                  <motion.path
                    d={frontierPath}
                    fill="none"
                    stroke={accent}
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                    transition={{
                      pathLength: { duration: drawDur, delay: baseDelay, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: 0.25, delay: baseDelay },
                    }}
                    key={`${token}-front`}
                  />
                )}

                {/* Dominated points (drawn first, dimmed) */}
                {ranked
                  .filter((d) => !d.onFrontier)
                  .map((d) => {
                    const cx = x(d.x);
                    const cy = y(d.y);
                    const active = hover?.i === d.i;
                    return (
                      <motion.circle
                        key={`${token}-dom-${d.i}`}
                        cx={cx}
                        cy={cy}
                        r={active ? 5.5 : 4}
                        fill={withAlpha(dominatedColor, active ? 0.55 : 0.32)}
                        stroke={withAlpha(dominatedColor, active ? 0.85 : 0.5)}
                        strokeWidth={1}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
                        transition={{
                          duration: reduced ? 0 : Math.min(0.45, duration / 2000),
                          delay: reduced ? 0 : baseDelay + d.i * per,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
                        onMouseEnter={() => setHover({ i: d.i, cx, cy })}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}

                {/* Frontier points (drawn last, emphasized) */}
                {ranked
                  .filter((d) => d.onFrontier)
                  .map((d) => {
                    const cx = x(d.x);
                    const cy = y(d.y);
                    const active = hover?.i === d.i;
                    return (
                      <motion.circle
                        key={`${token}-front-${d.i}`}
                        cx={cx}
                        cy={cy}
                        r={active ? 7 : 5.5}
                        fill={withAlpha(accent, active ? 1 : 0.92)}
                        stroke={p.surface}
                        strokeWidth={1.75}
                        filter={active ? `url(#${ids.glow})` : undefined}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
                        transition={{
                          duration: reduced ? 0 : Math.min(0.5, duration / 1800),
                          delay: reduced ? 0 : baseDelay + drawDur + d.i * per * 0.6,
                          ease: [0.34, 1.56, 0.64, 1],
                        }}
                        style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
                        onMouseEnter={() => setHover({ i: d.i, cx, cy })}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}

                {/* Labels on frontier points */}
                {frontier.map((d) => {
                  if (!d.label) return null;
                  const cx = x(d.x);
                  const cy = y(d.y);
                  // Place label toward the preferred-Y direction, clamped in-bounds.
                  const above = maximizeY ? cy > 22 : cy > inner.height - 22;
                  const ly = above ? cy - 12 : cy + 18;
                  const anchor = cx > inner.width - 60 ? "end" : "start";
                  const lx = anchor === "end" ? cx - 8 : cx + 8;
                  return (
                    <motion.text
                      key={`${token}-lab-${d.i}`}
                      x={lx}
                      y={ly}
                      textAnchor={anchor}
                      fill={p.ink}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.04em",
                      }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: inView ? 1 : 0 }}
                      transition={{ duration: 0.4, delay: baseDelay + drawDur + 0.25 }}
                    >
                      {d.label}
                    </motion.text>
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label={yLabel}
                  format={(v) => formatCompact(v)}
                />
                <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => formatCompact(v)} />

                {xLabel && (
                  <text
                    x={inner.width / 2}
                    y={inner.height + 40}
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

                {/* Frontier count badge */}
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: inView ? 1 : 0 }}
                  transition={{ duration: 0.4, delay: baseDelay + 0.15 }}
                  key={`${token}-badge`}
                >
                  <circle cx={6} cy={3} r={3.5} fill={accent} />
                  <text
                    x={16}
                    y={3}
                    dy="0.32em"
                    fill={p.inkMuted}
                    className="tabular-nums"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em" }}
                  >
                    {`${frontier.length} Pareto-optimal`}
                  </text>
                </motion.g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip
          x={hover ? hover.cx + (yLabel ? 58 : 48) : 0}
          y={hover ? hover.cy + 20 : 0}
          visible={hover != null}
        >
          {hover != null && (
            <>
              <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-80">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background: ranked[hover.i]?.onFrontier ? accent : dominatedColor,
                  }}
                />
                {ranked[hover.i]?.label ||
                  (ranked[hover.i]?.onFrontier ? "Pareto-optimal" : "Dominated")}
              </div>
              <TooltipRow label={xLabel || "x"} value={formatCompact(ranked[hover.i]?.x ?? 0, 2)} />
              <TooltipRow label={yLabel || "y"} value={formatCompact(ranked[hover.i]?.y ?? 0, 2)} />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "pareto-frontier",
  name: "Pareto Frontier",
  category: "ml-eval",
  description:
    "A trade-off scatter that computes the Pareto-optimal set, highlights it with a smooth frontier line and labels, and dims every dominated candidate.",
  tags: ["pareto", "tradeoff", "frontier", "multi-objective", "model-selection"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ParetoFrontier",
  sourcePath: "ml-eval/ParetoFrontier",
  aspect: 16 / 11,
  controls: [
    {
      key: "points",
      label: "Candidates",
      type: "json",
      group: "Data",
      help: "Array of { x, y, label? }. The Pareto frontier is computed from these.",
      default: DEFAULT_POINTS,
    },
    {
      key: "maximizeX",
      label: "Maximize X",
      type: "boolean",
      group: "Data",
      help: "On = larger X is better; Off = smaller X is better (e.g. latency, cost).",
      default: false,
    },
    {
      key: "maximizeY",
      label: "Maximize Y",
      type: "boolean",
      group: "Data",
      help: "On = larger Y is better (e.g. accuracy); Off = smaller is better.",
      default: true,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Accuracy vs. latency trade-off" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Latency (ms)" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Accuracy (%)" },
    { key: "color", label: "Frontier color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1100, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "accuracy-latency",
      name: "Accuracy vs. latency",
      props: {
        title: "Accuracy vs. latency trade-off",
        xLabel: "Latency (ms)",
        yLabel: "Accuracy (%)",
        maximizeX: false,
        maximizeY: true,
      },
    },
    {
      id: "quality-cost",
      name: "Quality vs. cost",
      props: {
        title: "Output quality vs. inference cost",
        xLabel: "Cost / 1M tokens ($)",
        yLabel: "Arena ELO",
        maximizeX: false,
        maximizeY: true,
        points: [
          { x: 0.15, y: 1142, label: "Haiku-class" },
          { x: 0.3, y: 1188 },
          { x: 0.5, y: 1205, label: "Flash" },
          { x: 0.8, y: 1196 },
          { x: 1.2, y: 1247, label: "Sonnet-class" },
          { x: 2.0, y: 1233 },
          { x: 3.0, y: 1271 },
          { x: 4.5, y: 1258 },
          { x: 6.0, y: 1294, label: "Pro" },
          { x: 9.0, y: 1281 },
          { x: 12.0, y: 1312, label: "Opus-class" },
          { x: 18.0, y: 1305 },
        ],
      },
    },
    {
      id: "size-reward",
      name: "Size vs. reward",
      props: {
        title: "Policy size vs. episodic return",
        xLabel: "Params (M)",
        yLabel: "Mean return",
        maximizeX: false,
        maximizeY: true,
        color: "",
        points: [
          { x: 1.2, y: 312, label: "Tiny-MLP" },
          { x: 2.5, y: 388 },
          { x: 4.0, y: 421, label: "Small-GRU" },
          { x: 6.5, y: 405 },
          { x: 9.0, y: 467 },
          { x: 13.0, y: 498, label: "Base-Transformer" },
          { x: 18.0, y: 472 },
          { x: 24.0, y: 521 },
          { x: 33.0, y: 540, label: "Large" },
          { x: 45.0, y: 528 },
          { x: 60.0, y: 553, label: "XL-Recurrent" },
        ],
      },
    },
  ],
};
