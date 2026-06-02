"use client";

import { arc as d3arc } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Glow,
  Legend,
  ResponsiveSvg,
  TooltipRow,
  clamp,
  formatCompact,
  mix,
  polarToCartesian,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useProgress,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ChordDiagramProps {
  labels: string[];
  matrix: number[][];
  colors?: string[];
  title?: string;
  caption?: string;
  source?: string;
  innerRadius?: number;
  arcWidth?: number;
  padAngle?: number;
  ribbonOpacity?: number;
  showLegend?: boolean;
  showValues?: boolean;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults — modality routing between agent subsystems                */
/* ------------------------------------------------------------------ */

const DEFAULT_LABELS = ["Vision", "Language", "Planner", "Memory", "Control"];

// Square flow matrix: matrix[i][j] = flow from group i → group j (messages/s).
const DEFAULT_MATRIX: number[][] = [
  [0, 142, 88, 34, 12],
  [96, 0, 124, 72, 40],
  [54, 110, 0, 46, 168],
  [28, 64, 38, 0, 22],
  [10, 36, 152, 18, 0],
];

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Chord layout — arcs + ribbons computed from the matrix             */
/* ------------------------------------------------------------------ */

interface GroupArc {
  index: number;
  startAngle: number; // radians, 0 = up (clockwise)
  endAngle: number;
  value: number; // total throughput (out + in to other groups)
}

interface SubGroup {
  startAngle: number;
  endAngle: number;
}

interface Ribbon {
  key: string;
  source: number;
  target: number;
  value: number; // combined flow on this connection
  /** Source-side angular band (at source group's arc). */
  s: SubGroup;
  /** Target-side angular band (at target group's arc). */
  t: SubGroup;
}

/**
 * Build a symmetric-ribbon chord layout. Each group's arc length is
 * proportional to its total interaction (outgoing + incoming with others).
 * Each undirected pair {i,j} gets ONE ribbon whose two ends are sized by the
 * directed flows m[i][j] and m[j][i] respectively.
 */
function buildLayout(matrix: number[][], n: number, padAngle: number) {
  const m = (i: number, j: number) => Math.max(0, matrix[i]?.[j] ?? 0);

  // Per-group total: all flow touching the group except self-loops.
  const totals: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      s += m(i, j) + m(j, i);
    }
    totals.push(s);
  }
  const grand = totals.reduce((a, b) => a + b, 0) || 1;

  const totalPad = padAngle * n;
  const usable = Math.max(0, TAU - totalPad);

  const groups: GroupArc[] = [];
  // Per group, the running angle for laying out its sub-bands.
  const cursor: number[] = [];
  let angle = 0;
  for (let i = 0; i < n; i++) {
    const span = (totals[i] / grand) * usable;
    const start = angle + padAngle / 2;
    const end = start + span;
    groups.push({ index: i, startAngle: start, endAngle: end, value: totals[i] });
    cursor[i] = start;
    angle = end + padAngle / 2;
  }

  // Within each group's arc, sub-bands are ordered by partner index so that
  // both ends of a ribbon are deterministic and stable.
  // For group i, allocate a band for each j (including self) sized by m(i,j).
  const bandFor = new Map<string, SubGroup>();
  for (let i = 0; i < n; i++) {
    const groupSpan = groups[i].endAngle - groups[i].startAngle;
    for (let j = 0; j < n; j++) {
      // outgoing band i→j plus the incoming reflection lives in i's arc;
      // we represent the connection {i,j} on i's side with m(i,j)+m(j,i)/... :
      // to keep arcs tidy, i's side band for partner j is sized by
      // (m[i][j] + m[j][i]) which makes both ends symmetric and visually clean.
      const w = i === j ? 0 : m(i, j) + m(j, i);
      const frac = totals[i] > 0 ? w / totals[i] : 0;
      const s = cursor[i];
      const e = s + frac * groupSpan;
      bandFor.set(`${i}:${j}`, { startAngle: s, endAngle: e });
      cursor[i] = e;
    }
  }

  // One ribbon per unordered pair i<j with any flow.
  const ribbons: Ribbon[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const flow = m(i, j) + m(j, i);
      if (flow <= 0) continue;
      const s = bandFor.get(`${i}:${j}`)!;
      const t = bandFor.get(`${j}:${i}`)!;
      ribbons.push({ key: `${i}-${j}`, source: i, target: j, value: flow, s, t });
    }
  }

  return { groups, ribbons, grand };
}

