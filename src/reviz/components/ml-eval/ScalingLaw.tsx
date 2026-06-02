"use client";

import { scaleLog } from "d3-scale";
import { line as d3line } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  Glow,
  LinearGradient,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
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

export interface ScalingLawProps {
  points?: Point[];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  showFit?: boolean;
  extrapolateTo?: number;
  color?: string;
  duration?: number;
}

const DEFAULT_POINTS: Point[] = [
  { x: 3.2e17, y: 3.94 },
  { x: 1.1e18, y: 3.46 },
  { x: 4.0e18, y: 3.02 },
  { x: 1.4e19, y: 2.71 },
  { x: 5.2e19, y: 2.43 },
  { x: 1.9e20, y: 2.16 },
  { x: 6.8e20, y: 1.95 },
  { x: 2.5e21, y: 1.78 },
  { x: 9.1e21, y: 1.62 },
  { x: 3.3e22, y: 1.49 },
];

/** Least-squares power-law fit y = a * x^b in log-log space. */
function fitPowerLaw(pts: Point[]): { a: number; b: number; r2: number } {
  const valid = pts.filter((d) => d.x > 0 && d.y > 0);
  const n = valid.length;
  if (n < 2) return { a: valid[0]?.y ?? 1, b: 0, r2: 0 };
  const xs = valid.map((d) => Math.log(d.x));
  const ys = valid.map((d) => Math.log(d.y));
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const lnA = my - b * mx;
  const a = Math.exp(lnA);
  // R² in log space.
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = lnA + b * xs[i];
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { a, b, r2 };
}

function fmtCoef(v: number): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e4)) {
    const exp = Math.floor(Math.log10(abs));
    const mant = v / 10 ** exp;
    return `${mant.toFixed(2)}e${exp}`;
  }
  return v.toFixed(abs < 1 ? 3 : 2);
}

