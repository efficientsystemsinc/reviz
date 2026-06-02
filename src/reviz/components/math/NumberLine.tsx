"use client";

import { scaleLinear } from "d3-scale";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
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
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface PointSpec {
  x: number;
  label?: string;
  /** Closed (filled) dot if true, open (hollow) if false. Default true. */
  closed?: boolean;
}

interface IntervalSpec {
  from: number;
  to: number;
  /** Left endpoint inclusive (closed bracket). Default true. */
  closedLeft?: boolean;
  /** Right endpoint inclusive (closed bracket). Default true. */
  closedRight?: boolean;
  color?: string;
  label?: string;
}

const DEFAULT_POINTS: PointSpec[] = [
  { x: -1, closed: true },
  { x: 3, closed: false },
];

const DEFAULT_INTERVALS: IntervalSpec[] = [
  { from: -1, to: 3, closedLeft: true, closedRight: false, label: "[−1, 3)" },
];

export interface NumberLineProps {
  min?: number;
  max?: number;
  step?: number;
  points?: PointSpec[];
  intervals?: IntervalSpec[];
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function NumberLine({
  min = -5,
  max = 5,
  step = 1,
  points = DEFAULT_POINTS,
  intervals = DEFAULT_INTERVALS,
  title = "Solution set  x ∈ [−1, 3)",
  caption = "",
  source = "",
  color = "",
  duration = 1100,
}: NumberLineProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ px: number; value: number } | null>(null);
  const gid = useMemo(() => uid("numline"), []);

  const accent = color || p.accent;

  // Sanitize the domain (monotone increasing).
  const [lo, hi] = useMemo(() => {
    const a = Number.isFinite(min) ? min : -5;
    const b = Number.isFinite(max) ? max : 5;
    return a < b ? [a, b] : [b - 1, b + 1];
  }, [min, max]);

  // Tick marks across [lo, hi] at the chosen step (capped to a sane count).
  const ticks = useMemo(() => {
    const s = step > 0 ? step : 1;
    const span = hi - lo;
    // Avoid runaway tick counts for huge ranges + tiny steps.
    const effStep = span / s > 40 ? span / 20 : s;
    const out: number[] = [];
    // Start from the first multiple of effStep ≥ lo for clean alignment.
    const start = Math.ceil(lo / effStep) * effStep;
    for (let t = start; t <= hi + 1e-9; t += effStep) {
      out.push(Math.abs(t) < 1e-9 ? 0 : t);
    }
    if (out[0] !== lo) out.unshift(lo);
    if (out[out.length - 1] !== hi) out.push(hi);
    return out;
  }, [lo, hi, step]);

  const intervalColor = (iv: IntervalSpec, i: number) =>
    iv.color || (i === 0 ? accent : p.series[i % p.series.length]);

