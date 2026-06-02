"use client";

import { max, min } from "d3-array";
import { scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  MonoLabel,
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

interface SlopeItem {
  label: string;
  before: number;
  after: number;
}

const DEFAULT_DATA: SlopeItem[] = [
  { label: "MMLU", before: 64.2, after: 71.8 },
  { label: "GSM8K", before: 52.1, after: 68.4 },
  { label: "HumanEval", before: 41.3, after: 59.7 },
  { label: "ARC-C", before: 78.5, after: 82.1 },
  { label: "Hallucination", before: 18.9, after: 11.2 },
  { label: "Refusal rate", before: 9.4, after: 4.1 },
];

export interface SlopeChartProps {
  data?: SlopeItem[];
  leftLabel?: string;
  rightLabel?: string;
  unit?: string;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

export default function SlopeChart({
  data = DEFAULT_DATA,
  leftLabel = "Base model",
  rightLabel = "After RLHF",
  unit = "%",
  title = "Benchmark scores before and after alignment",
  caption = "",
  source = "",
  color = "",
  duration = 1200,
}: SlopeChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; px: number; py: number } | null>(null);
  const gid = useMemo(() => uid("slope"), []);

  // Color encodes direction: rising = ok, falling = bad, flat = accent.
  // A `color` prop, when set, overrides the neutral/flat accent.
  const accent = color || p.accent;
  const colorFor = (d: SlopeItem) => {
    const delta = d.after - d.before;
    if (Math.abs(delta) < 1e-9) return accent;
    return delta > 0 ? p.ok : p.bad;
  };

  const rows = useMemo(
    () => data.filter((d) => Number.isFinite(d.before) && Number.isFinite(d.after)),
    [data],
  );

  const yDomain = useMemo(() => {
    const all = rows.flatMap((d) => [d.before, d.after]);
    if (all.length === 0) return [0, 1] as [number, number];
    const lo = min(all) ?? 0;
    const hi = max(all) ?? 1;
    if (hi === lo) return [lo - 1, hi + 1] as [number, number];
    const pad = (hi - lo) * 0.12;
    return [lo - pad, hi + pad] as [number, number];
  }, [rows]);

  const draw = reduced ? 1 : inView ? 1 : 0;
  const fmt = (v: number) => `${formatCompact(v, 1)}${unit}`;

  // Vertical estimate so columns of end-labels never overlap badly.
  const aspect = 4 / 3;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        {/* Column headers mirror the two endpoints. */}
        <div className="mb-2 flex items-center justify-between px-1">
          <MonoLabel className="text-ink">{leftLabel}</MonoLabel>
          <MonoLabel className="text-ink">{rightLabel}</MonoLabel>
        </div>

        <ResponsiveSvg
          aspect={aspect}
          margin={{ top: 12, right: 132, bottom: 18, left: 132 }}
        >
          {({ inner, margin }) => {
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();
            const xL = 0;
            const xR = inner.width;
            const drawDur = (duration / 1000) * 0.7;
            const labelDelay = drawDur * 0.55;

            // Right end-labels stack a value + delta line (~26px tall). When two
            // `after` endpoints sit close, those blocks collide. Compute a
            // collision-free y for each right label by greedily pushing labels
            // apart from top to bottom while keeping them near their endpoint.
            const RIGHT_LABEL_GAP = 28;
            const rightLabelY = (() => {
              const order = rows
                .map((d, i) => ({ i, yA: y(d.after) }))
                .sort((a, b) => a.yA - b.yA);
              const placed: number[] = [];
              let prev = -Infinity;
              for (const { yA } of order) {
                const ly = Math.max(yA, prev + RIGHT_LABEL_GAP);
                placed.push(ly);
                prev = ly;
              }
              const out: number[] = new Array(rows.length);
              order.forEach((o, k) => {
                out[o.i] = placed[k];
              });
              return out;
            })();

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <linearGradient id={`${gid}-axisfade`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.border} stopOpacity={0} />
                    <stop offset="12%" stopColor={p.borderStrong} stopOpacity={1} />
                    <stop offset="88%" stopColor={p.borderStrong} stopOpacity={1} />
                    <stop offset="100%" stopColor={p.border} stopOpacity={0} />
                  </linearGradient>
                </defs>

                {/* The two anchor rails. */}
                {[xL, xR].map((cx, k) => (
                  <motion.line
                    key={`${gid}-rail-${k}-${token}`}
                    x1={cx}
                    x2={cx}
                    y1={0}
                    y2={inner.height}
                    stroke={`url(#${gid}-axisfade)`}
                    strokeWidth={1.5}
                    initial={{ opacity: 0, scaleY: 0.6 }}
                    animate={{ opacity: draw ? 1 : 0, scaleY: draw ? 1 : 0.6 }}
                    style={{ transformOrigin: `${cx}px ${inner.height / 2}px` }}
                    transition={{ duration: reduced ? 0 : 0.5, ease: "easeOut" }}
                  />
                ))}

                {/* Slope lines + endpoint dots + labels, per item. */}
                {rows.map((d, i) => {
                  const yB = y(d.before);
                  const yA = y(d.after);
                  const c = colorFor(d);
                  const isHover = hover?.i === i;
                  const dimmed = hover != null && !isHover;
                  const stagger = reduced ? 0 : (i / Math.max(1, rows.length)) * drawDur * 0.45;
                  const delta = d.after - d.before;
                  const arrow = delta > 1e-9 ? "↑" : delta < -1e-9 ? "↓" : "→";
                  const labelY = rightLabelY[i];

                  return (
                    <g
                      key={`${gid}-row-${i}`}
                      style={{ cursor: "default" }}
                      onMouseEnter={() =>
                        setHover({ i, px: (xL + xR) / 2, py: (yB + yA) / 2 })
                      }
                      onMouseLeave={() => setHover(null)}
                    >
                      {/* Hover halo behind the line. */}
                      <line
                        x1={xL}
                        y1={yB}
                        x2={xR}
                        y2={yA}
                        stroke={withAlpha(c, 0.16)}
                        strokeWidth={isHover ? 9 : 0}
                        strokeLinecap="round"
                        style={{ transition: "stroke-width 0.18s ease" }}
                      />

                      {/* The slope line draws in. */}
                      <motion.line
                        key={`${gid}-line-${i}-${token}`}
                        x1={xL}
                        y1={yB}
                        x2={xR}
                        y2={yA}
                        stroke={c}
                        strokeWidth={isHover ? 2.6 : 2}
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                          pathLength: draw,
                          opacity: draw ? (dimmed ? 0.28 : 1) : 0,
                        }}
                        transition={{
                          pathLength: {
                            duration: reduced ? 0 : drawDur,
                            delay: stagger,
                            ease: [0.4, 0, 0.2, 1],
                          },
                          opacity: { duration: reduced ? 0 : 0.25, delay: stagger },
                        }}
                      />

                      {/* Endpoint dots. */}
                      {[
                        { cx: xL, cy: yB },
                        { cx: xR, cy: yA },
                      ].map((pt, k) => (
                        <motion.circle
                          key={`${gid}-dot-${i}-${k}-${token}`}
                          cx={pt.cx}
                          cy={pt.cy}
                          r={isHover ? 4.4 : 3.4}
                          fill={p.surface}
                          stroke={c}
                          strokeWidth={2}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{
                            opacity: draw ? (dimmed ? 0.3 : 1) : 0,
                            scale: draw ? 1 : 0,
                          }}
                          transition={{
                            duration: reduced ? 0 : 0.32,
                            delay: reduced ? 0 : labelDelay + stagger,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                      ))}

                      {/* Left end-label: name + value. */}
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? (dimmed ? 0.32 : 1) : 0 }}
                        transition={{
                          duration: reduced ? 0 : 0.3,
                          delay: reduced ? 0 : labelDelay + stagger,
                        }}
                      >
                        <text
                          x={xL - 12}
                          y={yB}
                          dy="0.32em"
                          textAnchor="end"
                          fill={p.inkMuted}
                          style={LABEL_FONT}
                        >
                          {d.label}
                        </text>
                        <text
                          x={xL - 12}
                          y={yB + 13}
                          textAnchor="end"
                          fill={c}
                          style={VALUE_FONT}
                        >
                          {fmt(d.before)}
                        </text>
                      </motion.g>

                      {/* Right end-label: value + delta. */}
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? (dimmed ? 0.32 : 1) : 0 }}
                        transition={{
                          duration: reduced ? 0 : 0.3,
                          delay: reduced ? 0 : labelDelay + stagger,
                        }}
                      >
                        {/* Leader line when the label was nudged off its dot. */}
                        {Math.abs(labelY - yA) > 1 && (
                          <polyline
                            points={`${xR + 3},${yA} ${xR + 8},${labelY} ${xR + 11},${labelY}`}
                            fill="none"
                            stroke={withAlpha(c, 0.4)}
                            strokeWidth={1}
                          />
                        )}
                        <text
                          x={xR + 12}
                          y={labelY}
                          dy="0.32em"
                          textAnchor="start"
                          fill={c}
                          style={VALUE_FONT}
                        >
                          {fmt(d.after)}
                        </text>
                        <text
                          x={xR + 12}
                          y={labelY + 13}
                          textAnchor="start"
                          fill={p.inkFaint}
                          style={LABEL_FONT}
                        >
                          {arrow} {formatCompact(Math.abs(delta), 1)}
                          {unit}
                        </text>
                      </motion.g>
                    </g>
                  );
                })}
              </g>
            );
          }}
        </ResponsiveSvg>

        {(() => {
          const d = hover == null ? null : rows[hover.i];
          return (
            <FloatingTooltip
              x={(hover?.px ?? 0) + 132}
              y={(hover?.py ?? 0) + 12 + 30}
              visible={d != null}
            >
              {d != null && (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {d.label}
                  </div>
                  <TooltipRow label={leftLabel} value={fmt(d.before)} />
                  <TooltipRow label={rightLabel} value={fmt(d.after)} />
                  <TooltipRow
                    label="Δ"
                    value={`${d.after - d.before >= 0 ? "+" : "−"}${formatCompact(
                      Math.abs(d.after - d.before),
                      1,
                    )}${unit}`}
                  />
                </>
              )}
            </FloatingTooltip>
          );
        })()}

        <ReplayButton
          onClick={replay}
          className="absolute -top-1 right-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
    </Figure>
  );
}

