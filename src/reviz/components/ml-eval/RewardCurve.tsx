"use client";

import { extent, max as d3max, min as d3min, sum as d3sum } from "d3-array";
import { scaleLinear } from "d3-scale";
import {
  area as d3area,
  line as d3line,
  curveMonotoneX,
  stack,
  stackOffsetNone,
  stackOrderNone,
} from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
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
  usePalette,
  usePrefersReducedMotion,
  useInView,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** One logged episode. `reward` is the total return; `components` holds the */
/** signed contribution of each shaped reward term that episode.            */
interface Episode {
  episode: number;
  reward: number;
  components?: Record<string, number>;
}

/** A shaped reward term to break out in the stacked area. */
interface RewardComponent {
  name: string;
  color?: string;
}

export interface RewardCurveProps {
  episodes?: Episode[];
  components?: RewardComponent[];
  smooth?: number;
  showBreakdown?: boolean;
  showBand?: boolean;
  showRaw?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  xLabel?: string;
  duration?: number;
  color?: string;
}

/* ------------------------------------------------------------------ */
/* Defaults — a PPO agent learning a coding-agent reward (file_hit +    */
/* patch_produced shaping, minus step / format penalties).             */
/* ------------------------------------------------------------------ */

const DEFAULT_COMPONENTS: RewardComponent[] = [
  { name: "file_hit" },
  { name: "patch_produced" },
  { name: "penalties" },
];

const DEFAULT_EPISODES: Episode[] = [
  { episode: 0, reward: -0.42, components: { file_hit: 0.08, patch_produced: 0.02, penalties: -0.52 } },
  { episode: 20, reward: -0.18, components: { file_hit: 0.14, patch_produced: 0.05, penalties: -0.37 } },
  { episode: 40, reward: 0.05, components: { file_hit: 0.21, patch_produced: 0.09, penalties: -0.25 } },
  { episode: 60, reward: 0.31, components: { file_hit: 0.29, patch_produced: 0.16, penalties: -0.14 } },
  { episode: 80, reward: 0.24, components: { file_hit: 0.33, patch_produced: 0.14, penalties: -0.23 } },
  { episode: 100, reward: 0.58, components: { file_hit: 0.38, patch_produced: 0.27, penalties: -0.07 } },
  { episode: 120, reward: 0.72, components: { file_hit: 0.44, patch_produced: 0.34, penalties: -0.06 } },
  { episode: 140, reward: 0.66, components: { file_hit: 0.46, patch_produced: 0.31, penalties: -0.11 } },
  { episode: 160, reward: 0.91, components: { file_hit: 0.51, patch_produced: 0.43, penalties: -0.03 } },
  { episode: 180, reward: 1.04, components: { file_hit: 0.55, patch_produced: 0.52, penalties: -0.03 } },
  { episode: 200, reward: 1.18, components: { file_hit: 0.58, patch_produced: 0.62, penalties: -0.02 } },
  { episode: 220, reward: 1.12, components: { file_hit: 0.6, patch_produced: 0.58, penalties: -0.06 } },
  { episode: 240, reward: 1.34, components: { file_hit: 0.63, patch_produced: 0.73, penalties: -0.02 } },
  { episode: 260, reward: 1.41, components: { file_hit: 0.65, patch_produced: 0.78, penalties: -0.02 } },
  { episode: 280, reward: 1.52, components: { file_hit: 0.67, patch_produced: 0.86, penalties: -0.01 } },
  { episode: 300, reward: 1.49, components: { file_hit: 0.68, patch_produced: 0.83, penalties: -0.02 } },
  { episode: 320, reward: 1.63, components: { file_hit: 0.7, patch_produced: 0.94, penalties: -0.01 } },
  { episode: 340, reward: 1.69, components: { file_hit: 0.71, patch_produced: 0.99, penalties: -0.01 } },
  { episode: 360, reward: 1.74, components: { file_hit: 0.72, patch_produced: 1.03, penalties: -0.01 } },
  { episode: 380, reward: 1.71, components: { file_hit: 0.72, patch_produced: 1.0, penalties: -0.01 } },
  { episode: 400, reward: 1.78, components: { file_hit: 0.73, patch_produced: 1.06, penalties: -0.01 } },
];

/* ------------------------------------------------------------------ */
/* Math helpers                                                        */
/* ------------------------------------------------------------------ */

/** Exponential moving average. `smooth` in [0,1) — 0 = raw, →1 = heavy. */
function ema(values: number[], smooth: number): number[] {
  if (smooth <= 0 || values.length === 0) return values.slice();
  const a = 1 - smooth;
  const out: number[] = [];
  let acc = values[0];
  for (let i = 0; i < values.length; i++) {
    acc = i === 0 ? values[i] : acc * smooth + values[i] * a;
    out.push(acc);
  }
  return out;
}

