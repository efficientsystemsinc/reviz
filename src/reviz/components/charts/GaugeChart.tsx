"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ResponsiveSvg,
  SoftShadow,
  Glow,
  clamp,
  mapRange,
  mix,
  round,
  uid,
  withAlpha,
  useAnimatedNumber,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  ReplayButton,
  type RevizMeta,
} from "@/reviz";

interface Zone {
  /** Upper bound of this zone, in value units. */
  to: number;
  /** Optional explicit color; otherwise derived from the bad→warn→ok ramp. */
  color?: string;
}

export interface GaugeChartProps {
  value?: number;
  min?: number;
  max?: number;
  zones?: Zone[];
  label?: string;
  unit?: string;
  color?: string;
  duration?: number;
  title?: string;
  caption?: string;
  source?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// The gauge spans a 240° arc, opening downward — wider than a flat semicircle so
// the value reads naturally left-to-right while leaving room for the readout.
const START_DEG = -120; // left end
const END_DEG = 120; // right end
const SWEEP = END_DEG - START_DEG; // 240°

const DEFAULT_ZONES: Zone[] = [
  { to: 50 },
  { to: 80 },
  { to: 100 },
];

/** Point on the arc, with 0° pointing straight up and angles increasing clockwise. */
function pointOnArc(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG arc path between two angles at a fixed radius (stroked, not filled). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const start = pointOnArc(cx, cy, r, a0);
  const end = pointOnArc(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${end.x} ${end.y}`;
}

export default function GaugeChart({
  value = 86,
  min = 0,
  max = 100,
  zones = DEFAULT_ZONES,
  label = "Eval score",
  unit = "",
  color = "",
  duration = 1300,
  title = "",
  caption = "",
  source = "",
}: GaugeChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [hostRef, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const accent = color || p.accent;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo || 1;

  const trackId = useMemo(() => uid("gauge-track"), []);
  const shadowId = useMemo(() => uid("gauge-shadow"), []);
  const glowId = useMemo(() => uid("gauge-glow"), []);

  // Resolve zones into ordered [from,to] bands with concrete colors along the
  // bad → warn → ok ramp (override per-zone via `color`).
  const bands = useMemo(() => {
    const ramp = [p.bad, p.warn, p.ok];
    const sorted = (zones && zones.length > 0 ? zones : DEFAULT_ZONES)
      .map((z) => ({ to: clamp(z.to, lo, hi), color: z.color }))
      .sort((a, b) => a.to - b.to);
    let prev = lo;
    const n = sorted.length;
    return sorted.map((z, i) => {
      const from = prev;
      prev = z.to;
      const fallback =
        n === 1 ? accent : ramp[Math.round(mapRange(i, 0, Math.max(1, n - 1), 0, 2))];
      return { from, to: z.to, color: z.color || fallback };
    });
  }, [zones, lo, hi, p.bad, p.warn, p.ok, accent]);

  const clampedValue = clamp(value, lo, hi);

  // Which zone the value sits in — drives the center accent + active band glow.
  const activeBand = useMemo(() => {
    const idx = bands.findIndex((b) => clampedValue <= b.to + 1e-9);
    return idx === -1 ? bands.length - 1 : idx;
  }, [bands, clampedValue]);
  const valueColor = bands[activeBand]?.color || accent;

  const valueToDeg = (v: number) =>
    START_DEG + (clamp(v, lo, hi) - lo) / span * SWEEP;

  const animated = useAnimatedNumber(clampedValue, {
    duration,
    easing: "easeOut",
    enabled: inView,
    trigger: token,
    delay: 120,
  });

  // Decimals for the readout: integers stay clean, fractional values show one place.
  const decimals = clampedValue % 1 === 0 && lo % 1 === 0 && hi % 1 === 0 ? 0 : 1;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={hostRef} className="group/figure relative w-full">
        <ResponsiveSvg aspect={16 / 11} margin={{ top: 18, right: 26, bottom: 22, left: 26 }}>
          {({ inner, margin }) => {
            const cx = inner.width / 2;
            // Radius sized to fit both the available width (arc half-width = r·sin120°)
            // and the height (the arc's bounding box is ~1.5r tall, plus tick labels).
            const maxByW = inner.width / 2 / Math.sin((SWEEP / 2) * (Math.PI / 180));
            const maxByH = (inner.height - 18) / 1.5;
            const r = Math.max(40, Math.min(maxByW, maxByH));
            const thickness = clamp(r * 0.18, 14, 40);
            // Vertically center the arc's bounding box. The 240° arc spans from its
            // top (cy − r) down to its open ends (cy + r·sin30° = cy + 0.5r), so the
            // box is 1.5r tall and its midpoint sits 0.25r below cy.
            const half = SWEEP / 2; // 120°
            const bottomRel = r * Math.sin((half - 90) * (Math.PI / 180)); // +0.5r
            const boxTop = -r;
            const boxHeight = bottomRel - boxTop; // 1.5r
            const cy = (inner.height - boxHeight) / 2 - boxTop;

            const valueDeg = valueToDeg(clampedValue);
            const targetFrac = (clampedValue - lo) / span;

            // Tick marks at each zone boundary + the two ends.
            const ticks = [
              { v: lo, major: true },
              ...bands.map((b) => ({ v: b.to, major: false })),
            ];

            const numSize = clamp(r * 0.34, 26, 64);

            return (
              <g transform={`translate(${margin.left},${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={3} blur={7} opacity={0.16} />
                  <Glow id={glowId} blur={5} />
                  <linearGradient id={trackId} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={valueColor} />
                    <stop offset="100%" stopColor={mix(valueColor, accent, 0.4)} />
                  </linearGradient>
                </defs>

                {/* Base track */}
                <path
                  d={arcPath(cx, cy, r, START_DEG, END_DEG)}
                  fill="none"
                  stroke={p.surfaceAlt}
                  strokeWidth={thickness}
                  strokeLinecap="round"
                />

                {/* Colored threshold zones */}
                {bands.map((b, i) => {
                  const a0 = valueToDeg(b.from);
                  const a1 = valueToDeg(b.to);
                  const isActive = i === activeBand;
                  return (
                    <path
                      key={`zone-${i}`}
                      d={arcPath(cx, cy, r, a0, a1)}
                      fill="none"
                      stroke={withAlpha(b.color, isActive ? 0.32 : 0.2)}
                      strokeWidth={thickness}
                      strokeLinecap="butt"
                    />
                  );
                })}

                {/* Animated value arc — sweeps from the left end to the value */}
                <motion.path
                  d={arcPath(cx, cy, r, START_DEG, END_DEG)}
                  fill="none"
                  stroke={`url(#${trackId})`}
                  strokeWidth={thickness}
                  strokeLinecap="round"
                  pathLength={1}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: inView || reduced ? targetFrac : 0 }}
                  transition={{
                    duration: reduced ? 0 : duration / 1000,
                    ease: EASE,
                    delay: reduced ? 0 : 0.12,
                  }}
                  style={{ filter: `url(#${glowId})` }}
                />

                {/* Tick marks across the track */}
                {ticks.map((t, i) => {
                  const deg = valueToDeg(t.v);
                  const inP = pointOnArc(cx, cy, r - thickness / 2 - 3, deg);
                  const outP = pointOnArc(cx, cy, r + thickness / 2 + 3, deg);
                  const labP = pointOnArc(cx, cy, r + thickness / 2 + 16, deg);
                  return (
                    <g key={`tick-${i}`}>
                      <line
                        x1={inP.x}
                        y1={inP.y}
                        x2={outP.x}
                        y2={outP.y}
                        stroke={withAlpha(p.ink, 0.45)}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                      />
                      <text
                        x={labP.x}
                        y={labP.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="font-mono tabular-nums"
                        style={{ fontSize: clamp(r * 0.085, 9, 12), fill: p.inkFaint }}
                      >
                        {round(t.v, t.v % 1 === 0 ? 0 : 1)}
                      </text>
                    </g>
                  );
                })}

                {/* Needle + hub */}
                <Needle
                  cx={cx}
                  cy={cy}
                  r={r}
                  thickness={thickness}
                  fromDeg={START_DEG}
                  toDeg={valueDeg}
                  color={p.ink}
                  hubFill={p.surface}
                  hubStroke={valueColor}
                  shadowId={shadowId}
                  inView={inView}
                  reduced={reduced}
                  duration={duration}
                  token={token}
                />

                {/* Center readout */}
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: inView || reduced ? 1 : 0 }}
                  transition={{ duration: reduced ? 0 : 0.5, ease: EASE, delay: reduced ? 0 : 0.25 }}
                >
                  <text
                    x={cx}
                    y={cy - r * 0.06}
                    textAnchor="middle"
                    dominantBaseline="alphabetic"
                    className="font-sans tabular-nums"
                    style={{ fontSize: numSize, fontWeight: 600, fill: p.ink }}
                  >
                    {round(animated, decimals).toFixed(decimals)}
                    {unit && (
                      <tspan
                        dx={3}
                        style={{ fontSize: numSize * 0.42, fill: p.inkMuted, fontWeight: 500 }}
                      >
                        {unit}
                      </tspan>
                    )}
                  </text>
                  {label && (
                    <text
                      x={cx}
                      y={cy + r * 0.18}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="font-mono uppercase tracking-label"
                      style={{ fontSize: clamp(r * 0.1, 9, 13), fill: p.inkFaint }}
                    >
                      {label}
                    </text>
                  )}
                </motion.g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
    </Figure>
  );
}