  const draw = reduced ? 1 : inView ? 1 : 0;
  const drawDur = (duration / 1000) * 0.7;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 5} minHeight={150} margin={{ top: 54, right: 30, bottom: 40, left: 30 }}>
          {({ inner, margin }) => {
            const x = scaleLinear().domain([lo, hi]).range([0, inner.width]);
            const axisY = inner.height * 0.58;
            const clampX = (v: number) => clamp(x(v), 0, inner.width);

            // Stagger schedule: axis → ticks → intervals → points.
            const tStart = 0.18;
            const lineLen = drawDur * 0.42;

            const hoverV = hover?.value ?? null;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {intervals.map((iv, i) => {
                    const c = intervalColor(iv, i);
                    return (
                      <linearGradient key={`${gid}-g-${i}`} id={`${gid}-g-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.26} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.08} />
                      </linearGradient>
                    );
                  })}
                </defs>

                {/* Shaded interval bands (drawn behind the axis). */}
                {intervals.map((iv, i) => {
                  const a = clampX(Math.min(iv.from, iv.to));
                  const b = clampX(Math.max(iv.from, iv.to));
                  const w = Math.max(b - a, 0);
                  const bandH = 30;
                  const c = intervalColor(iv, i);
                  const delay = reduced ? 0 : tStart + 0.28 + i * 0.1;
                  return (
                    <g key={`${gid}-iv-${i}-${token}`}>
                      <motion.rect
                        x={a}
                        y={axisY - bandH}
                        width={w}
                        height={bandH}
                        rx={3}
                        fill={`url(#${gid}-g-${i})`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? 1 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.4, delay }}
                      />
                      {/* Thick solution segment laid on the axis, draws L→R. */}
                      <motion.line
                        x1={a}
                        x2={b}
                        y1={axisY}
                        y2={axisY}
                        stroke={c}
                        strokeWidth={4}
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: draw, opacity: draw ? 1 : 0 }}
                        transition={{
                          pathLength: { duration: reduced ? 0 : drawDur * 0.5, delay, ease: [0.4, 0, 0.2, 1] },
                          opacity: { duration: reduced ? 0 : 0.2, delay },
                        }}
                      />
                      {/* Endpoint brackets (closed = ▮ bracket, open = ◁ chevron-style). */}
                      <Endpoint
                        cx={a}
                        cy={axisY}
                        color={c}
                        surface={p.surface}
                        closed={iv.closedLeft ?? true}
                        side="left"
                        draw={draw}
                        reduced={reduced}
                        delay={delay + 0.18}
                      />
                      <Endpoint
                        cx={b}
                        cy={axisY}
                        color={c}
                        surface={p.surface}
                        closed={iv.closedRight ?? true}
                        side="right"
                        draw={draw}
                        reduced={reduced}
                        delay={delay + 0.18}
                      />
                      {/* Interval label above the band. */}
                      {iv.label && (
                        <motion.text
                          x={(a + b) / 2}
                          y={axisY - bandH - 12}
                          textAnchor="middle"
                          fill={c}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            letterSpacing: "0.06em",
                            fontWeight: 600,
                          }}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: draw ? 1 : 0, y: draw ? 0 : 6 }}
                          transition={{ duration: reduced ? 0 : 0.34, delay: delay + 0.1 }}
                        >
                          {iv.label}
                        </motion.text>
                      )}
                    </g>
                  );
                })}

                {/* The base axis line, draws left → right. */}
                <motion.line
                  x1={0}
                  x2={inner.width}
                  y1={axisY}
                  y2={axisY}
                  stroke={p.borderStrong}
                  strokeWidth={1.5}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: draw }}
                  transition={{ duration: reduced ? 0 : lineLen, delay: reduced ? 0 : tStart, ease: [0.4, 0, 0.2, 1] }}
                />

                {/* Arrowheads at both ends (the ℝ continues). */}
                {[0, inner.width].map((ex, i) => {
                  const dir = i === 0 ? -1 : 1;
                  return (
                    <motion.path
                      key={`${gid}-arrow-${i}`}
                      d={`M ${ex} ${axisY} l ${-dir * 8} ${-4.5} M ${ex} ${axisY} l ${-dir * 8} ${4.5}`}
                      stroke={p.borderStrong}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      fill="none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: draw ? 1 : 0 }}
                      transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : tStart + lineLen }}
                    />
                  );
                })}

                {/* Ticks + numeric labels. */}
                <g aria-hidden>
                  {ticks.map((t, i) => {
                    const tx = x(t);
                    const isZero = Math.abs(t) < 1e-9;
                    const tickH = isZero ? 9 : 6;
                    const delay = reduced ? 0 : tStart + 0.12 + (i / Math.max(ticks.length - 1, 1)) * (lineLen * 0.8);
                    return (
                      <g key={`${gid}-tick-${i}`}>
                        <motion.line
                          x1={tx}
                          x2={tx}
                          y1={axisY - tickH}
                          y2={axisY + tickH}
                          stroke={isZero ? p.inkMuted : p.border}
                          strokeWidth={isZero ? 1.5 : 1}
                          shapeRendering="crispEdges"
                          initial={{ opacity: 0, scaleY: 0.4 }}
                          animate={{ opacity: draw ? 1 : 0, scaleY: draw ? 1 : 0.4 }}
                          transition={{ duration: reduced ? 0 : 0.26, delay }}
                          style={{ transformOrigin: `${tx}px ${axisY}px` }}
                        />
                        <motion.text
                          x={tx}
                          y={axisY + tickH + 16}
                          textAnchor="middle"
                          fill={isZero ? p.inkMuted : p.inkFaint}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10.5,
                            letterSpacing: "0.04em",
                            fontWeight: isZero ? 600 : 400,
                          }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: draw ? 1 : 0 }}
                          transition={{ duration: reduced ? 0 : 0.26, delay: delay + 0.04 }}
                        >
                          {formatCompact(t)}
                        </motion.text>
                      </g>
                    );
                  })}
                </g>

                {/* Annotated points (open / closed) — pop in last. */}
                {points.map((pt, i) => {
                  const cx = clampX(pt.x);
                  const closed = pt.closed ?? true;
                  const delay = reduced ? 0 : tStart + 0.5 + i * 0.12;
                  return (
                    <g key={`${gid}-pt-${i}-${token}`}>
                      {/* Stem connecting the dot to its label. */}
                      <motion.line
                        x1={cx}
                        x2={cx}
                        y1={axisY}
                        y2={axisY + 24}
                        stroke={p.border}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? 1 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.24, delay: delay + 0.08 }}
                      />
                      <motion.circle
                        cx={cx}
                        cy={axisY}
                        r={6}
                        fill={closed ? accent : p.surface}
                        stroke={accent}
                        strokeWidth={2}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: draw ? 1 : 0, opacity: draw ? 1 : 0 }}
                        transition={
                          reduced
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 420, damping: 18, delay }
                        }
                        style={{ transformOrigin: `${cx}px ${axisY}px` }}
                      />
                      {pt.label && (
                        <motion.text
                          x={cx}
                          y={axisY + 38}
                          textAnchor="middle"
                          fill={p.ink}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            letterSpacing: "0.05em",
                            fontWeight: 600,
                          }}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: draw ? 1 : 0, y: 0 }}
                          transition={{ duration: reduced ? 0 : 0.3, delay: delay + 0.1 }}
                        >
                          {pt.label}
                        </motion.text>
                      )}
                    </g>
                  );
                })}

                {/* Hover crosshair + readout. */}
                <AnimatePresence>
                  {hoverV != null && (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <line
                        x1={clampX(hoverV)}
                        x2={clampX(hoverV)}
                        y1={axisY - 42}
                        y2={axisY + 10}
                        stroke={accent}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        shapeRendering="crispEdges"
                      />
                      <circle cx={clampX(hoverV)} cy={axisY} r={4} fill={withAlpha(accent, 0.9)} />
                    </motion.g>
                  )}
                </AnimatePresence>

                {/* Transparent capture overlay. */}
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
                    setHover({ px, value: x.invert(px) });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={(hover?.px ?? 0) + 30} y={30} visible={hover != null}>
          {hover != null && (
            <div className="font-mono text-[11px] uppercase tracking-wide">
              <span className="opacity-70">x ≈ </span>
              <span className="font-medium tabular-nums">{formatCompact(hover.value, 3)}</span>
            </div>
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

/* ------------------------------------------------------------------ */
/* Endpoint marker: closed = filled dot, open = hollow dot.            */
/* ------------------------------------------------------------------ */

function Endpoint({
  cx,
  cy,
  color,
  surface,
  closed,
  side,
  draw,
  reduced,
  delay,
}: {
  cx: number;
  cy: number;
  color: string;
  surface: string;
  closed: boolean;
  side: "left" | "right";
  draw: number;
  reduced: boolean;
  delay: number;
}) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={6}
      fill={closed ? color : surface}
      stroke={color}
      strokeWidth={2.25}
      data-side={side}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: draw ? 1 : 0, opacity: draw ? 1 : 0 }}
      transition={
        reduced ? { duration: 0 } : { type: "spring", stiffness: 440, damping: 17, delay }
      }
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "number-line",
  name: "Number Line",
  category: "math",
  description:
    "An annotated number line over a range: ticked axis, open/closed points, shaded intervals with inclusive/exclusive endpoints, and labels that draw in left-to-right.",
  tags: ["number line", "interval", "set", "inequality", "endpoint", "math"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "NumberLine",
  sourcePath: "math/NumberLine",
  aspect: 16 / 5,
  controls: [
    { key: "min", label: "Min", type: "number", group: "Data", default: -5, min: -100, max: 0, step: 1 },
    { key: "max", label: "Max", type: "number", group: "Data", default: 5, min: 0, max: 100, step: 1 },
    { key: "step", label: "Tick step", type: "number", group: "Data", default: 1, min: 0.25, max: 10, step: 0.25 },
    {
      key: "points",
      label: "Points",
      type: "json",
      group: "Data",
      help: "Array of { x, label?, closed? }. closed=true → filled dot, false → hollow dot.",
      default: DEFAULT_POINTS,
    },
    {
      key: "intervals",
      label: "Intervals",
      type: "json",
      group: "Data",
      help: "Array of { from, to, closedLeft?, closedRight?, color?, label? }. Inclusive endpoints are filled.",
      default: DEFAULT_INTERVALS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Solution set  x ∈ [−1, 3)" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "solution-set",
      name: "Solution set",
      props: {
        title: "Solution set  x ∈ [−1, 3)",
        min: -5,
        max: 5,
        step: 1,
        points: [
          { x: -1, closed: true },
          { x: 3, closed: false },
        ],
        intervals: [{ from: -1, to: 3, closedLeft: true, closedRight: false, label: "[−1, 3)" }],
        caption: "Closed at −1, open at 3 — the half-open interval [−1, 3).",
      },
    },
    {
      id: "confidence",
      name: "95% interval",
      props: {
        title: "95% confidence interval",
        min: 0,
        max: 1,
        step: 0.1,
        points: [{ x: 0.62, label: "θ̂ = 0.62", closed: true }],
        intervals: [{ from: 0.48, to: 0.76, closedLeft: true, closedRight: true, label: "[0.48, 0.76]" }],
        caption: "Point estimate with a two-sided 95% confidence interval.",
      },
    },
    {
      id: "domains",
      name: "Disjoint domains",
      props: {
        title: "Domain  (−∞, −2] ∪ (1, 4)",
        min: -6,
        max: 6,
        step: 1,
        points: [
          { x: -2, label: "−2", closed: true },
          { x: 1, label: "1", closed: false },
          { x: 4, label: "4", closed: false },
        ],
        intervals: [
          { from: -6, to: -2, closedLeft: false, closedRight: true, label: "(−∞, −2]" },
          { from: 1, to: 4, closedLeft: false, closedRight: false, label: "(1, 4)" },
        ],
      },
    },
  ],
};
