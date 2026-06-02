"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Crown, Medal, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Figure,
  ReplayButton,
  formatCompact,
  mix,
  round,
  useAnimatedNumber,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Row {
  name: string;
  score: number;
  delta?: number;
}

export interface LeaderboardProps {
  rows: Row[];
  title?: string;
  caption?: string;
  source?: string;
  metricName?: string;
  color?: string;
  duration?: number;
  showBars?: boolean;
}

type SortDir = "desc" | "asc";

export default function Leaderboard({
  rows = [
    { name: "Atlas-3", score: 88.4, delta: 2.1 },
    { name: "Aria-L", score: 87.9, delta: 3.4 },
    { name: "Nova-Ultra", score: 85.2, delta: 1.2 },
    { name: "Vega-405B", score: 79.6, delta: -0.8 },
    { name: "Orion-Max", score: 77.1, delta: 4.6 },
    { name: "Lyra-Large-3", score: 71.3, delta: 0.0 },
    { name: "Halo-V4", score: 68.9, delta: -2.3 },
  ],
  title = "Frontier model leaderboard",
  caption = "",
  source = "",
  metricName = "MMLU-Pro",
  color = "",
  duration = 900,
  showBars = true,
}: LeaderboardProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Top score governs bar widths so the leader fills the track.
  const maxScore = useMemo(
    () => Math.max(1, ...rows.map((r) => Math.abs(r.score))),
    [rows],
  );

  // Ranked rows. Rank badges follow the descending (canonical) order so #1 is
  // always the best model regardless of the current sort direction.
  const ranked = useMemo(() => {
    const withRank = [...rows]
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return [...withRank].sort((a, b) =>
      sortDir === "desc" ? b.score - a.score : a.score - b.score,
    );
  }, [rows, sortDir]);

  const animate = inView && !reduced;
  const step = ranked.length > 1 ? 0.07 : 0;

  // Medal accent per top-3 rank. Returns null for everyone else.
  const medalColor = (rank: number) => {
    if (rank === 1) return p.warn; // gold
    if (rank === 2) return mix(p.inkFaint, p.surface, 0.15); // silver
    if (rank === 3) return mix(p.warn, p.bad, 0.5); // bronze
    return null;
  };

  return (
    <Figure
      variant="plain"
      align="left"
      title={title}
      caption={caption}
      source={source}
    >
      <div ref={ref} className="relative w-full">
        {/* Header row */}
        <div className="mb-1.5 flex items-center gap-3 px-1 pb-2">
          <div className="w-7 shrink-0 text-center font-mono text-[10px] uppercase tracking-label text-ink-faint">
            #
          </div>
          <div className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-label text-ink-faint">
            Model
          </div>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            title="Sort by score"
            className="group inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-ink-muted transition-colors hover:text-ink"
          >
            {metricName}
            <motion.span
              key={sortDir}
              initial={{ rotate: sortDir === "desc" ? -12 : 12, opacity: 0.4 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="text-accent"
            >
              {sortDir === "desc" ? (
                <ArrowDown className="h-3 w-3" />
              ) : (
                <ArrowUp className="h-3 w-3" />
              )}
            </motion.span>
          </button>
          <div className="w-16 shrink-0 text-right font-mono text-[10px] uppercase tracking-label text-ink-faint">
            Δ
          </div>
        </div>

        <div className="h-px w-full bg-border" />

        {/* Rows */}
        <ol className="flex flex-col">
          <AnimatePresence initial={false}>
            {ranked.map((r, i) => {
              const medal = medalColor(r.rank);
              const isLeader = r.rank === 1;
              const barColor = isLeader
                ? fill
                : medal
                  ? mix(fill, medal, 0.45)
                  : mix(fill, p.inkFaint, 0.35);
              return (
                <LeaderboardRow
                  key={r.name}
                  name={r.name}
                  score={r.score}
                  delta={r.delta}
                  rank={r.rank}
                  isLeader={isLeader}
                  medal={medal}
                  barColor={barColor}
                  pct={Math.max(0, (r.score / maxScore) * 100)}
                  fill={fill}
                  showBars={showBars}
                  animate={animate}
                  reduced={reduced}
                  duration={duration}
                  delay={i * step}
                  token={token}
                  p={p}
                />
              );
            })}
          </AnimatePresence>
        </ol>

        <div className="mt-2 flex items-center justify-between px-1">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            {ranked.length} models · sorted {sortDir === "desc" ? "high → low" : "low → high"}
          </span>
          <ReplayButton onClick={replay} label="Replay" />
        </div>
      </div>
    </Figure>
  );
}

function LeaderboardRow({
  name,
  score,
  delta,
  rank,
  isLeader,
  medal,
  barColor,
  pct,
  fill,
  showBars,
  animate,
  reduced,
  duration,
  delay,
  token,
  p,
}: {
  name: string;
  score: number;
  delta: number | undefined;
  rank: number;
  isLeader: boolean;
  medal: string | null;
  barColor: string;
  pct: number;
  fill: string;
  showBars: boolean;
  animate: boolean;
  reduced: boolean;
  duration: number;
  delay: number;
  token: number;
  p: ReturnType<typeof usePalette>;
}) {
  const live = useAnimatedNumber(score, {
    duration,
    delay: (delay + 0.05) * 1000,
    enabled: animate,
    trigger: token,
  });

  return (
    <motion.li
      layout={!reduced}
      initial={{ opacity: 0, y: animate ? 10 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: animate ? delay : 0,
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
        layout: { duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] },
      }}
      className="group/row relative flex items-center gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-surface-alt"
      style={isLeader ? { background: withAlpha(fill, 0.05) } : undefined}
    >
      {/* Rank badge */}
      <div className="flex w-7 shrink-0 items-center justify-center">
        {medal ? (
          <span
            className="grid h-6 w-6 place-items-center rounded-full"
            style={{
              background: withAlpha(medal, 0.16),
              color: medal,
              boxShadow: `inset 0 0 0 1px ${withAlpha(medal, 0.4)}`,
            }}
          >
            {rank === 1 ? (
              <Crown className="h-3.5 w-3.5" />
            ) : (
              <Medal className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="font-mono text-[12px] tabular-nums text-ink-faint">
            {rank}
          </span>
        )}
      </div>

      {/* Name + inline bar */}
      <div className="min-w-0 flex-1">
        <span
          className={
            "block truncate text-[13.5px] leading-tight text-ink " +
            (isLeader ? "font-semibold" : "font-medium")
          }
        >
          {name}
        </span>
        {showBars && (
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: withAlpha(p.inkFaint, 0.14) }}
          >
            <motion.div
              key={`${token}-${name}`}
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${withAlpha(barColor, 0.65)}, ${barColor})`,
              }}
              initial={{ width: animate ? "0%" : `${pct}%` }}
              animate={{ width: `${pct}%` }}
              transition={{
                duration: reduced ? 0 : duration / 1000,
                delay: animate ? delay + 0.05 : 0,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </div>
        )}
      </div>

      {/* Score */}
      <div className="shrink-0 text-right">
        <span
          className={
            "block font-mono text-[14px] tabular-nums text-ink " +
            (isLeader ? "font-semibold" : "")
          }
        >
          {formatNum(live)}
        </span>
      </div>

      {/* Delta */}
      <div className="w-16 shrink-0 text-right">
        <Delta value={delta} p={p} />
      </div>
    </motion.li>
  );
}

function Delta({
  value,
  p,
}: {
  value: number | undefined;
  p: ReturnType<typeof usePalette>;
}) {
  if (value === undefined || value === null) {
    return <span className="font-mono text-[11px] text-ink-faint">—</span>;
  }
  const up = value > 0.0001;
  const down = value < -0.0001;
  const tone = up ? p.ok : down ? p.bad : p.inkFaint;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const txt = `${value > 0 ? "+" : ""}${round(value, 1)}`;
  return (
    <span
      className="inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums"
      style={{ color: tone }}
    >
      <Icon className="h-3 w-3" />
      {up || down ? txt.replace("-", "") : "0.0"}
    </span>
  );
}

function formatNum(n: number): string {
  if (n >= 1000) return formatCompact(n, 1);
  return n.toFixed(1);
}

export const meta: RevizMeta = {
  id: "leaderboard",
  name: "Leaderboard",
  category: "ml-eval",
  description:
    "A ranked model leaderboard with count-up scores, inline animated bars, medal accents for the top three, and a sortable score header.",
  tags: ["leaderboard", "ranking", "benchmark", "eval", "models"],
  badges: ["animated", "interactive", "themed", "responsive"],
  exportName: "Leaderboard",
  sourcePath: "ml-eval/Leaderboard",
  aspect: 16 / 11,
  controls: [
    {
      key: "rows",
      label: "Rows",
      type: "json",
      group: "Data",
      help: "Array of { name, score, delta? }.",
      default: [
        { name: "Atlas-3", score: 88.4, delta: 2.1 },
        { name: "Aria-L", score: 87.9, delta: 3.4 },
        { name: "Nova-Ultra", score: 85.2, delta: 1.2 },
        { name: "Vega-405B", score: 79.6, delta: -0.8 },
        { name: "Orion-Max", score: 77.1, delta: 4.6 },
        { name: "Lyra-Large-3", score: 71.3, delta: 0.0 },
        { name: "Halo-V4", score: 68.9, delta: -2.3 },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Frontier model leaderboard" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "metricName", label: "Metric name", type: "text", group: "Labels", default: "MMLU-Pro" },
    { key: "showBars", label: "Show bars", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 900, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "llm-benchmark",
      name: "LLM benchmark",
      props: {
        title: "Frontier model leaderboard",
        metricName: "MMLU-Pro",
        caption: "Accuracy on the held-out MMLU-Pro test split; Δ vs. previous release.",
        source: "Internal eval harness",
        rows: [
          { name: "Atlas-3", score: 88.4, delta: 2.1 },
          { name: "Aria-L", score: 87.9, delta: 3.4 },
          { name: "Nova-Ultra", score: 85.2, delta: 1.2 },
          { name: "Vega-405B", score: 79.6, delta: -0.8 },
          { name: "Orion-Max", score: 77.1, delta: 4.6 },
          { name: "Lyra-Large-3", score: 71.3, delta: 0.0 },
          { name: "Halo-V4", score: 68.9, delta: -2.3 },
        ],
      },
    },
    {
      id: "agent-bench",
      name: "Agent benchmark",
      props: {
        title: "SWE-bench Verified",
        metricName: "% resolved",
        caption: "Share of GitHub issues resolved end-to-end by each agent.",
        rows: [
          { name: "Aria-L + scaffold", score: 64.2, delta: 7.5 },
          { name: "Atlas-3 Agent", score: 61.8, delta: 5.1 },
          { name: "Nova-Coder", score: 54.0, delta: 3.2 },
          { name: "Iris-v3", score: 48.6, delta: 1.4 },
          { name: "Orion-Hands", score: 41.2, delta: -1.0 },
        ],
      },
    },
    {
      id: "latency",
      name: "Latency (lower better)",
      props: {
        title: "Inference latency leaderboard",
        metricName: "tok/s",
        showBars: true,
        rows: [
          { name: "Aria-S", score: 612, delta: 48 },
          { name: "Nova-Flash", score: 540, delta: 22 },
          { name: "Atlas-3 Mini", score: 471, delta: -12 },
          { name: "Vega-70B", score: 388, delta: 9 },
          { name: "Lyra-Small-3", score: 305, delta: 0 },
        ],
      },
    },
  ],
};
