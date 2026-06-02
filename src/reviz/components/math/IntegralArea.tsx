"use client";

import { scaleLinear } from "d3-scale";
import { area as d3area, curveMonotoneX, line as d3line } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  VerticalFade,
  clamp,
  formatCompact,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Safe, built-in function library (mirrors FunctionPlot — no eval).    */
/* `a` = amplitude / vertical scale, `b` = frequency / rate.            */
/* ------------------------------------------------------------------ */

type FnType =
  | "sin"
  | "cos"
  | "tanh"
  | "relu"
  | "sigmoid"
  | "gaussian"
  | "square"
  | "log"
  | "exp";

const FN_LABEL: Record<FnType, string> = {
  sin: "sin",
  cos: "cos",
  tanh: "tanh",
  relu: "relu",
  sigmoid: "sigmoid",
  gaussian: "gaussian",
  square: "x²",
  log: "log",
  exp: "exp",
};

/** Evaluate a built-in function safely. Returns NaN where undefined. */
function evalFn(type: FnType, x: number, amp: number, freq: number): number {
  switch (type) {
    case "sin":
      return amp * Math.sin(freq * x);
    case "cos":
      return amp * Math.cos(freq * x);
    case "tanh":
      return amp * Math.tanh(freq * x);
    case "relu":
      return amp * Math.max(0, freq * x);
    case "sigmoid":
      return amp / (1 + Math.exp(-freq * x));
    case "gaussian":
      return amp * Math.exp(-((freq * x) ** 2) / 2);
    case "square":
      return amp * (freq * x) ** 2;
    case "log":
      return freq * x > 0 ? amp * Math.log(freq * x) : NaN;
    case "exp":
      return amp * Math.exp(freq * x);
    default:
      return NaN;
  }
}

/** A readable label like "exp(x)" or "x²". */
function fnLabel(type: FnType, amp: number, freq: number): string {
  const base = FN_LABEL[type];
  const arg = freq === 1 ? "x" : `${formatCompact(freq)}x`;
  const a = amp === 1 ? "" : `${formatCompact(amp)}·`;
  if (type === "square") return amp === 1 && freq === 1 ? "x²" : `${a}(${arg})²`;
  return `${a}${base}(${arg})`;
}

type RiemannMethod = "left" | "right" | "mid";

const METHOD_LABEL: Record<RiemannMethod, string> = {
  left: "left endpoint",
  right: "right endpoint",
  mid: "midpoint",
};

export interface IntegralAreaProps {
  fn?: FnType;
  amp?: number;
  freq?: number;
  a?: number;
  b?: number;
  domain?: [number, number];
  rects?: number;
  method?: RiemannMethod;
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  color?: string;
  duration?: number;
}

const DEFAULT_DOMAIN: [number, number] = [-4, 4];

