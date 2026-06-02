"use client";

import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line as d3line } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  clamp,
  formatCompact,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* The safe, built-in function library (no string eval).               */
/* `a` = amplitude / scale, `b` = frequency / rate. Defaults are 1.     */
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

interface FnSpec {
  type: FnType;
  color?: string;
  /** Amplitude / vertical scale. */
  a?: number;
  /** Frequency / rate. */
  b?: number;
}

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
function evalFn(type: FnType, x: number, a: number, b: number): number {
  switch (type) {
    case "sin":
      return a * Math.sin(b * x);
    case "cos":
      return a * Math.cos(b * x);
    case "tanh":
      return a * Math.tanh(b * x);
    case "relu":
      return a * Math.max(0, b * x);
    case "sigmoid":
      return a / (1 + Math.exp(-b * x));
    case "gaussian":
      return a * Math.exp(-((b * x) ** 2) / 2);
    case "square":
      return a * (b * x) ** 2;
    case "log":
      return b * x > 0 ? a * Math.log(b * x) : NaN;
    case "exp":
      return a * Math.exp(b * x);
    default:
      return NaN;
  }
}

/** A readable label like "1.5·sin(2x)". */
function fnLabel({ type, a = 1, b = 1 }: FnSpec): string {
  const base = FN_LABEL[type];
  const arg = b === 1 ? "x" : `${formatCompact(b)}x`;
  const amp = a === 1 ? "" : `${formatCompact(a)}·`;
  if (type === "square") return a === 1 && b === 1 ? "x²" : `${amp}(${arg})²`;
  return `${amp}${base}(${arg})`;
}

const DEFAULT_FNS: FnSpec[] = [
  { type: "relu" },
  { type: "sigmoid", b: 4 },
  { type: "tanh", b: 2 },
];

const DEFAULT_DOMAIN: [number, number] = [-4, 4];

export interface FunctionPlotProps {
  fns?: FnSpec[];
  domain?: [number, number];
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  color?: string;
  duration?: number;
}