export default function ScalingLaw({
  points = DEFAULT_POINTS,
  title = "Neural scaling law",
  caption = "",
  source = "",
  xLabel = "Compute (FLOPs)",
  yLabel = "Test loss",
  showFit = true,
  extrapolateTo = 0,
  color = "",
  duration = 1100,
}: ScalingLawProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const ids = useMemo(
    () => ({ grad: uid("scaling-grad"), glow: uid("scaling-glow") }),
    [],
  );

  const data = useMemo(
    () => points.filter((d) => d != null && d.x > 0 && d.y > 0).slice().sort((a, b) => a.x - b.x),
    [points],
  );

  const fit = useMemo(() => fitPowerLaw(data), [data]);

  // Domains: include the extrapolation target if it extends the x range.
  const { xDomain, yDomain } = useMemo(() => {
    const xsAll = data.map((d) => d.x);
    const ysAll = data.map((d) => d.y);
    let xMin = Math.min(...xsAll);
    let xMax = Math.max(...xsAll);
    const extend = showFit && extrapolateTo > xMax;
    if (extend) {
      xMax = extrapolateTo;
      ysAll.push(fit.a * extrapolateTo ** fit.b);
    }
    const yMin = Math.min(...ysAll);
    const yMax = Math.max(...ysAll);
    // Pad in log space.
    const xPad = (xMax / xMin) ** 0.06;
    const yPad = (yMax / yMin) ** 0.12;
    return {
      xDomain: [xMin / xPad, xMax * xPad] as [number, number],
      yDomain: [yMin / yPad, yMax * yPad] as [number, number],
    };
  }, [data, showFit, extrapolateTo, fit]);

  const progress = useProgress({ duration, enabled: inView, trigger: token });
  const lineP = reduced || !inView ? 1 : progress;

  const equation = `y = ${fmtCoef(fit.a)} · x^${fmtCoef(fit.b)}`;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 10} margin={{ top: 22, right: 26, bottom: 48, left: 58 }}>
          {({ inner, margin }) => {
            const xScale = scaleLog().domain(xDomain).range([0, inner.width]);
            const yScale = scaleLog().domain(yDomain).range([inner.height, 0]);

            const xTicks = xScale.ticks(6);
            const yTicks = yScale.ticks(5);

            // On a wide log domain d3 emits every minor (2×,3×,…) tick, which
            // overprints into an illegible smear. Label only decade (power-of-10)
            // ticks so the compute axis stays readable.
            const isDecade = (t: number) => {
              const e = Math.log10(t);
              return Math.abs(e - Math.round(e)) < 1e-6;
            };
            const decadeTicks = xTicks.filter(isDecade);
            const xLabelTicks = decadeTicks.length > 0 ? decadeTicks : xScale.domain();

            // Fit endpoints over the observed range and the extrapolated range.
            const obsXMin = data[0]?.x ?? xDomain[0];
            const obsXMax = data[data.length - 1]?.x ?? xDomain[1];
            const fitOf = (x: number) => fit.a * x ** fit.b;

            const fitPath =
              d3line<number>()
                .x((lx) => xScale(lx))
                .y((lx) => yScale(fitOf(lx)))([obsXMin, obsXMax]) ?? "";

            const hasExtrap = showFit && extrapolateTo > obsXMax;
            const extrapPath = hasExtrap
              ? d3line<number>()
                  .x((lx) => xScale(lx))
                  .y((lx) => yScale(fitOf(lx)))([obsXMax, extrapolateTo]) ?? ""
              : "";

            const extrapX = hasExtrap ? xScale(extrapolateTo) : 0;
            const extrapY = hasExtrap ? yScale(fitOf(extrapolateTo)) : 0;

            // Equation anchor: near the fit line, upper-right region.
            const annX = xScale(obsXMin);
            const annY = yScale(fitOf(obsXMin));

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <LinearGradient id={ids.grad} from={fill} to={p.series[3]} angle={0} />
                  <Glow id={ids.glow} blur={5} />
                </defs>

                {/* Log gridlines (both axes) */}
                <g aria-hidden>
                  {xTicks.map((t, i) => (
                    <line
                      key={`gx-${i}`}
                      x1={xScale(t)}
                      x2={xScale(t)}
                      y1={0}
                      y2={inner.height}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      shapeRendering="crispEdges"
                    />
                  ))}
                  {yTicks.map((t, i) => (
                    <line
                      key={`gy-${i}`}
                      x1={0}
                      x2={inner.width}
                      y1={yScale(t)}
                      y2={yScale(t)}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      shapeRendering="crispEdges"
                    />
                  ))}
                </g>

                {/* Extrapolation shaded band (region beyond observed data) */}
                {hasExtrap && (
                  <motion.rect
                    x={xScale(obsXMax)}
                    y={0}
                    width={Math.max(0, inner.width - xScale(obsXMax))}
                    height={inner.height}
                    fill={withAlpha(fill, 0.05)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: 0.5, delay: duration / 1000 }}
                  />
                )}

                {/* Fitted power-law line (observed range), drawn left→right */}
                {showFit && (
                  <path
                    d={fitPath}
                    fill="none"
                    stroke={`url(#${ids.grad})`}
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - lineP}
                  />
                )}

                {/* Extrapolation dashed segment */}
                {hasExtrap && (
                  <>
                    <motion.path
                      key={`extrap-${token}`}
                      d={extrapPath}
                      fill="none"
                      stroke={fill}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeDasharray="2 6"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: inView ? 0.9 : 0 }}
                      transition={{ duration: 0.4, delay: duration / 1000 }}
                    />
                    <motion.g
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0.6 }}
                      transition={{ duration: 0.45, delay: duration / 1000 + 0.15, ease: [0.22, 1, 0.36, 1] }}
                      style={{ transformOrigin: `${extrapX}px ${extrapY}px` }}
                    >
                      <circle cx={extrapX} cy={extrapY} r={4.5} fill={p.canvas} stroke={fill} strokeWidth={2} strokeDasharray="2 2.5" />
                      <text
                        x={extrapX}
                        y={extrapY - 12}
                        textAnchor="end"
                        fill={p.inkMuted}
                        className="font-mono"
                        style={{ fontSize: 10, letterSpacing: "0.04em" }}
                      >
                        {`≈ ${formatCompact(fitOf(extrapolateTo), 2)}`}
                      </text>
                    </motion.g>
                  </>
                )}

                {/* Observed data points */}
                {data.map((d, i) => {
                  const cx = xScale(d.x);
                  const cy = yScale(d.y);
                  const active = hover?.i === i;
                  const delay = reduced ? 0 : (i / Math.max(1, data.length)) * (duration / 1000) * 0.6;
                  return (
                    <motion.circle
                      key={`pt-${token}-${i}`}
                      cx={cx}
                      cy={cy}
                      r={active ? 6 : 4.5}
                      fill={p.canvas}
                      stroke={fill}
                      strokeWidth={active ? 2.5 : 2}
                      filter={active ? `url(#${ids.glow})` : undefined}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
                      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
                      onMouseMove={(e) => {
                        const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                        setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: "pointer" }}
                    />
                  );
                })}

                {/* Fit equation annotation */}
                {showFit && (
                  <AnimatePresence>
                    <motion.g
                      key={`ann-${token}`}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: inView ? 1 : 0, y: 0 }}
                      transition={{ duration: 0.5, delay: duration / 1000 * 0.7 }}
                    >
                      <foreignObject
                        x={Math.min(annX + 8, inner.width - 168)}
                        y={Math.max(2, annY - 52)}
                        width={168}
                        height={48}
                        style={{ overflow: "visible" }}
                      >
                        <div className="rounded-md border border-border bg-surface/90 px-2.5 py-1.5 shadow-float backdrop-blur-sm">
                          <div className="font-mono text-[12px] tabular-nums text-ink">{equation}</div>
                          <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
                            {`R² = ${fit.r2.toFixed(3)}`}
                          </div>
                        </div>
                      </foreignObject>
                    </motion.g>
                  </AnimatePresence>
                )}

                {/* Axes */}
                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={yScale as never}
                  height={inner.height}
                  label={yLabel}
                  count={5}
                  format={(v) => formatCompact(v, 2)}
                />
                <g aria-hidden transform={`translate(0, ${inner.height})`}>
                  {xLabelTicks.map((t, i) => (
                    <text
                      key={`tx-${i}`}
                      x={xScale(t)}
                      y={16}
                      textAnchor="middle"
                      fill={p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: 10.5, letterSpacing: "0.04em" }}
                    >
                      {formatCompact(t)}
                    </text>
                  ))}
                  {xLabel && (
                    <text
                      x={inner.width / 2}
                      y={38}
                      textAnchor="middle"
                      fill={p.inkMuted}
                      className="font-mono"
                      style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase" }}
                    >
                      {xLabel}
                    </text>
                  )}
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && data[hover.i] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {xLabel || "x"}
              </div>
              <TooltipRow label="x" value={formatCompact(data[hover.i].x, 2)} />
              <TooltipRow label="y" value={formatCompact(data[hover.i].y, 3)} />
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
  id: "scaling-law",
  name: "Scaling Law",
  category: "ml-eval",
  description:
    "A log-log scatter with a least-squares power-law fit (y = a·x^b), annotated equation and R², plus an optional dashed extrapolation to forecast loss at larger compute.",
  tags: ["scaling", "power-law", "loss", "compute", "log-log", "extrapolation", "fit"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ScalingLaw",
  sourcePath: "ml-eval/ScalingLaw",
  aspect: 16 / 10,
  controls: [
    {
      key: "points",
      label: "Points",
      type: "json",
      group: "Data",
      help: "Array of { x, y } observations (both must be positive for log-log).",
      default: DEFAULT_POINTS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Neural scaling law" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Compute (FLOPs)" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Test loss" },
    { key: "showFit", label: "Show fit + equation", type: "boolean", group: "Style", default: true },
    {
      key: "extrapolateTo",
      label: "Extrapolate to x",
      type: "number",
      group: "Style",
      help: "Project the fit out to this x value (0 disables). Use large values, e.g. 1e24.",
      default: 0,
      min: 0,
      max: 1e26,
      step: 1e22,
    },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "loss-vs-compute",
      name: "Loss vs compute",
      props: {
        title: "Loss scales as a power law in compute",
        xLabel: "Compute (FLOPs)",
        yLabel: "Test loss",
        caption: "Each point is a trained model; the line is a least-squares power-law fit in log-log space.",
        showFit: true,
      },
    },
    {
      id: "extrapolated",
      name: "Forecast to 10²⁴ FLOPs",
      props: {
        title: "Extrapolating the scaling law",
        xLabel: "Compute (FLOPs)",
        yLabel: "Test loss",
        extrapolateTo: 1e24,
        source: "fit on observed runs",
      },
    },
    {
      id: "data-scaling",
      name: "Loss vs dataset size",
      props: {
        title: "Loss vs dataset size",
        xLabel: "Tokens",
        yLabel: "Test loss",
        points: [
          { x: 1.0e8, y: 4.21 },
          { x: 3.0e8, y: 3.78 },
          { x: 1.0e9, y: 3.38 },
          { x: 3.0e9, y: 3.05 },
          { x: 1.0e10, y: 2.74 },
          { x: 3.0e10, y: 2.49 },
          { x: 1.0e11, y: 2.27 },
          { x: 3.0e11, y: 2.08 },
        ],
      },
    },
  ],
};
