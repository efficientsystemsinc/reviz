"use client";

import { area, line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import { extent } from "d3-array";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  Figure,
  ReplayButton,
  VerticalFade,
  formatCompact,
  round,
  uid,
  useAnimatedNumber,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useProgress,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

export interface StatCardProps {
  label?: string;
  value?: number;
  unit?: string;
  prefix?: string;
  decimals?: number;
  delta?: number;
  deltaSuffix?: string;
  spark?: number[];
  color?: string;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

/** Format the headline number: respect decimals, fall back to compact for large magnitudes. */
function formatValue(v: number, decimals: number): string {
  if (Math.abs(v) >= 100000) return formatCompact(v, 1);
  const fixed = round(v, decimals).toFixed(Math.max(0, decimals));
  // group thousands without locale surprises
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac != null ? `${grouped}.${frac}` : grouped;
}

export default function StatCard({
  label = "Recall@10",
  value = 0.882,
  unit = "",
  prefix = "",
  decimals = 3,
  delta = 0.12,
  deltaSuffix = "vs prev. checkpoint",
  spark = [0.71, 0.74, 0.73, 0.78, 0.8, 0.79, 0.83, 0.85, 0.86, 0.882],
  color = "",
  title = "",
  caption = "",
  source = "",
  duration = 1100,
}: StatCardProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const reduced = usePrefersReducedMotion();

  const animated = useAnimatedNumber(value, {
    duration,
    easing: "easeOut",
    enabled: inView,
    trigger: token,
  });

  // delta semantics: up = ok, down = bad, flat = neutral.
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const deltaColor = dir === "up" ? p.ok : dir === "down" ? p.bad : p.inkFaint;
  const DeltaIcon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;

  const gradId = useMemo(() => uid("spark-fill"), []);
  const series = Array.isArray(spark) ? spark.filter((n) => Number.isFinite(n)) : [];
  const hasSpark = series.length >= 2;

  // sparkline geometry (viewBox space)
  const W = 220;
  const H = 56;
  const PAD = 4;
  const sparkProgress = useProgress({ duration, enabled: inView, trigger: token });

  const { linePath, areaPath, lastPt } = useMemo(() => {
    if (!hasSpark) return { linePath: "", areaPath: "", lastPt: { x: 0, y: 0 } };
    const xs = scaleLinear()
      .domain([0, series.length - 1])
      .range([PAD, W - PAD]);
    const [lo, hi] = extent(series) as [number, number];
    const span = hi - lo || 1;
    const ys = scaleLinear()
      .domain([lo - span * 0.15, hi + span * 0.15])
      .range([H - PAD, PAD]);
    const lineGen = line<number>()
      .x((_, i) => xs(i))
      .y((d) => ys(d));
    const areaGen = area<number>()
      .x((_, i) => xs(i))
      .y0(H)
      .y1((d) => ys(d));
    return {
      linePath: lineGen(series) ?? "",
      areaPath: areaGen(series) ?? "",
      lastPt: { x: xs(series.length - 1), y: ys(series[series.length - 1]) },
    };
  }, [series, hasSpark]);

  const headline = `${prefix}${formatValue(animated, decimals)}${unit}`;
  const deltaText = `${dir === "up" ? "+" : dir === "down" ? "−" : ""}${formatValue(
    Math.abs(delta),
    decimals,
  )}`;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <motion.div
        ref={ref}
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: duration / 1400, ease: [0.22, 1, 0.36, 1] }}
        className="group/stat relative w-full overflow-hidden rounded-reviz border border-border bg-surface p-5"
      >
        {/* accent rail */}
        <motion.span
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px] rounded-l-reviz"
          style={{ background: accent }}
          initial={reduced ? false : { scaleY: 0 }}
          animate={inView ? { scaleY: 1 } : undefined}
          transition={{ duration: duration / 1400, ease: [0.22, 1, 0.36, 1] }}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-label text-ink-muted">
              {label}
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-sans text-[40px] font-semibold leading-none tracking-tight text-ink tabular-nums">
                {headline}
              </span>
            </div>

            {/* delta chip */}
            <AnimatePresence>
              {inView && (
                <motion.div
                  className="mt-3 flex items-center gap-2"
                  initial={reduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: duration / 1600, duration: 0.4 }}
                >
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums"
                    style={{
                      color: deltaColor,
                      background: withAlpha(deltaColor, 0.13),
                    }}
                  >
                    <DeltaIcon className="h-3 w-3" strokeWidth={2.5} />
                    {deltaText}
                  </span>
                  {deltaSuffix && (
                    <span className="truncate font-serif text-[12px] italic text-ink-faint">
                      {deltaSuffix}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* sparkline */}
          {hasSpark && (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-[56px] w-[120px] shrink-0 self-center sm:w-[140px]"
              role="img"
              aria-label={`${label} trend`}
            >
              <defs>
                <VerticalFade id={gradId} color={accent} from={0.26} to={0} />
              </defs>
              <motion.path
                d={areaPath}
                fill={`url(#${gradId})`}
                initial={reduced ? false : { opacity: 0 }}
                animate={inView ? { opacity: 1 } : undefined}
                transition={{ delay: duration / 2200, duration: duration / 1600 }}
              />
              <motion.path
                d={linePath}
                fill="none"
                stroke={accent}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
                animate={{ pathLength: inView ? 1 : 0 }}
                transition={{ duration: duration / 1000, ease: [0.4, 0, 0.2, 1] }}
              />
              <motion.circle
                cx={lastPt.x}
                cy={lastPt.y}
                r={3.5}
                fill={accent}
                stroke={p.surface}
                strokeWidth={1.5}
                initial={reduced ? false : { opacity: 0, scale: 0 }}
                animate={{
                  opacity: reduced ? 1 : sparkProgress > 0.92 ? 1 : 0,
                  scale: reduced ? 1 : sparkProgress > 0.92 ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
              />
            </svg>
          )}
        </div>

        <ReplayButton
          onClick={replay}
          label="replay"
          className="absolute bottom-3 right-3 border-transparent bg-transparent px-1.5 py-1 opacity-0 transition-opacity group-hover/stat:opacity-100"
        />
      </motion.div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "stat-card",
  name: "Stat Card",
  category: "data-display",
  description:
    "A single KPI card with a big count-up number, a colored ▲/▼ delta chip, and an inline sparkline trend — the headline metric of any dashboard.",
  tags: ["kpi", "metric", "sparkline", "delta", "dashboard"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "StatCard",
  sourcePath: "data-display/StatCard",
  aspect: 16 / 6,
  controls: [
    {
      key: "value",
      label: "Value",
      type: "number",
      group: "Data",
      default: 0.882,
      min: -1000000,
      max: 1000000,
      step: 0.001,
    },
    {
      key: "delta",
      label: "Delta",
      type: "number",
      group: "Data",
      default: 0.12,
      min: -1000000,
      max: 1000000,
      step: 0.001,
    },
    {
      key: "spark",
      label: "Sparkline",
      type: "json",
      group: "Data",
      default: [0.71, 0.74, 0.73, 0.78, 0.8, 0.79, 0.83, 0.85, 0.86, 0.882],
    },
    { key: "label", label: "Label", type: "text", group: "Labels", default: "Recall@10" },
    { key: "prefix", label: "Prefix", type: "text", group: "Labels", default: "" },
    { key: "unit", label: "Unit", type: "text", group: "Labels", default: "" },
    {
      key: "deltaSuffix",
      label: "Delta context",
      type: "text",
      group: "Labels",
      default: "vs prev. checkpoint",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "decimals",
      label: "Decimals",
      type: "number",
      group: "Style",
      default: 3,
      min: 0,
      max: 4,
      step: 1,
    },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1100,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "recall",
      name: "Recall@10",
      props: {
        label: "Recall@10",
        value: 0.882,
        prefix: "",
        unit: "",
        decimals: 3,
        delta: 0.12,
        deltaSuffix: "vs prev. checkpoint",
        spark: [0.71, 0.74, 0.73, 0.78, 0.8, 0.79, 0.83, 0.85, 0.86, 0.882],
      },
    },
    {
      id: "latency",
      name: "p50 latency",
      props: {
        label: "p50 latency",
        value: 650,
        unit: "ms",
        decimals: 0,
        delta: -84,
        deltaSuffix: "vs last release",
        color: "",
        spark: [812, 790, 760, 744, 738, 705, 690, 672, 661, 650],
      },
    },
    {
      id: "throughput",
      name: "Tokens / sec",
      props: {
        label: "Throughput",
        value: 12840,
        unit: " tok/s",
        decimals: 0,
        delta: 1320,
        deltaSuffix: "vs prev. kernel",
        spark: [9100, 9600, 10200, 10800, 11100, 11600, 12000, 12350, 12600, 12840],
      },
    },
  ],
};