/** Rolling local std around the smoothed value, used for the ±band. */
function rollingStd(raw: number[], smoothed: number[], window: number): number[] {
  const half = Math.max(1, Math.floor(window / 2));
  return raw.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(raw.length - 1, i + half); j++) {
      const d = raw[j] - smoothed[j];
      sum += d * d;
      n++;
    }
    return n > 0 ? Math.sqrt(sum / n) : 0;
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function RewardCurve({
  episodes = DEFAULT_EPISODES,
  components = DEFAULT_COMPONENTS,
  smooth = 0.7,
  showBreakdown = true,
  showBand = true,
  showRaw = true,
  title = "Episode reward over training",
  caption = "",
  source = "",
  yLabel = "Reward",
  xLabel = "Episode",
  duration = 1200,
  color = "",
}: RewardCurveProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const baseId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<{ i: number; px: number; py: number } | null>(null);

  const totalColor = color || p.accent;

  // Clean + sort the episode log.
  const rows = useMemo(() => {
    const safe = (episodes ?? []).filter(
      (e) => e && Number.isFinite(e.episode) && Number.isFinite(e.reward),
    );
    return [...safe].sort((a, b) => a.episode - b.episode);
  }, [episodes]);

  // Resolve component palette (skip empties).
  const comps = useMemo(() => {
    const safe = (components ?? []).filter((c) => c && c.name);
    return safe.map((c, i) => ({
      name: c.name,
      color: c.color || p.series[i % p.series.length],
    }));
  }, [components, p.series]);

  // Smoothed total reward + ±std band.
  const total = useMemo(() => {
    const xs = rows.map((d) => d.episode);
    const rawVals = rows.map((d) => d.reward);
    const smoothVals = ema(rawVals, smooth);
    const std = rollingStd(rawVals, smoothVals, 7);
    return {
      raw: rows.map((d, k) => ({ episode: d.episode, value: rawVals[k] })),
      smooth: rows.map((d, k) => ({ episode: d.episode, value: smoothVals[k] })),
      band: rows.map((d, k) => ({
        episode: d.episode,
        lo: smoothVals[k] - std[k],
        hi: smoothVals[k] + std[k],
      })),
      xs,
    };
  }, [rows, smooth]);

  // Stacked breakdown layers (only when enabled + we have terms + data).
  const stacks = useMemo(() => {
    if (!showBreakdown || comps.length === 0 || rows.length === 0) return null;
    const data = rows.map((d, i) => {
      const row: Record<string, number> = { __i: i };
      comps.forEach((c) => {
        // Each shaped term is EMA-smoothed independently for a calm stack.
        row[c.name] = d.components?.[c.name] ?? 0;
      });
      return row;
    });
    // Smooth each component column.
    comps.forEach((c) => {
      const col = data.map((r) => r[c.name]);
      const sm = ema(col, smooth);
      data.forEach((r, i) => (r[c.name] = sm[i]));
    });
    const gen = stack<Record<string, number>>()
      .keys(comps.map((c) => c.name))
      .order(stackOrderNone)
      .offset(stackOffsetNone);
    return gen(data);
  }, [showBreakdown, comps, rows, smooth]);

  // Y-domain spans the band, raw, and any negative/positive stack extents.
  const { xDomain, yDomain } = useMemo(() => {
    const xs = total.xs;
    const ys: number[] = [];
    for (const d of total.smooth) ys.push(d.value);
    if (showRaw) for (const d of total.raw) ys.push(d.value);
    if (showBand) for (const d of total.band) ys.push(d.lo, d.hi);
    if (stacks) {
      for (const layer of stacks) {
        for (const seg of layer) ys.push(seg[0], seg[1]);
      }
    }
    if (ys.length === 0) ys.push(0, 1);
    const xExt = extent(xs) as [number, number];
    let lo = d3min(ys) ?? 0;
    let hi = d3max(ys) ?? 1;
    const pad = (hi - lo) * 0.08 || 0.5;
    lo -= pad;
    hi += pad;
    if (lo > 0) lo = 0; // always show the zero baseline for reward
    return {
      xDomain: (xExt[0] === undefined ? [0, 1] : xExt) as [number, number],
      yDomain: [lo, hi] as [number, number],
    };
  }, [total, showRaw, showBand, stacks]);

  const legendItems: LegendItem[] = [
    { label: yLabel || "Total reward", color: totalColor, shape: "line" },
    ...(showBreakdown ? comps.map((c) => ({ label: c.name, color: c.color, shape: "square" as const })) : []),
  ];

  const drawSpan = reduced ? 0 : Math.max(0.3, duration / 1000);
  const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Legend items={legendItems} align="left" />
          <ReplayButton
            onClick={replay}
            className="shrink-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
          />
        </div>

        <ResponsiveSvg
          aspect={16 / 9}
          margin={{ top: 14, right: 18, bottom: 42, left: yLabel ? 56 : 46 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]);
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();

            const xAt = (i: number) => x(rows[i]?.episode ?? 0);

            const lineGen = d3line<{ episode: number; value: number }>()
              .x((d) => x(d.episode))
              .y((d) => y(d.value))
              .curve(curveMonotoneX);

            const bandGen = d3area<{ episode: number; lo: number; hi: number }>()
              .x((d) => x(d.episode))
              .y0((d) => y(d.lo))
              .y1((d) => y(d.hi))
              .curve(curveMonotoneX);

            const stackArea = d3area<[number, number]>()
              .x((_d, j) => xAt(j))
              .y0((d) => y(d[0]))
              .y1((d) => y(d[1]))
              .curve(curveMonotoneX);

            const indexFromX = (px: number) => {
              if (rows.length === 0) return 0;
              const ep = x.invert(px);
              let best = 0;
              let bestD = Infinity;
              for (let i = 0; i < rows.length; i++) {
                const d = Math.abs(rows[i].episode - ep);
                if (d < bestD) {
                  bestD = d;
                  best = i;
                }
              }
              return best;
            };

            const zeroY = y(0);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {comps.map((c, i) => (
                    <VerticalFade
                      key={`cf-${i}`}
                      id={`${baseId}-stack-${i}`}
                      color={c.color}
                      from={0.4}
                      to={0.16}
                    />
                  ))}
                  <VerticalFade id={`${baseId}-band`} color={totalColor} from={0.16} to={0.03} />
                  <clipPath id={`${baseId}-clip`}>
                    <motion.rect
                      x={-2}
                      y={-10}
                      height={inner.height + 20}
                      initial={{ width: reduced ? inner.width + 4 : 0 }}
                      animate={{ width: inView || reduced ? inner.width + 4 : 0 }}
                      transition={{ duration: drawSpan, ease: easeOut }}
                      key={`${token}-clip`}
                    />
                  </clipPath>
                </defs>

                <GridLines scale={y as never} width={inner.width} count={5} />

                {/* zero reference (reward can be negative early in RL) */}
                {yDomain[0] < 0 && (
                  <line
                    x1={0}
                    x2={inner.width}
                    y1={zeroY}
                    y2={zeroY}
                    stroke={p.borderStrong}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                  />
                )}

                {/* faint stacked breakdown of shaped reward terms */}
                {showBreakdown && stacks && (
                  <g clipPath={`url(#${baseId}-clip)`}>
                    {stacks.map((layer, i) => {
                      const segs = layer.map((d) => [d[0], d[1]] as [number, number]);
                      return (
                        <path
                          key={`stack-${comps[i].name}`}
                          d={stackArea(segs) ?? ""}
                          fill={`url(#${baseId}-stack-${i})`}
                          stroke={withAlpha(comps[i].color, 0.55)}
                          strokeWidth={0.75}
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </g>
                )}

                {/* ±std band on the total reward */}
                {showBand && (
                  <motion.path
                    key={`band-${token}`}
                    d={bandGen(total.band) ?? undefined}
                    fill={`url(#${baseId}-band)`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: drawSpan * 0.6, delay: drawSpan * 0.35 }}
                  />
                )}

                {/* faint raw reward trace */}
                {showRaw && (
                  <motion.path
                    key={`raw-${token}`}
                    d={lineGen(total.raw) ?? undefined}
                    fill="none"
                    stroke={withAlpha(totalColor, 0.3)}
                    strokeWidth={1}
                    strokeLinejoin="round"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: drawSpan * 0.5, delay: drawSpan * 0.5 }}
                  />
                )}

                {/* bold smoothed total reward (draw-in via pathLength) */}
                <motion.path
                  key={`total-${token}`}
                  d={lineGen(total.smooth) ?? undefined}
                  fill="none"
                  stroke={totalColor}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  animate={{ pathLength: inView ? 1 : 0 }}
                  transition={{ duration: drawSpan, ease: [0.4, 0, 0.1, 1] }}
                />

                {/* endpoint dot */}
                {(() => {
                  const last = total.smooth[total.smooth.length - 1];
                  if (!last) return null;
                  return (
                    <motion.circle
                      cx={x(last.episode)}
                      cy={y(last.value)}
                      r={3.25}
                      fill={totalColor}
                      stroke={p.surface}
                      strokeWidth={1.5}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                      transition={{ duration: 0.3, delay: drawSpan }}
                      style={{ transformOrigin: `${x(last.episode)}px ${y(last.value)}px` }}
                    />
                  );
                })()}

                {/* hover crosshair + markers */}
                <AnimatePresence>
                  {hover != null && rows[hover.i] && (
                    <motion.g
                      pointerEvents="none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <line
                        x1={xAt(hover.i)}
                        x2={xAt(hover.i)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.borderStrong}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                      <circle
                        cx={xAt(hover.i)}
                        cy={y(total.smooth[hover.i]?.value ?? 0)}
                        r={3.75}
                        fill={p.surface}
                        stroke={totalColor}
                        strokeWidth={2}
                      />
                    </motion.g>
                  )}
                </AnimatePresence>

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label={yLabel}
                  count={5}
                  format={(v) => formatCompact(v, 2)}
                />
                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={(v) => formatCompact(v)}
                  linearCount={6}
                />
                <text
                  x={inner.width / 2}
                  y={inner.height + 36}
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

                {/* pointer capture */}
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
                    setHover({ i, px: margin.left + xAt(i), py: e.clientY - r.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.px ?? 0} y={hover?.py ?? 0} visible={hover != null}>
          {hover != null && rows[hover.i] && (
            <>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {xLabel} {formatCompact(rows[hover.i].episode)}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-[2px] w-3 rounded-full" style={{ background: totalColor }} />
                    <span className="font-mono text-[10px] uppercase tracking-wide opacity-80">
                      reward
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCompact(total.smooth[hover.i]?.value ?? 0, 2)}
                  </span>
                </div>
                {showBreakdown &&
                  comps.map((c) => {
                    const v = rows[hover.i].components?.[c.name];
                    if (v === undefined) return null;
                    return (
                      <div key={c.name} className="flex items-baseline justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-[2px]"
                            style={{ background: c.color }}
                          />
                          <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                            {c.name}
                          </span>
                        </span>
                        <span className="tabular-nums opacity-90">{formatCompact(v, 2)}</span>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </FloatingTooltip>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "reward-curve",
  name: "Reward Curve",
  category: "ml-eval",
  description:
    "RL episode reward over training: an EMA-smoothed return line over a faint raw trace with a ±std band, plus an optional stacked area breaking the shaped reward into its component terms.",
  tags: ["rl", "reward", "reinforcement-learning", "ppo", "curve", "reward-shaping"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "RewardCurve",
  sourcePath: "ml-eval/RewardCurve",
  aspect: 16 / 9,
  controls: [
    {
      key: "episodes",
      label: "Episodes",
      type: "json",
      group: "Data",
      help: "Array of { episode, reward, components?: { [name]: number } }.",
      default: DEFAULT_EPISODES,
    },
    {
      key: "components",
      label: "Reward components",
      type: "json",
      group: "Data",
      help: "Shaped reward terms to stack: [{ name, color? }]. Must match keys in episodes.components.",
      default: DEFAULT_COMPONENTS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Episode reward over training" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Reward" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Episode" },
    {
      key: "smooth",
      label: "EMA smoothing",
      type: "number",
      group: "Style",
      default: 0.7,
      min: 0,
      max: 0.97,
      step: 0.01,
    },
    { key: "showBreakdown", label: "Show shaped breakdown", type: "boolean", group: "Style", default: true },
    { key: "showBand", label: "Show ±std band", type: "boolean", group: "Style", default: true },
    { key: "showRaw", label: "Show raw trace", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Reward color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1200,
      min: 0,
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "shaped-climb",
      name: "Reward climbing with shaping",
      props: {
        title: "Coding-agent reward over episodes",
        caption: "PPO return decomposed into shaped reward terms.",
        yLabel: "Return",
        smooth: 0.7,
        showBreakdown: true,
        showBand: true,
      },
    },
    {
      id: "clean-return",
      name: "Smoothed return only",
      props: {
        title: "Episode return (smoothed)",
        yLabel: "Reward",
        smooth: 0.82,
        showBreakdown: false,
        showBand: true,
        showRaw: true,
      },
    },
    {
      id: "sparse-reward",
      name: "Sparse reward, late take-off",
      props: {
        title: "Sparse-reward navigation task",
        yLabel: "Success reward",
        smooth: 0.6,
        showBreakdown: false,
        showBand: true,
        showRaw: true,
        episodes: [
          { episode: 0, reward: 0.0 },
          { episode: 50, reward: 0.02 },
          { episode: 100, reward: 0.01 },
          { episode: 150, reward: 0.05 },
          { episode: 200, reward: 0.04 },
          { episode: 250, reward: 0.11 },
          { episode: 300, reward: 0.18 },
          { episode: 350, reward: 0.34 },
          { episode: 400, reward: 0.52 },
          { episode: 450, reward: 0.68 },
          { episode: 500, reward: 0.79 },
          { episode: 550, reward: 0.85 },
          { episode: 600, reward: 0.9 },
        ],
      },
    },
  ],
};
