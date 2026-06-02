"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Figure,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  clamp,
  polarToCartesian,
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
/* Math helpers. Angles are kept in radians internally; the `angle`    */
/* prop and the θ label are in degrees (the natural classroom unit).   */
/* ------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;

/** A small, mono-styled SVG tick / value label. */
const TICK_FONT = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.04em",
} as const;

/** Nice radian labels at the cardinal + quadrant angles for the wave axis. */
const WAVE_TICKS: { t: number; label: string }[] = [
  { t: 0, label: "0" },
  { t: Math.PI / 2, label: "π/2" },
  { t: Math.PI, label: "π" },
  { t: (3 * Math.PI) / 2, label: "3π/2" },
  { t: TAU, label: "2π" },
];

export interface UnitCircleProps {
  /** Current angle θ in degrees. Used directly when `loop` is off. */
  angle?: number;
  /** Continuously rotate θ (a looping sweep) instead of a fixed angle. */
  loop?: boolean;
  /** Trace the synced sine & cosine waves to the right of the circle. */
  showWave?: boolean;
  /** Draw the dashed cos / sin projection legs and right-angle marker. */
  showProjections?: boolean;
  /** Override the accent color for the radius, point, and sine wave. */
  color?: string;
  title?: string;
  caption?: string;
  source?: string;
  /** One full revolution duration when looping, or the entrance tween (ms). */
  duration?: number;
}