export default function FunctionPlot({
  fns = DEFAULT_FNS,
  domain = DEFAULT_DOMAIN,
  title = "Activation functions",
  caption = "",
  source = "",
  xLabel = "x",
  yLabel = "f(x)",
  color = "",
  duration = 1100,
}: FunctionPlotProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  // Hover stores both data-space x (for f(x) readouts) and the pixel offset
  // inside the plot box (for crosshair + tooltip placement).
  const [hover, setHover] = useState<{ x: number; px: number } | null>(null);
  const gid = useMemo(() => uid("fnplot"), []);

  const colorOf = (i: number) =>
    i === 0 && color ? color : fns[i]?.color || p.series[i % p.series.length];

  // Domain (clamped to a sane, monotone-increasing window).
  const [xMin, xMax] = useMemo(() => {
    const lo = Number.isFinite(domain?.[0]) ? domain[0] : -4;
    const hi = Number.isFinite(domain?.[1]) ? domain[1] : 4;
    return lo < hi ? [lo, hi] : [hi - 1, hi + 1];
  }, [domain]);

  const SAMPLES = 220;

  // Sample every function across the domain once. y can be NaN (undefined region).
  const samples = useMemo(() => {
    return fns.map(({ type, a = 1, b = 1 }) => {
      const pts: { x: number; y: number }[] = [];
      for (let s = 0; s <= SAMPLES; s++) {
        const x = xMin + ((xMax - xMin) * s) / SAMPLES;
        pts.push({ x, y: evalFn(type, x, a, b) });
      }
      return pts;
    });
  }, [fns, xMin, xMax]);

  // Y-domain from finite samples, clamped so a blowing-up exp/log stays framed.
  const [yMin, yMax] = useMemo(() => {
    const all = samples.flat().map((d) => d.y).filter((v) => Number.isFinite(v));
    if (all.length === 0) return [-1, 1] as [number, number];
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    // Cap extreme excursions (exp/x^2) at a robust percentile-ish bound.
    const sorted = [...all].sort((m, n) => m - n);
    const q = (t: number) => sorted[clamp(Math.round(t * (sorted.length - 1)), 0, sorted.length - 1)];
    const robustHi = q(0.98);
    const robustLo = q(0.02);
    if (hi > robustHi * 2 && robustHi > 0) hi = robustHi * 1.15;
    if (lo < robustLo * 2 && robustLo < 0) lo = robustLo * 1.15;
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    // Always keep y=0 visible so the origin axis reads.
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad] as [number, number];
  }, [samples]);

  const legendItems: LegendItem[] = fns.map((f, i) => ({
    label: fnLabel(f),
    color: colorOf(i),
    shape: "line",
  }));

  const draw = reduced ? 1 : inView ? 1 : 0;
  const drawDur = (duration / 1000) * 0.82;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        {fns.length > 0 && <Legend items={legendItems} align="center" className="mb-3" />}

        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 14, right: 18, bottom: 34, left: yLabel ? 50 : 38 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain([xMin, xMax]).range([0, inner.width]);
            const y = scaleLinear().domain([yMin, yMax]).range([inner.height, 0]).nice();

            // Origin pixel positions (clamped to the plot box).
            const originX = clamp(x(0), 0, inner.width);
            const originY = clamp(y(0), 0, inner.height);
            const xHasZero = 0 >= xMin && 0 <= xMax;
            const yHasZero = 0 >= y.domain()[0] && 0 <= y.domain()[1];

            const lineGen = d3line<{ x: number; y: number }>()
              .x((d) => x(d.x))
              .y((d) => y(d.y))
              .defined((d) => Number.isFinite(d.y))
              .curve(curveMonotoneX);

            // Hover x in data space (already clamped on capture).
            const hoverX = hover?.x ?? null;

            const xTicks = x.ticks(7);
            const yTicks = (y as unknown as { ticks: (n: number) => number[] }).ticks(6);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <clipPath id={`${gid}-clip`}>
                    <rect x={0} y={0} width={inner.width} height={inner.height} />
                  </clipPath>
                </defs>

                {/* Gridlines (vertical + horizontal). */}
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

                {/* Axes through the origin. */}
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

                {/* The function curves. Paths are always rendered at their full,
                    final geometry (so the static end-state is guaranteed correct);
                    the left-to-right "draw" is a clip-rect wipe whose width animates
                    from 0 → inner.width. This avoids relying on framer-motion's
                    pathLength measurement, which can fail to reveal long SVG paths. */}
                <defs>
                  <clipPath id={`${gid}-wipe`}>
                    <motion.rect
                      key={`${gid}-wipe-${token}`}
                      x={0}
                      y={0}
                      height={inner.height}
                      initial={{ width: reduced ? inner.width : 0 }}
                      animate={{ width: draw ? inner.width : 0 }}
                      transition={{ duration: reduced ? 0 : drawDur, ease: [0.4, 0, 0.2, 1] }}
                    />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${gid}-clip)`}>
                  <g clipPath={`url(#${gid}-wipe)`}>
                    {samples.map((pts, i) => {
                      const d = lineGen(pts);
                      if (!d) return null;
                      const stroke = colorOf(i);
                      return (
                        <motion.path
                          key={`${gid}-fn-${i}-${token}`}
                          d={d}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={2.25}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: draw ? 1 : 0 }}
                          transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : i * 0.08 }}
                        />
                      );
                    })}
                  </g>
                </g>

                {/* Hover crosshair + per-curve readout dots. */}
                <AnimatePresence>
                  {hoverX != null && (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      clipPath={`url(#${gid}-clip)`}
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
                      {fns.map((f, i) => {
                        const v = evalFn(f.type, hoverX, f.a ?? 1, f.b ?? 1);
                        if (!Number.isFinite(v)) return null;
                        const cy = y(v);
                        if (cy < 0 || cy > inner.height) return null;
                        return (
                          <g key={`${gid}-hov-${i}`}>
                            <circle cx={x(hoverX)} cy={cy} r={6} fill={withAlpha(colorOf(i), 0.18)} />
                            <circle
                              cx={x(hoverX)}
                              cy={cy}
                              r={3.5}
                              fill={colorOf(i)}
                              stroke={p.surface}
                              strokeWidth={1.5}
                            />
                          </g>
                        );
                      })}
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

                {/* Transparent capture overlay for hover tracking. */}
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

        <FloatingTooltip
          x={(hover?.px ?? 0) + (yLabel ? 50 : 38)}
          y={26}
          visible={hover != null}
        >
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                x = {formatCompact(hover.x, 3)}
              </div>
              {fns.map((f, i) => {
                const v = evalFn(f.type, hover.x, f.a ?? 1, f.b ?? 1);
                return (
                  <div key={i} className="flex items-baseline justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                      <span
                        className="inline-block h-[2px] w-3 rounded-full align-middle"
                        style={{ background: colorOf(i) }}
                      />
                      {fnLabel(f)}
                    </span>
                    <span className="font-medium tabular-nums">
                      {Number.isFinite(v) ? formatCompact(v, 3) : "—"}
                    </span>
                  </div>
                );
              })}
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
  id: "function-plot",
  name: "Function Plot",
  category: "math",
  description:
    "Plots one or more named mathematical functions over a domain on a clean Cartesian grid with axes through the origin and an animated left-to-right draw.",
  tags: ["function", "curve", "cartesian", "activation", "calculus", "math"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "FunctionPlot",
  sourcePath: "math/FunctionPlot",
  aspect: 16 / 10,
  controls: [
    {
      key: "fns",
      label: "Functions",
      type: "json",
      group: "Data",
      help: "Each entry: { type, a (amplitude), b (frequency), color? }. type ∈ sin, cos, tanh, relu, sigmoid, gaussian, square, log, exp.",
      default: DEFAULT_FNS,
    },
    {
      key: "domain",
      label: "Domain [min, max]",
      type: "json",
      group: "Data",
      default: DEFAULT_DOMAIN,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Activation functions" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "x" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "f(x)" },
    { key: "color", label: "First curve color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "activations",
      name: "Activations",
      props: {
        title: "Activation functions",
        yLabel: "f(x)",
        domain: [-4, 4],
        fns: [
          { type: "relu" },
          { type: "sigmoid", b: 4 },
          { type: "tanh", b: 2 },
        ],
        caption: "ReLU, sigmoid (β=4), and tanh (β=2) compared on a shared domain.",
      },
    },
    {
      id: "trig",
      name: "Trigonometric",
      props: {
        title: "Sine & cosine",
        yLabel: "amplitude",
        domain: [-6.283, 6.283],
        fns: [
          { type: "sin", b: 1 },
          { type: "cos", b: 1 },
        ],
      },
    },
    {
      id: "growth",
      name: "Growth & decay",
      props: {
        title: "Gaussian, square, and log",
        yLabel: "f(x)",
        domain: [-3, 3],
        fns: [
          { type: "gaussian", a: 4, b: 1 },
          { type: "square", b: 1 },
          { type: "log", a: 2, b: 1 },
        ],
      },
    },
  ],
};
