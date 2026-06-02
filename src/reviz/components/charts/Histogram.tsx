"use client";

import { bin as d3bin, max as d3max, mean as d3mean, deviation, quantile } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area as d3area, curveBasis, line as d3line } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  VerticalFade,
  formatCompact,
  round,
  uid,
  useInView,
  usePalette,
  useProgress,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

export interface HistogramProps {
  values?: number[];
  bins?: number;
  showDensity?: boolean;
  showMean?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  color?: string;
  duration?: number;
}

interface Bucket {
  x0: number;
  x1: number;
  count: number;
  mid: number;
}

/** A tiny Gaussian-kernel density estimate sampled across the value range. */
function kde(values: number[], lo: number, hi: number, steps = 64): { x: number; y: number }[] {
  const n = values.length;
  if (n < 2) return [];
  const sd = deviation(values) ?? 1;
  // Silverman's rule of thumb for the bandwidth.
  const iqrArr = [...values].sort((a, b) => a - b);
  const q1 = quantile(iqrArr, 0.25) ?? lo;
  const q3 = quantile(iqrArr, 0.75) ?? hi;
  const iqr = q3 - q1;
  const spread = Math.min(sd, iqr > 0 ? iqr / 1.349 : sd) || sd || 1;
  const h = 1.06 * spread * Math.pow(n, -1 / 5) || (hi - lo) / 12 || 1;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    let sum = 0;
    for (const v of values) {
      const u = (x - v) / h;
      sum += Math.exp(-0.5 * u * u);
    }
    const y = sum / (n * h * Math.sqrt(2 * Math.PI));
    out.push({ x, y });
  }
  return out;
}

