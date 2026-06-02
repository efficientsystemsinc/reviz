"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
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
  TooltipRow,
  formatCompact,
  round,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

export interface QQPlotProps {
  values?: number[];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  showGrid?: boolean;
  showTailBands?: boolean;
  color?: string;
  pointRadius?: number;
  duration?: number;
}

/**
 * Default sample: 60 residuals that are very nearly Gaussian in the body but
 * carry a couple of heavy points in each tail — the classic "S"/flared Q-Q signature.
 */
const DEFAULT_VALUES: number[] = [
  -3.42, -2.71, -2.18, -1.86, -1.62, -1.44, -1.29, -1.16, -1.05, -0.95, -0.86,
  -0.78, -0.7, -0.63, -0.56, -0.5, -0.43, -0.37, -0.31, -0.25, -0.2, -0.14,
  -0.09, -0.03, 0.02, 0.08, 0.13, 0.19, 0.24, 0.3, 0.36, 0.42, 0.48, 0.54, 0.61,
  0.68, 0.75, 0.83, 0.91, 1.0, 1.09, 1.2, 1.31, 1.44, 1.59, 1.77, 1.99, 2.28,
  2.74, 3.61, -4.1, 4.38, -3.05, 3.18, -2.46, 2.55, 0.0, -0.66, 0.69, -1.5,
];

/**
 * Inverse standard-normal CDF (Acklam's rational approximation).
 * Returns the z-score whose lower-tail probability is `pr` ∈ (0, 1).
 */
