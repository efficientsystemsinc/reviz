"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  polarToCartesian,
  round,
  uid,
  useInView,
  useMeasure,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface RadarSeries {
  name: string;
  values: number[];
  color?: string;
}

const DEFAULT_AXES = [
  "Reasoning",
  "Coding",
  "Math",
  "Knowledge",
  "Instruction",
  "Safety",
];

const DEFAULT_SERIES: RadarSeries[] = [
  { name: "GPT-class", values: [88, 84, 79, 91, 86, 82] },
  { name: "Open 70B", values: [74, 81, 68, 77, 72, 75] },
];

const TICK_FONT = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.04em",
} as const;

export interface RadarChartProps {
  axes?: string[];
  series?: RadarSeries[];
  title?: string;
  caption?: string;
  source?: string;
  max?: number;
  showGrid?: boolean;
  color?: string;
  duration?: number;
}

export default function RadarChart({
  axes = DEFAULT_AXES,
  series = DEFAULT_SERIES,
  title = "Model capability profile",
  caption = "",
  source = "",
  max = 100,
  showGrid = true,
  color = "",
  duration = 1100,
}: RadarChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const [measureRef, { width: containerW }] = useMeasure<HTMLDivElement>();
  const { token, replay } = useReplay();
  // Which axis spoke is hovered (drives the value readout + emphasis).
  const [hoverAxis, setHoverAxis] = useState<number | null>(null);
  const gid = useMemo(() => uid("radar"), []);

  const n = Math.max(3, axes.length);
  const safeMax = max > 0 ? max : 1;

  // First series can be overridden by the `color` prop; the rest pull from the
  // palette series ramp so a theme swap recolors everything.
  const colorOf = (i: number) =>
    i === 0 && color ? color : series[i]?.color || p.series[i % p.series.length];

  const legendItems: LegendItem[] = series.map((s, i) => ({
    label: s.name,
    color: colorOf(i),
    shape: "square",
  }));

  // Concentric ring fractions (0..1 of the radius).
  const rings = [0.25, 0.5, 0.75, 1];

  // Angle (deg, clockwise from top) for axis `i`.
  const angleAt = (i: number) => (360 / n) * i;

  const draw = reduced ? 1 : inView ? 1 : 0;
  const dur = duration / 1000;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div
        ref={(el) => {
          ref.current = el;
          measureRef.current = el;
        }}
        className="relative"
      >
        {series.length > 1 && <Legend items={legendItems} align="center" className="mb-5" />}

        <ResponsiveSvg aspect={4 / 3} margin={{ top: 42, right: 30, bottom: 30, left: 30 }}>
          {({ inner }) => {
            const cx = inner.width / 2;
            const cy = inner.height / 2;
            // Leave headroom for the outermost labels (a little extra up top so the
            // topmost rim label clears the legend row sitting above the SVG).
            const radius = Math.min(inner.width, inner.height) / 2 - 14;

            // Cartesian point for a given axis index at a normalized value 0..1.
            const point = (i: number, t: number) =>
              polarToCartesian(cx, cy, radius * Math.max(0, Math.min(1, t)), angleAt(i));

            // Build a closed polygon path for one series at fraction f (0..1)
            // of its true shape — used to scale-in from the center.
            const polygonPath = (vals: number[], f: number) => {
              if (vals.length === 0) return "";
              let d = "";
              for (let i = 0; i < n; i++) {
                const v = Number.isFinite(vals[i]) ? vals[i] : 0;
                const pt = point(i, (v / safeMax) * f);
                d += `${i === 0 ? "M" : "L"}${round(pt.x, 2)},${round(pt.y, 2)}`;
              }
              return `${d}Z`;
            };

            return (
              <g>
                {/* Concentric grid rings + radial spokes. */}
                {showGrid && (
                  <g>
                    {rings.map((rf, ri) => {
                      let d = "";
                      for (let i = 0; i < n; i++) {
                        const pt = point(i, rf);
                        d += `${i === 0 ? "M" : "L"}${round(pt.x, 2)},${round(pt.y, 2)}`;
                      }
                      d += "Z";
                      return (
                        <motion.path
                          key={`ring-${ri}-${token}`}
                          d={d}
                          fill={ri === rings.length - 1 ? withAlpha(p.grid, 0.18) : "none"}
                          stroke={p.grid}
                          strokeWidth={1}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: draw ? 1 : 0, scale: draw ? 1 : 0.85 }}
                          transition={{
                            duration: reduced ? 0 : dur * 0.5,
                            delay: reduced ? 0 : ri * 0.05,
                            ease: "easeOut",
                          }}
                          style={{ transformOrigin: `${cx}px ${cy}px` }}
                        />
                      );
                    })}

                    {/* Radial axis spokes. */}
                    {axes.map((_, i) => {
                      const outer = point(i, 1);
                      return (
                        <motion.line
                          key={`spoke-${i}-${token}`}
                          x1={cx}
                          y1={cy}
                          x2={outer.x}
                          y2={outer.y}
                          stroke={hoverAxis === i ? p.borderStrong : p.grid}
                          strokeWidth={1}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: draw ? 1 : 0 }}
                          transition={{
                            duration: reduced ? 0 : dur * 0.4,
                            delay: reduced ? 0 : 0.1 + i * 0.03,
                          }}
                        />
                      );
                    })}
                  </g>
                )}

                {/* Series polygons: scale-in from the center to full shape. */}
                {series.map((s, i) => {
                  const stroke = colorOf(i);
                  const dimmed = hoverAxis != null;
                  return (
                    <motion.path
                      key={`poly-${i}-${token}`}
                      fill={withAlpha(stroke, 0.16)}
                      stroke={stroke}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      initial={{ d: polygonPath(s.values, 0), opacity: 0 }}
                      animate={{
                        d: polygonPath(s.values, draw),
                        opacity: draw ? (dimmed ? 0.82 : 1) : 0,
                      }}
                      transition={{
                        d: {
                          duration: reduced ? 0 : dur,
                          delay: reduced ? 0 : 0.18 + i * 0.12,
                          ease: [0.22, 1, 0.36, 1],
                        },
                        opacity: { duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.18 + i * 0.12 },
                      }}
                    />
                  );
                })}

                {/* Vertices: small dots, emphasized on the hovered axis. */}
                {series.map((s, i) =>
                  axes.map((_, j) => {
                    const v = Number.isFinite(s.values[j]) ? s.values[j] : 0;
                    const pt = point(j, (v / safeMax) * draw);
                    const active = hoverAxis === j;
                    return (
                      <motion.circle
                        key={`vtx-${i}-${j}-${token}`}
                        cx={pt.x}
                        cy={pt.y}
                        r={active ? 4 : 2.6}
                        fill={p.surface}
                        stroke={colorOf(i)}
                        strokeWidth={1.6}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? 1 : 0 }}
                        transition={{
                          duration: reduced ? 0 : 0.3,
                          delay: reduced ? 0 : 0.18 + i * 0.12 + dur * 0.7,
                        }}
                        style={{ transition: "r 140ms ease" }}
                      />
                    );
                  }),
                )}

                {/* Axis labels around the rim + hover capture wedges. */}
                {axes.map((label, i) => {
                  const lp = polarToCartesian(cx, cy, radius + 16, angleAt(i));
                  const cos = Math.cos(((angleAt(i) - 90) * Math.PI) / 180);
                  const anchor: "start" | "middle" | "end" =
                    Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end";
                  const active = hoverAxis === i;
                  // Triangular hover wedge spanning this axis sector.
                  const a0 = polarToCartesian(cx, cy, radius, angleAt(i) - 180 / n);
                  const a1 = polarToCartesian(cx, cy, radius, angleAt(i) + 180 / n);
                  return (
                    <g key={`axis-${i}`}>
                      <motion.text
                        x={lp.x}
                        y={lp.y}
                        dy="0.32em"
                        textAnchor={anchor}
                        fill={active ? p.ink : p.inkMuted}
                        style={{ ...TICK_FONT, textTransform: "uppercase" }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? 1 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : 0.3 + i * 0.04 }}
                      >
                        {label}
                      </motion.text>
                      <path
                        d={`M${cx},${cy}L${round(a0.x, 2)},${round(a0.y, 2)}L${round(a1.x, 2)},${round(a1.y, 2)}Z`}
                        fill="transparent"
                        onMouseEnter={() => setHoverAxis(i)}
                        onMouseLeave={() => setHoverAxis(null)}
                      />
                    </g>
                  );
                })}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={containerW / 2} y={26} visible={hoverAxis != null} align="center">
          {hoverAxis != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {axes[hoverAxis]}
              </div>
              {series.map((s, i) => {
                const v = s.values[hoverAxis];
                if (!Number.isFinite(v)) return null;
                return (
                  <div key={s.name} className="flex items-baseline justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                      <span
                        className="inline-block h-2 w-2 rounded-[2px] align-middle"
                        style={{ background: colorOf(i) }}
                      />
                      {s.name}
                    </span>
                    <span className="font-medium tabular-nums">{round(v, 1)}</span>
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
  id: "radar-chart",
  name: "Radar Chart",
  category: "charts",
  description:
    "A spider/radar chart that compares multiple series across N axes with semi-transparent polygon fills, concentric grid rings, and a per-axis hover readout. Polygons scale in from the center.",
  tags: ["radar", "spider", "profile", "comparison", "multivariate"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "RadarChart",
  sourcePath: "charts/RadarChart",
  aspect: 4 / 3,
  controls: [
    {
      key: "axes",
      label: "Axes",
      type: "json",
      group: "Data",
      default: DEFAULT_AXES,
    },
    {
      key: "series",
      label: "Series",
      type: "json",
      group: "Data",
      default: DEFAULT_SERIES,
    },
    { key: "max", label: "Scale max", type: "number", group: "Data", default: 100, min: 1, max: 1000, step: 1 },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Model capability profile" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showGrid", label: "Grid rings", type: "boolean", group: "Layout", default: true },
    { key: "color", label: "First series color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "capability-profile",
      name: "Capability profile",
      props: {
        title: "Model capability profile",
        axes: DEFAULT_AXES,
        series: DEFAULT_SERIES,
        max: 100,
        caption: "Two frontier models scored 0–100 across six capability dimensions.",
      },
    },
    {
      id: "agent-skills",
      name: "Agent skills",
      props: {
        title: "Embodied agent skill mix",
        axes: ["Perception", "Planning", "Control", "Memory", "Grasping", "Recovery"],
        series: [
          { name: "Baseline", values: [62, 55, 48, 41, 58, 39] },
          { name: "+ World model", values: [78, 81, 72, 69, 74, 66] },
        ],
        max: 100,
        showGrid: true,
      },
    },
  ],
};
