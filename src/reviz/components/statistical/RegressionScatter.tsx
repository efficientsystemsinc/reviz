"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area as d3area, line as d3line } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  Glow,
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
  usePrefersReducedMotion,
  useProgress,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Point {
  x: number;
  y: number;
}

export interface RegressionScatterProps {
  points?: Point[];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  showBand?: boolean;
  color?: string;
  duration?: number;
}

/**
 * A correlated cloud (R² ≈ 0.7): training-set size vs. validation accuracy.
 * Mirrors the `points` control default exactly.
 */
const DEFAULT_POINTS: Point[] = [
  { x: 5, y: 58.2 }, { x: 8, y: 60.1 }, { x: 11, y: 59.4 }, { x: 14, y: 63.8 },
  { x: 17, y: 62.0 }, { x: 20, y: 66.5 }, { x: 23, y: 64.9 }, { x: 26, y: 69.1 },
  { x: 29, y: 67.3 }, { x: 32, y: 71.8 }, { x: 35, y: 70.0 }, { x: 38, y: 74.6 },
  { x: 41, y: 72.1 }, { x: 44, y: 76.9 }, { x: 47, y: 75.2 }, { x: 50, y: 79.4 },
  { x: 53, y: 77.0 }, { x: 56, y: 81.6 }, { x: 59, y: 80.1 }, { x: 62, y: 84.2 },
  { x: 65, y: 82.4 }, { x: 68, y: 86.0 }, { x: 71, y: 83.9 }, { x: 74, y: 88.1 },
];

/**
 * Ordinary-least-squares fit y = slope·x + intercept, plus R², the residual
 * standard error, and the sufficient statistics needed for a pointwise
 * confidence band on the mean response.
 */
function fitLine(pts: Point[]) {
  const valid = pts.filter((d) => d != null && Number.isFinite(d.x) && Number.isFinite(d.y));
  const n = valid.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const d of valid) {
    sx += d.x;
    sy += d.y;
    sxx += d.x * d.x;
    sxy += d.x * d.y;
  }
  const meanX = sx / n;
  const meanY = sy / n;
  const ssXX = sxx - sx * sx / n;
  if (Math.abs(ssXX) < 1e-12) return null;
  const slope = (sxy - sx * sy / n) / ssXX;
  const intercept = meanY - slope * meanX;

  let ssTot = 0;
  let ssRes = 0;
  for (const d of valid) {
    const pred = slope * d.x + intercept;
    ssTot += (d.y - meanY) ** 2;
    ssRes += (d.y - pred) ** 2;
  }
  const r2 = ssTot < 1e-12 ? 0 : 1 - ssRes / ssTot;
  // Residual standard error (degrees of freedom n - 2 for a simple regression).
  const sigma = Math.sqrt(ssRes / Math.max(1, n - 2));
  // Pointwise standard error of the fitted mean at a given x.
  const seAt = (x: number) => sigma * Math.sqrt(1 / n + (x - meanX) ** 2 / ssXX);
  // ~95% band: a t-multiplier ≈ 2 keeps this robust without a t-table.
  const tMult = 2;
  const predict = (x: number) => slope * x + intercept;
  return { slope, intercept, r2, sigma, meanX, n, seAt, tMult, predict };
}

