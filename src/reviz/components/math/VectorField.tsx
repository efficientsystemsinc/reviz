"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ResponsiveSvg,
  TooltipRow,
  clamp,
  formatCompact,
  mix,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* The safe, built-in vector-field library (no string eval).           */
/* Each field maps (x, y) -> (u, v) in data space.                      */
/* ------------------------------------------------------------------ */

type FieldType = "rotational" | "source" | "saddle" | "shear";

const FIELD_LABEL: Record<FieldType, string> = {
  rotational: "rotational",
  source: "source / sink",
  saddle: "saddle",
  shear: "shear",
};

/** A short formula caption (plain text) for each field. */
const FIELD_FORMULA: Record<FieldType, string> = {
  rotational: "(−y, x)",
  source: "(x, y)",
  saddle: "(x, −y)",
  shear: "(y, 0)",
};

/** Evaluate a built-in vector field at (x, y). */
function evalField(type: FieldType, x: number, y: number): [number, number] {
  switch (type) {
    case "rotational":
      // Solid-body rotation — curl, no divergence.
      return [-y, x];
    case "source":
      // Radial source/sink — pure divergence.
      return [x, y];
    case "saddle":
      // Hyperbolic saddle — a 1-stable / 1-unstable fixed point.
      return [x, -y];
    case "shear":
      // Simple horizontal shear — vorticity with straight streamlines.
      return [y, 0];
    default:
      return [0, 0];
  }
}

const DEFAULT_DOMAIN: [number, number] = [-3, 3];

export interface VectorFieldProps {
  field?: FieldType;
  density?: number;
  domain?: [number, number];
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

export default function VectorField({
  field = "rotational",
  density = 13,
  domain = DEFAULT_DOMAIN,
  title = "Rotational vector field",
  caption = "",
  source = "",
  color = "",
  duration = 1300,
}: VectorFieldProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{
    px: number;
    py: number;
    x: number;
    y: number;
    u: number;
    v: number;
    mag: number;
  } | null>(null);
  const gid = useMemo(() => uid("vfield"), []);

  const accent = color || p.accent;
  // A perceptual ramp: low magnitude reads as a quiet, faint stroke; high
  // magnitude warms toward the accent. Two stops keep it palette-driven.
  const lowColor = useMemo(() => mix(p.inkFaint, accent, 0.25), [p.inkFaint, accent]);
  const highColor = accent;

  // Domain (square window, clamped to a sane, monotone-increasing range).
  const [lo, hi] = useMemo(() => {
    const a = Number.isFinite(domain?.[0]) ? domain[0] : -3;
    const b = Number.isFinite(domain?.[1]) ? domain[1] : 3;
    return a < b ? [a, b] : [b - 1, b + 1];
  }, [domain]);

  // Grid resolution per axis, clamped so the figure never gets unreadable.
  const n = useMemo(() => clamp(Math.round(density), 4, 28), [density]);

  // Sample the field on an n×n lattice across the domain.
  const samples = useMemo(() => {
    const out: {
      x: number;
      y: number;
      u: number;
      v: number;
      mag: number;
      angle: number;
    }[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        // Centered cell coordinates so arrows sit inside their cells.
        const x = lo + ((hi - lo) * (i + 0.5)) / n;
        const y = lo + ((hi - lo) * (j + 0.5)) / n;
        const [u, v] = evalField(field, x, y);
        const mag = Math.hypot(u, v);
        out.push({ x, y, u, v, mag, angle: Math.atan2(v, u) });
      }
    }
    return out;
  }, [field, n, lo, hi]);

  const maxMag = useMemo(
    () => Math.max(1e-6, ...samples.map((s) => s.mag)),
    [samples],
  );

