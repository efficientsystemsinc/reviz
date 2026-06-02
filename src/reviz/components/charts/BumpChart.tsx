"use client";

import { scalePoint } from "d3-scale";
import { curveBumpX, line as d3line } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  SoftShadow,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  type RevizMeta,
} from "@/reviz";

interface BumpSeries {
  name: string;
  /** Rank at each period (1 = best/top). Use 0/null to break the line. */
  ranks: number[];
  color?: string;
}

const DEFAULT_PERIODS = ["v1.0", "v1.5", "v2.0", "v2.5", "v3.0", "v3.5"];

const DEFAULT_SERIES: BumpSeries[] = [
  { name: "Atlas", ranks: [3, 2, 2, 1, 1, 1] },
  { name: "Nimbus", ranks: [1, 1, 1, 2, 2, 3] },
  { name: "Orion", ranks: [4, 4, 3, 3, 3, 2] },
  { name: "Paxos", ranks: [2, 3, 4, 4, 5, 5] },
  { name: "Vela", ranks: [5, 5, 5, 5, 4, 4] },
];

export interface BumpChartProps {
  periods?: string[];
  series?: BumpSeries[];
  title?: string;
  caption?: string;
  source?: string;
  showMarkers?: boolean;
  showRankAxis?: boolean;
  color?: string;
  duration?: number;
}