export default function RegressionScatter({
  points = DEFAULT_POINTS,
  title = "Training set size vs. validation accuracy",
  caption = "",
  source = "",
  xLabel = "Training examples (k)",
  yLabel = "Val. accuracy (%)",
  showBand = true,
  color = "",
  duration = 1100,
}: RegressionScatterProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null);

  const ids = useMemo(
    () => ({ band: uid("reg-band"), glow: uid("reg-glow") }),
    [],
  );

  const data = useMemo(
    () => points.filter((d) => d != null && Number.isFinite(d.x) && Number.isFinite(d.y)),
    [points],
  );

  const fit = useMemo(() => fitLine(data), [data]);

  const xDomain = useMemo(() => {
    const e = extent(data, (d) => d.x) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const pad = (e[1] - e[0]) * 0.05 || 1;
    return [e[0] - pad, e[1] + pad] as [number, number];
  }, [data]);

  const yDomain = useMemo(() => {
    const ys = data.map((d) => d.y);
    if (fit) {
      // Make sure the confidence band stays inside the frame.
      for (const xq of xDomain) {
        const mid = fit.predict(xq);
        const half = fit.tMult * fit.seAt(xq);
        ys.push(mid + half, mid - half);
      }
    }
    if (ys.length === 0) return [0, 1] as [number, number];
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = (hi - lo) * 0.1 || 1;
    return [lo - pad, hi + pad] as [number, number];
  }, [data, fit, xDomain]);

  // Progress driver for the line + band sweep (left → right).
  const sweep = useProgress({ duration, enabled: inView, trigger: token });
  const swept = reduced || !inView ? 1 : sweep;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={16 / 11}
          margin={{ top: 22, right: 22, bottom: xLabel ? 48 : 40, left: yLabel ? 58 : 46 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]).nice();
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();

            const [x0, x1] = x.domain() as [number, number];

            // Sample the fit across the niced x-domain for a smooth band.
            const samples = 48;
            const bandData: { x: number; mid: number; lo: number; hi: number }[] = [];
            if (fit) {
              for (let i = 0; i <= samples; i++) {
                const xv = x0 + (x1 - x0) * (i / samples);
                const mid = fit.predict(xv);
                const half = fit.tMult * fit.seAt(xv);
                bandData.push({ x: xv, mid, lo: mid - half, hi: mid + half });
              }
            }

            const bandPath =
              fit && showBand
                ? d3area<{ x: number; lo: number; hi: number }>()
                    .x((d) => x(d.x))
                    .y0((d) => y(d.lo))
                    .y1((d) => y(d.hi))(bandData) ?? ""
                : "";

            const linePath =
              fit
                ? d3line<{ x: number; mid: number }>()
                    .x((d) => x(d.x))
                    .y((d) => y(d.mid))(bandData) ?? ""
                : "";

            // Reveal width for the left→right sweep of line + band.
            const revealW = inner.width * swept;

            const baseDelay = fit ? Math.min(0.4, duration / 2600) : 0.08;
            const per = data.length > 0 ? Math.min(0.035, 0.6 / data.length) : 0;

            // Slope reported per the original units.
            const slopeTxt = fit ? round(fit.slope, fit.slope !== 0 && Math.abs(fit.slope) < 1 ? 3 : 2) : null;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <Glow id={ids.glow} blur={3.5} />
                  <VerticalFade id={ids.band} color={accent} from={0.22} to={0.06} />
                  <clipPath id={`${ids.band}-clip`}>
                    <rect x={0} y={-margin.top} width={revealW} height={inner.height + margin.top + margin.bottom} />
                  </clipPath>
                </defs>

                {/* Gridlines (both directions) */}
                <GridLines scale={y as never} width={inner.width} />
                <g aria-hidden>
                  {(x as never as { ticks: (n: number) => number[] }).ticks(6).map((t, i) => (
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

                {/* Confidence band + fit line, revealed left→right via clip */}
                {fit && (
                  <g clipPath={`url(#${ids.band}-clip)`}>
                    {showBand && bandPath && (
                      <motion.path
                        key={`${token}-band`}
                        d={bandPath}
                        fill={`url(#${ids.band})`}
                        stroke={withAlpha(accent, 0.35)}
                        strokeWidth={1}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: inView ? 1 : 0 }}
                        transition={{ duration: 0.5, delay: baseDelay * 0.4 }}
                      />
                    )}
                    {linePath && (
                      <path
                        d={linePath}
                        fill="none"
                        stroke={accent}
                        strokeWidth={2.25}
                        strokeLinecap="round"
                      />
                    )}
                  </g>
                )}

                {/* Observed points */}
                {data.map((d, i) => {
                  const cx = x(d.x);
                  const cy = y(d.y);
                  const active = hover?.i === i;
                  return (
                    <motion.circle
                      key={`${token}-${i}`}
                      cx={cx}
                      cy={cy}
                      r={active ? 6 : 4.5}
                      fill={withAlpha(accent, active ? 0.95 : 0.8)}
                      stroke={active ? accent : withAlpha(accent, 0.5)}
                      strokeWidth={active ? 1.5 : 1}
                      filter={active ? `url(#${ids.glow})` : undefined}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
                      transition={{
                        duration: reduced ? 0 : Math.min(0.5, duration / 2000),
                        delay: reduced ? 0 : baseDelay + i * per,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
                      onMouseEnter={() => setHover({ i, cx, cy })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}

                {/* Axes */}
                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label={yLabel} format={(v) => formatCompact(v, 1)} />
                <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => formatCompact(v)} />
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

                {/* R² + slope statistics card */}
                {fit && (
                  <motion.g
                    key={`${token}-stats`}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : -6 }}
                    transition={{ duration: 0.5, delay: baseDelay + duration / 1800 }}
                  >
                    <foreignObject x={0} y={0} width={196} height={52} style={{ overflow: "visible" }}>
                      <div className="inline-flex flex-col gap-0.5 rounded-md border border-border bg-surface/90 px-2.5 py-1.5 shadow-float backdrop-blur-sm">
                        <div className="font-mono text-[11.5px] tabular-nums text-ink">
                          {`R² = ${round(fit.r2, 3)}`}
                        </div>
                        <div className="whitespace-nowrap font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
                          {`slope = ${slopeTxt} · n = ${fit.n}`}
                        </div>
                      </div>
                    </foreignObject>
                  </motion.g>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip
          x={hover ? hover.cx + (yLabel ? 58 : 46) : 0}
          y={hover ? hover.cy + 22 : 0}
          visible={hover != null}
        >
          {hover != null && data[hover.i] && (
            <>
              <TooltipRow label={xLabel || "x"} value={formatCompact(data[hover.i].x, 2)} />
              <TooltipRow label={yLabel || "y"} value={formatCompact(data[hover.i].y, 2)} />
              {fit && (
                <TooltipRow
                  label="residual"
                  value={formatCompact(data[hover.i].y - fit.predict(data[hover.i].x), 2)}
                />
              )}
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
  id: "regression-scatter",
  name: "Regression Scatter",
  category: "statistical",
  description:
    "A scatter with an ordinary-least-squares best-fit line, a shaded confidence band on the mean response, and an annotated R² and slope — points, line, and band sweep in together.",
  tags: ["regression", "ols", "scatter", "correlation", "confidence-band", "r-squared", "linear-fit"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "RegressionScatter",
  sourcePath: "statistical/RegressionScatter",
  aspect: 16 / 11,
  controls: [
    {
      key: "points",
      label: "Points",
      type: "points",
      group: "Data",
      help: "Array of { x, y } observations. The OLS line, band, R², and slope are computed from these.",
      default: DEFAULT_POINTS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Training set size vs. validation accuracy" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Training examples (k)" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Val. accuracy (%)" },
    { key: "showBand", label: "Confidence band", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "correlated-cloud",
      name: "Correlated cloud (R² ≈ 0.7)",
      props: {
        title: "Training set size vs. validation accuracy",
        xLabel: "Training examples (k)",
        yLabel: "Val. accuracy (%)",
        caption: "Each point is a run; the line is an OLS fit with a 95% band on the mean response.",
        showBand: true,
      },
    },
    {
      id: "strong-fit",
      name: "Strong linear fit",
      props: {
        title: "Predicted vs. measured binding affinity",
        xLabel: "Predicted ΔG (kcal/mol)",
        yLabel: "Measured ΔG (kcal/mol)",
        showBand: true,
        points: [
          { x: -12.1, y: -11.6 }, { x: -11.4, y: -11.9 }, { x: -10.8, y: -10.3 },
          { x: -10.2, y: -10.7 }, { x: -9.6, y: -9.1 }, { x: -9.0, y: -9.5 },
          { x: -8.4, y: -8.0 }, { x: -7.9, y: -8.3 }, { x: -7.3, y: -6.9 },
          { x: -6.7, y: -7.2 }, { x: -6.1, y: -5.8 }, { x: -5.5, y: -6.0 },
          { x: -4.9, y: -4.6 }, { x: -4.3, y: -4.9 }, { x: -3.7, y: -3.5 },
          { x: -3.1, y: -3.8 }, { x: -2.5, y: -2.2 }, { x: -1.9, y: -2.4 },
        ],
      },
    },
    {
      id: "weak-trend",
      name: "Weak / noisy trend",
      props: {
        title: "Dropout rate vs. test loss",
        xLabel: "Dropout rate",
        yLabel: "Test loss",
        showBand: true,
        points: [
          { x: 0.05, y: 2.41 }, { x: 0.1, y: 2.18 }, { x: 0.1, y: 2.55 },
          { x: 0.15, y: 2.29 }, { x: 0.2, y: 2.62 }, { x: 0.2, y: 2.11 },
          { x: 0.25, y: 2.34 }, { x: 0.3, y: 2.48 }, { x: 0.3, y: 2.05 },
          { x: 0.35, y: 2.27 }, { x: 0.4, y: 2.58 }, { x: 0.4, y: 2.19 },
          { x: 0.45, y: 2.36 }, { x: 0.5, y: 2.13 }, { x: 0.5, y: 2.5 },
          { x: 0.55, y: 2.22 },
        ],
      },
    },
  ],
};
