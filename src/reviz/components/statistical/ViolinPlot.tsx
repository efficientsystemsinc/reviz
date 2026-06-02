"use client";

import { ascending, max as d3max, min as d3min, mean as d3mean, quantileSorted } from "d3-array";
import { scaleBand, scaleLinear } from "d3-scale";
import { area, curveCatmullRom } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  LinearGradient,
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

/** A raw group: label + a sample array of observations. */
interface RawGroup {
  label: string;
  values: number[];
}

/** Fully-resolved per-group statistics + density profile used to draw a violin. */
interface ViolinStats {
  label: string;
  q1: number;
  median: number;
  q3: number;
  min: number;
  max: number;
  mean: number;
  n: number;
  /** Density profile sampled across the value domain: {v: value, d: density}. */
  profile: { v: number; d: number }[];
  /** Peak density (for normalizing half-width). */
  peak: number;
}

export interface ViolinPlotProps {
  data?: RawGroup[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  showBox?: boolean;
  showGrid?: boolean;
  bandwidth?: number;
  color?: string;
  duration?: number;
}

const DEFAULT_DATA: RawGroup[] = [
  {
    label: "fp32",
    values: [
      88, 90, 91, 92, 93, 93, 94, 94, 95, 96, 96, 97, 98, 99, 100, 101, 103, 105, 108, 112, 118, 127,
    ],
  },
  {
    label: "fp16",
    values: [
      52, 53, 54, 55, 55, 56, 56, 57, 57, 58, 58, 59, 60, 61, 62, 63, 65, 68, 72, 78, 86, 97,
    ],
  },
  {
    label: "int8",
    values: [
      34, 35, 36, 36, 37, 37, 38, 38, 39, 39, 40, 41, 42, 43, 44, 46, 49, 53, 58, 64, 71, 82,
    ],
  },
  {
    label: "int4",
    values: [
      26, 27, 27, 28, 28, 29, 29, 30, 30, 31, 31, 32, 33, 34, 36, 38, 41, 45, 50, 56, 63, 74,
    ],
  },
];

/** Gaussian kernel. */
function gaussian(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.SQRT2 / Math.sqrt(Math.PI);
}

/**
 * Compute a simple Gaussian KDE + five-number summary from a sample.
 * `bw` is a relative bandwidth multiplier applied to a Silverman rule-of-thumb.
 */
function computeStats(g: RawGroup, bw: number, lo: number, hi: number, steps: number): ViolinStats {
  const sorted = [...g.values].filter((v) => Number.isFinite(v)).sort(ascending);
  const n = sorted.length;
  if (n === 0) {
    return {
      label: g.label,
      q1: 0,
      median: 0,
      q3: 0,
      min: 0,
      max: 0,
      mean: 0,
      n: 0,
      profile: [],
      peak: 1,
    };
  }

  const q1 = quantileSorted(sorted, 0.25) ?? sorted[0];
  const median = quantileSorted(sorted, 0.5) ?? sorted[0];
  const q3 = quantileSorted(sorted, 0.75) ?? sorted[n - 1];
  const lowV = d3min(sorted) as number;
  const highV = d3max(sorted) as number;
  const meanV = (d3mean(sorted) as number) ?? 0;

  // Silverman's rule-of-thumb bandwidth (robust via IQR), scaled by the control.
  const std = Math.sqrt(sorted.reduce((a, v) => a + (v - meanV) ** 2, 0) / Math.max(1, n));
  const iqr = q3 - q1;
  const sigma = Math.min(std || iqr / 1.349 || 1, iqr / 1.349 || std || 1) || 1;
  const h = Math.max(1e-6, 0.9 * sigma * Math.pow(n, -1 / 5) * bw);

  // Sample density across the shared domain, but only render where the group has support.
  const pad = h * 2.5;
  const groupLo = Math.max(lo, lowV - pad);
  const groupHi = Math.min(hi, highV + pad);
  const profile: { v: number; d: number }[] = [];
  let peak = 0;
  for (let i = 0; i <= steps; i++) {
    const v = groupLo + ((groupHi - groupLo) * i) / steps;
    let d = 0;
    for (const x of sorted) d += gaussian((v - x) / h);
    d /= n * h;
    profile.push({ v, d });
    if (d > peak) peak = d;
  }

  return {
    label: g.label,
    q1,
    median,
    q3,
    min: lowV,
    max: highV,
    mean: meanV,
    n,
    profile,
    peak: peak || 1,
  };
}

export default function ViolinPlot({
  data = DEFAULT_DATA,
  title = "Inference latency by precision",
  caption = "",
  source = "",
  yLabel = "Latency (ms)",
  showBox = true,
  showGrid = true,
  bandwidth = 1,
  color = "",
  duration = 1000,
}: ViolinPlotProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const gid = useMemo(() => uid("violin"), []);

  // Shared value domain across all groups.
  const domain = useMemo(() => {
    const all: number[] = [];
    for (const g of data ?? []) for (const v of g.values) if (Number.isFinite(v)) all.push(v);
    if (all.length === 0) return [0, 1] as [number, number];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.1 || 1;
    return [lo - pad, hi + pad] as [number, number];
  }, [data]);

  const stats = useMemo(
    () => (data ?? []).map((g) => computeStats(g, bandwidth, domain[0], domain[1], 64)),
    [data, bandwidth, domain],
  );

  const play = inView && !reduced;
  const sec = duration / 1000;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 16, right: 20, bottom: 38, left: yLabel ? 56 : 44 }}
        >
          {({ inner, margin }) => {
            const y = scaleLinear().domain(domain).range([inner.height, 0]).nice();
            const band = scaleBand<string>()
              .domain(stats.map((s) => s.label))
              .range([0, inner.width])
              .paddingInner(0.4)
              .paddingOuter(0.3);
            const bw = band.bandwidth();
            const halfW = Math.min(bw, 120) / 2;
            const boxW = Math.min(halfW * 0.62, 22);

            // Builds the mirrored violin outline for a group's density profile.
            const violinArea = area<{ v: number; d: number }>()
              .y((pt) => y(pt.v))
              .x0((pt) => -(pt.d) )
              .x1((pt) => pt.d)
              .curve(curveCatmullRom.alpha(0.5));

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <LinearGradient id={gid} from={withAlpha(fill, 0.42)} to={withAlpha(fill, 0.1)} angle={90} />
                </defs>

                {showGrid && <GridLines scale={y} width={inner.width} />}

                {stats.map((s, i) => {
                  const cx = (band(s.label) ?? 0) + bw / 2;
                  const active = hover?.i === i;
                  const delay = i * 0.1;

                  // Normalize density to the available half-width.
                  const scaled = s.profile.map((pt) => ({ v: pt.v, d: (pt.d / s.peak) * halfW }));
                  const d = violinArea(scaled) ?? "";

                  const yQ1 = y(s.q1);
                  const yQ3 = y(s.q3);
                  const yMed = y(s.median);
                  const boxTop = Math.min(yQ1, yQ3);
                  const boxH = Math.abs(yQ1 - yQ3);

                  return (
                    <g
                      key={`${s.label}-${i}`}
                      onMouseMove={(e) => {
                        const r = (
                          e.currentTarget.ownerSVGElement as SVGSVGElement
                        ).getBoundingClientRect();
                        setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                    >
                      {/* hover hit area spanning the violin width */}
                      <rect
                        x={cx - halfW}
                        y={y(s.max) - 6}
                        width={halfW * 2}
                        height={Math.abs(y(s.min) - y(s.max)) + 12}
                        fill="transparent"
                      />

                      {/* the violin body: scales open horizontally from the center axis */}
                      <motion.path
                        d={d}
                        transform={`translate(${cx}, 0)`}
                        fill={`url(#${gid})`}
                        stroke={fill}
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: play ? 1 : 0, opacity: play ? (active ? 1 : 0.92) : 0 }}
                        transition={{ duration: sec * 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
                        style={{ transformBox: "fill-box", transformOrigin: "center" }}
                        key={`${token}-body-${i}`}
                      />

                      {/* inner box (IQR) */}
                      {showBox && (
                        <motion.rect
                          x={cx - boxW / 2}
                          width={boxW}
                          rx={2}
                          fill={withAlpha(p.ink, 0.62)}
                          stroke={p.surface}
                          strokeWidth={1}
                          initial={{ y: yMed, height: 0, opacity: 0 }}
                          animate={{
                            y: play ? boxTop : yMed,
                            height: play ? boxH : 0,
                            opacity: play ? 1 : 0,
                          }}
                          transition={{ duration: sec * 0.45, delay: delay + sec * 0.4, ease: [0.22, 1, 0.36, 1] }}
                          key={`${token}-box-${i}`}
                        />
                      )}

                      {/* whisker stem from min to max when the box is shown */}
                      {showBox && (
                        <motion.line
                          x1={cx}
                          x2={cx}
                          y1={y(s.max)}
                          y2={y(s.min)}
                          stroke={withAlpha(p.ink, 0.5)}
                          strokeWidth={1.25}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: play ? 1 : 0 }}
                          transition={{ duration: sec * 0.3, delay: delay + sec * 0.55 }}
                          key={`${token}-stem-${i}`}
                        />
                      )}

                      {/* median marker — a bright dot, always visible */}
                      <motion.circle
                        cx={cx}
                        cy={yMed}
                        r={showBox ? 2.8 : 3.4}
                        fill={p.surface}
                        stroke={fill}
                        strokeWidth={2}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: play ? 1 : 0, scale: play ? 1 : 0 }}
                        transition={{ duration: sec * 0.35, delay: delay + sec * 0.6, ease: [0.22, 1, 0.36, 1] }}
                        style={{ transformOrigin: `${cx}px ${yMed}px` }}
                        key={`${token}-med-${i}`}
                      />
                    </g>
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y}
                  height={inner.height}
                  label={yLabel}
                  format={(v) => formatCompact(v)}
                />
                <AxisBottom scale={band} y={inner.height} rotate={stats.length > 7 ? -28 : 0} />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && stats[hover.i] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {stats[hover.i].label}
                <span className="ml-1 opacity-60">n={stats[hover.i].n}</span>
              </div>
              <TooltipRow label="max" value={formatCompact(stats[hover.i].max, 2)} />
              <TooltipRow label="q3" value={formatCompact(stats[hover.i].q3, 2)} />
              <TooltipRow label="median" value={formatCompact(stats[hover.i].median, 2)} />
              <TooltipRow label="mean" value={formatCompact(stats[hover.i].mean, 2)} />
              <TooltipRow label="q1" value={formatCompact(stats[hover.i].q1, 2)} />
              <TooltipRow label="min" value={formatCompact(stats[hover.i].min, 2)} />
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

export const meta: RevizMeta = {
  id: "violin-plot",
  name: "Violin Plot",
  category: "statistical",
  description:
    "Mirrored kernel-density violins for each group, with an inner IQR box and median marker — reveals the full shape of a distribution (modes, skew, tails) where a box plot only shows quartiles.",
  tags: ["violin", "kde", "density", "distribution", "statistics", "kernel"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ViolinPlot",
  sourcePath: "statistical/ViolinPlot",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Groups",
      type: "json",
      group: "Data",
      help: "Array of [{ label, values: number[] }]. A Gaussian KDE + quartiles are computed per group.",
      default: DEFAULT_DATA,
    },
    {
      key: "bandwidth",
      label: "KDE bandwidth",
      type: "number",
      group: "Data",
      help: "Multiplier on the auto (Silverman) kernel bandwidth. Higher = smoother.",
      default: 1,
      min: 0.3,
      max: 3,
      step: 0.1,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Inference latency by precision" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Latency (ms)" },
    { key: "showBox", label: "Show inner box", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Violin color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1000, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "latency",
      name: "Latency by precision",
      props: {
        title: "Inference latency by precision",
        yLabel: "Latency (ms)",
        showBox: true,
      },
    },
    {
      id: "config",
      name: "Latency by serving config",
      props: {
        title: "p50 latency by serving config",
        yLabel: "Latency (ms)",
        bandwidth: 1.2,
        data: [
          {
            label: "vLLM",
            values: [
              41, 42, 43, 43, 44, 44, 45, 45, 46, 46, 47, 48, 49, 51, 54, 58, 64, 72, 83, 98,
            ],
          },
          {
            label: "TGI",
            values: [
              58, 60, 61, 62, 62, 63, 64, 64, 65, 66, 67, 69, 71, 74, 78, 84, 92, 103, 118, 138,
            ],
          },
          {
            label: "TensorRT",
            values: [
              33, 34, 34, 35, 35, 36, 36, 37, 37, 38, 39, 40, 41, 43, 46, 50, 56, 63, 73, 86,
            ],
          },
          {
            label: "Triton",
            values: [
              47, 48, 49, 50, 50, 51, 52, 52, 53, 54, 55, 57, 59, 62, 66, 72, 80, 90, 104, 122,
            ],
          },
        ],
      },
    },
    {
      id: "scores",
      name: "Eval scores by model",
      props: {
        title: "Pass@1 across 200 seeds",
        yLabel: "Pass@1 (%)",
        showBox: false,
        color: "",
        data: [
          {
            label: "7B-base",
            values: [
              28, 30, 31, 32, 33, 33, 34, 34, 35, 35, 36, 36, 37, 38, 39, 40, 42, 44, 47, 51,
            ],
          },
          {
            label: "7B-RLHF",
            values: [
              46, 48, 49, 50, 51, 51, 52, 53, 53, 54, 54, 55, 56, 57, 59, 61, 64, 67, 71, 76,
            ],
          },
          {
            label: "34B-RLHF",
            values: [
              66, 68, 69, 70, 71, 72, 72, 73, 73, 74, 75, 76, 77, 78, 80, 82, 84, 87, 90, 93,
            ],
          },
        ],
      },
    },
  ],
};