const LABEL_FONT = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
};

const VALUE_FONT = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.02em",
};

export const meta: RevizMeta = {
  id: "slope-chart",
  name: "Slope Chart",
  category: "charts",
  description:
    "A two-column before/after slope chart: each metric is a line from its left value to its right, labeled at both ends and colored by whether it rose or fell, with lines that draw on as they enter view.",
  tags: ["slope", "before-after", "comparison", "change", "intervention"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "SlopeChart",
  sourcePath: "charts/SlopeChart",
  aspect: 4 / 3,
  controls: [
    {
      key: "data",
      label: "Items",
      type: "json",
      group: "Data",
      default: DEFAULT_DATA,
      help: "Array of { label, before, after }.",
    },
    { key: "leftLabel", label: "Left column", type: "text", group: "Labels", default: "Base model" },
    { key: "rightLabel", label: "Right column", type: "text", group: "Labels", default: "After RLHF" },
    { key: "unit", label: "Value unit", type: "text", group: "Labels", default: "%" },
    {
      key: "title",
      label: "Title",
      type: "text",
      group: "Labels",
      default: "Benchmark scores before and after alignment",
    },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Flat-line color", type: "color", group: "Style", default: "" },
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
      id: "alignment",
      name: "Alignment uplift",
      props: {
        title: "Benchmark scores before and after alignment",
        leftLabel: "Base model",
        rightLabel: "After RLHF",
        unit: "%",
        caption: "RLHF lifts reasoning and code benchmarks while cutting hallucinations and over-refusals.",
        data: DEFAULT_DATA,
      },
    },
    {
      id: "latency",
      name: "Latency after distillation",
      props: {
        title: "P50 latency before and after distillation",
        leftLabel: "Teacher (70B)",
        rightLabel: "Student (8B)",
        unit: "ms",
        caption: "Distilling to an 8B student roughly halves serving latency across endpoints.",
        data: [
          { label: "Chat", before: 312, after: 141 },
          { label: "Summarize", before: 488, after: 219 },
          { label: "Code", before: 421, after: 198 },
          { label: "Embed", before: 96, after: 58 },
          { label: "Rerank", before: 174, after: 89 },
        ],
      },
    },
    {
      id: "intervention",
      name: "Treatment effect",
      props: {
        title: "Task success rate before and after fine-tuning",
        leftLabel: "Zero-shot",
        rightLabel: "Fine-tuned",
        unit: "%",
        caption: "Per-task success rate for a robotic manipulation policy after 2k demonstrations.",
        data: [
          { label: "Pick-place", before: 44.0, after: 81.0 },
          { label: "Stacking", before: 31.0, after: 72.0 },
          { label: "Pouring", before: 22.0, after: 58.0 },
          { label: "Insertion", before: 17.0, after: 49.0 },
          { label: "Folding", before: 9.0, after: 28.0 },
        ],
      },
    },
  ],
};
