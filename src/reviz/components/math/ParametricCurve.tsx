"use client";

import { scaleLinear } from "d3-scale";
import { curveCatmullRom, line as d3line } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  Glow,
  MonoLabel,
  ReplayButton,
  ResponsiveSvg,
  clamp,
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

/* ------------------------------------------------------------------ */
/* Parametric curve families. Each maps a parameter t (or θ) to a       */
/* point (x, y) in a normalized [-1, 1]² frame. `a` and `b` shape the   */
/* curve (frequencies / petal counts / winding). No string eval.        */
/* ------------------------------------------------------------------ */

type CurveKind = "lissajous" | "rose" | "spiral" | "circle";

interface CurveSpec {
  kind: CurveKind;
  a: number;
  b: number;
  /** Number of full revolutions of the driving parameter. */
  turns: number;
}

const KIND_LABEL: Record<CurveKind, string> = {
  lissajous: "Lissajous",
  rose: "Rose",
  spiral: "Spiral",
  circle: "Circle",
};

const TWO_PI = Math.PI * 2;

/** Total parameter span (in radians) for a given curve. */
function paramSpan({ kind, b, turns }: CurveSpec): number {
  switch (kind) {
    case "lissajous":
      return TWO_PI * Math.max(1, Math.round(turns));
    case "rose":
      // A rose r = cos(k·θ) with k = a/b closes after b·2π when k is rational.
      return TWO_PI * Math.max(1, Math.round(b));
    case "spiral":
      return TWO_PI * Math.max(1, turns);
    case "circle":
    default:
      return TWO_PI;
  }
}

/** Evaluate the curve at parameter t, returning a point in roughly [-1, 1]². */
function evalCurve(spec: CurveSpec, t: number): { x: number; y: number } {
  const { kind, a, b } = spec;
  switch (kind) {
    case "lissajous": {
      // Classic figure: x = sin(a·t + δ), y = sin(b·t). δ = π/2 gives open lobes.
      const delta = Math.PI / 2;
      return { x: Math.sin(a * t + delta), y: Math.sin(b * t) };
    }
    case "rose": {
      // r = cos(k·θ), k = a/b. k odd → a petals, k even → 2a petals.
      const k = a / Math.max(1, b);
      const r = Math.cos(k * t);
      return { x: r * Math.cos(t), y: r * Math.sin(t) };
    }
    case "spiral": {
      // Archimedean spiral r = a·θ, normalized to the unit frame, with a gentle
      // b-driven swirl modulation for visual richness.
      const span = paramSpan(spec);
      const rNorm = (a * t) / Math.max(1e-6, a * span);
      const r = rNorm * (1 + 0.06 * Math.sin(b * t));
      return { x: r * Math.cos(t), y: r * Math.sin(t) };
    }
    case "circle":
    default: {
      // An ellipse when a ≠ b (semi-axes a, b normalized to the frame).
      const m = Math.max(Math.abs(a), Math.abs(b), 1e-6);
      return { x: (a / m) * Math.cos(t), y: (b / m) * Math.sin(t) };
    }
  }
}

const SAMPLES = 600;

interface Pt {
  x: number;
  y: number;
  t: number;
}

const DEFAULT_TURNS = 1;

export interface ParametricCurveProps {
  kind?: CurveKind;
  a?: number;
  b?: number;
  turns?: number;
  color?: string;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
  loop?: boolean;
}

