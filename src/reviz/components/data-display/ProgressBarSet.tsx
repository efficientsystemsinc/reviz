"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  clamp,
  useAnimatedNumber,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface BarItem {
  /** Row label shown at the left. */
  label: string;
  /** Current value (in the same units as `max`). */
  value: number;
  /** Track maximum; defaults to `defaultMax` when omitted. */
  max?: number;
  /** Override the fill color for this row. */
  color?: string;
  /** Optional target marker drawn as a tick on the track. */
  target?: number;
}

export interface ProgressBarSetProps {
  items?: BarItem[];
  title?: string;
  caption?: string;
  source?: string;
  defaultMax?: number;
  showValues?: boolean;
  valueMode?: "percent" | "value" | "fraction";
  colorByThreshold?: boolean;
  color?: string;
  trackHeight?: number;
  duration?: number;
}

const DEFAULT_ITEMS: BarItem[] = [
  { label: "Reasoning", value: 91.2, max: 100, target: 85 },
  { label: "Code generation", value: 84.6, max: 100, target: 85 },
  { label: "Tool use", value: 78.3, max: 100, target: 85 },
  { label: "Long-context recall", value: 72.0, max: 100, target: 85 },
  { label: "Multilingual", value: 66.4, max: 100, target: 85 },
  { label: "Safety / refusal", value: 58.1, max: 100, target: 85 },
];

export default function ProgressBarSet({
  items = DEFAULT_ITEMS,
  title = "Capability scorecard",
  caption = "",
  source = "",
  defaultMax = 100,
  showValues = true,
  valueMode = "percent",
  colorByThreshold = true,
  color = "",
  trackHeight = 10,
  duration = 1000,
}: ProgressBarSetProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const animate = inView && !reduced;
  const rows = Array.isArray(items) ? items : [];
  const step = rows.length > 1 ? 0.08 : 0;

  // Resolve geometry + tone for every row up front so the render is declarative.
  const resolved = useMemo(() => {
    return rows.map((it) => {
      const max = it.max && it.max > 0 ? it.max : defaultMax || 1;
      const frac = clamp(it.value / max, 0, 1);
      const pct = frac * 100;
      // Threshold tone: green near/above target (or full), amber mid, red low.
      const targetFrac = it.target != null ? clamp(it.target / max, 0, 1) : null;
      let tone = it.color || accent;
      if (!it.color && colorByThreshold) {
        const gate = targetFrac ?? 0.85;
        if (frac >= gate) tone = p.ok;
        else if (frac >= gate * 0.7) tone = p.warn;
        else tone = p.bad;
      }
      return { ...it, max, frac, pct, targetFrac, tone };
    });
  }, [rows, defaultMax, accent, colorByThreshold, p.ok, p.warn, p.bad]);

  return (
    <Figure
      variant="plain"
      align="left"
      title={title}
      caption={caption}
      source={source}
    >
      <div ref={ref} className="relative w-full">
        <div className="flex flex-col gap-4">
          {resolved.map((r, i) => (
            <BarRow
              key={`${r.label}-${i}`}
              label={r.label}
              value={r.value}
              max={r.max}
              pct={r.pct}
              frac={r.frac}
              targetFrac={r.targetFrac}
              target={r.target}
              tone={r.tone}
              showValues={showValues}
              valueMode={valueMode}
              trackHeight={trackHeight}
              animate={animate}
              reduced={reduced}
              duration={duration}
              delay={i * step}
              token={token}
              p={p}
            />
          ))}
        </div>

        {rows.length > 0 && (
          <div className="mt-5 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
              {rows.length} {rows.length === 1 ? "metric" : "metrics"}
              {colorByThreshold ? " · color = vs target" : ""}
            </span>
            <ReplayButton onClick={replay} label="Replay" />
          </div>
        )}
      </div>
    </Figure>
  );
}