/** Quadratic-ish ribbon path connecting two angular bands through the centre. */
function ribbonPath(r: number, s: SubGroup, t: SubGroup): string {
  const deg = (a: number) => (a * 180) / Math.PI;
  const a0 = polarToCartesian(0, 0, r, deg(s.startAngle));
  const a1 = polarToCartesian(0, 0, r, deg(s.endAngle));
  const b0 = polarToCartesian(0, 0, r, deg(t.startAngle));
  const b1 = polarToCartesian(0, 0, r, deg(t.endAngle));

  // Pull control points toward the centre for the classic chord curve.
  return [
    `M${a0.x},${a0.y}`,
    `A${r},${r} 0 0,1 ${a1.x},${a1.y}`, // outer arc along source band
    `Q0,0 ${b0.x},${b0.y}`, // curve through centre to target band start
    `A${r},${r} 0 0,1 ${b1.x},${b1.y}`, // outer arc along target band
    `Q0,0 ${a0.x},${a0.y}`, // curve back through centre
    "Z",
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function ChordDiagram({
  labels = DEFAULT_LABELS,
  matrix = DEFAULT_MATRIX,
  colors = [],
  title = "Inter-module message flow",
  caption = "",
  source = "",
  innerRadius = 0.74,
  arcWidth = 14,
  padAngle = 0.06,
  ribbonOpacity = 0.62,
  showLegend = true,
  showValues = true,
  duration = 1300,
}: ChordDiagramProps) {
  const p = usePalette();
  const ramp = colors.length ? colors : p.series;
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<
    | { kind: "arc"; i: number; x: number; y: number }
    | { kind: "ribbon"; key: string; x: number; y: number }
    | null
  >(null);

  const glowId = useMemo(() => uid("chord-glow"), []);

  const n = Math.min(labels.length, matrix.length);

  const colorFor = (i: number) => ramp[i % ramp.length];

  const layout = useMemo(
    () => buildLayout(matrix, n, clamp(padAngle, 0, 0.4)),
    [matrix, n, padAngle],
  );

  const sweep = useProgress({ duration, enabled: inView, trigger: token });

  // The focused group: hovered arc, hovered ribbon endpoint, else none.
  const focus = useMemo(() => {
    if (!hover) return null;
    if (hover.kind === "arc") return new Set([hover.i]);
    const rb = layout.ribbons.find((r) => r.key === hover.key);
    return rb ? new Set([rb.source, rb.target]) : null;
  }, [hover, layout.ribbons]);

  const ribbonActive = (rb: Ribbon) =>
    !focus || focus.has(rb.source) || focus.has(rb.target);

  const legendItems: LegendItem[] = labels.slice(0, n).map((label, i) => ({
    label,
    color: colorFor(i),
    shape: "circle",
  }));

  const groupTotal = (i: number) => layout.groups[i]?.value ?? 0;

  // Entrance progress drives a wrapper fade/scale only — never the geometry,
  // so the diagram is always full-size in its final (static) state even if the
  // rAF-driven sweep has not advanced. `inView` forces it visible.
  const reveal = reduced || !inView ? 1 : sweep;
  // Ease the ring in: scale up subtly and fade. Final state = full + opaque.
  const ringScale = 0.94 + 0.06 * reveal;
  const ringOpacity = inView ? Math.min(1, 0.15 + reveal * 0.85) : 0;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg aspect={1} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
          {({ inner, margin }) => {
            const cx = inner.width / 2;
            const cy = inner.height / 2;
            // Reserve room around the ring for labels (group name + value
            // sit outside the arc, so leave generous breathing room or the
            // ring/labels collide with the canvas edge).
            const labelPad = 56;
            const outer = clamp(Math.min(inner.width, inner.height) / 2 - labelPad, 30, 1000);
            const aw = clamp(arcWidth, 4, outer * 0.4);
            const arcOuter = outer;
            const arcInner = Math.max(outer * clamp(innerRadius, 0.4, 0.95), arcOuter - aw);
            const ribbonR = arcInner - 1;

            const arcGen = d3arc<GroupArc>()
              .innerRadius(arcInner)
              .outerRadius(arcOuter)
              .startAngle((d) => d.startAngle)
              .endAngle((d) => d.endAngle)
              .padAngle(0)
              .cornerRadius(Math.min(3, aw / 3));

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <Glow id={glowId} blur={5} />
                </defs>

                <g transform={`translate(${cx}, ${cy})`}>
                  {/* Faint track behind the arc ring for a finished look. */}
                  <circle
                    r={(arcInner + arcOuter) / 2}
                    fill="none"
                    stroke={withAlpha(p.inkFaint, 0.18)}
                    strokeWidth={arcOuter - arcInner}
                  />

                  {/* Everything below fades/scales in as one ring; geometry is
                      always full-size so the final static state is complete. */}
                  <motion.g
                    initial={false}
                    animate={{ opacity: ringOpacity, scale: ringScale }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    style={{ transformOrigin: "0px 0px" }}
                  >
                  {/* Ribbons (drawn under the arcs). */}
                  <g style={{ mixBlendMode: p.mode === "dark" ? "screen" : "multiply" }}>
                    {layout.ribbons.map((rb) => {
                      const active = ribbonActive(rb);
                      const isHot = hover?.kind === "ribbon" && hover.key === rb.key;
                      // Ribbon color leans toward its source endpoint (rather
                      // than a 50/50 blend that desaturates to muddy grey-brown)
                      // so individual flows keep a distinguishable hue.
                      const fill = mix(colorFor(rb.source), colorFor(rb.target), 0.3);
                      const d = ribbonPath(ribbonR, rb.s, rb.t);
                      const op =
                        (isHot ? Math.min(1, ribbonOpacity + 0.28) : ribbonOpacity) *
                        (active ? 1 : 0.12);
                      return (
                        <motion.path
                          key={`${token}-${rb.key}`}
                          d={d}
                          fill={fill}
                          stroke={withAlpha(mix(fill, p.ink, 0.25), active ? 0.5 : 0.15)}
                          strokeWidth={0.6}
                          initial={false}
                          animate={{ opacity: op }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          style={{ cursor: "pointer" }}
                          onMouseMove={(e) => {
                            const r = (
                              e.currentTarget.ownerSVGElement as SVGSVGElement
                            ).getBoundingClientRect();
                            setHover({
                              kind: "ribbon",
                              key: rb.key,
                              x: e.clientX - r.left,
                              y: e.clientY - r.top,
                            });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                      );
                    })}
                  </g>

                  {/* Group arcs. */}
                  <g>
                    {layout.groups.map((g) => {
                      const i = g.index;
                      const active = !focus || focus.has(i);
                      const fill = colorFor(i);
                      const path = arcGen(g) ?? undefined;
                      return (
                        <path
                          key={`arc-${i}`}
                          d={path}
                          fill={active ? fill : withAlpha(fill, 0.3)}
                          stroke={p.canvas}
                          strokeWidth={1.25}
                          filter={
                            hover?.kind === "arc" && hover.i === i ? `url(#${glowId})` : undefined
                          }
                          style={{
                            transition: "fill 200ms ease",
                            cursor: "pointer",
                          }}
                          onMouseMove={(e) => {
                            const r = (
                              e.currentTarget.ownerSVGElement as SVGSVGElement
                            ).getBoundingClientRect();
                            setHover({
                              kind: "arc",
                              i,
                              x: e.clientX - r.left,
                              y: e.clientY - r.top,
                            });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                      );
                    })}
                  </g>
                  </motion.g>

                  {/* Labels around the ring. */}
                  <g style={{ pointerEvents: "none" }}>
                    {layout.groups.map((g) => {
                      const i = g.index;
                      if (g.endAngle - g.startAngle < 0.001) return null;
                      const active = !focus || focus.has(i);
                      const mid = (g.startAngle + g.endAngle) / 2;
                      const deg = (mid * 180) / Math.PI;
                      const lp = polarToCartesian(0, 0, arcOuter + 12, deg);
                      // Right half → anchor start; left half → anchor end.
                      const onRight = Math.sin(mid) >= 0;
                      return (
                        <motion.g
                          key={`lbl-${i}`}
                          initial={false}
                          animate={{ opacity: inView ? (active ? 1 : 0.35) : 0 }}
                          transition={{ duration: 0.25, delay: reduced ? 0 : 0.3 }}
                        >
                          <text
                            x={lp.x}
                            y={lp.y}
                            dy={showValues ? "0em" : "0.32em"}
                            textAnchor={onRight ? "start" : "end"}
                            className="font-mono uppercase"
                            fontSize={10.5}
                            letterSpacing={0.4}
                            fill={active ? p.ink : p.inkMuted}
                          >
                            {labels[i]}
                          </text>
                          {showValues && (
                            <text
                              x={lp.x}
                              y={lp.y + 11}
                              textAnchor={onRight ? "start" : "end"}
                              className="font-mono tabular-nums"
                              fontSize={9}
                              fill={active ? p.inkMuted : p.inkFaint}
                            >
                              {formatCompact(groupTotal(i))}
                            </text>
                          )}
                        </motion.g>
                      );
                    })}
                  </g>

                  {/* Center readout. A soft surface disc sits behind it so the
                      value stays legible over the overlapping ribbons. */}
                  <g style={{ pointerEvents: "none" }}>
                    <circle
                      r={clamp(arcInner * 0.6, 26, 80)}
                      fill={withAlpha(p.surface, 0.82)}
                    />
                    <text
                      textAnchor="middle"
                      y={-5}
                      className="font-mono uppercase"
                      fontSize={9}
                      letterSpacing={0.6}
                      fill={p.inkFaint}
                    >
                      Total flow
                    </text>
                    <text
                      textAnchor="middle"
                      y={16}
                      className="font-sans tabular-nums"
                      fontSize={clamp(arcInner * 0.34, 16, 30)}
                      fontWeight={600}
                      fill={p.ink}
                    >
                      {formatCompact(layout.grand / 2)}
                    </text>
                  </g>
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover?.kind === "arc" &&
            (() => {
              const i = hover.i;
              let out = 0;
              let inc = 0;
              for (let j = 0; j < n; j++) {
                if (j === i) continue;
                out += Math.max(0, matrix[i]?.[j] ?? 0);
                inc += Math.max(0, matrix[j]?.[i] ?? 0);
              }
              return (
                <>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: colorFor(i) }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-wide opacity-80">
                      {labels[i]}
                    </span>
                  </div>
                  <TooltipRow label="outgoing" value={formatCompact(out, 2)} />
                  <TooltipRow label="incoming" value={formatCompact(inc, 2)} />
                  <TooltipRow label="total" value={formatCompact(out + inc, 2)} />
                </>
              );
            })()}
          {hover?.kind === "ribbon" &&
            (() => {
              const rb = layout.ribbons.find((r) => r.key === hover.key);
              if (!rb) return null;
              const ab = Math.max(0, matrix[rb.source]?.[rb.target] ?? 0);
              const ba = Math.max(0, matrix[rb.target]?.[rb.source] ?? 0);
              return (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {labels[rb.source]} {"⇄"} {labels[rb.target]}
                  </div>
                  <TooltipRow
                    label={`${labels[rb.source]} → ${labels[rb.target]}`}
                    value={formatCompact(ab, 2)}
                  />
                  <TooltipRow
                    label={`${labels[rb.target]} → ${labels[rb.source]}`}
                    value={formatCompact(ba, 2)}
                  />
                  <TooltipRow label="combined" value={formatCompact(rb.value, 2)} />
                </>
              );
            })()}
        </FloatingTooltip>

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
        >
          replay
        </button>
      </div>

      {showLegend && <Legend items={legendItems} align="center" className="mt-2" />}
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "chord-diagram",
  name: "Chord Diagram",
  category: "trees-graphs",
  description:
    "A circular chord diagram where arcs sized by total throughput ring the edge and gradient ribbons curve through the centre to reveal pairwise flows between groups — hover any group to isolate its connections.",
  tags: ["chord", "flow", "network", "matrix", "relationship", "graph", "circular"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ChordDiagram",
  sourcePath: "trees-graphs/ChordDiagram",
  aspect: 1,
  controls: [
    {
      key: "labels",
      label: "Group labels",
      type: "json",
      group: "Data",
      help: "Array of group names; one per row/column of the matrix.",
      default: DEFAULT_LABELS,
    },
    {
      key: "matrix",
      label: "Flow matrix",
      type: "matrix",
      group: "Data",
      help: "Square matrix where cell [i][j] is the flow from group i to group j.",
      default: DEFAULT_MATRIX,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Inter-module message flow" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showValues", label: "Show group totals", type: "boolean", group: "Labels", default: true },
    { key: "showLegend", label: "Show legend", type: "boolean", group: "Labels", default: true },
    {
      key: "innerRadius",
      label: "Ring radius",
      type: "number",
      group: "Layout",
      default: 0.74,
      min: 0.4,
      max: 0.95,
      step: 0.02,
    },
    {
      key: "arcWidth",
      label: "Arc width",
      type: "number",
      group: "Layout",
      default: 14,
      min: 4,
      max: 40,
      step: 1,
      unit: "px",
    },
    {
      key: "padAngle",
      label: "Group gap",
      type: "number",
      group: "Layout",
      default: 0.06,
      min: 0,
      max: 0.2,
      step: 0.01,
    },
    { key: "colors", label: "Group colors", type: "colorArray", group: "Style", default: [] },
    {
      key: "ribbonOpacity",
      label: "Ribbon opacity",
      type: "number",
      group: "Style",
      default: 0.62,
      min: 0.15,
      max: 0.95,
      step: 0.02,
    },
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
      id: "agent-modules",
      name: "Agent modules",
      props: {
        title: "Inter-module message flow",
        caption: "Arc length is total throughput; each ribbon's ends scale with the directed flow.",
        labels: DEFAULT_LABELS,
        matrix: DEFAULT_MATRIX,
      },
    },
    {
      id: "token-routing",
      name: "MoE expert routing",
      props: {
        title: "Token routing between experts",
        source: "Switch-MoE, 8k tokens",
        arcWidth: 18,
        ribbonOpacity: 0.55,
        labels: ["Expert A", "Expert B", "Expert C", "Expert D", "Expert E"],
        matrix: [
          [0, 240, 86, 130, 44],
          [210, 0, 158, 60, 92],
          [74, 168, 0, 96, 188],
          [122, 52, 104, 0, 70],
          [38, 84, 196, 66, 0],
        ],
      },
    },
    {
      id: "lab-collab",
      name: "Lab collaboration",
      props: {
        title: "Co-authorship across research areas",
        caption: "Joint papers between five subfields over five years.",
        innerRadius: 0.78,
        arcWidth: 12,
        padAngle: 0.08,
        labels: ["Vision", "NLP", "RL", "Theory", "Systems"],
        matrix: [
          [0, 58, 22, 14, 31],
          [58, 0, 40, 26, 19],
          [22, 40, 0, 33, 27],
          [14, 26, 33, 0, 11],
          [31, 19, 27, 11, 0],
        ],
      },
    },
  ],
};