function probit(pr: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (pr < pLow) {
    q = Math.sqrt(-2 * Math.log(pr));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (pr <= pHigh) {
    q = pr - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - pr));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

interface QQPoint {
  /** Theoretical normal quantile (z-score). */
  theo: number;
  /** Observed sample value (sorted ascending). */
  sample: number;
  /** Plotting position p = (i + 0.5) / n. */
  pp: number;
}

export default function QQPlot({
  values = DEFAULT_VALUES,
  title = "",
  caption = "",
  source = "",
  xLabel = "Theoretical quantiles (z)",
  yLabel = "Sample quantiles",
  showGrid = true,
  showTailBands = true,
  color = "",
  pointRadius = 4,
  duration = 1100,
}: QQPlotProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null);
  const ids = useMemo(() => ({ glow: uid("qq-glow") }), []);

  // Sort, compute plotting positions and theoretical quantiles, and fit the
  // robust reference line μ + σ·z so the diagonal is the expected line under normality.
  const { points, fit } = useMemo(() => {
    const clean = (values ?? []).filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
    const n = clean.length;
    if (n === 0) return { points: [] as QQPoint[], fit: { mu: 0, sigma: 1 } };

    const pts: QQPoint[] = clean.map((sample, i) => {
      const pp = (i + 0.5) / n;
      return { theo: probit(pp), sample, pp };
    });

    // Reference line through the 25th/75th sample percentiles vs the matching
    // normal quantiles — the standard R/qqline construction, robust to tails.
    const q = (frac: number) => {
      const idx = (n - 1) * frac;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
    };
    const sLo = q(0.25);
    const sHi = q(0.75);
    const zLo = probit(0.25);
    const zHi = probit(0.75);
    const sigma = (sHi - sLo) / (zHi - zLo) || 1;
    const mu = sLo - sigma * zLo;
    return { points: pts, fit: { mu, sigma } };
  }, [values]);

  const n = points.length;

  const xDomain = useMemo(() => {
    const e = extent(points, (d) => d.theo) as [number, number];
    if (e[0] == null) return [-3, 3] as [number, number];
    const pad = (e[1] - e[0]) * 0.08 || 0.5;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [points]);

  const yDomain = useMemo(() => {
    const e = extent(points, (d) => d.sample) as [number, number];
    if (e[0] == null) return [-3, 3] as [number, number];
    const pad = (e[1] - e[0]) * 0.08 || 0.5;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [points]);

  // Tail flag: a point sits in a tail if its plotting position is in the outer 10%.
  const tailFrac = 0.1;
  const isTail = (pp: number) => pp < tailFrac || pp > 1 - tailFrac;

  // A point "deviates" if it sits notably off the reference line — surfaced in the legend/tooltip.
  const refAt = (z: number) => fit.mu + fit.sigma * z;

  const legendItems: LegendItem[] = [
    { label: "sample", color: accent, shape: "circle" },
    { label: "normal y = μ + σz", color: p.inkFaint, shape: "dashed" },
  ];
  if (showTailBands) legendItems.push({ label: "tails", color: p.warn, shape: "circle" });

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <div className="mb-3 flex items-center justify-center">
          <Legend items={legendItems} align="center" />
        </div>

        <ResponsiveSvg
          aspect={1.16}
          margin={{ top: 16, right: 18, bottom: 48, left: 56 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]).nice();
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();

            const [z0, z1] = x.domain() as [number, number];
            const refLine = {
              x1: x(z0),
              y1: y(refAt(z0)),
              x2: x(z1),
              y2: y(refAt(z1)),
            };

            // Shade the theoretical-quantile tail regions (outer 10% of probability).
            const zTailLo = probit(tailFrac);
            const zTailHi = probit(1 - tailFrac);

            const baseDelay = 0.3;
            const per = n > 0 ? Math.min(0.035, 0.65 / n) : 0;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <filter id={ids.glow} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="3.5" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {showGrid && <GridLines scale={y as never} width={inner.width} />}
                {showGrid && (
                  <g aria-hidden>
                    {(x as never as { ticks: (c: number) => number[] }).ticks(6).map((t, i) => (
                      <line
                        key={i}
                        x1={x(t)}
                        x2={x(t)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.grid}
                        strokeWidth={1}
                        strokeDasharray="2 4"
                        shapeRendering="crispEdges"
                      />
                    ))}
                  </g>
                )}

                {/* Tail bands — outer 10% of the theoretical distribution */}
                {showTailBands && (
                  <motion.g
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.1 }}
                    key={`bands-${token}`}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={Math.max(0, x(zTailLo))}
                      height={inner.height}
                      fill={withAlpha(p.warn, 0.07)}
                    />
                    <rect
                      x={x(zTailHi)}
                      y={0}
                      width={Math.max(0, inner.width - x(zTailHi))}
                      height={inner.height}
                      fill={withAlpha(p.warn, 0.07)}
                    />
                  </motion.g>
                )}

                {/* Reference line y = μ + σ·z (the "normal" diagonal) */}
                <motion.line
                  x1={refLine.x1}
                  y1={refLine.y1}
                  x2={refLine.x2}
                  y2={refLine.y2}
                  stroke={p.inkFaint}
                  strokeWidth={1.75}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                  transition={{
                    pathLength: { duration: reduced ? 0 : duration / 1500, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.3 },
                  }}
                  key={`ref-${token}`}
                />

                {/* Sample-vs-theoretical points */}
                {points.map((d, i) => {
                  const cx = x(d.theo);
                  const cy = y(d.sample);
                  const tail = showTailBands && isTail(d.pp);
                  const c = tail ? p.warn : accent;
                  const active = hover?.i === i;
                  return (
                    <motion.circle
                      key={`${token}-${i}`}
                      cx={cx}
                      cy={cy}
                      r={active ? pointRadius + 2 : pointRadius}
                      fill={withAlpha(c, active ? 0.95 : 0.8)}
                      stroke={active ? c : withAlpha(c, 0.55)}
                      strokeWidth={active ? 1.5 : 1}
                      filter={active ? `url(#${ids.glow})` : undefined}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
                      transition={{
                        duration: reduced ? 0 : Math.min(0.5, duration / 1800),
                        delay: reduced ? 0 : baseDelay + i * per,
                        ease: [0.34, 1.56, 0.64, 1],
                      }}
                      style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
                      onMouseEnter={() => setHover({ i, cx, cy })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label={yLabel}
                  format={(v) => formatCompact(v, 2)}
                />
                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={(v) => formatCompact(v, 1)}
                />

                {/* X-axis title */}
                {xLabel && (
                  <text
                    x={inner.width / 2}
                    y={inner.height + 40}
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
                )}

                {/* σ readout badge */}
                {n > 0 && (
                  <motion.text
                    x={inner.width}
                    y={6}
                    textAnchor="end"
                    fill={p.inkMuted}
                    className="tabular-nums"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.04em" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: 0.4, delay: baseDelay + 0.2 }}
                    key={`sig-${token}`}
                  >
                    {`n = ${n} · σ̂ = ${round(fit.sigma, 2)}`}
                  </motion.text>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip
          x={hover ? hover.cx + 56 : 0}
          y={hover ? hover.cy + 16 : 0}
          visible={hover != null}
        >
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                quantile {round(points[hover.i].pp * 100, 1)}%
                {isTail(points[hover.i].pp) ? " · tail" : ""}
              </div>
              <TooltipRow label="theoretical z" value={formatCompact(points[hover.i].theo, 2)} />
              <TooltipRow label="sample" value={formatCompact(points[hover.i].sample, 2)} />
              <TooltipRow
                label="residual"
                value={formatCompact(points[hover.i].sample - refAt(points[hover.i].theo), 2)}
              />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "qq-plot",
  name: "Q-Q Plot",
  category: "statistical",
  description:
    "A quantile-quantile plot of sample values against theoretical normal quantiles, with the fitted reference line and shaded tails so departures from normality reveal themselves in the flared ends.",
  tags: ["qq", "quantile", "normality", "distribution", "residuals", "diagnostics"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "QQPlot",
  sourcePath: "statistical/QQPlot",
  aspect: 1.16,
  controls: [
    {
      key: "values",
      label: "Sample values",
      type: "json",
      group: "Data",
      help: "Array of numbers (e.g. model residuals). Plotted against normal quantiles; order doesn't matter — they're sorted internally.",
      default: DEFAULT_VALUES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Theoretical quantiles (z)" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Sample quantiles" },
    { key: "showGrid", label: "Gridlines", type: "boolean", group: "Layout", default: true },
    { key: "showTailBands", label: "Highlight tails", type: "boolean", group: "Layout", default: true },
    { key: "color", label: "Point color", type: "color", group: "Style", default: "" },
    { key: "pointRadius", label: "Point radius", type: "number", group: "Style", default: 4, min: 2, max: 10, step: 0.5, unit: "px" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "heavy-tailed",
      name: "Heavy-tailed residuals",
      props: {
        title: "Residual normality · regression head",
        caption:
          "The body of the distribution tracks the line, but both tails flare away from it — the hallmark of a heavy-tailed (leptokurtic) sample.",
        source: "Held-out residuals · n = 60",
        showTailBands: true,
      },
    },
    {
      id: "well-behaved",
      name: "Approximately normal",
      props: {
        title: "Calibration residuals after winsorizing",
        caption: "Points hug the reference line end to end — the sample is consistent with a normal distribution.",
        showTailBands: false,
        pointRadius: 4.5,
        values: [
          -2.41, -1.98, -1.74, -1.55, -1.39, -1.25, -1.13, -1.02, -0.92, -0.83,
          -0.74, -0.66, -0.58, -0.5, -0.43, -0.36, -0.29, -0.22, -0.16, -0.09,
          -0.03, 0.03, 0.09, 0.16, 0.22, 0.29, 0.36, 0.43, 0.5, 0.58, 0.66, 0.74,
          0.83, 0.92, 1.02, 1.13, 1.25, 1.39, 1.55, 1.74, 1.98, 2.41,
        ],
      },
    },
    {
      id: "right-skewed",
      name: "Right-skewed latency",
      props: {
        title: "Inference latency distribution",
        caption: "A convex curve above the line: the upper tail is stretched, the signature of a right-skewed sample.",
        xLabel: "Theoretical quantiles (z)",
        yLabel: "Latency (ms)",
        color: "",
        values: [
          41, 43, 44, 45, 46, 47, 47, 48, 49, 49, 50, 50, 51, 52, 52, 53, 54,
          55, 56, 57, 58, 59, 61, 62, 64, 66, 68, 71, 74, 78, 83, 89, 97, 108,
          124, 149, 192, 276, 441, 812,
        ],
      },
    },
  ],
};