export default function Histogram({
  values = NORMAL_SAMPLE,
  bins = 16,
  showDensity = true,
  showMean = true,
  title = "Distribution of eval scores",
  caption = "",
  source = "",
  xLabel = "Score",
  color = "",
  duration = 1000,
}: HistogramProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const ids = useMemo(() => ({ fade: uid("hist-fade") }), []);

  const clean = useMemo(
    () => (Array.isArray(values) ? values.filter((v) => typeof v === "number" && Number.isFinite(v)) : []),
    [values],
  );

  const { buckets, domain, meanV, medianV, densityMaxCount, peakCount } = useMemo(() => {
    if (clean.length === 0) {
      return {
        buckets: [] as Bucket[],
        domain: [0, 1] as [number, number],
        meanV: 0,
        medianV: 0,
        densityMaxCount: 1,
        peakCount: 1,
      };
    }
    const lo = Math.min(...clean);
    const hi = Math.max(...clean);
    const dom: [number, number] = lo === hi ? [lo - 0.5, hi + 0.5] : [lo, hi];

    const x = scaleLinear().domain(dom).nice();
    const niceDom = x.domain() as [number, number];
    const thresholds = x.ticks(Math.max(1, Math.round(bins)));
    const binner = d3bin<number, number>().domain(niceDom).thresholds(thresholds);
    const raw = binner(clean);
    const bk: Bucket[] = raw.map((b) => {
      const x0 = b.x0 ?? niceDom[0];
      const x1 = b.x1 ?? niceDom[1];
      return { x0, x1, count: b.length, mid: (x0 + x1) / 2 };
    });

    const sorted = [...clean].sort((a, b) => a - b);
    const med = quantile(sorted, 0.5) ?? sorted[0];
    const mn = mean(clean) ?? sorted[0];

    // Scale the density curve so its peak roughly matches the tallest bar.
    const binWidth = bk.length ? bk[0].x1 - bk[0].x0 : 1;
    const density = showDensity ? kde(clean, niceDom[0], niceDom[1]) : [];
    const densityPeak = density.length ? d3max(density, (d) => d.y) ?? 0 : 0;
    const peak = Math.max(1, d3max(bk, (b) => b.count) ?? 1);
    // Convert density (prob per unit x) to expected count per bin for shared y-axis.
    const dMaxCount = densityPeak * clean.length * binWidth;

    return {
      buckets: bk,
      domain: niceDom,
      meanV: mn,
      medianV: med,
      densityMaxCount: Math.max(peak, dMaxCount),
      peakCount: peak,
    };
  }, [clean, bins, showDensity]);

  const densityPts = useMemo(
    () => (showDensity && clean.length > 1 ? kde(clean, domain[0], domain[1]) : []),
    [showDensity, clean, domain],
  );

  const progress = useProgress({ duration, trigger: `${token}-${inView}`, enabled: inView });

  const yMax = Math.max(1, Math.ceil(densityMaxCount));
  const binWidth = buckets.length ? buckets[0].x1 - buckets[0].x0 : 1;
  // density(prob) -> count-per-bin so curve shares the bar y-axis
  const densCountScale = clean.length * binWidth;

  const empty = clean.length === 0;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 10} margin={{ top: 38, right: 18, bottom: 46, left: 48 }}>
          {({ inner, margin }) => {
            const x = scaleLinear().domain(domain).range([0, inner.width]);
            const y = scaleLinear().domain([0, yMax]).range([inner.height, 0]).nice();

            const curve = d3line<{ x: number; y: number }>()
              .x((d) => x(d.x))
              .y((d) => y(d.y * densCountScale))
              .curve(curveBasis);
            const curveArea = d3area<{ x: number; y: number }>()
              .x((d) => x(d.x))
              .y0(inner.height)
              .y1((d) => y(d.y * densCountScale))
              .curve(curveBasis);

            const meanX = x(meanV);
            const medX = x(medianV);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <VerticalFade id={ids.fade} color={fill} from={0.22} to={0.02} />
                </defs>

                <GridLines scale={y as never} width={inner.width} />

                {/* Bars */}
                {buckets.map((b, i) => {
                  const bx = x(b.x0);
                  const bw = Math.max(0, x(b.x1) - x(b.x0));
                  const gap = bw > 6 ? 1.2 : 0.4;
                  const full = inner.height - y(b.count);
                  const stagger = buckets.length > 1 ? i / buckets.length : 0;
                  const local = clamp01((progress - stagger * 0.45) / (1 - stagger * 0.45 || 1));
                  const h = empty ? 0 : full * local;
                  const active = hover?.i === i;
                  return (
                    <rect
                      key={i}
                      x={bx + gap}
                      width={Math.max(0, bw - gap * 2)}
                      y={inner.height - h}
                      height={h}
                      rx={bw > 8 ? 2.5 : 1}
                      fill={active ? fill : withAlpha(fill, 0.82)}
                      stroke={active ? p.surface : "transparent"}
                      strokeWidth={active ? 1.5 : 0}
                      onMouseMove={(e) => {
                        const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                        setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}

                {/* Density overlay */}
                {showDensity && densityPts.length > 1 && (
                  <g style={{ opacity: clamp01((progress - 0.25) / 0.6) }}>
                    <path d={curveArea(densityPts) ?? ""} fill={`url(#${ids.fade})`} />
                    <motion.path
                      d={curve(densityPts) ?? ""}
                      fill="none"
                      stroke={fill}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={false}
                      animate={{ pathLength: progress }}
                      transition={{ duration: 0 }}
                    />
                  </g>
                )}

                {/* Mean / median markers */}
                {showMean && !empty && (
                  <g style={{ opacity: clamp01((progress - 0.55) / 0.4) }}>
                    {/* median */}
                    <line
                      x1={medX}
                      x2={medX}
                      y1={-6}
                      y2={inner.height}
                      stroke={p.inkMuted}
                      strokeWidth={1}
                      strokeDasharray="2 3"
                    />
                    {/* mean */}
                    <line
                      x1={meanX}
                      x2={meanX}
                      y1={6}
                      y2={inner.height}
                      stroke={p.accent}
                      strokeWidth={1.5}
                    />
                    <g transform={`translate(${meanX}, 6)`}>
                      <polygon points="0,0 -4,-6 4,-6" fill={p.accent} />
                    </g>
                    {/* Labels — drawn last, anchored to opposite sides with opaque
                        plates so the near-coincident guide lines never bleed through.
                        Median label is pulled left, mean label pushed right, and the
                        two are staggered vertically to fully decouple the cluster. */}
                    {(() => {
                      const medLabel = `MED ${formatCompact(medianV, 2)}`;
                      const meanLabel = `μ ${formatCompact(meanV, 2)}`;
                      const ch = 5.6; // approx mono glyph advance at 9.5px
                      const plateH = 13;
                      const padX = 3;
                      const medW = medLabel.length * ch;
                      const meanW = meanLabel.length * ch;
                      const medAnchorX = medX - 8;
                      const meanAnchorX = meanX + 8;
                      const medY = -22;
                      const meanY = -8;
                      return (
                        <>
                          <rect
                            x={medAnchorX - medW - padX}
                            y={medY - plateH + 2}
                            width={medW + padX * 2}
                            height={plateH}
                            rx={2}
                            fill={p.canvas}
                          />
                          <text
                            x={medAnchorX}
                            y={medY}
                            textAnchor="end"
                            fill={p.inkMuted}
                            className="font-mono"
                            style={{ fontSize: 9.5, letterSpacing: "0.08em" }}
                          >
                            {medLabel}
                          </text>
                          <rect
                            x={meanAnchorX - padX}
                            y={meanY - plateH + 2}
                            width={meanW + padX * 2}
                            height={plateH}
                            rx={2}
                            fill={p.canvas}
                          />
                          <text
                            x={meanAnchorX}
                            y={meanY}
                            textAnchor="start"
                            fill={p.accent}
                            className="font-mono"
                            style={{ fontSize: 9.5, letterSpacing: "0.08em" }}
                          >
                            {meanLabel}
                          </text>
                        </>
                      );
                    })()}
                  </g>
                )}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label="Count" format={(v) => formatCompact(v)} />
                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={(v) => formatCompact(v, 2)}
                  linearCount={6}
                />
                {xLabel && (
                  <text
                    x={inner.width / 2}
                    y={inner.height + 40}
                    textAnchor="middle"
                    fill={p.inkMuted}
                    className="font-mono"
                    style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase" }}
                  >
                    {xLabel}
                  </text>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && buckets[hover.i] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {formatCompact(buckets[hover.i].x0, 2)} – {formatCompact(buckets[hover.i].x1, 2)}
              </div>
              <TooltipRow label="count" value={buckets[hover.i].count} />
              <TooltipRow
                label="share"
                value={`${round((buckets[hover.i].count / Math.max(1, clean.length)) * 100, 1)}%`}
              />
            </>
          )}
        </FloatingTooltip>

        <div className="pointer-events-none absolute right-0 top-0 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            n = {clean.length} · peak {peakCount}
          </span>
        </div>

        <div className="absolute bottom-0 right-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// d3-array `mean` re-exported under a local name to avoid shadowing.
function mean(arr: number[]): number | undefined {
  return d3mean(arr);
}

// realistic, roughly-normal eval-score sample (seeded look, hand-tuned)
const NORMAL_SAMPLE = [
  68, 71, 73, 74, 75, 76, 76, 77, 78, 78, 79, 79, 80, 80, 80, 81, 81, 81, 82, 82, 82, 82, 83, 83, 83,
  83, 84, 84, 84, 84, 84, 85, 85, 85, 85, 85, 85, 86, 86, 86, 86, 86, 87, 87, 87, 87, 88, 88, 88, 88,
  89, 89, 89, 90, 90, 90, 91, 91, 92, 92, 93, 94, 95, 97, 66, 72, 78, 83, 86, 88, 81, 84, 87, 79, 82,
  85, 80, 83, 86, 89,
];

// right-skewed inference-latency sample (ms) — long tail
const LATENCY_SAMPLE = [
  42, 44, 45, 46, 47, 48, 48, 49, 50, 50, 51, 52, 52, 53, 54, 55, 56, 57, 58, 60, 62, 63, 65, 67, 70,
  72, 75, 78, 82, 88, 95, 104, 118, 135, 162, 41, 43, 46, 49, 51, 53, 56, 59, 64, 71, 80, 92, 110,
  148, 47, 50, 52, 54, 57, 61, 66, 73, 85, 101, 130, 45, 48, 51, 55, 60, 68, 79, 96, 124, 188,
];

export const meta: RevizMeta = {
  id: "histogram",
  name: "Histogram",
  category: "charts",
  description:
    "Bins raw samples into a frequency distribution with an optional smooth density curve and mean/median markers — the fastest read on the shape of your data.",
  tags: ["histogram", "distribution", "frequency", "density", "kde"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "Histogram",
  sourcePath: "charts/Histogram",
  aspect: 16 / 10,
  controls: [
    {
      key: "values",
      label: "Samples",
      type: "json",
      group: "Data",
      help: "Raw numeric samples — binned automatically.",
      default: NORMAL_SAMPLE,
    },
    { key: "bins", label: "Bin count", type: "number", group: "Data", default: 16, min: 4, max: 60, step: 1 },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Distribution of eval scores" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Score" },
    { key: "showDensity", label: "Density curve", type: "boolean", group: "Style", default: true },
    { key: "showMean", label: "Mean / median", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1000, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "normal",
      name: "Normal scores",
      props: {
        title: "Distribution of eval scores",
        xLabel: "Score",
        bins: 16,
        values: NORMAL_SAMPLE,
      },
    },
    {
      id: "latency",
      name: "Skewed latency",
      props: {
        title: "Inference latency distribution",
        xLabel: "Latency (ms)",
        bins: 22,
        values: LATENCY_SAMPLE,
      },
    },
  ],
};