function BarRow({
  label,
  value,
  max,
  pct,
  frac,
  targetFrac,
  target,
  tone,
  showValues,
  valueMode,
  trackHeight,
  animate,
  reduced,
  duration,
  delay,
  token,
  p,
}: {
  label: string;
  value: number;
  max: number;
  pct: number;
  frac: number;
  targetFrac: number | null;
  target: number | undefined;
  tone: string;
  showValues: boolean;
  valueMode: "percent" | "value" | "fraction";
  trackHeight: number;
  animate: boolean;
  reduced: boolean;
  duration: number;
  delay: number;
  token: number;
  p: ReturnType<typeof usePalette>;
}) {
  // The end-of-row readout counts up in lockstep with the fill.
  const live = useAnimatedNumber(frac, {
    duration,
    delay: (delay + 0.05) * 1000,
    enabled: animate,
    trigger: token,
  });

  const readout =
    valueMode === "percent"
      ? `${(live * 100).toFixed(pct % 1 === 0 ? 0 : 1)}%`
      : valueMode === "fraction"
        ? `${fmt(live * max)} / ${fmt(max)}`
        : fmt(live * max);

  const h = Math.max(4, trackHeight);
  const metAtTarget = targetFrac != null && frac >= targetFrac;

  return (
    <motion.div
      initial={{ opacity: 0, y: animate ? 8 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: animate ? delay : 0,
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group/row"
    >
      {/* Label + readout */}
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] font-medium leading-tight text-ink">
          {label}
        </span>
        {showValues && (
          <span
            className="shrink-0 font-mono text-[12px] tabular-nums"
            style={{ color: tone }}
          >
            {readout}
          </span>
        )}
      </div>

      {/* Track */}
      <div
        className="relative w-full overflow-hidden rounded-full"
        style={{ height: h, background: withAlpha(p.inkFaint, 0.13) }}
      >
        <motion.div
          key={`${token}-fill`}
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${withAlpha(tone, 0.6)}, ${tone})`,
            boxShadow: `0 0 12px ${withAlpha(tone, 0.35)}`,
          }}
          initial={{ width: animate ? "0%" : `${pct}%` }}
          animate={{ width: `${pct}%` }}
          transition={{
            duration: reduced ? 0 : duration / 1000,
            delay: animate ? delay + 0.05 : 0,
            ease: [0.22, 1, 0.36, 1],
          }}
        />

        {/* Target tick */}
        {targetFrac != null && targetFrac > 0 && targetFrac < 1 && (
          <div
            className="absolute top-0 h-full"
            style={{
              left: `${targetFrac * 100}%`,
              width: 2,
              transform: "translateX(-1px)",
              background: withAlpha(p.ink, 0.55),
            }}
          />
        )}
      </div>

      {/* Target annotation */}
      {target != null && (
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: metAtTarget ? p.ok : "transparent",
              boxShadow: `inset 0 0 0 1.5px ${metAtTarget ? p.ok : p.inkFaint}`,
            }}
          />
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            target {fmt(target)}
            {valueMode === "percent" && max === 100 ? "%" : ""}
            {metAtTarget ? " · met" : ""}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/** Compact numeric formatter that drops trailing zeros. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export const meta: RevizMeta = {
  id: "progress-bars",
  name: "Progress Bar Set",
  category: "data-display",
  description:
    "A set of labeled horizontal meter bars that fill in with stagger, count up to their value, and shift color against an optional target tick — a clean capability or quota scorecard.",
  tags: ["progress", "meter", "bars", "scorecard", "quota"],
  badges: ["animated", "themed", "responsive"],
  exportName: "ProgressBarSet",
  sourcePath: "data-display/ProgressBarSet",
  aspect: 16 / 11,
  controls: [
    {
      key: "items",
      label: "Items",
      type: "json",
      group: "Data",
      help: "Array of { label, value, max?, color?, target? }.",
      default: DEFAULT_ITEMS,
    },
    {
      key: "defaultMax",
      label: "Default max",
      type: "number",
      group: "Data",
      default: 100,
      min: 1,
      max: 1000000,
      step: 1,
      help: "Used for rows that omit their own max.",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Capability scorecard" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "valueMode",
      label: "Readout",
      type: "select",
      group: "Labels",
      default: "percent",
      options: [
        { label: "Percent", value: "percent" },
        { label: "Value", value: "value" },
        { label: "Fraction", value: "fraction" },
      ],
    },
    { key: "showValues", label: "Show values", type: "boolean", group: "Labels", default: true },
    {
      key: "colorByThreshold",
      label: "Color by threshold",
      type: "boolean",
      group: "Style",
      default: true,
      help: "Tint fills green/amber/red relative to the target.",
    },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    {
      key: "trackHeight",
      label: "Track height",
      type: "number",
      group: "Layout",
      default: 10,
      min: 4,
      max: 28,
      step: 1,
      unit: "px",
    },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1000,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "capability-scores",
      name: "Capability scores",
      props: {
        title: "Capability scorecard",
        caption: "Per-axis eval scores for the latest checkpoint; tick marks the release gate.",
        source: "Internal eval harness",
        valueMode: "percent",
        colorByThreshold: true,
        defaultMax: 100,
        items: [
          { label: "Reasoning", value: 91.2, max: 100, target: 85 },
          { label: "Code generation", value: 84.6, max: 100, target: 85 },
          { label: "Tool use", value: 78.3, max: 100, target: 85 },
          { label: "Long-context recall", value: 72.0, max: 100, target: 85 },
          { label: "Multilingual", value: 66.4, max: 100, target: 85 },
          { label: "Safety / refusal", value: 58.1, max: 100, target: 85 },
        ],
      },
    },
    {
      id: "quota-usage",
      name: "Quota usage",
      props: {
        title: "Cluster quota usage",
        caption: "Resource consumption against allocated limits this billing period.",
        valueMode: "fraction",
        colorByThreshold: true,
        showValues: true,
        items: [
          { label: "GPU-A GPU-hours", value: 7820, max: 8000, target: 7200 },
          { label: "vCPU cores", value: 1840, max: 4096, target: 3500 },
          { label: "Object storage (TB)", value: 96, max: 120, target: 110 },
          { label: "Egress (TB)", value: 41, max: 50, target: 45 },
        ],
      },
    },
    {
      id: "training-progress",
      name: "Training progress",
      props: {
        title: "Run progress",
        caption: "Tokens seen vs. planned budget across concurrent runs.",
        valueMode: "percent",
        colorByThreshold: false,
        color: "",
        trackHeight: 14,
        items: [
          { label: "pretrain-7b", value: 1.92, max: 2.0 },
          { label: "pretrain-34b", value: 1.1, max: 3.0 },
          { label: "sft-instruct", value: 0.48, max: 0.5 },
          { label: "rlhf-policy", value: 0.12, max: 0.4 },
        ],
      },
    },
  ],
};