export default function BumpChart({
  periods = DEFAULT_PERIODS,
  series = DEFAULT_SERIES,
  title = "Model leaderboard rank across releases",
  caption = "",
  source = "",
  showMarkers = true,
  showRankAxis = true,
  color = "",
  duration = 1300,
}: BumpChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ si: number; pi: number; px: number; py: number } | null>(null);
  const gid = useMemo(() => uid("bump"), []);

  const colorOf = (i: number) =>
    i === 0 && color ? color : series[i]?.color || p.series[i % p.series.length];

  // Number of periods = the x-domain length.
  const span = useMemo(
    () => Math.max(2, periods.length, ...series.map((s) => s.ranks.length)),
    [periods, series],
  );

  // The worst (largest) rank present sets the vertical extent (rank 1 on top).
  const maxRank = useMemo(() => {
    const ranks = series.flatMap((s) => s.ranks).filter((r) => Number.isFinite(r) && r > 0);
    return Math.max(2, ranks.length ? Math.max(...ranks) : series.length);
  }, [series]);

  const draw = reduced ? 1 : inView ? 1 : 0;
  const drawDur = (duration / 1000) * 0.8;

  // Rank ladder labels for the (optional) left axis.
  const rankTicks = useMemo(
    () => Array.from({ length: maxRank }, (_, i) => i + 1),
    [maxRank],
  );

  const labelW = 96;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={16 / 9}
          margin={{ top: 16, right: labelW, bottom: 30, left: showRankAxis ? 34 : 18 }}
        >
          {({ inner, margin }) => {
            const x = scalePoint<string>()
              .domain(Array.from({ length: span }, (_, i) => String(i)))
              .range([0, inner.width])
              .padding(0);

            // Map rank (1..maxRank) to y; rank 1 sits at the top with a half-row inset.
            const rowH = inner.height / maxRank;
            const yOf = (rank: number) => (rank - 0.5) * rowH;
            const xOf = (i: number) => x(String(i)) ?? 0;

            const lineGen = d3line<{ i: number; r: number }>()
              .x((d) => xOf(d.i))
              .y((d) => yOf(d.r))
              .defined((d) => Number.isFinite(d.r) && d.r > 0)
              .curve(curveBumpX);

            // Build per-series point lists, indexed by period.
            const built = series.map((s, si) => {
              const pts = s.ranks
                .slice(0, span)
                .map((r, i) => ({ i, r }))
                .filter((d) => Number.isFinite(d.r) && d.r > 0);
              return { s, si, pts, d: lineGen(pts) ?? "" };
            });

            const hovered = hover?.si ?? null;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={`${gid}-sh`} dy={2} blur={4} opacity={0.22} />
                </defs>

                {/* Faint horizontal rank rails. */}
                {showRankAxis &&
                  rankTicks.map((r) => (
                    <line
                      key={`rail-${r}`}
                      x1={0}
                      x2={inner.width}
                      y1={yOf(r)}
                      y2={yOf(r)}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 5"
                      shapeRendering="crispEdges"
                    />
                  ))}

                {/* Vertical period guides. */}
                {Array.from({ length: span }, (_, i) => (
                  <line
                    key={`vg-${i}`}
                    x1={xOf(i)}
                    x2={xOf(i)}
                    y1={0}
                    y2={inner.height}
                    stroke={p.grid}
                    strokeWidth={1}
                    strokeOpacity={0.55}
                    shapeRendering="crispEdges"
                  />
                ))}

                {/* Left rank ladder. */}
                {showRankAxis &&
                  rankTicks.map((r) => (
                    <text
                      key={`rt-${r}`}
                      x={-12}
                      y={yOf(r)}
                      dy="0.32em"
                      textAnchor="end"
                      fill={p.inkFaint}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.04em" }}
                    >
                      {r}
                    </text>
                  ))}

                {/* Lines: smooth bump curves drawing left-to-right. */}
                {built.map(({ d, si }) => {
                  if (!d) return null;
                  const stroke = colorOf(si);
                  const dim = hovered != null && hovered !== si;
                  return (
                    <motion.path
                      key={`${gid}-line-${si}-${token}`}
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={hovered === si ? 3.2 : 2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{
                        pathLength: draw,
                        opacity: draw ? (dim ? 0.22 : 1) : 0,
                      }}
                      transition={{
                        pathLength: {
                          duration: reduced ? 0 : drawDur,
                          delay: reduced ? 0 : si * 0.08,
                          ease: [0.4, 0, 0.2, 1],
                        },
                        opacity: { duration: reduced ? 0 : 0.3, delay: reduced ? 0 : si * 0.08 },
                        strokeWidth: { duration: 0.18 },
                      }}
                    />
                  );
                })}

                {/* Markers at each rank position. */}
                {showMarkers &&
                  built.map(({ pts, si }) =>
                    pts.map((d) => {
                      const dim = hovered != null && hovered !== si;
                      const active = hovered === si;
                      return (
                        <motion.circle
                          key={`${gid}-pt-${si}-${d.i}-${token}`}
                          cx={xOf(d.i)}
                          cy={yOf(d.r)}
                          r={active ? 5.2 : 4}
                          fill={p.surface}
                          stroke={colorOf(si)}
                          strokeWidth={active ? 2.6 : 2}
                          filter={`url(#${gid}-sh)`}
                          style={{ cursor: "pointer" }}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{
                            opacity: draw ? (dim ? 0.25 : 1) : 0,
                            scale: draw ? 1 : 0,
                          }}
                          transition={{
                            duration: reduced ? 0 : 0.3,
                            delay: reduced
                              ? 0
                              : drawDur * (d.i / Math.max(1, span - 1)) + si * 0.08,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          onMouseEnter={() =>
                            setHover({ si, pi: d.i, px: xOf(d.i), py: yOf(d.r) })
                          }
                          onMouseLeave={() => setHover(null)}
                        />
                      );
                    }),
                  )}

                {/* End labels on the right (at each series' final ranked period). */}
                {built.map(({ s, pts, si }) => {
                  const last = pts[pts.length - 1];
                  if (!last) return null;
                  const dim = hovered != null && hovered !== si;
                  return (
                    <motion.g
                      key={`${gid}-lab-${si}-${token}`}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: draw ? (dim ? 0.3 : 1) : 0, x: 0 }}
                      transition={{
                        duration: reduced ? 0 : 0.4,
                        delay: reduced ? 0 : drawDur * 0.85 + si * 0.05,
                        ease: "easeOut",
                      }}
                      style={{ pointerEvents: "none" }}
                    >
                      <line
                        x1={xOf(last.i)}
                        x2={xOf(last.i) + 10}
                        y1={yOf(last.r)}
                        y2={yOf(last.r)}
                        stroke={colorOf(si)}
                        strokeWidth={2}
                      />
                      <circle
                        cx={xOf(last.i) + 10}
                        cy={yOf(last.r)}
                        r={2.4}
                        fill={colorOf(si)}
                      />
                      <text
                        x={xOf(last.i) + 18}
                        y={yOf(last.r)}
                        dy="0.32em"
                        textAnchor="start"
                        fill={hovered === si ? p.ink : p.inkMuted}
                        style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600 }}
                      >
                        {s.name}
                      </text>
                    </motion.g>
                  );
                })}

                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  values={Array.from({ length: span }, (_, i) => String(i))}
                  format={(v) => periods[Number(v)] ?? ""}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip
          x={(hover?.px ?? 0) + (showRankAxis ? 34 : 18)}
          y={(hover?.py ?? 0) + 16}
          visible={hover != null}
        >
          {hover != null && (
            <>
              <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                <span
                  className="inline-block h-[2px] w-3 rounded-full align-middle"
                  style={{ background: colorOf(hover.si) }}
                />
                {series[hover.si]?.name}
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {periods[hover.pi] ?? `period ${hover.pi}`}
                </span>
                <span className="font-medium tabular-nums">
                  rank #{series[hover.si]?.ranks[hover.pi]}
                </span>
              </div>
            </>
          )}
        </FloatingTooltip>

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
    </Figure>
  );
}