/** Animated needle pivoting from the gauge hub to the value angle. */
function Needle({
  cx,
  cy,
  r,
  thickness,
  fromDeg,
  toDeg,
  color,
  hubFill,
  hubStroke,
  shadowId,
  inView,
  reduced,
  duration,
  token,
}: {
  cx: number;
  cy: number;
  r: number;
  thickness: number;
  fromDeg: number;
  toDeg: number;
  color: string;
  hubFill: string;
  hubStroke: string;
  shadowId: string;
  inView: boolean;
  reduced: boolean;
  duration: number;
  token: number;
}) {
  const len = r - thickness / 2 - 2;
  const hubR = clamp(r * 0.12, 8, 18);
  const target = inView || reduced ? toDeg : fromDeg;

  return (
    <g>
      {/* Translate to the hub so rotation pivots about (cx, cy): the CSS
          transform-origin on an SVG <g> resolves against the needle's own
          bounding box, not the gauge center, which would aim it wrongly.
          The outer static group sets the pivot; the inner motion.g only
          rotates, about its now-correct origin (0,0). */}
      <g transform={`translate(${cx},${cy})`}>
        <motion.g
          style={{ transformOrigin: "0px 0px" }}
          initial={{ rotate: fromDeg }}
          animate={{ rotate: target }}
          transition={{
            duration: reduced ? 0 : duration / 1000,
            ease: EASE,
            delay: reduced ? 0 : 0.12,
          }}
          key={token}
        >
          {/* Needle points straight up at rotate=0; rotation maps to the value angle. */}
          <path
            d={`M 0 ${-len} L ${-hubR * 0.5} 0 L ${hubR * 0.5} 0 Z`}
            fill={color}
            filter={`url(#${shadowId})`}
          />
        </motion.g>
      </g>
      <circle cx={cx} cy={cy} r={hubR} fill={hubFill} stroke={hubStroke} strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={hubR * 0.4} fill={color} />
    </g>
  );
}