export default function UnitCircle({
  angle = 48,
  loop = true,
  showWave = true,
  showProjections = true,
  color = "",
  title = "The unit circle",
  caption = "",
  source = "",
  duration = 6000,
}: UnitCircleProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const gid = useMemo(() => uid("unitcircle"), []);

  const accent = color || p.accent;
  const cosColor = p.series[3] || p.inkMuted; // a stable, distinct hue for cosine
  const sinColor = accent;

  // --- θ driver --------------------------------------------------------
  // When looping (and motion is allowed and in view), θ sweeps 0→2π on a
  // self-paced rAF loop. Otherwise θ is pinned to the `angle` prop.
  const fixedTheta = ((angle % 360) + 360) % 360 / DEG;
  const [theta, setTheta] = useState(fixedTheta);
  const animateLoop = loop && !reduced && inView;
  const rafRef = useRef<number>();
  const startRef = useRef<number>();

  useEffect(() => {
    if (!animateLoop) {
      setTheta(fixedTheta);
      return;
    }
    const period = Math.max(1200, duration);
    startRef.current = undefined;
    const tick = (now: number) => {
      if (startRef.current === undefined) startRef.current = now;
      const elapsed = now - startRef.current;
      setTheta(((elapsed % period) / period) * TAU);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateLoop, duration, fixedTheta, token]);

  const cosV = Math.cos(theta);
  const sinV = Math.sin(theta);
  const degDisplay = ((theta * DEG) % 360 + 360) % 360;

  // Entrance: fade/scale the whole scene in when it scrolls into view.
  const entered = reduced || inView;
  const entranceDur = reduced ? 0 : Math.min(0.9, (duration / 1000) * 0.25 + 0.4);

  const legendItems: LegendItem[] = [
    { label: "sin θ", color: sinColor, shape: "line" },
    { label: "cos θ", color: cosColor, shape: "line" },
  ];

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        {showWave && <Legend items={legendItems} align="center" className="mb-3" />}

        <ResponsiveSvg
          aspect={showWave ? 16 / 7 : 1}
          margin={{ top: 18, right: 18, bottom: 26, left: 18 }}
        >
          {({ inner, margin }) => {
            // Layout: the circle occupies a square box on the left; if the
            // wave is shown, it takes the remaining width to the right.
            const gap = showWave ? 26 : 0;
            const circleBox = showWave
              ? Math.min(inner.height, inner.width * 0.42)
              : Math.min(inner.height, inner.width);
            const R = circleBox / 2 - 14; // radius in px, leaving room for labels
            const cx = circleBox / 2;
            const cy = inner.height / 2;

            // Point on the circle (SVG y grows downward → negate sin).
            const px = cx + cosV * R;
            const py = cy - sinV * R;

            // Wave panel geometry.
            const waveX0 = circleBox + gap;
            const waveW = Math.max(inner.width - waveX0, 0);
            const ampPx = R; // sin/cos amplitude matches the circle radius
            const waveMidY = cy;

            // Map a sweep angle (0..2π) to an x in the wave panel.
            const waveX = (t: number) => waveX0 + (t / TAU) * waveW;

            // Build the traced sine & cosine paths up to the current θ.
            const SAMPLES = 160;
            const upTo = Math.max(1, Math.round((theta / TAU) * SAMPLES));
            const sinPts: string[] = [];
            const cosPts: string[] = [];
            for (let i = 0; i <= upTo; i++) {
              const t = (theta * i) / upTo;
              sinPts.push(`${waveX(t)},${waveMidY - Math.sin(t) * ampPx}`);
              cosPts.push(`${waveX(t)},${waveMidY - Math.cos(t) * ampPx}`);
            }
            const sinPath = "M" + sinPts.join("L");
            const cosPath = "M" + cosPts.join("L");

            // Full-range (0..2π) ghost curves so the plotted area always spans
            // the labeled axis; the bold traced paths above overlay these as θ
            // sweeps, instead of leaving the π..2π region empty.
            const sinFull: string[] = [];
            const cosFull: string[] = [];
            for (let i = 0; i <= SAMPLES; i++) {
              const t = (TAU * i) / SAMPLES;
              sinFull.push(`${waveX(t)},${waveMidY - Math.sin(t) * ampPx}`);
              cosFull.push(`${waveX(t)},${waveMidY - Math.cos(t) * ampPx}`);
            }
            const sinFullPath = "M" + sinFull.join("L");
            const cosFullPath = "M" + cosFull.join("L");

            // Tick marks for the circle's cardinal radii.
            const cardinals = [0, 90, 180, 270];

            return (
              <motion.g
                initial={false}
                animate={{ opacity: entered ? 1 : 0 }}
                transition={{ duration: entranceDur, ease: [0.22, 1, 0.36, 1] }}
                transform={`translate(${margin.left},${margin.top})`}
              >
                <defs>
                  <radialGradient id={`${gid}-disc`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={withAlpha(accent, 0.1)} />
                    <stop offset="70%" stopColor={withAlpha(accent, 0.04)} />
                    <stop offset="100%" stopColor={withAlpha(accent, 0)} />
                  </radialGradient>
                </defs>

                {/* ---------- Circle panel ---------- */}
                <g>
                  {/* soft disc fill */}
                  <circle cx={cx} cy={cy} r={R} fill={`url(#${gid}-disc)`} />

                  {/* cardinal gridlines / axes through the centre */}
                  <line
                    x1={cx - R - 8}
                    x2={cx + R + 8}
                    y1={cy}
                    y2={cy}
                    stroke={p.borderStrong}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <line
                    x1={cx}
                    x2={cx}
                    y1={cy - R - 8}
                    y2={cy + R + 8}
                    stroke={p.borderStrong}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />

                  {/* the unit circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={R}
                    fill="none"
                    stroke={p.border}
                    strokeWidth={1.5}
                  />

                  {/* cardinal coordinate ticks (±1 on each axis) */}
                  {cardinals.map((deg) => {
                    const pt = polarToCartesian(cx, cy, R, deg);
                    return (
                      <circle key={deg} cx={pt.x} cy={pt.y} r={2} fill={p.inkMuted} />
                    );
                  })}
                  <text
                    x={cx + R + 11}
                    y={cy}
                    dy="0.32em"
                    textAnchor="start"
                    fill={p.inkMuted}
                    style={TICK_FONT}
                  >
                    1
                  </text>
                  <text
                    x={cx - R - 11}
                    y={cy}
                    dy="0.32em"
                    textAnchor="end"
                    fill={p.inkMuted}
                    style={TICK_FONT}
                  >
                    -1
                  </text>
                  <text
                    x={cx}
                    y={cy - R - 9}
                    textAnchor="middle"
                    fill={p.inkMuted}
                    style={TICK_FONT}
                  >
                    1
                  </text>
                  <text
                    x={cx}
                    y={cy + R + 17}
                    textAnchor="middle"
                    fill={p.inkMuted}
                    style={TICK_FONT}
                  >
                    -1
                  </text>

                  {/* angle sweep arc from 0 to θ */}
                  <ArcSweep cx={cx} cy={cy} r={R * 0.3} theta={theta} color={accent} />

                  {/* projection legs: cos (horizontal) + sin (vertical) */}
                  {showProjections && (
                    <g>
                      {/* cos leg along the x-axis */}
                      <line
                        x1={cx}
                        x2={px}
                        y1={cy}
                        y2={cy}
                        stroke={cosColor}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                      {/* sin leg dropped from the point to the x-axis */}
                      <line
                        x1={px}
                        x2={px}
                        y1={cy}
                        y2={py}
                        stroke={sinColor}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                      {/* dashed guide back to the y-axis (sin value) */}
                      <line
                        x1={px}
                        x2={cx}
                        y1={py}
                        y2={py}
                        stroke={withAlpha(sinColor, 0.4)}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                      {/* tiny right-angle marker at the foot of the sin leg */}
                      <RightAngle x={px} y={cy} sx={cosV} sy={sinV} color={p.inkFaint} />
                    </g>
                  )}

                  {/* the rotating radius */}
                  <line
                    x1={cx}
                    x2={px}
                    y1={cy}
                    y2={py}
                    stroke={accent}
                    strokeWidth={2.25}
                    strokeLinecap="round"
                  />

                  {/* the point on the circle */}
                  <circle cx={px} cy={py} r={7} fill={withAlpha(accent, 0.18)} />
                  <circle
                    cx={px}
                    cy={py}
                    r={4}
                    fill={accent}
                    stroke={p.surface}
                    strokeWidth={1.5}
                  />

                  {/* θ readout near the arc */}
                  <ThetaLabel
                    cx={cx}
                    cy={cy}
                    r={R * 0.3}
                    theta={theta}
                    deg={degDisplay}
                    color={p.ink}
                  />

                  {/* (cos, sin) coordinate readout near the point, kept inside
                      the circle panel so it never clips at the canvas edges */}
                  {(() => {
                    const coordText = `(${cosV.toFixed(2)}, ${sinV.toFixed(2)})`;
                    const coordW = coordText.length * 6.3 + 2; // mono est. width
                    const anchorStart = cosV >= 0;
                    const rawX = px + (anchorStart ? 12 : -12);
                    // For end-anchored text x is the right edge; clamp so the
                    // left edge (x - coordW) stays >= 0. For start-anchored x is
                    // the left edge; clamp so x + coordW stays within the panel.
                    const x = anchorStart
                      ? Math.min(rawX, circleBox - coordW)
                      : Math.max(rawX, coordW);
                    const y = clamp(py + (sinV >= 0 ? -12 : 16), 10, inner.height - 4);
                    return (
                      <text
                        x={x}
                        y={y}
                        textAnchor={anchorStart ? "start" : "end"}
                        fill={p.inkMuted}
                        style={{ ...TICK_FONT, fontSize: 10.5 }}
                      >
                        {coordText}
                      </text>
                    );
                  })()}
                </g>

                {/* ---------- Wave panel ---------- */}
                {showWave && waveW > 0 && (
                  <g>
                    {/* baseline (y = 0) */}
                    <line
                      x1={waveX0}
                      x2={waveX0 + waveW}
                      y1={waveMidY}
                      y2={waveMidY}
                      stroke={p.borderStrong}
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                    {/* ±1 reference gridlines */}
                    {[1, -1].map((s) => (
                      <line
                        key={s}
                        x1={waveX0}
                        x2={waveX0 + waveW}
                        y1={waveMidY - s * ampPx}
                        y2={waveMidY - s * ampPx}
                        stroke={p.grid}
                        strokeWidth={1}
                        strokeDasharray="2 4"
                        shapeRendering="crispEdges"
                      />
                    ))}

                    {/* radian ticks along the bottom */}
                    {WAVE_TICKS.map(({ t, label }) => (
                      <g key={label}>
                        <line
                          x1={waveX(t)}
                          x2={waveX(t)}
                          y1={waveMidY - ampPx}
                          y2={waveMidY + ampPx}
                          stroke={p.grid}
                          strokeWidth={1}
                          strokeDasharray="2 4"
                          shapeRendering="crispEdges"
                        />
                        <text
                          x={waveX(t)}
                          y={waveMidY + ampPx + 16}
                          textAnchor="middle"
                          fill={p.inkFaint}
                          style={TICK_FONT}
                        >
                          {label}
                        </text>
                      </g>
                    ))}

                    {/* faint full-range reference curves spanning 0..2π so the
                        labeled axis is always filled; the bold traced paths
                        overlay these up to the current θ */}
                    <path
                      d={cosFullPath}
                      fill="none"
                      stroke={withAlpha(cosColor, 0.18)}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={sinFullPath}
                      fill="none"
                      stroke={withAlpha(sinColor, 0.18)}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* cosine trace */}
                    <path
                      d={cosPath}
                      fill="none"
                      stroke={cosColor}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.9}
                    />
                    {/* sine trace */}
                    <path
                      d={sinPath}
                      fill="none"
                      stroke={sinColor}
                      strokeWidth={2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* connector from the circle's point to the wave playhead */}
                    <line
                      x1={px}
                      x2={waveX(theta)}
                      y1={py}
                      y2={waveMidY - sinV * ampPx}
                      stroke={withAlpha(sinColor, 0.35)}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />

                    {/* playhead dots on each wave */}
                    <circle
                      cx={waveX(theta)}
                      cy={waveMidY - cosV * ampPx}
                      r={3.5}
                      fill={cosColor}
                      stroke={p.surface}
                      strokeWidth={1.25}
                    />
                    <circle
                      cx={waveX(theta)}
                      cy={waveMidY - sinV * ampPx}
                      r={4}
                      fill={sinColor}
                      stroke={p.surface}
                      strokeWidth={1.5}
                    />
                  </g>
                )}
              </motion.g>
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

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

/** A filled-stroke arc from 0 to θ (counter-clockwise, math convention). */
function ArcSweep({
  cx,
  cy,
  r,
  theta,
  color,
}: {
  cx: number;
  cy: number;
  r: number;
  theta: number;
  color: string;
}) {
  const t = clamp(theta, 0, TAU);
  if (t < 0.001) return null;
  // SVG sweep: start at angle 0 (east), go counter-clockwise → y decreases.
  const x0 = cx + r;
  const y0 = cy;
  const x1 = cx + r * Math.cos(t);
  const y1 = cy - r * Math.sin(t);
  const largeArc = t > Math.PI ? 1 : 0;
  // sweep-flag 0 = counter-clockwise in SVG's y-down space (visually CCW).
  const d = `M${x0},${y0}A${r},${r} 0 ${largeArc} 0 ${x1},${y1}`;
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
  );
}

/** The θ value label, placed just outside the sweep arc at its mid-angle. */
function ThetaLabel({
  cx,
  cy,
  r,
  theta,
  deg,
  color,
}: {
  cx: number;
  cy: number;
  r: number;
  theta: number;
  deg: number;
  color: string;
}) {
  const mid = theta / 2;
  const lr = r + 18;
  const lx = cx + lr * Math.cos(mid);
  const ly = cy - lr * Math.sin(mid);
  return (
    <text
      x={lx}
      y={ly}
      dy="0.32em"
      textAnchor="middle"
      fill={color}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.02em",
        fontWeight: 600,
      }}
    >
      θ={Math.round(deg)}°
    </text>
  );
}

/** A small right-angle square at the foot of the sin projection. */
function RightAngle({
  x,
  y,
  sx,
  sy,
  color,
}: {
  x: number;
  y: number;
  sx: number; // cos sign direction
  sy: number; // sin sign direction
  color: string;
}) {
  // Skip near the axes where a right-angle marker is degenerate.
  if (Math.abs(sy) < 0.08 || Math.abs(sx) < 0.08) return null;
  const s = 8;
  const dx = sx >= 0 ? -s : s; // step back toward the origin along x
  const dy = sy >= 0 ? -s : s; // step up toward the point along y
  const d = `M${x + dx},${y} L${x + dx},${y + dy} L${x},${y + dy}`;
  return <path d={d} fill="none" stroke={color} strokeWidth={1} opacity={0.7} />;
}

export const meta: RevizMeta = {
  id: "unit-circle",
  name: "Unit Circle",
  category: "math",
  description:
    "An animated unit circle: a rotating radius at angle θ with its cos/sin projection legs, the point on the circle, an angle arc, and an optional synced sine & cosine wave traced to the right.",
  tags: ["trigonometry", "sine", "cosine", "unit circle", "rotation", "math"],
  badges: ["animated", "themed", "responsive", "exportable"],
  exportName: "UnitCircle",
  sourcePath: "math/UnitCircle",
  aspect: 16 / 7,
  controls: [
    {
      key: "angle",
      label: "Angle θ (deg)",
      type: "number",
      group: "Data",
      help: "Fixed angle in degrees. Used when looping is off.",
      default: 48,
      min: 0,
      max: 360,
      step: 1,
      unit: "°",
    },
    {
      key: "loop",
      label: "Rotate (loop)",
      type: "boolean",
      group: "Animation",
      help: "Continuously sweep θ from 0 to 2π instead of holding a fixed angle.",
      default: true,
    },
    {
      key: "showWave",
      label: "Show waves",
      type: "boolean",
      group: "Layout",
      help: "Trace the synced sine & cosine waves to the right of the circle.",
      default: true,
    },
    {
      key: "showProjections",
      label: "Show projections",
      type: "boolean",
      group: "Layout",
      help: "Draw the cos / sin projection legs and the right-angle marker.",
      default: true,
    },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "The unit circle" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "duration",
      label: "Revolution (ms)",
      type: "number",
      group: "Animation",
      help: "Time for one full revolution when looping.",
      default: 6000,
      min: 1200,
      max: 16000,
      step: 200,
    },
  ],
  presets: [
    {
      id: "rotating-waves",
      name: "Rotating with waves",
      props: {
        title: "The unit circle",
        loop: true,
        showWave: true,
        showProjections: true,
        duration: 6000,
        caption: "As θ sweeps the circle, its vertical and horizontal projections trace sin θ and cos θ.",
      },
    },
    {
      id: "fixed-angle",
      name: "Fixed 30°",
      props: {
        title: "sin 30° = 1/2",
        loop: false,
        angle: 30,
        showWave: false,
        showProjections: true,
        caption: "A fixed angle with its cosine and sine legs called out.",
      },
    },
    {
      id: "fast-spin",
      name: "Fast spin",
      props: {
        title: "Rotation → oscillation",
        loop: true,
        showWave: true,
        showProjections: false,
        duration: 2400,
      },
    },
  ],
};