export default function ParametricCurve({
  kind = "lissajous",
  a = 3,
  b = 2,
  turns = DEFAULT_TURNS,
  color = "",
  title = "Lissajous curve",
  caption = "",
  source = "",
  duration = 2600,
  loop = true,
}: ParametricCurveProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const gid = useMemo(() => uid("paramcurve"), []);

  const stroke = color || p.accent;

  const spec = useMemo<CurveSpec>(
    () => ({
      kind,
      a: Number.isFinite(a) ? a : 1,
      b: Number.isFinite(b) ? b : 1,
      turns: Number.isFinite(turns) ? clamp(turns, 1, 12) : 1,
    }),
    [kind, a, b, turns],
  );

  // Sample the full curve once in normalized space.
  const pts = useMemo<Pt[]>(() => {
    const span = paramSpan(spec);
    const out: Pt[] = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const t = (span * s) / SAMPLES;
      const { x, y } = evalCurve(spec, t);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, t });
    }
    return out;
  }, [spec]);

  // Trace head progress, looping when requested. Honors reduced-motion (snaps).
  const progress = useProgress({
    duration,
    enabled: inView && !reduced,
    loop: loop && !reduced,
    trigger: `${token}-${kind}-${a}-${b}-${turns}-${loop}`,
  });

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg aspect={4 / 3} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
          {({ inner, margin }) => {
            // Square plotting box, centered, so circles read as circles.
            const side = Math.min(inner.width, inner.height);
            const ox = margin.left + (inner.width - side) / 2;
            const oy = margin.top + (inner.height - side) / 2;
            const pad = side * 0.08;

            const x = scaleLinear().domain([-1, 1]).range([pad, side - pad]);
            const y = scaleLinear().domain([-1, 1]).range([side - pad, pad]);

            const cx = x(0);
            const cy = y(0);

            const lineGen = d3line<Pt>()
              .x((d) => x(d.x))
              .y((d) => y(d.y))
              .curve(curveCatmullRom.alpha(0.5));

            const fullPath = lineGen(pts) ?? "";

            // Head index along the trace.
            const headIdx = clamp(Math.round(progress * (pts.length - 1)), 0, pts.length - 1);
            const traced = pts.slice(0, headIdx + 1);
            const tracedPath = lineGen(traced.length > 1 ? traced : pts.slice(0, 2)) ?? "";
            const head = pts[headIdx] ?? pts[0];
            const headX = head ? x(head.x) : cx;
            const headY = head ? y(head.y) : cy;

            // Axis ticks at unit and half-unit positions inside the frame.
            const ticks = [-1, -0.5, 0.5, 1];

            const drawDur = (duration / 1000) * 0.9;

            return (
              <g>
                <defs>
                  <Glow id={`${gid}-glow`} blur={5} />
                </defs>

                {/* Soft framing square. */}
                <rect
                  x={x(-1)}
                  y={y(1)}
                  width={x(1) - x(-1)}
                  height={y(-1) - y(1)}
                  rx={6}
                  fill={withAlpha(stroke, 0.025)}
                  stroke={p.border}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />

                {/* Centered axes through the origin. */}
                <g aria-hidden>
                  {ticks.map((t) => (
                    <line
                      key={`gx-${t}`}
                      x1={x(t)}
                      x2={x(t)}
                      y1={y(-1)}
                      y2={y(1)}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 5"
                      shapeRendering="crispEdges"
                    />
                  ))}
                  {ticks.map((t) => (
                    <line
                      key={`gy-${t}`}
                      x1={x(-1)}
                      x2={x(1)}
                      y1={y(t)}
                      y2={y(t)}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 5"
                      shapeRendering="crispEdges"
                    />
                  ))}
                  <line
                    x1={x(-1)}
                    x2={x(1)}
                    y1={cy}
                    y2={cy}
                    stroke={p.borderStrong}
                    strokeWidth={1.25}
                    shapeRendering="crispEdges"
                  />
                  <line
                    x1={cx}
                    x2={cx}
                    y1={y(-1)}
                    y2={y(1)}
                    stroke={p.borderStrong}
                    strokeWidth={1.25}
                    shapeRendering="crispEdges"
                  />
                </g>

                {/* Ghost of the full curve, faint, behind the live trace. */}
                <path
                  d={fullPath}
                  fill="none"
                  stroke={withAlpha(stroke, 0.16)}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* The animated trace. Initial entrance draws via pathLength;
                    once in view the head-following slice (above) takes over. */}
                {reduced ? (
                  <path
                    d={fullPath}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : loop ? (
                  <path
                    d={tracedPath}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <motion.path
                    key={`${gid}-trace-${token}`}
                    d={fullPath}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                    transition={{
                      pathLength: { duration: drawDur, ease: [0.4, 0, 0.2, 1] },
                      opacity: { duration: 0.2 },
                    }}
                  />
                )}

                {/* The moving head point (and a connector to the origin). */}
                {!reduced && head && (
                  <g>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={headX}
                      y2={headY}
                      stroke={withAlpha(stroke, 0.35)}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={headX}
                      cy={headY}
                      r={9}
                      fill={withAlpha(stroke, 0.18)}
                    />
                    <circle
                      cx={headX}
                      cy={headY}
                      r={4.5}
                      fill={stroke}
                      stroke={p.surface}
                      strokeWidth={1.75}
                      filter={`url(#${gid}-glow)`}
                    />
                  </g>
                )}

                {/* Origin marker. */}
                <circle cx={cx} cy={cy} r={2} fill={p.inkFaint} />

                {/* Axis end labels, kept inside the frame with a small plate so
                    they read clearly against the curve. */}
                <g aria-hidden>
                  <rect
                    x={x(1) - 17}
                    y={cy - 16}
                    width={13}
                    height={12}
                    rx={2}
                    fill={p.surface}
                  />
                  <text
                    x={x(1) - 6}
                    y={cy - 6}
                    textAnchor="end"
                    fill={p.inkMuted}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em" }}
                  >
                    x
                  </text>
                  <rect
                    x={cx + 4}
                    y={y(1) + 1}
                    width={13}
                    height={12}
                    rx={2}
                    fill={p.surface}
                  />
                  <text
                    x={cx + 9}
                    y={y(1) + 10}
                    textAnchor="start"
                    fill={p.inkMuted}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em" }}
                  >
                    y
                  </text>
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* Equation / parameter chip row. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          <MonoLabel>{KIND_LABEL[kind]}</MonoLabel>
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            a = {formatCompact(a, 2)}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            b = {formatCompact(b, 2)}
          </span>
        </div>

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "parametric-curve",
  name: "Parametric Curve",
  category: "math",
  description:
    "Animates a parametric curve — Lissajous figure, rose, spiral, or circle — by tracing it over the parameter t with a glowing moving head point on clean centered axes.",
  tags: ["parametric", "lissajous", "rose", "spiral", "curve", "math"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "ParametricCurve",
  sourcePath: "math/ParametricCurve",
  aspect: 4 / 3,
  controls: [
    {
      key: "kind",
      label: "Curve",
      type: "select",
      group: "Data",
      options: [
        { label: "Lissajous", value: "lissajous" },
        { label: "Rose", value: "rose" },
        { label: "Spiral", value: "spiral" },
        { label: "Circle / Ellipse", value: "circle" },
      ],
      default: "lissajous",
    },
    {
      key: "a",
      label: "a (x frequency / k)",
      type: "number",
      group: "Data",
      default: 3,
      min: 1,
      max: 12,
      step: 1,
    },
    {
      key: "b",
      label: "b (y frequency / k)",
      type: "number",
      group: "Data",
      default: 2,
      min: 1,
      max: 12,
      step: 1,
    },
    {
      key: "turns",
      label: "Turns (spiral)",
      type: "number",
      group: "Data",
      default: DEFAULT_TURNS,
      min: 1,
      max: 12,
      step: 1,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Lissajous curve" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Curve color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Trace duration (ms)",
      type: "number",
      group: "Animation",
      default: 2600,
      min: 400,
      max: 8000,
      step: 100,
    },
    { key: "loop", label: "Loop trace", type: "boolean", group: "Animation", default: true },
  ],
  presets: [
    {
      id: "lissajous",
      name: "Lissajous 3:2",
      props: {
        kind: "lissajous",
        a: 3,
        b: 2,
        title: "Lissajous curve",
        caption: "x = sin(3t + π/2), y = sin(2t) — a 3:2 frequency ratio.",
        loop: true,
        duration: 2600,
      },
    },
    {
      id: "rose",
      name: "Rose (5 petals)",
      props: {
        kind: "rose",
        a: 5,
        b: 1,
        title: "Rose curve",
        caption: "r = cos(5θ) — a five-petalled rhodonea curve.",
        loop: true,
        duration: 3200,
      },
    },
    {
      id: "spiral",
      name: "Archimedean spiral",
      props: {
        kind: "spiral",
        a: 1,
        b: 6,
        turns: 5,
        title: "Archimedean spiral",
        caption: "r = aθ wound over five turns.",
        loop: true,
        duration: 4000,
      },
    },
  ],
};