export default function IntegralArea({
  fn = "gaussian",
  amp = 1,
  freq = 1,
  a = -1.2,
  b = 1.2,
  domain = DEFAULT_DOMAIN,
  rects = 0,
  method = "mid",
  title = "Area under a Gaussian",
  caption = "",
  source = "",
  xLabel = "x",
  yLabel = "f(x)",
  color = "",
  duration = 1200,
}: IntegralAreaProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ x: number; px: number } | null>(null);
  const gid = useMemo(() => uid("intg"), []);

  const fill = color || p.accent;

  // Integration bounds (lo <= hi).
  const [lo, hi] = useMemo<[number, number]>(() => {
    const a0 = Number.isFinite(a) ? a : -1;
    const b0 = Number.isFinite(b) ? b : 1;
    return a0 <= b0 ? [a0, b0] : [b0, a0];
  }, [a, b]);

  // Plot domain (clamped, monotone-increasing) — always contains [lo, hi].
  const [xMin, xMax] = useMemo<[number, number]>(() => {
    let d0 = Number.isFinite(domain?.[0]) ? domain[0] : -4;
    let d1 = Number.isFinite(domain?.[1]) ? domain[1] : 4;
    if (d0 >= d1) [d0, d1] = [d1 - 1, d1 + 1];
    return [Math.min(d0, lo), Math.max(d1, hi)];
  }, [domain, lo, hi]);

  const nRects = clamp(Math.round(rects), 0, 200);
  const SAMPLES = 240;

  // Sample the curve across the full domain (y can be NaN).
  const samples = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const x = xMin + ((xMax - xMin) * s) / SAMPLES;
      pts.push({ x, y: evalFn(fn, x, amp, freq) });
    }
    return pts;
  }, [fn, amp, freq, xMin, xMax]);

  // Sample finely *inside* [lo, hi] for the shaded region (clean edges).
  const regionPts = useMemo(() => {
    const N = 160;
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= N; s++) {
      const x = lo + ((hi - lo) * s) / N;
      pts.push({ x, y: evalFn(fn, x, amp, freq) });
    }
    return pts;
  }, [fn, amp, freq, lo, hi]);

  // High-resolution definite integral over [lo, hi] (Simpson-ish trapezoid).
  const integral = useMemo(() => {
    const N = 2000;
    const dx = (hi - lo) / N;
    let acc = 0;
    for (let s = 0; s < N; s++) {
      const x0 = lo + dx * s;
      const x1 = x0 + dx;
      const y0 = evalFn(fn, x0, amp, freq);
      const y1 = evalFn(fn, x1, amp, freq);
      if (Number.isFinite(y0) && Number.isFinite(y1)) acc += ((y0 + y1) / 2) * dx;
    }
    return acc;
  }, [fn, amp, freq, lo, hi]);

  // Riemann-sum rectangles + their (signed) area estimate.
  const riemann = useMemo(() => {
    if (nRects <= 0) return { bars: [] as { x0: number; x1: number; h: number }[], sum: 0 };
    const dx = (hi - lo) / nRects;
    const bars: { x0: number; x1: number; h: number }[] = [];
    let sum = 0;
    for (let i = 0; i < nRects; i++) {
      const x0 = lo + dx * i;
      const x1 = x0 + dx;
      const sx = method === "left" ? x0 : method === "right" ? x1 : (x0 + x1) / 2;
      const h = evalFn(fn, sx, amp, freq);
      if (Number.isFinite(h)) {
        bars.push({ x0, x1, h });
        sum += h * dx;
      }
    }
    return { bars, sum };
  }, [fn, amp, freq, lo, hi, nRects, method]);

  // Y-domain from finite samples, robustly clamped, with y=0 always visible.
  const [yMin, yMax] = useMemo<[number, number]>(() => {
    const all = samples.map((d) => d.y).filter((v) => Number.isFinite(v));
    if (all.length === 0) return [-1, 1];
    let yl = Math.min(...all);
    let yh = Math.max(...all);
    const sorted = [...all].sort((m, n) => m - n);
    const q = (t: number) =>
      sorted[clamp(Math.round(t * (sorted.length - 1)), 0, sorted.length - 1)];
    const robustHi = q(0.98);
    const robustLo = q(0.02);
    if (yh > robustHi * 2 && robustHi > 0) yh = robustHi * 1.15;
    if (yl < robustLo * 2 && robustLo < 0) yl = robustLo * 1.15;
    if (yh === yl) {
      yh += 1;
      yl -= 1;
    }
    yl = Math.min(yl, 0);
    yh = Math.max(yh, 0);
    const pad = (yh - yl) * 0.07;
    return [yl - pad, yh + pad];
  }, [samples]);

  const fnText = fnLabel(fn, amp, freq);
  const smooth = nRects <= 0;

  // Animation timing.
  const drawDur = reduced ? 0 : (duration / 1000) * 0.7;
  const reveal = reduced ? 1 : inView ? 1 : 0;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        {/* Integral annotation header. */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-3">
            <span
              className="font-serif italic leading-none text-ink"
              style={{ fontSize: 30 }}
            >
              ∫
            </span>
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
                {smooth
                  ? `exact area · ${METHOD_LABEL[method] ? "definite integral" : ""}`.trim()
                  : `${nRects} rect · ${METHOD_LABEL[method]}`}
              </span>
              <span className="font-mono text-[12px] text-ink-muted">
                {fnText} on [{formatCompact(lo, 2)}, {formatCompact(hi, 2)}]
              </span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
              {smooth ? "∫ f(x) dx" : "Σ f(xᵢ)Δx"}
            </span>
            <motion.span
              key={`${token}-val`}
              className="font-semibold tabular-nums text-ink"
              style={{ fontSize: 22, color: fill }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: reveal ? 1 : 0, y: reveal ? 0 : 4 }}
              transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : drawDur * 0.55 }}
            >
              {formatCompact(smooth ? integral : riemann.sum, 4)}
            </motion.span>
          </div>
        </div>

        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 14, right: 18, bottom: xLabel ? 40 : 32, left: yLabel ? 50 : 38 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain([xMin, xMax]).range([0, inner.width]);
            const y = scaleLinear().domain([yMin, yMax]).range([inner.height, 0]).nice();

            const originX = clamp(x(0), 0, inner.width);
            const originY = clamp(y(0), 0, inner.height);
            const xHasZero = 0 >= xMin && 0 <= xMax;
            const yHasZero = 0 >= y.domain()[0] && 0 <= y.domain()[1];
            const zeroPx = clamp(y(0), 0, inner.height);

            const lineGen = d3line<{ x: number; y: number }>()
              .x((d) => x(d.x))
              .y((d) => y(d.y))
              .defined((d) => Number.isFinite(d.y))
              .curve(curveMonotoneX);

            const regionAreaGen = d3area<{ x: number; y: number }>()
              .x((d) => x(d.x))
              .y0(zeroPx)
              .y1((d) => y(d.y))
              .defined((d) => Number.isFinite(d.y))
              .curve(curveMonotoneX);

            const curvePath = lineGen(samples) ?? "";
            const regionPath = regionAreaGen(regionPts) ?? "";

            const xTicks = x.ticks(7);
            const yTicks = (y as unknown as { ticks: (n: number) => number[] }).ticks(6);

            const hoverX = hover?.x ?? null;
            const inRange = hoverX != null && hoverX >= lo && hoverX <= hi;

            // Per-rectangle stagger (cap so dense sums still feel snappy).
            const perRect = nRects > 0 ? Math.min(0.03, (drawDur * 0.5) / nRects) : 0;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <clipPath id={`${gid}-clip`}>
                    <rect x={0} y={0} width={inner.width} height={inner.height} />
                  </clipPath>
                  <VerticalFade
                    id={`${gid}-fade`}
                    color={fill}
                    from={0.32}
                    to={0.04}
                  />
                  {/* Sweep clip that reveals the shaded region left-to-right. */}
                  <clipPath id={`${gid}-sweep`}>
                    <motion.rect
                      x={x(lo)}
                      y={-10}
                      height={inner.height + 20}
                      initial={{ width: reduced ? Math.max(0, x(hi) - x(lo)) : 0 }}
                      animate={{ width: reveal ? Math.max(0, x(hi) - x(lo)) : 0 }}
                      transition={{ duration: drawDur, ease: [0.22, 1, 0.36, 1] }}
                      key={`${token}-sweep`}
                    />
                  </clipPath>
                </defs>

                {/* Gridlines. */}
                <g aria-hidden>
                  {xTicks.map((t, i) => (
                    <line
                      key={`vx-${i}`}
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
                  {yTicks.map((t, i) => (
                    <line
                      key={`hy-${i}`}
                      x1={0}
                      x2={inner.width}
                      y1={y(t)}
                      y2={y(t)}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      shapeRendering="crispEdges"
                    />
                  ))}
                </g>

                {/* Bounds [a, b] guide lines. */}
                {[lo, hi].map((v, i) => (
                  <g key={`bound-${i}`}>
                    <motion.line
                      x1={x(v)}
                      x2={x(v)}
                      y1={0}
                      y2={inner.height}
                      stroke={withAlpha(fill, 0.55)}
                      strokeWidth={1.25}
                      strokeDasharray="3 3"
                      shapeRendering="crispEdges"
                      initial={{ opacity: reduced ? 1 : 0 }}
                      animate={{ opacity: reveal ? 1 : 0 }}
                      transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : 0.1 }}
                    />
                    <motion.text
                      x={x(v)}
                      y={inner.height + 26}
                      textAnchor="middle"
                      fill={fill}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                      }}
                      initial={{ opacity: reduced ? 1 : 0 }}
                      animate={{ opacity: reveal ? 1 : 0 }}
                      transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : 0.15 }}
                    >
                      {i === 0 ? "a" : "b"}={formatCompact(v, 2)}
                    </motion.text>
                  </g>
                ))}

                {/* Smooth shaded region (when no rectangles). */}
                {smooth && (
                  <g clipPath={`url(#${gid}-clip)`}>
                    <g clipPath={`url(#${gid}-sweep)`}>
                      <path d={regionPath} fill={`url(#${gid}-fade)`} />
                    </g>
                  </g>
                )}

                {/* Riemann-sum rectangles. */}
                {!smooth && (
                  <g clipPath={`url(#${gid}-clip)`}>
                    {riemann.bars.map((bar, i) => {
                      const bx = x(bar.x0);
                      const bw = Math.max(0, x(bar.x1) - x(bar.x0));
                      const top = y(bar.h);
                      const ry = Math.min(zeroPx, top);
                      const rh = Math.abs(top - zeroPx);
                      const negative = bar.h < 0;
                      return (
                        <motion.rect
                          key={`${gid}-r${i}-${token}`}
                          x={bx}
                          width={bw}
                          y={ry}
                          height={rh}
                          fill={withAlpha(fill, negative ? 0.14 : 0.24)}
                          stroke={withAlpha(fill, 0.9)}
                          strokeWidth={bw > 4 ? 1 : 0.5}
                          initial={{ scaleY: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
                          animate={{ scaleY: reveal ? 1 : 0, opacity: reveal ? 1 : 0 }}
                          transition={{
                            duration: reduced ? 0 : 0.4,
                            delay: reduced ? 0 : i * perRect,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          style={{ transformBox: "fill-box", transformOrigin: negative ? "top" : "bottom" }}
                        />
                      );
                    })}
                  </g>
                )}

                {/* Origin axes. */}
                {yHasZero && (
                  <line
                    x1={0}
                    x2={inner.width}
                    y1={originY}
                    y2={originY}
                    stroke={p.borderStrong}
                    strokeWidth={1.25}
                    shapeRendering="crispEdges"
                  />
                )}
                {xHasZero && (
                  <line
                    x1={originX}
                    x2={originX}
                    y1={0}
                    y2={inner.height}
                    stroke={p.borderStrong}
                    strokeWidth={1.25}
                    shapeRendering="crispEdges"
                  />
                )}

                {/* Axis tick labels. */}
                <g aria-hidden>
                  {xTicks.map((t, i) =>
                    t === 0 && yHasZero ? null : (
                      <text
                        key={`xt-${i}`}
                        x={x(t)}
                        y={(yHasZero ? originY : inner.height) + 15}
                        textAnchor="middle"
                        fill={p.inkFaint}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em" }}
                      >
                        {formatCompact(t)}
                      </text>
                    ),
                  )}
                  {yTicks.map((t, i) =>
                    t === 0 ? null : (
                      <text
                        key={`yt-${i}`}
                        x={(xHasZero ? originX : 0) - 8}
                        y={y(t)}
                        dy="0.32em"
                        textAnchor="end"
                        fill={p.inkFaint}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em" }}
                      >
                        {formatCompact(t)}
                      </text>
                    ),
                  )}
                </g>

                {/* The function curve (drawn left-to-right). */}
                <g clipPath={`url(#${gid}-clip)`}>
                  <motion.path
                    key={`${gid}-curve-${token}`}
                    d={curvePath}
                    fill="none"
                    stroke={fill}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
                    animate={{ pathLength: reveal, opacity: reveal ? 1 : 0 }}
                    transition={{
                      pathLength: { duration: reduced ? 0 : drawDur * 1.1, ease: [0.4, 0, 0.2, 1] },
                      opacity: { duration: reduced ? 0 : 0.2 },
                    }}
                  />
                </g>

                {/* Hover crosshair + readout dot. */}
                <AnimatePresence>
                  {hoverX != null && (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      clipPath={`url(#${gid}-clip)`}
                      pointerEvents="none"
                    >
                      <line
                        x1={x(hoverX)}
                        x2={x(hoverX)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.borderStrong}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        shapeRendering="crispEdges"
                      />
                      {(() => {
                        const v = evalFn(fn, hoverX, amp, freq);
                        if (!Number.isFinite(v)) return null;
                        const cy = y(v);
                        if (cy < 0 || cy > inner.height) return null;
                        return (
                          <>
                            <circle cx={x(hoverX)} cy={cy} r={6} fill={withAlpha(fill, inRange ? 0.22 : 0.12)} />
                            <circle
                              cx={x(hoverX)}
                              cy={cy}
                              r={3.5}
                              fill={fill}
                              stroke={p.surface}
                              strokeWidth={1.5}
                            />
                          </>
                        );
                      })()}
                    </motion.g>
                  )}
                </AnimatePresence>

                {/* Axis labels. */}
                {xLabel && (
                  <text
                    x={inner.width}
                    y={(yHasZero ? originY : inner.height) - 7}
                    textAnchor="end"
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
                {yLabel && (
                  <text
                    transform={`translate(${-38}, ${inner.height / 2}) rotate(-90)`}
                    textAnchor="middle"
                    fill={p.inkMuted}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    {yLabel}
                  </text>
                )}

                {/* Pointer capture overlay. */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                    const r = svg.getBoundingClientRect();
                    const px = clamp(e.clientX - r.left - margin.left, 0, inner.width);
                    setHover({ px, x: clamp(x.invert(px), xMin, xMax) });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={(hover?.px ?? 0) + (yLabel ? 50 : 38)} y={26} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                x = {formatCompact(hover.x, 3)}
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                  <span
                    className="inline-block h-[2px] w-3 rounded-full align-middle"
                    style={{ background: fill }}
                  />
                  {fnText}
                </span>
                <span className="font-medium tabular-nums">
                  {(() => {
                    const v = evalFn(fn, hover.x, amp, freq);
                    return Number.isFinite(v) ? formatCompact(v, 3) : "—";
                  })()}
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide opacity-50">
                {hover.x >= lo && hover.x <= hi ? "inside [a, b]" : "outside [a, b]"}
              </div>
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
  id: "integral-area",
  name: "Integral Area",
  category: "math",
  description:
    "Area-under-the-curve visualization: a function with the region between a and b shaded, optional left/right/midpoint Riemann-sum rectangles that animate in, and a live definite-integral readout.",
  tags: ["integral", "area", "riemann", "calculus", "definite", "math"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "IntegralArea",
  sourcePath: "math/IntegralArea",
  aspect: 16 / 10,
  controls: [
    {
      key: "fn",
      label: "Function",
      type: "select",
      group: "Data",
      options: [
        { label: "Gaussian", value: "gaussian" },
        { label: "Square (x²)", value: "square" },
        { label: "Sine", value: "sin" },
        { label: "Cosine", value: "cos" },
        { label: "Tanh", value: "tanh" },
        { label: "ReLU", value: "relu" },
        { label: "Sigmoid", value: "sigmoid" },
        { label: "Log", value: "log" },
        { label: "Exp", value: "exp" },
      ],
      default: "gaussian",
    },
    { key: "amp", label: "Amplitude (a)", type: "number", group: "Data", default: 1, min: -5, max: 5, step: 0.1 },
    { key: "freq", label: "Frequency (b)", type: "number", group: "Data", default: 1, min: -5, max: 5, step: 0.1 },
    { key: "a", label: "Lower bound a", type: "number", group: "Data", default: -1.2, min: -10, max: 10, step: 0.1 },
    { key: "b", label: "Upper bound b", type: "number", group: "Data", default: 1.2, min: -10, max: 10, step: 0.1 },
    {
      key: "domain",
      label: "Plot domain [min, max]",
      type: "json",
      group: "Data",
      default: DEFAULT_DOMAIN,
    },
    {
      key: "rects",
      label: "Riemann rectangles",
      type: "number",
      group: "Layout",
      help: "Number of rectangles. 0 = smooth shaded fill.",
      default: 0,
      min: 0,
      max: 200,
      step: 1,
    },
    {
      key: "method",
      label: "Sampling method",
      type: "select",
      group: "Layout",
      options: [
        { label: "Left endpoint", value: "left" },
        { label: "Right endpoint", value: "right" },
        { label: "Midpoint", value: "mid" },
      ],
      default: "mid",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Area under a Gaussian" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "x" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "f(x)" },
    { key: "color", label: "Color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1200, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "gaussian-area",
      name: "Area under a Gaussian",
      props: {
        title: "Area under a Gaussian",
        caption: "The shaded region is the definite integral of a unit Gaussian over [a, b].",
        fn: "gaussian",
        amp: 1,
        freq: 1,
        a: -1.2,
        b: 1.2,
        domain: [-4, 4],
        rects: 0,
        method: "mid",
        yLabel: "f(x)",
      },
    },
    {
      id: "riemann-square",
      name: "Riemann sum of x²",
      props: {
        title: "Riemann sum of x²",
        caption: "Twelve midpoint rectangles approximating ∫₀² x² dx ≈ 2.667.",
        fn: "square",
        amp: 1,
        freq: 1,
        a: 0,
        b: 2,
        domain: [-0.5, 2.5],
        rects: 12,
        method: "mid",
        yLabel: "x²",
      },
    },
    {
      id: "left-vs-area",
      name: "Coarse left sum",
      props: {
        title: "Left Riemann sum overshoots a falling curve",
        caption: "Six left-endpoint rectangles on a decaying exponential.",
        fn: "exp",
        amp: 1,
        freq: -1,
        a: 0,
        b: 3,
        domain: [-0.4, 3.4],
        rects: 6,
        method: "left",
        yLabel: "e⁻ˣ",
      },
    },
  ],
};