  const drawDur = (duration / 1000) * 0.7;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={1} margin={{ top: 16, right: 16, bottom: 36, left: 44 }}>
          {({ inner, margin }) => {
            // Keep the plotting area square so the field isn't visually sheared.
            const side = Math.min(inner.width, inner.height);
            const ox = (inner.width - side) / 2;
            const oy = (inner.height - side) / 2;

            const x = scaleLinear().domain([lo, hi]).range([0, side]);
            const y = scaleLinear().domain([lo, hi]).range([side, 0]);

            // Cell pitch in pixels → cap arrow length to ~0.9 of a cell.
            const cell = side / n;
            const arrowMax = cell * 0.86;
            // Scale data magnitude → pixel length (sqrt eases the dynamic range).
            const lenScale = scaleLinear().domain([0, 1]).range([cell * 0.18, arrowMax]);

            const originX = clamp(x(0), 0, side);
            const originY = clamp(y(0), 0, side);
            const hasZeroX = 0 >= lo && 0 <= hi;
            const hasZeroY = 0 >= lo && 0 <= hi;

            const ticks = x.ticks(7);

            return (
              <g transform={`translate(${margin.left + ox}, ${margin.top + oy})`}>
                <defs>
                  <clipPath id={`${gid}-clip`}>
                    <rect x={-2} y={-2} width={side + 4} height={side + 4} />
                  </clipPath>
                </defs>

                {/* Plot frame. */}
                <rect
                  x={0}
                  y={0}
                  width={side}
                  height={side}
                  fill={withAlpha(p.surfaceAlt, 0.45)}
                  stroke={p.border}
                  strokeWidth={1}
                  rx={4}
                />

                {/* Gridlines. */}
                <g aria-hidden>
                  {ticks.map((t, i) => (
                    <line
                      key={`vx-${i}`}
                      x1={x(t)}
                      x2={x(t)}
                      y1={0}
                      y2={side}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      shapeRendering="crispEdges"
                    />
                  ))}
                  {ticks.map((t, i) => (
                    <line
                      key={`hy-${i}`}
                      x1={0}
                      x2={side}
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
                {hasZeroX && (
                  <line
                    x1={originX}
                    x2={originX}
                    y1={0}
                    y2={side}
                    stroke={p.borderStrong}
                    strokeWidth={1.25}
                    shapeRendering="crispEdges"
                  />
                )}
                {hasZeroY && (
                  <line
                    x1={0}
                    x2={side}
                    y1={originY}
                    y2={originY}
                    stroke={p.borderStrong}
                    strokeWidth={1.25}
                    shapeRendering="crispEdges"
                  />
                )}

                {/* Tick labels along the bottom and left edges. */}
                <g aria-hidden>
                  {ticks.map((t, i) =>
                    t === 0 ? null : (
                      <text
                        key={`xt-${i}`}
                        x={x(t)}
                        y={side + 15}
                        textAnchor="middle"
                        fill={p.inkMuted}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {formatCompact(t)}
                      </text>
                    ),
                  )}
                  {ticks.map((t, i) =>
                    t === 0 ? null : (
                      <text
                        key={`yt-${i}`}
                        x={-8}
                        y={y(t)}
                        dy="0.32em"
                        textAnchor="end"
                        fill={p.inkMuted}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {formatCompact(t)}
                      </text>
                    ),
                  )}
                </g>

                {/* The quiver: one arrow per lattice point. */}
                <g clipPath={`url(#${gid}-clip)`}>
                  {samples.map((s, idx) => {
                    const cx = x(s.x);
                    const cy = y(s.y);
                    const norm = s.mag / maxMag; // 0..1
                    const len = s.mag < 1e-9 ? 0 : lenScale(Math.sqrt(norm));
                    // Direction in *pixel* space: invert v because y grows downward.
                    const dx = (s.u / (s.mag || 1)) * len;
                    const dy = -(s.v / (s.mag || 1)) * len;
                    const ex = cx + dx;
                    const ey = cy + dy;
                    const stroke = mix(lowColor, highColor, clamp(norm, 0, 1));
                    const headLen = clamp(len * 0.34, 2.2, cell * 0.42);
                    // Arrowhead wings.
                    const ang = Math.atan2(dy, dx);
                    const spread = 0.42;
                    const hx1 = ex - headLen * Math.cos(ang - spread);
                    const hy1 = ey - headLen * Math.sin(ang - spread);
                    const hx2 = ex - headLen * Math.cos(ang + spread);
                    const hy2 = ey - headLen * Math.sin(ang + spread);

                    // Stagger by distance from center for a radial "bloom" reveal.
                    const radial = Math.hypot(s.x, s.y) / (Math.hypot(hi, hi) || 1);
                    const delay = reduced ? 0 : radial * drawDur * 0.7;
                    const animate = reduced || inView;

                    if (len < 0.6) {
                      // Near a fixed point — draw a small node instead of an arrow.
                      return (
                        <motion.circle
                          key={`${gid}-pt-${idx}-${token}`}
                          cx={cx}
                          cy={cy}
                          r={1.6}
                          fill={lowColor}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: animate ? 0.7 : 0, scale: animate ? 1 : 0 }}
                          transition={{ duration: reduced ? 0 : 0.4, delay }}
                        />
                      );
                    }

                    return (
                      <motion.g
                        key={`${gid}-arr-${idx}-${token}`}
                        initial={{ opacity: 0, scale: 0.2 }}
                        animate={{ opacity: animate ? 1 : 0, scale: animate ? 1 : 0.2 }}
                        transition={{
                          duration: reduced ? 0 : 0.5,
                          delay,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ transformOrigin: `${cx}px ${cy}px` }}
                      >
                        <line
                          x1={cx}
                          y1={cy}
                          x2={ex}
                          y2={ey}
                          stroke={stroke}
                          strokeWidth={clamp(1 + norm * 1.4, 1, 2.6)}
                          strokeLinecap="round"
                        />
                        <path
                          d={`M ${ex} ${ey} L ${hx1} ${hy1} L ${hx2} ${hy2} Z`}
                          fill={stroke}
                        />
                      </motion.g>
                    );
                  })}
                </g>

                {/* Hover spotlight. */}
                {hover && (
                  <circle
                    cx={x(hover.x)}
                    cy={y(hover.y)}
                    r={cell * 0.62}
                    fill="none"
                    stroke={accent}
                    strokeWidth={1.25}
                    opacity={0.8}
                  />
                )}

                {/* Axis labels — anchored to the frame edges (not the origin
                    axis) so they stay clear of the dense central arrows, each
                    on a small canvas plate to lift them off the quiver. */}
                <g>
                  <rect
                    x={side - 15}
                    y={side - 15}
                    width={14}
                    height={13}
                    fill={p.surface}
                    rx={2}
                  />
                  <text
                    x={side - 4}
                    y={side - 4}
                    textAnchor="end"
                    fill={p.inkMuted}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    x
                  </text>
                </g>
                <text
                  transform={`translate(${-34}, ${side / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  y
                </text>

                {/* Transparent hover capture, snapping to nearest lattice cell. */}
                <rect
                  x={0}
                  y={0}
                  width={side}
                  height={side}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                    const r = svg.getBoundingClientRect();
                    const localX = clamp(
                      e.clientX - r.left - margin.left - ox,
                      0,
                      side,
                    );
                    const localY = clamp(
                      e.clientY - r.top - margin.top - oy,
                      0,
                      side,
                    );
                    const i = clamp(Math.floor((localX / side) * n), 0, n - 1);
                    const j = clamp(Math.floor(((side - localY) / side) * n), 0, n - 1);
                    const s = samples[j * n + i];
                    if (!s) return;
                    setHover({
                      px: x(s.x) + margin.left + ox,
                      py: y(s.y) + margin.top + oy,
                      x: s.x,
                      y: s.y,
                      u: s.u,
                      v: s.v,
                      mag: s.mag,
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* Field formula + magnitude ramp legend. */}
        <div className="mb-1 mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-ink">
            F(x, y) = {FIELD_FORMULA[field]}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
              low
            </span>
            <span
              className="h-2 w-16 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${lowColor}, ${highColor})`,
              }}
            />
            <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
              ‖F‖ high
            </span>
          </span>
        </div>

        <FloatingTooltip x={hover?.px ?? 0} y={(hover?.py ?? 0) - 2} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                ({formatCompact(hover.x, 2)}, {formatCompact(hover.y, 2)})
              </div>
              <TooltipRow label="u" value={formatCompact(hover.u, 2)} />
              <TooltipRow label="v" value={formatCompact(hover.v, 2)} />
              <TooltipRow label="‖F‖" value={formatCompact(hover.mag, 2)} />
            </>
          )}
        </FloatingTooltip>

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-ink-muted opacity-0 transition-all hover:border-border-strong hover:text-ink group-hover/figure:opacity-100"
        >
          Replay
        </button>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "vector-field",
  name: "Vector Field",
  category: "math",
  description:
    "A 2D quiver plot of a selectable built-in vector field over a square lattice, with arrows scaled and colored by magnitude and a staggered radial bloom-in.",
  tags: ["vector field", "quiver", "calculus", "dynamics", "gradient", "math"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "VectorField",
  sourcePath: "math/VectorField",
  aspect: 1,
  controls: [
    {
      key: "field",
      label: "Field",
      type: "select",
      group: "Data",
      default: "rotational",
      options: (Object.keys(FIELD_LABEL) as FieldType[]).map((value) => ({
        value,
        label: FIELD_LABEL[value],
      })),
    },
    {
      key: "density",
      label: "Density (per axis)",
      type: "number",
      group: "Layout",
      default: 13,
      min: 4,
      max: 28,
      step: 1,
    },
    {
      key: "domain",
      label: "Domain [min, max]",
      type: "json",
      group: "Data",
      help: "Square window applied to both axes, e.g. [-3, 3].",
      default: DEFAULT_DOMAIN,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Rotational vector field" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1300,
      min: 0,
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "rotational",
      name: "Rotational",
      props: {
        field: "rotational",
        density: 13,
        domain: [-3, 3],
        title: "Rotational field  F = (−y, x)",
        caption: "Solid-body rotation: nonzero curl, zero divergence — streamlines are closed circles.",
      },
    },
    {
      id: "saddle",
      name: "Saddle",
      props: {
        field: "saddle",
        density: 15,
        domain: [-3, 3],
        title: "Saddle field  F = (x, −y)",
        caption: "A hyperbolic fixed point at the origin: one stable and one unstable eigendirection.",
      },
    },
    {
      id: "source",
      name: "Source / sink",
      props: {
        field: "source",
        density: 13,
        domain: [-3, 3],
        title: "Radial source  F = (x, y)",
        caption: "Pure divergence: vectors point radially outward, growing with distance from the origin.",
      },
    },
  ],
};
