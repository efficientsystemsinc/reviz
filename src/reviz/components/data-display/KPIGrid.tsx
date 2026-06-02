"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useId, useMemo } from "react";
import {
  Figure,
  ReplayButton,
  clamp,
  round,
  useAnimatedNumber,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface KPIItem {
  /** Mono label, e.g. "Throughput". */
  label: string;
  /** The headline value (count-up target). */
  value: number;
  /** Optional unit suffix, e.g. "tok/s", "%", "ms". */
  unit?: string;
  /** Optional prefix glued to the number, e.g. "$" or "~". */
  prefix?: string;
  /** Period-over-period delta in value units. Sign drives the chip. */
  delta?: number;
  /** Recent history for the inline sparkline (oldest → newest). */
  spark?: number[];
  /** When true, a lower value is the good outcome (e.g. latency, error rate). */
  lowerIsBetter?: boolean;
  /** Fixed decimal places for the big number (auto otherwise). */
  decimals?: number;
}

export interface KPIGridProps {
  items?: KPIItem[];
  columns?: number;
  showSparkline?: boolean;
  showDelta?: boolean;
  color?: string;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

const DEFAULT_ITEMS: KPIItem[] = [
  {
    label: "Throughput",
    value: 12840,
    unit: "tok/s",
    delta: 1320,
    decimals: 0,
    spark: [9100, 9600, 10200, 10800, 11100, 11600, 12000, 12350, 12600, 12840],
  },
  {
    label: "p50 latency",
    value: 142,
    unit: "ms",
    delta: -23,
    lowerIsBetter: true,
    decimals: 0,
    spark: [198, 191, 184, 177, 170, 165, 158, 151, 147, 142],
  },
  {
    label: "Error rate",
    value: 0.18,
    unit: "%",
    delta: -0.07,
    lowerIsBetter: true,
    decimals: 2,
    spark: [0.41, 0.38, 0.34, 0.31, 0.28, 0.26, 0.23, 0.21, 0.19, 0.18],
  },
  {
    label: "Uptime",
    value: 99.98,
    unit: "%",
    delta: 0.04,
    decimals: 2,
    spark: [99.9, 99.92, 99.91, 99.94, 99.95, 99.95, 99.96, 99.97, 99.97, 99.98],
  },
];

/* ------------------------------------------------------------------ */

/** Auto decimals: big magnitudes round to integers, small fractions keep precision. */
function autoDecimals(v: number): number {
  const a = Math.abs(v);
  return a >= 1000 ? 0 : a >= 100 ? 0 : a >= 1 ? 2 : 3;
}

function fmtValue(value: number, decimals: number | undefined): string {
  const d = decimals ?? autoDecimals(value);
  const fixed = round(value, d).toFixed(d);
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac != null ? `${grouped}.${frac}` : grouped;
}

function fmtDelta(delta: number, decimals: number | undefined): string {
  const d = decimals ?? autoDecimals(delta);
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${round(Math.abs(delta), d).toFixed(d)}`;
}

/* ------------------------------------------------------------------ */

function Sparkline({
  data,
  color,
  positive,
  inView,
  duration,
  delay,
  reduced,
  trigger,
}: {
  data: number[];
  color: string;
  positive: boolean;
  inView: boolean;
  duration: number;
  delay: number;
  reduced: boolean;
  trigger: number;
}) {
  const p = usePalette();
  const gradId = useId();
  const w = 132;
  const h = 34;
  const pad = 2.5;

  const { linePath, areaPath, lastPt } = useMemo(() => {
    const [lo = 0, hi = 1] = extent(data) as [number, number];
    const span = hi - lo || 1;
    const x = scaleLinear()
      .domain([0, Math.max(1, data.length - 1)])
      .range([pad, w - pad]);
    const y = scaleLinear()
      .domain([lo - span * 0.14, hi + span * 0.14])
      .range([h - pad, pad]);
    const ln = line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX);
    const ar = area<number>()
      .x((_, i) => x(i))
      .y0(h - pad)
      .y1((d) => y(d))
      .curve(curveMonotoneX);
    return {
      linePath: ln(data) ?? "",
      areaPath: ar(data) ?? "",
      lastPt: { x: x(data.length - 1), y: y(data[data.length - 1]) },
    };
  }, [data]);

  const dotColor = positive ? p.ok : p.bad;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-[34px] w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: inView ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : duration / 1000, delay: reduced ? 0 : delay + 0.18 }}
      />
      <motion.path
        key={`${trigger}-line`}
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: inView ? 1 : 0 }}
        transition={{
          duration: reduced ? 0 : (duration / 1000) * 1.1,
          delay: reduced ? 0 : delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
      <motion.circle
        cx={lastPt.x}
        cy={lastPt.y}
        r={2.6}
        fill={dotColor}
        stroke={p.surface}
        strokeWidth={1.4}
        initial={{ scale: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
        animate={{ scale: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : delay + duration / 1000 }}
        style={{ transformOrigin: `${lastPt.x}px ${lastPt.y}px` }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

function Tile({
  item,
  color,
  showSparkline,
  showDelta,
  inView,
  duration,
  index,
  reduced,
  trigger,
}: {
  item: KPIItem;
  color: string;
  showSparkline: boolean;
  showDelta: boolean;
  inView: boolean;
  duration: number;
  index: number;
  reduced: boolean;
  trigger: number;
}) {
  const p = usePalette();
  const delay = index * 0.08;

  const animated = useAnimatedNumber(item.value, {
    duration,
    delay: reduced ? 0 : delay * 1000 + 120,
    enabled: inView,
    easing: "easeOut",
    trigger,
  });

  const hasDelta = showDelta && item.delta != null && item.delta !== 0;
  const delta = item.delta ?? 0;
  // "good" = the direction the team wants; lowerIsBetter flips it.
  const good = item.lowerIsBetter ? delta < 0 : delta > 0;
  const deltaColor = hasDelta ? (good ? p.ok : p.bad) : p.inkFaint;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;

  // Spark trend positivity (last vs first), respecting lowerIsBetter.
  const sparkPositive = useMemo(() => {
    const s = item.spark;
    if (!s || s.length < 2) return good;
    const rising = s[s.length - 1] >= s[0];
    return item.lowerIsBetter ? !rising : rising;
  }, [item.spark, item.lowerIsBetter, good]);

  const hasSpark = showSparkline && Array.isArray(item.spark) && item.spark.length > 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 16 }}
      transition={{ duration: reduced ? 0 : 0.55, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      className="group/tile relative flex flex-col gap-3 overflow-hidden rounded-reviz border border-border bg-surface px-4 py-4 transition-colors hover:border-border-strong"
    >
      {/* accent rail */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[2.5px]"
        style={{
          background: `linear-gradient(to bottom, ${color}, ${withAlpha(color, 0)})`,
          transformOrigin: "top",
        }}
        initial={reduced ? false : { scaleY: 0 }}
        animate={inView ? { scaleY: 1 } : undefined}
        transition={{ duration: reduced ? 0 : 0.55, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      />

      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-label text-ink-muted">
          {item.label}
        </span>
        {hasDelta && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none tabular-nums"
            style={{ color: deltaColor, background: withAlpha(deltaColor, 0.13) }}
          >
            <DeltaIcon className="h-3 w-3" strokeWidth={2.4} />
            {fmtDelta(delta, item.decimals)}
          </span>
        )}
      </div>

      <div className="flex items-end gap-1.5">
        {item.prefix && (
          <span className="mb-1 font-sans text-[18px] font-medium leading-none text-ink-muted">
            {item.prefix}
          </span>
        )}
        <span className="font-sans text-[32px] font-semibold leading-none tracking-tight text-ink tabular-nums">
          {fmtValue(animated, item.decimals)}
        </span>
        {item.unit && (
          <span className="mb-0.5 font-mono text-[12px] lowercase text-ink-faint">{item.unit}</span>
        )}
      </div>

      {hasSpark && (
        <div className="mt-1 -mb-1.5 self-stretch">
          <Sparkline
            data={item.spark as number[]}
            color={color}
            positive={sparkPositive}
            inView={inView}
            duration={duration}
            delay={delay + 0.12}
            reduced={reduced}
            trigger={trigger}
          />
        </div>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

export default function KPIGrid({
  items = DEFAULT_ITEMS,
  columns = 4,
  showSparkline = true,
  showDelta = true,
  color = "",
  title = "",
  caption = "",
  source = "",
  duration = 1100,
}: KPIGridProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const cols = clamp(Math.round(columns), 1, 4);
  const list = Array.isArray(items) ? items : [];

  const gridCols =
    cols === 1
      ? "grid-cols-1"
      : cols === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : cols === 3
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/kpigrid relative">
        <div className={`grid gap-3 ${gridCols}`}>
          {list.map((item, i) => (
            <Tile
              key={`${token}-${item.label}-${i}`}
              item={item}
              color={fill}
              showSparkline={showSparkline}
              showDelta={showDelta}
              inView={inView}
              duration={duration}
              index={i}
              reduced={reduced}
              trigger={token}
            />
          ))}
        </div>

        <AnimatePresence>
          {inView && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: reduced ? 0 : 0.4 }}
              className="absolute -top-1 right-0 opacity-0 transition-opacity group-hover/kpigrid:opacity-100"
            >
              <ReplayButton onClick={replay} label="Replay" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "kpi-grid",
  name: "KPI Grid",
  category: "data-display",
  description:
    "A responsive grid of KPI tiles — each staggers in with a big count-up number, a unit, a colored up/down delta chip, and an optional inline trend sparkline.",
  tags: ["kpi", "metrics", "dashboard", "grid", "sparkline", "delta"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "KPIGrid",
  sourcePath: "data-display/KPIGrid",
  aspect: 16 / 7,
  controls: [
    {
      key: "items",
      label: "Tiles",
      type: "json",
      group: "Data",
      help: "Array of { label, value, unit?, prefix?, delta?, spark?, lowerIsBetter?, decimals? }.",
      default: DEFAULT_ITEMS,
    },
    { key: "columns", label: "Columns", type: "number", group: "Layout", default: 4, min: 1, max: 4, step: 1 },
    { key: "showSparkline", label: "Show sparkline", type: "boolean", group: "Style", default: true },
    { key: "showDelta", label: "Show delta chip", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "duration",
      label: "Count-up (ms)",
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
      id: "system",
      name: "System KPIs",
      props: {
        title: "Inference cluster · last 24h",
        source: "serving telemetry",
        columns: 4,
        items: DEFAULT_ITEMS,
      },
    },
    {
      id: "training",
      name: "Training run",
      props: {
        title: "Perseus-7B · run 0412",
        columns: 3,
        items: [
          {
            label: "Tokens seen",
            value: 1.42,
            unit: "T",
            decimals: 2,
            delta: 0.18,
            spark: [0.6, 0.78, 0.94, 1.08, 1.2, 1.31, 1.42],
          },
          {
            label: "Val loss",
            value: 1.836,
            decimals: 3,
            delta: -0.042,
            lowerIsBetter: true,
            spark: [2.21, 2.08, 1.99, 1.94, 1.9, 1.86, 1.836],
          },
          {
            label: "MFU",
            value: 54.2,
            unit: "%",
            decimals: 1,
            delta: 3.1,
            spark: [44, 47, 49, 50.5, 52, 53.4, 54.2],
          },
        ],
      },
    },
    {
      id: "product",
      name: "Product growth",
      props: {
        title: "Weekly active researchers",
        columns: 4,
        items: [
          {
            label: "WAU",
            value: 8420,
            decimals: 0,
            delta: 640,
            spark: [6100, 6500, 6900, 7200, 7600, 8000, 8420],
          },
          {
            label: "Retention",
            value: 71.4,
            unit: "%",
            decimals: 1,
            delta: 2.3,
            spark: [64, 65.5, 67, 68.2, 69.4, 70.6, 71.4],
          },
          {
            label: "Avg session",
            value: 18.2,
            unit: "min",
            decimals: 1,
            delta: 1.4,
            spark: [13.8, 14.6, 15.4, 16.1, 16.9, 17.6, 18.2],
          },
          {
            label: "Cost / 1k req",
            value: 0.41,
            prefix: "$",
            decimals: 2,
            delta: -0.06,
            lowerIsBetter: true,
            spark: [0.62, 0.58, 0.54, 0.5, 0.47, 0.44, 0.41],
          },
        ],
      },
    },
  ],
};
