"use client";

import { scaleBand, scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  ResponsiveSvg,
  SoftShadow,
  uid,
  usePalette,
  usePrefersReducedMotion,
  useInView,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface BenchmarkDatum {
  /** Task / benchmark label shown on the x-axis. */
  label: string;
  /** Mean value (e.g. success rate %). */
  value: number;
  /** Symmetric error (±, e.g. one standard error). 0 or omitted hides whiskers. */
  error?: number;
  /** Optional longer description shown in the hover card. */
  description?: string;
  /** Fade this bar (e.g. an out-of-scope or held-out task). */
  muted?: boolean;
}

export interface BenchmarkBarsProps {
  data?: BenchmarkDatum[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  color?: string;
  baseline?: number;
  baselineLabel?: string;
  unit?: string;
  showValues?: boolean;
  showGrid?: boolean;
  duration?: number;
}

const DEFAULT_DATA: BenchmarkDatum[] = [
  { label: "Fold Towel", value: 92, error: 3 },
  { label: "Stack Cups", value: 84, error: 4 },
  {
    label: "Load Dishwasher",
    value: 71,
    error: 5,
    description:
      "Long-horizon manipulation: open the door, identify each item, and place it in the correct rack slot. The headline task — strong here because of the grasp-recovery policy.",
  },
  { label: "Wipe Counter", value: 63, error: 6 },
  { label: "Water Plant", value: 48, error: 7 },
  { label: "Sort Laundry", value: 31, error: 8 },
  { label: "Draw Smiley", value: 0, error: 0, muted: true, description: "Out-of-distribution fine-motor task. No successful rollouts in 200 trials." },
  { label: "Pour Cereal", value: 0, error: 0, muted: true, description: "Requires bimanual coordination not yet supported by the policy. 0/200 trials." },
];

export default function BenchmarkBars({
  data = DEFAULT_DATA,
  title = "World-model success rate by task",
  caption = "",
  source = "",
  yLabel = "Success rate (%)",
  color = "",
  baseline = 0,
  baselineLabel = "prior best",
  unit = "%",
  showValues = true,
  showGrid = true,
  duration = 1000,
}: BenchmarkBarsProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const shadowId = useMemo(() => uid("benchbar-shadow"), []);

  const maxValue = useMemo(() => {
    const top = Math.max(
      1,
      ...data.map((d) => d.value + (d.error ?? 0)),
      baseline,
    );
    return top;
  }, [data, baseline]);

  const play = inView && !reduced;
  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 22, right: 18, bottom: 52, left: yLabel ? 56 : 44 }}
        >
          {({ inner, margin }) => {
            const value = scaleLinear().domain([0, maxValue]).range([inner.height, 0]).nice();
            const band = scaleBand<string>()
              .domain(data.map((d) => d.label))
              .range([0, inner.width])
              .padding(0.34);
            const bw = band.bandwidth();
            const capHalf = Math.min(bw * 0.32, 11);
            const baseY = inner.height;
            const hasBaseline = baseline > 0;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={3} blur={6} opacity={0.16} />
                </defs>

                {showGrid && <GridLines scale={value as never} width={inner.width} />}

                {/* Baseline reference line */}
                {hasBaseline && (
                  <g>
                    <motion.line
                      x1={0}
                      x2={inner.width}
                      y1={value(baseline)}
                      y2={value(baseline)}
                      stroke={p.inkMuted}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                      transition={{ duration: 0.4, delay: play ? duration / 1000 : 0 }}
                    />
                    <motion.text
                      x={inner.width}
                      y={value(baseline) - 6}
                      textAnchor="end"
                      fill={p.inkMuted}
                      className="font-mono text-[9.5px] uppercase"
                      style={{ letterSpacing: "0.1em" }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                      transition={{ duration: 0.4, delay: play ? duration / 1000 + 0.1 : 0 }}
                    >
                      {baselineLabel} {fmt(baseline)}
                    </motion.text>
                  </g>
                )}

                {data.map((d, i) => {
                  const x = band(d.label) ?? 0;
                  const cx = x + bw / 2;
                  const top = value(d.value);
                  const h = baseY - top;
                  const active = hover?.i === i;
                  const dim = !!d.muted && !active;
                  const isZero = d.value <= 0;
                  const barFill = dim ? withAlpha(fill, 0.28) : fill;
                  const delay = play ? i * 0.07 : 0;
                  const err = d.error ?? 0;
                  const errTop = value(d.value + err);
                  const errBot = value(Math.max(0, d.value - err));

                  return (
                    <g key={`${d.label}-${i}`}>
                      {/* Hover hit area spanning the full column height */}
                      <rect
                        x={x}
                        y={0}
                        width={bw}
                        height={baseY}
                        fill="transparent"
                        onMouseMove={(e) => {
                          const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      />

                      {/* Zero-value tick stub so empty tasks remain legible */}
                      {isZero && (
                        <line
                          x1={x + bw * 0.3}
                          x2={x + bw * 0.7}
                          y1={baseY}
                          y2={baseY}
                          stroke={p.inkFaint}
                          strokeWidth={2}
                          strokeLinecap="round"
                          pointerEvents="none"
                        />
                      )}

                      {/* The bar */}
                      {!isZero && (
                        <motion.rect
                          x={x}
                          width={bw}
                          rx={4}
                          fill={barFill}
                          filter={active ? `url(#${shadowId})` : undefined}
                          initial={{ height: 0, y: baseY }}
                          animate={{
                            height: play ? h : reduced ? h : 0,
                            y: play ? top : reduced ? top : baseY,
                          }}
                          transition={{ duration: duration / 1000, delay, ease: [0.22, 1, 0.36, 1] }}
                          style={{ opacity: dim ? 0.85 : 1 }}
                          pointerEvents="none"
                          key={`bar-${token}-${i}`}
                        />
                      )}

                      {/* Error-bar whisker */}
                      {err > 0 && !isZero && (
                        <motion.g
                          stroke={p.ink}
                          strokeWidth={1.4}
                          strokeLinecap="round"
                          pointerEvents="none"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: play ? (dim ? 0.4 : 0.85) : reduced ? (dim ? 0.4 : 0.85) : 0 }}
                          transition={{ duration: 0.35, delay: play ? delay + duration / 1000 * 0.55 : 0 }}
                          key={`err-${token}-${i}`}
                        >
                          <line x1={cx} x2={cx} y1={errTop} y2={errBot} />
                          <line x1={cx - capHalf} x2={cx + capHalf} y1={errTop} y2={errTop} />
                          <line x1={cx - capHalf} x2={cx + capHalf} y1={errBot} y2={errBot} />
                        </motion.g>
                      )}

                      {/* Value label */}
                      {showValues && (
                        <motion.text
                          x={cx}
                          y={(isZero ? baseY : errTop) - 8}
                          textAnchor="middle"
                          fill={active ? p.ink : dim ? p.inkFaint : p.inkMuted}
                          className="font-mono text-[10.5px] tabular-nums"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                          transition={{ duration: 0.3, delay: play ? delay + duration / 1000 * 0.7 : 0 }}
                          key={`val-${token}-${i}`}
                        >
                          {fmt(d.value)}
                        </motion.text>
                      )}

                      {/* X-axis task label (manual to support multi-word rotation) */}
                      <text
                        x={cx}
                        y={baseY + 14}
                        textAnchor="end"
                        transform={`rotate(-32, ${cx}, ${baseY + 14})`}
                        fill={active ? p.ink : p.inkFaint}
                        className="font-mono text-[10px]"
                        pointerEvents="none"
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}

                <Baseline y={baseY} width={inner.width} />
                <AxisLeft scale={value as never} height={inner.height} label={yLabel} />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null} align="center">
          {hover != null && (
            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                {data[hover.i].label}
              </div>
              <div className="font-semibold tabular-nums">
                {fmt(data[hover.i].value)}
                {(data[hover.i].error ?? 0) > 0 && (
                  <span className="font-normal opacity-70"> {"±"} {fmt(data[hover.i].error ?? 0)}</span>
                )}
              </div>
              {data[hover.i].description && (
                <p className="max-w-[220px] text-[11px] leading-snug opacity-80">
                  {data[hover.i].description}
                </p>
              )}
            </div>
          )}
        </FloatingTooltip>

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
        >
          replay
        </button>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "benchmark-bars",
  name: "Benchmark Bars (error bars)",
  category: "ml-eval",
  description:
    "The hero benchmark figure: success rate per task with standard-error whiskers, faded held-out tasks, a baseline reference line, and rich hover cards.",
  tags: ["benchmark", "eval", "error-bars", "success-rate", "bar"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "BenchmarkBars",
  sourcePath: "ml-eval/BenchmarkBars",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Tasks",
      type: "json",
      group: "Data",
      help: "Array of { label, value, error?, description?, muted? }.",
      default: DEFAULT_DATA,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "World-model success rate by task" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Success rate (%)" },
    { key: "unit", label: "Value unit", type: "text", group: "Labels", default: "%" },
    { key: "baselineLabel", label: "Baseline label", type: "text", group: "Labels", default: "prior best" },
    { key: "color", label: "Bar color", type: "color", group: "Style", default: "" },
    { key: "showValues", label: "Show values", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    {
      key: "baseline",
      label: "Baseline",
      type: "number",
      group: "Layout",
      default: 0,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1000, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "world-model",
      name: "World-model eval",
      props: {
        title: "World-model success rate by task",
        yLabel: "Success rate (%)",
        baseline: 55,
        baselineLabel: "prior best",
      },
    },
    {
      id: "recall",
      name: "Retrieval recall@10",
      props: {
        title: "Retrieval recall@10 by corpus",
        yLabel: "Recall@10 (%)",
        baseline: 0,
        color: "",
        data: [
          { label: "Wiki", value: 88, error: 2 },
          { label: "ArXiv", value: 81, error: 3, description: "Dense scientific text; benefits most from the hard-negative mining stage." },
          { label: "Code", value: 74, error: 4 },
          { label: "Legal", value: 66, error: 5 },
          { label: "Clinical", value: 52, error: 6, muted: true, description: "Held out of training. Domain shift hurts recall substantially." },
          { label: "Patents", value: 0, error: 0, muted: true, description: "Corpus not yet indexed." },
        ],
      },
    },
    {
      id: "latency",
      name: "Latency-budget pass rate",
      props: {
        title: "Pass rate under latency budget",
        yLabel: "Pass rate (%)",
        baseline: 70,
        baselineLabel: "SLA target",
        data: [
          { label: "50ms", value: 41, error: 5 },
          { label: "100ms", value: 68, error: 4 },
          { label: "200ms", value: 86, error: 3, description: "Sweet spot: clears the SLA target with comfortable margin." },
          { label: "500ms", value: 94, error: 2 },
          { label: "1s", value: 97, error: 1 },
        ],
      },
    },
  ],
};
