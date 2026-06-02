"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { curveCatmullRom, line as d3line } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  Glow,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
  mix,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useProgress,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Pt {
  x: number;
  y: number;
}

interface Goal {
  x: number;
  y: number;
  r?: number;
}

/** Default path: a planar end-effector reach that arcs around an obstacle to a target. */
const DEFAULT_PATH: Pt[] = [
  { x: 0.04, y: 0.12 },
  { x: 0.11, y: 0.21 },
  { x: 0.18, y: 0.33 },
  { x: 0.24, y: 0.46 },
  { x: 0.29, y: 0.58 },
  { x: 0.37, y: 0.66 },
  { x: 0.46, y: 0.69 },
  { x: 0.55, y: 0.66 },
  { x: 0.62, y: 0.58 },
  { x: 0.68, y: 0.49 },
  { x: 0.74, y: 0.42 },
  { x: 0.82, y: 0.4 },
  { x: 0.89, y: 0.43 },
  { x: 0.93, y: 0.5 },
];

const DEFAULT_GOAL: Goal = { x: 0.93, y: 0.5, r: 0.09 };

export interface TrajectoryPlotProps {
  path?: Pt[];
  goal?: Goal | null;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  showWaypoints?: boolean;
  duration?: number;
}

export default function TrajectoryPlot({
  path = DEFAULT_PATH,
  goal = DEFAULT_GOAL,
  title = "End-effector trajectory to target",
  caption = "",
  source = "",
  color = "",
  showWaypoints = true,
  duration = 1600,
}: TrajectoryPlotProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; cx: number; cy: number } | null>(null);
  const ids = useMemo(
    () => ({ grad: uid("traj-grad"), glow: uid("traj-glow") }),
    [],
  );

  // Color ramp along time: cool start -> warm end. The end color is the
  // emphasis (accent unless overridden), the start a muted blend toward the ink.
  const endColor = color || p.accent;
  const startColor = mix(endColor, p.inkFaint, 0.62);

  const pts = useMemo(() => path.filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y)), [path]);

  const xDomain = useMemo(() => {
    const e = extent(pts, (d) => d.x) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const span = e[1] - e[0] || 1;
    const pad = span * 0.08;
    let lo = e[0] - pad;
    let hi = e[1] + pad;
    if (goal) {
      const r = goal.r ?? 0;
      lo = Math.min(lo, goal.x - r - span * 0.04);
      hi = Math.max(hi, goal.x + r + span * 0.04);
    }
    return [lo, hi] as [number, number];
  }, [pts, goal]);

  const yDomain = useMemo(() => {
    const e = extent(pts, (d) => d.y) as [number, number];
    if (e[0] == null) return [0, 1] as [number, number];
    const span = e[1] - e[0] || 1;
    const pad = span * 0.1;
    let lo = e[0] - pad;
    let hi = e[1] + pad;
    if (goal) {
      const r = goal.r ?? 0;
      lo = Math.min(lo, goal.y - r - span * 0.04);
      hi = Math.max(hi, goal.y + r + span * 0.04);
    }
    return [lo, hi] as [number, number];
  }, [pts, goal]);

  // Master 0->1 draw progress (path reveal + marker arrivals key off it).
  const t = useProgress({
    duration,
    enabled: inView,
    trigger: token,
  });
  const drawn = reduced ? 1 : t;

  const start = pts[0];
  const end = pts[pts.length - 1];

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 11} margin={{ top: 16, right: 22, bottom: 38, left: 48 }}>
          {({ inner, margin }) => {
            const x = scaleLinear().domain(xDomain).range([0, inner.width]).nice();
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();

            const lineGen = d3line<Pt>()
              .x((d) => x(d.x))
              .y((d) => y(d.y))
              .curve(curveCatmullRom.alpha(0.5));
            const d = pts.length > 1 ? lineGen(pts) : null;

            // Gradient oriented along the path bounding box so the ramp tracks
            // travel direction (start -> end) regardless of orientation.
            const sx = start ? x(start.x) : 0;
            const sy = start ? y(start.y) : 0;
            const ex = end ? x(end.x) : inner.width;
            const ey = end ? y(end.y) : 0;

            const gx = goal ? x(goal.x) : 0;
            const gy = goal ? y(goal.y) : 0;
            // Goal radius in px (use the x-scale span; circle stays round on
            // near-square plots — acceptable schematic tolerance region).
            const gr = goal
              ? Math.abs(x((goal.r ?? 0) + (xDomain[0])) - x(xDomain[0]))
              : 0;

            const drawDur = (reduced ? 0 : duration) / 1000;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <linearGradient
                    id={ids.grad}
                    gradientUnits="userSpaceOnUse"
                    x1={sx}
                    y1={sy}
                    x2={ex}
                    y2={ey}
                  >
                    <stop offset="0%" stopColor={startColor} />
                    <stop offset="55%" stopColor={mix(startColor, endColor, 0.6)} />
                    <stop offset="100%" stopColor={endColor} />
                  </linearGradient>
                  <Glow id={ids.glow} blur={4} />
                </defs>

                <GridLines scale={y as never} width={inner.width} count={5} />
                <g aria-hidden>
                  {(x as never as { ticks: (n: number) => number[] }).ticks(6).map((tk, i) => (
                    <line
                      key={i}
                      x1={x(tk)}
                      x2={x(tk)}
                      y1={0}
                      y2={inner.height}
                      stroke={p.grid}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      shapeRendering="crispEdges"
                    />
                  ))}
                </g>

                {/* Faint goal / tolerance region */}
                {goal && gr > 0 && (
                  <motion.g
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: drawn > 0 ? 1 : 0, scale: drawn > 0 ? 1 : 0.8 }}
                    transition={{ duration: reduced ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                    style={{ transformOrigin: `${gx}px ${gy}px` }}
                    key={`${token}-goal`}
                  >
                    <circle cx={gx} cy={gy} r={gr} fill={withAlpha(endColor, 0.1)} />
                    <circle
                      cx={gx}
                      cy={gy}
                      r={gr}
                      fill="none"
                      stroke={withAlpha(endColor, 0.45)}
                      strokeWidth={1.25}
                      strokeDasharray="3 4"
                    />
                    <line x1={gx - gr * 0.4} x2={gx + gr * 0.4} y1={gy} y2={gy} stroke={withAlpha(endColor, 0.55)} strokeWidth={1} />
                    <line x1={gx} x2={gx} y1={gy - gr * 0.4} y2={gy + gr * 0.4} stroke={withAlpha(endColor, 0.55)} strokeWidth={1} />
                  </motion.g>
                )}

                {/* Soft underlay halo of the path for depth */}
                {d && (
                  <motion.path
                    d={d}
                    fill="none"
                    stroke={withAlpha(endColor, 0.14)}
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: drawn }}
                    transition={{ duration: 0, ease: "linear" }}
                    key={`${token}-halo`}
                  />
                )}

                {/* Time-colored trajectory, drawn progressively */}
                {d && (
                  <motion.path
                    d={d}
                    fill="none"
                    stroke={`url(#${ids.grad})`}
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: drawn }}
                    transition={{ duration: 0, ease: "linear" }}
                    key={`${token}-path`}
                  />
                )}

                {/* Waypoint dots, revealed as the playhead passes each one */}
                {showWaypoints &&
                  pts.map((d2, i) => {
                    if (i === 0 || i === pts.length - 1) return null;
                    const frac = i / Math.max(1, pts.length - 1);
                    const shown = drawn >= frac;
                    const cx = x(d2.x);
                    const cy = y(d2.y);
                    const active = hover?.i === i;
                    return (
                      <motion.circle
                        key={`${token}-wp-${i}`}
                        cx={cx}
                        cy={cy}
                        r={active ? 4.2 : 2.6}
                        fill={p.surface}
                        stroke={mix(startColor, endColor, frac)}
                        strokeWidth={active ? 2 : 1.5}
                        filter={active ? `url(#${ids.glow})` : undefined}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                        style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
                        onMouseEnter={() => setHover({ i, cx, cy })}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}

                {/* Start marker — hollow ring */}
                {start && (
                  <motion.g
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: drawn > 0 ? 1 : 0, scale: drawn > 0 ? 1 : 0 }}
                    transition={{ duration: reduced ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{ transformOrigin: `${x(start.x)}px ${y(start.y)}px`, cursor: "pointer" }}
                    key={`${token}-start`}
                    onMouseEnter={() => setHover({ i: 0, cx: x(start.x), cy: y(start.y) })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <circle cx={x(start.x)} cy={y(start.y)} r={5.5} fill={p.surface} stroke={startColor} strokeWidth={2} />
                    <circle cx={x(start.x)} cy={y(start.y)} r={1.6} fill={startColor} />
                  </motion.g>
                )}

                {/* End marker — filled, arrives when the path completes */}
                {end && (
                  <motion.g
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: drawn >= 0.999 ? 1 : 0, scale: drawn >= 0.999 ? 1 : 0 }}
                    transition={{ duration: reduced ? 0 : 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                    style={{ transformOrigin: `${x(end.x)}px ${y(end.y)}px`, cursor: "pointer" }}
                    key={`${token}-end`}
                    onMouseEnter={() => setHover({ i: pts.length - 1, cx: x(end.x), cy: y(end.y) })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <circle cx={x(end.x)} cy={y(end.y)} r={8} fill={withAlpha(endColor, 0.2)} />
                    <circle cx={x(end.x)} cy={y(end.y)} r={5} fill={endColor} stroke={p.surface} strokeWidth={1.75} />
                  </motion.g>
                )}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label="Y" format={(v) => formatCompact(v)} />
                <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => formatCompact(v)} />

                {/* X-axis label */}
                <text
                  x={inner.width / 2}
                  y={inner.height + 32}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  X
                </text>

                {/* Direction-of-travel legend chip */}
                <g aria-hidden transform={`translate(${inner.width - 2}, 4)`}>
                  <text
                    x={0}
                    y={0}
                    textAnchor="end"
                    fill={p.inkFaint}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em" }}
                  >
                    start → end
                  </text>
                  <rect x={-78} y={6} width={78} height={4} rx={2} fill={`url(#${ids.grad})`} opacity={0.85} />
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip
          x={hover ? hover.cx + 48 : 0}
          y={hover ? hover.cy + 16 : 0}
          visible={hover != null}
        >
          {hover != null && pts[hover.i] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {hover.i === 0 ? "start" : hover.i === pts.length - 1 ? "goal" : `step ${hover.i}`}
              </div>
              <TooltipRow label="x" value={formatCompact(pts[hover.i].x, 3)} />
              <TooltipRow label="y" value={formatCompact(pts[hover.i].y, 3)} />
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

/** A spiral search sweep ending at a detected target — a second realistic preset. */
const SPIRAL: Pt[] = Array.from({ length: 48 }, (_, i) => {
  const tt = i / 47;
  const ang = tt * Math.PI * 5.2;
  const rad = 0.06 + tt * 0.4;
  return {
    x: Number((0.5 + Math.cos(ang) * rad).toFixed(3)),
    y: Number((0.5 + Math.sin(ang) * rad * 0.85).toFixed(3)),
  };
});

export const meta: RevizMeta = {
  id: "trajectory-plot",
  name: "Trajectory Plot",
  category: "robotics-media",
  description:
    "A 2D motion path colored by time from start to finish, with a hollow start marker, a filled goal marker, optional waypoint dots, and a faint tolerance region — drawn progressively along the route.",
  tags: ["trajectory", "path", "robotics", "motion", "end-effector", "planning"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "TrajectoryPlot",
  sourcePath: "robotics-media/TrajectoryPlot",
  aspect: 16 / 11,
  controls: [
    {
      key: "path",
      label: "Path",
      type: "points",
      group: "Data",
      help: "Ordered { x, y } waypoints traced from start to end.",
      default: DEFAULT_PATH,
    },
    {
      key: "goal",
      label: "Goal region",
      type: "json",
      group: "Data",
      help: "{ x, y, r? } target with optional tolerance radius. Set null to hide.",
      default: DEFAULT_GOAL,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "End-effector trajectory to target" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showWaypoints", label: "Waypoint dots", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Path color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1600, min: 0, max: 4000, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "reach-to-target",
      name: "Reach to target",
      props: {
        title: "End-effector trajectory to target",
        caption: "Planned path arcs around the workspace center and settles inside the goal tolerance.",
        showWaypoints: true,
        path: DEFAULT_PATH,
        goal: DEFAULT_GOAL,
      },
    },
    {
      id: "search-sweep",
      name: "Spiral search sweep",
      props: {
        title: "Coverage sweep until target detected",
        caption: "An expanding spiral search terminates the moment the target enters the sensor footprint.",
        showWaypoints: false,
        duration: 2400,
        path: SPIRAL,
        goal: { x: 0.5 + Math.cos(47 / 47 * Math.PI * 5.2) * (0.06 + 0.4), y: 0.5 + Math.sin(47 / 47 * Math.PI * 5.2) * (0.06 + 0.4) * 0.85, r: 0.08 },
      },
    },
  ],
};
