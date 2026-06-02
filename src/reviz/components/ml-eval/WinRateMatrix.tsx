"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  clamp,
  mix,
  readableOn,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

export interface WinRateMatrixProps {
  /** Model / agent names, one per row & column. */
  models?: string[];
  /** Square matrix of win rates (%): winRates[r][c] = % of games model r beats model c. */
  winRates?: number[][];
  /** Show the numeric win-rate inside each cell. */
  showValues?: boolean;
  /** Show the per-model average win-rate column on the right. */
  showAverage?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  /** Overrides the "winning" accent color. */
  color?: string;
  duration?: number;
}

const FALLBACK_MODELS = (n: number) => Array.from({ length: n }, (_, i) => `M${i + 1}`);

export default function WinRateMatrix({
  models = ["Atlas-4", "Aria-3", "Nova-1", "Vega-70B", "Lyra-L"],
  winRates = [
    [50, 58, 62, 71, 76],
    [42, 50, 55, 66, 70],
    [38, 45, 50, 61, 67],
    [29, 34, 39, 50, 57],
    [24, 30, 33, 43, 50],
  ],
  showValues = true,
  showAverage = true,
  title = "",
  caption = "",
  source = "",
  color = "",
  duration = 950,
}: WinRateMatrixProps) {
  const p = usePalette();
  const winColor = color || p.accent;
  const loseColor = p.bad === winColor ? p.warn : p.bad;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  const n = winRates.length;
  const names = useMemo(() => {
    if (models.length >= n) return models.slice(0, n);
    return [...models, ...FALLBACK_MODELS(n).slice(models.length)];
  }, [models, n]);

  // Per-model average win-rate across all opponents (excludes the self/diagonal cell).
  const averages = useMemo(
    () =>
      winRates.map((row, r) => {
        const opp = row.filter((_, c) => c !== r);
        return opp.length ? opp.reduce((a, b) => a + b, 0) / opp.length : 0;
      }),
    [winRates],
  );

  // Ranking by average win-rate (1 = strongest), used to order the leaderboard rail.
  const rankOf = useMemo(() => {
    const order = averages.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const ranks = new Array(n).fill(0);
    order.forEach((o, idx) => (ranks[o.i] = idx + 1));
    return ranks;
  }, [averages, n]);

  // Diverging ramp centered at 50%: < 50 fades toward the "lose" hue, > 50 toward "win".
  const cellFill = (v: number) => {
    const t = clamp((v - 50) / 50, -1, 1); // -1..1
    const eased = Math.sign(t) * Math.pow(Math.abs(t), 0.78);
    if (eased >= 0) return mix(p.surface, winColor, eased * 0.92);
    return mix(p.surface, loseColor, -eased * 0.92);
  };

  const cellText = (v: number) => {
    const t = clamp((v - 50) / 50, -1, 1);
    const eased = Math.sign(t) * Math.pow(Math.abs(t), 0.78);
    const mag = Math.abs(eased) * 0.92;
    if (mag > 0.52) return readableOn(mix(p.surface, eased >= 0 ? winColor : loseColor, mag));
    return p.inkMuted;
  };

  const aspect = 1.12;
  const labelChars = Math.max(...names.map((l) => l.length), 4);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={aspect}
          margin={{
            top: 38,
            right: showAverage ? 64 : 18,
            bottom: 44,
            left: Math.min(118, 30 + labelChars * 6.6),
          }}
        >
          {({ inner, margin }) => {
            const railW = showAverage ? Math.min(46, inner.width * 0.16) : 0;
            const gridW = inner.width - railW - (showAverage ? 12 : 0);
            const size = Math.min(gridW, inner.height);
            const ox = 0;
            const oy = (inner.height - size) / 2;
            const cell = n > 0 ? size / n : 0;
            const gap = Math.min(3, cell * 0.05);
            const fontSize = Math.max(8.5, Math.min(15, cell * 0.27));
            const tickFont = Math.max(8.5, Math.min(12, cell * 0.3));

            const orderDelay = (r: number, c: number) => {
              const wave = (r + c) * 0.5 + Math.abs(r - c) * 0.16;
              return reduced ? 0 : (wave / (n * 1.6)) * (duration / 1000);
            };

            // Max average for the leaderboard bar scale.
            const maxAvg = Math.max(...averages, 1);

            return (
              <g transform={`translate(${margin.left + ox}, ${margin.top + oy})`}>
                {/* Axis titles */}
                <text
                  x={size / 2}
                  y={-margin.top + 4}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  className="font-mono uppercase"
                  style={{ fontSize: 10, letterSpacing: "0.12em" }}
                >
                  Opponent
                </text>
                <text
                  transform={`translate(${-margin.left + 12}, ${size / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  className="font-mono uppercase"
                  style={{ fontSize: 10, letterSpacing: "0.12em" }}
                >
                  Model
                </text>

                {/* Opponent (column) tick labels along the top */}
                {names.map((label, c) => {
                  const active = hover?.c === c;
                  return (
                    <text
                      key={`xt-${c}`}
                      x={c * cell + cell / 2}
                      y={-6}
                      textAnchor="middle"
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Model (row) tick labels along the left */}
                {names.map((label, r) => {
                  const active = hover?.r === r;
                  return (
                    <text
                      key={`yt-${r}`}
                      x={-8}
                      y={r * cell + cell / 2}
                      dy="0.32em"
                      textAnchor="end"
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Cells */}
                {winRates.map((row, r) =>
                  row.map((v, c) => {
                    const x = c * cell;
                    const y = r * cell;
                    const isDiag = r === c;
                    const onCross = hover != null && (hover.r === r || hover.c === c);
                    const exact = hover != null && hover.r === r && hover.c === c;
                    const dimmed = hover != null && !onCross;
                    const fill = isDiag ? p.surfaceAlt : cellFill(v);

                    return (
                      <g key={`cell-${token}-${r}-${c}`}>
                        <motion.rect
                          x={x + gap / 2}
                          y={y + gap / 2}
                          width={Math.max(0, cell - gap)}
                          height={Math.max(0, cell - gap)}
                          rx={Math.min(4, cell * 0.12)}
                          fill={fill}
                          stroke={exact ? winColor : isDiag ? p.border : p.border}
                          strokeWidth={exact ? 1.6 : 0.75}
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{
                            opacity: inView ? (dimmed ? 0.3 : 1) : 0,
                            scale: inView ? (exact ? 1.04 : 1) : 0.6,
                          }}
                          transition={{
                            opacity: { duration: reduced ? 0 : 0.45, delay: hover ? 0 : orderDelay(r, c) },
                            scale: {
                              duration: reduced ? 0 : exact ? 0.18 : 0.5,
                              delay: hover ? 0 : orderDelay(r, c),
                              ease: [0.22, 1, 0.36, 1],
                            },
                          }}
                          style={{ transformOrigin: `${x + cell / 2}px ${y + cell / 2}px`, cursor: isDiag ? "default" : "pointer" }}
                          onMouseMove={(e: React.MouseEvent<SVGRectElement>) => {
                            const svg = e.currentTarget.ownerSVGElement;
                            if (!svg) return;
                            const rect = svg.getBoundingClientRect();
                            setHover({ r, c, x: e.clientX - rect.left, y: e.clientY - rect.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                        {isDiag ? (
                          // greyed diagonal: a subtle dash instead of a self-matchup value
                          <line
                            x1={x + cell * 0.34}
                            y1={y + cell / 2}
                            x2={x + cell * 0.66}
                            y2={y + cell / 2}
                            stroke={p.inkFaint}
                            strokeWidth={1}
                            className="pointer-events-none"
                            opacity={dimmed ? 0.4 : 0.75}
                          />
                        ) : (
                          showValues &&
                          cell > 18 && (
                            <motion.text
                              x={x + cell / 2}
                              y={y + cell / 2}
                              dy="0.34em"
                              textAnchor="middle"
                              fill={cellText(v)}
                              className="font-mono tabular-nums pointer-events-none"
                              style={{ fontSize, fontWeight: 500 }}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: inView ? (dimmed ? 0.4 : 1) : 0 }}
                              transition={{
                                duration: reduced ? 0 : 0.4,
                                delay: hover ? 0 : orderDelay(r, c) + 0.18,
                              }}
                            >
                              {round(v, v % 1 === 0 ? 0 : 1)}
                            </motion.text>
                          )
                        )}
                      </g>
                    );
                  }),
                )}

                {/* Outer frame */}
                <rect
                  x={0}
                  y={0}
                  width={size}
                  height={size}
                  fill="none"
                  stroke={p.borderStrong}
                  strokeWidth={1}
                  rx={Math.min(5, cell * 0.12)}
                  className="pointer-events-none"
                />

                {/* Leaderboard rail: average win-rate per model */}
                {showAverage && (
                  <g transform={`translate(${size + 12}, 0)`}>
                    <text
                      x={railW / 2}
                      y={-6}
                      textAnchor="middle"
                      fill={p.inkFaint}
                      className="font-mono uppercase"
                      style={{ fontSize: Math.max(7.5, tickFont * 0.82), letterSpacing: "0.1em" }}
                    >
                      avg
                    </text>
                    {averages.map((avg, r) => {
                      const y = r * cell;
                      const barH = Math.max(0, cell - gap - 2);
                      const w = (avg / maxAvg) * railW;
                      const active = hover?.r === r;
                      const dimmed = hover != null && hover.r !== r;
                      const lead = rankOf[r] === 1;
                      return (
                        <g key={`avg-${token}-${r}`} opacity={dimmed ? 0.4 : 1}>
                          <rect
                            x={0}
                            y={y + gap / 2 + 1}
                            width={railW}
                            height={barH}
                            rx={Math.min(3, cell * 0.1)}
                            fill={p.surfaceAlt}
                          />
                          <motion.rect
                            x={0}
                            y={y + gap / 2 + 1}
                            height={barH}
                            rx={Math.min(3, cell * 0.1)}
                            fill={lead ? winColor : withAlpha(winColor, 0.55)}
                            initial={{ width: 0 }}
                            animate={{ width: inView ? w : 0 }}
                            transition={{
                              duration: reduced ? 0 : 0.6,
                              delay: reduced ? 0 : 0.2 + (r / Math.max(1, n)) * (duration / 1000),
                              ease: [0.22, 1, 0.36, 1],
                            }}
                          />
                          <text
                            x={railW + 5}
                            y={y + cell / 2}
                            dy="0.32em"
                            textAnchor="start"
                            fill={active || lead ? p.ink : p.inkMuted}
                            className="font-mono tabular-nums pointer-events-none"
                            style={{ fontSize: Math.max(8, tickFont * 0.9), fontWeight: lead ? 600 : 400 }}
                          >
                            {round(avg, 0)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* Diverging legend + count readout */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-label text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-[2px]" style={{ background: cellFill(20) }} />
            loses
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-[2px]" style={{ background: p.surfaceAlt }} />
            even (50%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-[2px]" style={{ background: cellFill(80) }} />
            wins
          </span>
          <span className="text-border-strong">/</span>
          <span>
            n <span className="tabular-nums text-ink-muted">{n}</span> models
          </span>
        </div>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {names[hover.r]} {"vs"} {names[hover.c]}
              </div>
              {hover.r === hover.c ? (
                <TooltipRow label="self" value="—" />
              ) : (
                <>
                  <TooltipRow label="win rate" value={`${round(winRates[hover.r]?.[hover.c] ?? 0, 1)}%`} />
                  <TooltipRow label="loss rate" value={`${round(100 - (winRates[hover.r]?.[hover.c] ?? 0), 1)}%`} />
                  <TooltipRow
                    label="verdict"
                    value={(winRates[hover.r]?.[hover.c] ?? 50) >= 50 ? "favored" : "underdog"}
                  />
                </>
              )}
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} label="replay" />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "win-rate-matrix",
  name: "Win-Rate Matrix",
  category: "ml-eval",
  description:
    "A head-to-head win-rate matrix where each cell is the percentage of games the row model beats the column model — a diverging ramp centered at 50%, a greyed self-diagonal, a per-model average leaderboard rail, and hover that lights up the matchup.",
  tags: ["win-rate", "head-to-head", "tournament", "leaderboard", "elo", "evaluation", "arena"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "WinRateMatrix",
  sourcePath: "ml-eval/WinRateMatrix",
  aspect: 1.12,
  controls: [
    {
      key: "models",
      label: "Models",
      type: "json",
      group: "Data",
      default: ["Atlas-4", "Aria-3", "Nova-1", "Vega-70B", "Lyra-L"],
    },
    {
      key: "winRates",
      label: "Win rates (% row beats col)",
      type: "matrix",
      group: "Data",
      default: [
        [50, 58, 62, 71, 76],
        [42, 50, 55, 66, 70],
        [38, 45, 50, 61, 67],
        [29, 34, 39, 50, 57],
        [24, 30, 33, 43, 50],
      ],
    },
    { key: "showValues", label: "Show cell values", type: "boolean", group: "Style", default: true },
    { key: "showAverage", label: "Show average rail", type: "boolean", group: "Style", default: true },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Win color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 950, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "llm-arena",
      name: "LLM arena (5 models)",
      props: {
        title: "Head-to-head win rates — pairwise LLM arena",
        caption: "Each cell is the % of judged battles the row model wins against the column model.",
        source: "12.4k human preference battles",
        models: ["Atlas-4", "Aria-3", "Nova-1", "Vega-70B", "Lyra-L"],
        winRates: [
          [50, 58, 62, 71, 76],
          [42, 50, 55, 66, 70],
          [38, 45, 50, 61, 67],
          [29, 34, 39, 50, 57],
          [24, 30, 33, 43, 50],
        ],
      },
    },
    {
      id: "rl-tournament",
      name: "Self-play tournament",
      props: {
        title: "Self-play policy tournament",
        caption: "Win rate of row agent vs column agent over 1,000 matches each.",
        models: ["v5-final", "v4", "v3", "v2-base"],
        winRates: [
          [50, 64, 78, 91],
          [36, 50, 67, 84],
          [22, 33, 50, 71],
          [9, 16, 29, 50],
        ],
      },
    },
    {
      id: "tight-race",
      name: "Tight race",
      props: {
        title: "Frontier models — near-parity",
        caption: "A closely matched cohort where most matchups hover around even.",
        showAverage: false,
        models: ["Model A", "Model B", "Model C", "Model D"],
        winRates: [
          [50, 53, 49, 55],
          [47, 50, 52, 51],
          [51, 48, 50, 54],
          [45, 49, 46, 50],
        ],
      },
    },
  ],
};