export const meta: RevizMeta = {
  id: "gauge-chart",
  name: "Gauge Chart",
  category: "charts",
  description:
    "A semicircular arc gauge for a single metric, with colored bad/warn/ok threshold zones, an animated sweeping arc and needle, and a big counting-up center readout.",
  tags: ["gauge", "kpi", "dial", "speedometer", "threshold", "single-value"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "GaugeChart",
  sourcePath: "charts/GaugeChart",
  aspect: 16 / 11,
  controls: [
    {
      key: "value",
      label: "Value",
      type: "number",
      group: "Data",
      default: 86,
      min: 0,
      max: 100,
      step: 0.5,
    },
    {
      key: "min",
      label: "Min",
      type: "number",
      group: "Data",
      default: 0,
      min: -100,
      max: 100,
      step: 1,
    },
    {
      key: "max",
      label: "Max",
      type: "number",
      group: "Data",
      default: 100,
      min: 1,
      max: 1000,
      step: 1,
    },
    {
      key: "zones",
      label: "Threshold zones",
      type: "json",
      group: "Data",
      default: [{ to: 50 }, { to: 80 }, { to: 100 }],
    },
    { key: "label", label: "Center label", type: "text", group: "Labels", default: "Eval score" },
    { key: "unit", label: "Unit", type: "text", group: "Labels", default: "" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Arc color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1300,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "score",
      name: "Eval score 0–100",
      props: {
        value: 86,
        min: 0,
        max: 100,
        label: "Eval score",
        unit: "",
        zones: [{ to: 50 }, { to: 80 }, { to: 100 }],
        title: "Agent benchmark",
        caption: "Aggregate pass rate across 1,240 held-out tasks.",
      },
    },
    {
      id: "latency",
      name: "Latency budget",
      props: {
        value: 142,
        min: 0,
        max: 300,
        label: "p95 latency",
        unit: "ms",
        zones: [{ to: 120 }, { to: 200 }, { to: 300 }],
        title: "Inference latency",
      },
    },
    {
      id: "utilization",
      name: "GPU utilization",
      props: {
        value: 73,
        min: 0,
        max: 100,
        label: "GPU util",
        unit: "%",
        zones: [{ to: 40 }, { to: 75 }, { to: 100 }],
        title: "Cluster utilization",
      },
    },
  ],
};