const SCALING_PERIODS = ["7B", "13B", "34B", "70B", "180B", "400B"];
const SCALING_SERIES: BumpSeries[] = [
  { name: "Dense", ranks: [1, 1, 2, 3, 4, 4] },
  { name: "MoE", ranks: [3, 2, 1, 1, 1, 1] },
  { name: "Retrieval", ranks: [2, 3, 3, 2, 2, 2] },
  { name: "Distilled", ranks: [4, 4, 4, 4, 3, 3] },
];

export const meta: RevizMeta = {
  id: "bump-chart",
  name: "Bump Chart",
  category: "charts",
  description:
    "A rank-over-time bump chart: each competitor rides a smooth curve through its rank at every release, with end labels, hover highlighting, and lines that draw on in sequence.",
  tags: ["bump", "rank", "leaderboard", "ranking", "time-series"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "BumpChart",
  sourcePath: "charts/BumpChart",
  aspect: 16 / 9,
  controls: [
    {
      key: "periods",
      label: "Periods",
      type: "json",
      group: "Data",
      default: DEFAULT_PERIODS,
      help: "Ordered time points along the x-axis (e.g. releases).",
    },
    {
      key: "series",
      label: "Series",
      type: "json",
      group: "Data",
      default: DEFAULT_SERIES,
      help: "Each entry: { name, ranks: number[] (1 = top), color? }.",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Model leaderboard rank across releases" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showRankAxis", label: "Rank ladder", type: "boolean", group: "Layout", default: true },
    { key: "showMarkers", label: "Point markers", type: "boolean", group: "Style", default: true },
    { key: "color", label: "First series color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1300, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "leaderboard",
      name: "Model leaderboard",
      props: {
        title: "Model leaderboard rank across releases",
        caption: "Public arena standings reshuffle as each model ships a new version.",
        periods: DEFAULT_PERIODS,
        series: DEFAULT_SERIES,
        showMarkers: true,
      },
    },
    {
      id: "scaling",
      name: "Architecture by scale",
      props: {
        title: "Architecture rank by parameter count",
        caption: "Mixture-of-experts overtakes dense transformers past the 34B scale.",
        periods: SCALING_PERIODS,
        series: SCALING_SERIES,
        showMarkers: true,
        showRankAxis: true,
      },
    },
  ],
};
