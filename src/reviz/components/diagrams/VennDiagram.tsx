"use client";

import { motion } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import {
  Figure,
  ResponsiveSvg,
  SoftShadow,
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

interface VennSet {
  label: string;
  color?: string;
}

interface VennValues {
  a?: number;
  b?: number;
  c?: number;
  ab?: number;
  ac?: number;
  bc?: number;
  abc?: number;
}

export interface VennDiagramProps {
  sets?: VennSet[];
  values?: VennValues;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

/** A single fillable region: an intersection of circles to keep, minus the rest. */
interface Region {
  /** Unique key, e.g. "a", "ab", "abc". */
  key: string;
  /** Indices of circles whose area we INTERSECT to form this region. */
  inside: number[];
  /** Display count. */
  value: number;
  /** Blended fill color. */
  color: string;
  /** Centroid for the count label. */
  label: { x: number; y: number };
  /** Human title for the tooltip (e.g. "Vision ∩ Language"). */
  title: string;
}

interface Circle {
  cx: number;
  cy: number;
  r: number;
  color: string;
  label: string;
  /** Anchor point for the outer set label. */
  labelAnchor: { x: number; y: number; align: "start" | "middle" | "end" };
}

export default function VennDiagram({
  sets = [
    { label: "Perception" },
    { label: "Reasoning" },
    { label: "Action" },
  ],
  values = { a: 38, b: 44, c: 31, ab: 22, ac: 14, bc: 18, abc: 12 },
  title = "",
  caption = "Capabilities shared across agent skills",
  source = "",
  duration = 1100,
}: VennDiagramProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<string | null>(null);

  const ids = useMemo(() => ({ shadow: uid("venn-shadow") }), []);

  const play = inView && !reduced;
  const dur = duration / 1000;

  // Two- or three-set diagram. Clamp to the supported range.
  const list = sets.length >= 3 ? sets.slice(0, 3) : sets.length === 2 ? sets : sets.length === 1 ? [sets[0], { label: "Set B" }] : [{ label: "Set A" }, { label: "Set B" }];
  const three = list.length >= 3;

  // Series-derived default colors so the diagram is fully themed; explicit
  // per-set colors override.
  const colors = list.map((s, i) => s.color || p.series[i % p.series.length]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg aspect={three ? 7 / 6 : 16 / 10} margin={{ top: 30, right: 30, bottom: 30, left: 30 }}>
          {({ inner, margin }) => {
            const w = inner.width;
            const h = inner.height;

            // ---- Geometry: place the circles. ----------------------------
            const circles: Circle[] = [];
            if (three) {
              // Equilateral arrangement around a center.
              const cx = w / 2;
              const cy = h / 2 + h * 0.04;
              const r = Math.min(w, h) * 0.3;
              const sep = r * 0.62; // distance from arrangement center to each circle center
              const pts = [
                { x: cx, y: cy - sep, align: "middle" as const, ly: -1 }, // top (A)
                { x: cx - sep * 0.92, y: cy + sep * 0.62, align: "end" as const, ly: 1 }, // bottom-left (B)
                { x: cx + sep * 0.92, y: cy + sep * 0.62, align: "start" as const, ly: 1 }, // bottom-right (C)
              ];
              pts.forEach((pt, i) => {
                // Top set sits above its circle; the two bottom sets are
                // labeled beside their outer edge (left / right) so the labels
                // stay inside the visible frame instead of clipping below.
                const labelAnchor =
                  pt.ly < 0
                    ? { x: pt.x, y: pt.y - r - 14, align: pt.align }
                    : {
                        x: pt.align === "end" ? pt.x - r - 6 : pt.x + r + 6,
                        y: pt.y + r * 0.62,
                        align: pt.align,
                      };
                circles.push({
                  cx: pt.x,
                  cy: pt.y,
                  r,
                  color: colors[i],
                  label: list[i].label,
                  labelAnchor,
                });
              });
            } else {
              const cy = h / 2;
              const r = Math.min(w / 2.7, h * 0.42);
              const overlap = r * 0.66;
              const cxA = w / 2 - overlap / 2;
              const cxB = w / 2 + overlap / 2;
              circles.push({
                cx: cxA,
                cy,
                r,
                color: colors[0],
                label: list[0].label,
                labelAnchor: { x: cxA - r * 0.55, y: cy - r - 12, align: "middle" },
              });
              circles.push({
                cx: cxB,
                cy,
                r,
                color: colors[1],
                label: list[1].label,
                labelAnchor: { x: cxB + r * 0.55, y: cy - r - 12, align: "middle" },
              });
            }

            // ---- Regions: which intersections to fill + label. -----------
            const regions: Region[] = [];
            const v = values;
            const lbl = (idx: number[]) => idx.map((i) => list[i].label).join(" ∩ ");

            if (three) {
              regions.push(
                { key: "a", inside: [0], value: v.a ?? 0, color: colors[0], label: centroidOnly(circles, 0), title: list[0].label },
                { key: "b", inside: [1], value: v.b ?? 0, color: colors[1], label: centroidOnly(circles, 1), title: list[1].label },
                { key: "c", inside: [2], value: v.c ?? 0, color: colors[2], label: centroidOnly(circles, 2), title: list[2].label },
                { key: "ab", inside: [0, 1], value: v.ab ?? 0, color: mix(colors[0], colors[1], 0.5), label: pairCentroid(circles, 0, 1, 2), title: lbl([0, 1]) },
                { key: "ac", inside: [0, 2], value: v.ac ?? 0, color: mix(colors[0], colors[2], 0.5), label: pairCentroid(circles, 0, 2, 1), title: lbl([0, 2]) },
                { key: "bc", inside: [1, 2], value: v.bc ?? 0, color: mix(colors[1], colors[2], 0.5), label: pairCentroid(circles, 1, 2, 0), title: lbl([1, 2]) },
                { key: "abc", inside: [0, 1, 2], value: v.abc ?? 0, color: mix(mix(colors[0], colors[1], 0.5), colors[2], 0.5), label: triCentroid(circles), title: lbl([0, 1, 2]) },
              );
            } else {
              const midY = circles[0].cy;
              regions.push(
                { key: "a", inside: [0], value: v.a ?? 0, color: colors[0], label: { x: circles[0].cx - circles[0].r * 0.42, y: midY }, title: list[0].label },
                { key: "b", inside: [1], value: v.b ?? 0, color: colors[1], label: { x: circles[1].cx + circles[1].r * 0.42, y: midY }, title: list[1].label },
                { key: "ab", inside: [0, 1], value: v.ab ?? 0, color: mix(colors[0], colors[1], 0.5), label: { x: (circles[0].cx + circles[1].cx) / 2, y: midY }, title: lbl([0, 1]) },
              );
            }

            const total = regions.reduce((s, r) => s + r.value, 0);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={ids.shadow} dy={5} blur={12} opacity={0.14} />
                  {/* A clip for each circle, used to compose intersection regions. */}
                  {circles.map((c, i) => (
                    <clipPath key={`clip-${i}`} id={`${ids.shadow}-clip-${i}`}>
                      <circle cx={c.cx} cy={c.cy} r={c.r} />
                    </clipPath>
                  ))}
                </defs>

                {/* Soft tinted disks (the base fills). */}
                {circles.map((c, i) => {
                  const delay = i * dur * 0.16;
                  return (
                    <motion.circle
                      key={`disk-${i}-${token}`}
                      cx={c.cx}
                      cy={c.cy}
                      r={c.r}
                      fill={withAlpha(c.color, 0.14)}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: play ? 1 : reduced ? 1 : 0,
                        opacity: play || reduced ? 1 : 0,
                      }}
                      transition={{ duration: dur * 0.62, delay, ease: [0.22, 1, 0.36, 1] }}
                      style={{ transformOrigin: `${c.cx}px ${c.cy}px` }}
                    />
                  );
                })}

                {/* Highlight overlay for the hovered region, built by nesting
                    clip paths so only the true intersection is painted. */}
                {regions.map((rg) => {
                  const active = hover === rg.key;
                  if (!active) return null;
                  return (
                    <RegionFill
                      key={`fill-${rg.key}`}
                      region={rg}
                      circles={circles}
                      clipBase={`${ids.shadow}-clip`}
                    />
                  );
                })}

                {/* Crisp circle outlines on top. */}
                {circles.map((c, i) => {
                  const delay = i * dur * 0.16;
                  const involved =
                    hover != null &&
                    regions.find((r) => r.key === hover)?.inside.includes(i);
                  const dim = hover != null && !involved;
                  return (
                    <motion.circle
                      key={`ring-${i}-${token}`}
                      cx={c.cx}
                      cy={c.cy}
                      r={c.r}
                      fill="none"
                      stroke={c.color}
                      strokeWidth={involved ? 2.2 : 1.6}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: play ? 1 : reduced ? 1 : 0,
                        opacity: play || reduced ? (dim ? 0.4 : 1) : 0,
                      }}
                      transition={{ duration: dur * 0.62, delay, ease: [0.22, 1, 0.36, 1] }}
                      style={{ transformOrigin: `${c.cx}px ${c.cy}px`, filter: `url(#${ids.shadow})` }}
                    />
                  );
                })}

                {/* Invisible hit areas for each region (top-to-bottom by
                    specificity: triple, then pairs, then singles). */}
                {[...regions]
                  .sort((a, b) => b.inside.length - a.inside.length)
                  .map((rg) => (
                    <RegionHit
                      key={`hit-${rg.key}`}
                      region={rg}
                      circles={circles}
                      clipBase={`${ids.shadow}-clip`}
                      onEnter={() => setHover(rg.key)}
                      onLeave={() => setHover(null)}
                    />
                  ))}

                {/* Region count labels. */}
                {regions.map((rg, i) => {
                  const active = hover === rg.key;
                  const dim = hover != null && !active;
                  const delay = dur * 0.5 + i * dur * 0.06;
                  return (
                    <motion.g
                      key={`count-${rg.key}-${token}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: play ? (dim ? 0.35 : 1) : reduced ? 1 : 0, y: play || reduced ? 0 : 4 }}
                      transition={{ duration: dur * 0.4, delay, ease: "easeOut" }}
                      style={{ pointerEvents: "none" }}
                    >
                      <text
                        x={rg.label.x}
                        y={rg.label.y}
                        textAnchor="middle"
                        dy="0.34em"
                        className="tabular-nums"
                        style={{ fontSize: active ? 17 : 14, fontWeight: 600, transition: "font-size 160ms" }}
                        fill={active ? mix(rg.color, p.ink, 0.35) : p.ink}
                      >
                        {formatCompact(rg.value)}
                      </text>
                    </motion.g>
                  );
                })}

                {/* Outer set labels. */}
                {circles.map((c, i) => {
                  const involved =
                    hover != null &&
                    regions.find((r) => r.key === hover)?.inside.includes(i);
                  const dim = hover != null && !involved;
                  const delay = dur * 0.45 + i * dur * 0.1;
                  return (
                    <motion.text
                      key={`setlabel-${i}-${token}`}
                      x={c.labelAnchor.x}
                      y={c.labelAnchor.y}
                      textAnchor={c.labelAnchor.align}
                      dy="0.32em"
                      className="font-mono uppercase tracking-label"
                      style={{ fontSize: 11, fontWeight: 600, pointerEvents: "none" }}
                      fill={dim ? p.inkFaint : mix(c.color, p.ink, 0.25)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                      transition={{ duration: dur * 0.4, delay, ease: "easeOut" }}
                    >
                      {c.label}
                    </motion.text>
                  );
                })}

                {/* Total badge, lower-right. */}
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                  transition={{ duration: dur * 0.4, delay: dur * 0.7 }}
                  style={{ pointerEvents: "none" }}
                >
                  <text
                    x={w}
                    y={h}
                    textAnchor="end"
                    className="font-mono uppercase tracking-label"
                    style={{ fontSize: 9.5 }}
                    fill={p.inkFaint}
                  >
                    {`n = ${formatCompact(total)}`}
                  </text>
                </motion.g>
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* Hover legend / tooltip pinned top-left so it never overlaps the art. */}
        <HoverChip hover={hover} sets={list} values={values} colors={colors} three={three} />

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
        >
          replay
        </button>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Region rendering helpers                                            */
/* ------------------------------------------------------------------ */

/** Paint a region by nesting one clip path per "inside" circle. */
function RegionFill({
  region,
  circles,
  clipBase,
}: {
  region: Region;
  circles: Circle[];
  clipBase: string;
}) {
  // Bounding box that comfortably covers all involved circles.
  const bb = boundingRect(region.inside.map((i) => circles[i]));
  return (
    <NestedClips inside={region.inside} clipBase={clipBase}>
      <motion.rect
        x={bb.x}
        y={bb.y}
        width={bb.w}
        height={bb.h}
        fill={withAlpha(region.color, region.inside.length >= 2 ? 0.5 : 0.36)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      />
    </NestedClips>
  );
}

/** Transparent hit-region using the same nested-clip technique. */
function RegionHit({
  region,
  circles,
  clipBase,
  onEnter,
  onLeave,
}: {
  region: Region;
  circles: Circle[];
  clipBase: string;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const bb = boundingRect(region.inside.map((i) => circles[i]));
  return (
    <NestedClips inside={region.inside} clipBase={clipBase}>
      <rect
        x={bb.x}
        y={bb.y}
        width={bb.w}
        height={bb.h}
        fill="transparent"
        style={{ cursor: "pointer" }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
    </NestedClips>
  );
}

/**
 * Wrap children in N nested <g clip-path> elements — one per circle that the
 * region must be INSIDE of. The intersection of all clips is exactly the
 * region. (For a pure pair like A∩B we'd also want to exclude C, but with the
 * standard 3-circle layout the A∩B "petal" the user expects is the pairwise
 * intersection; clicking the very center maps to A∩B∩C via specificity order.)
 */
function NestedClips({
  inside,
  clipBase,
  children,
}: {
  inside: number[];
  clipBase: string;
  children: ReactNode;
}) {
  return inside.reduce<ReactNode>(
    (acc, ci) => <g clipPath={`url(#${clipBase}-${ci})`}>{acc}</g>,
    children,
  );
}

function boundingRect(cs: Circle[]) {
  const minX = Math.min(...cs.map((c) => c.cx - c.r));
  const maxX = Math.max(...cs.map((c) => c.cx + c.r));
  const minY = Math.min(...cs.map((c) => c.cy - c.r));
  const maxY = Math.max(...cs.map((c) => c.cy + c.r));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Label spot for a single-set-only region (push outward, away from center). */
function centroidOnly(circles: Circle[], i: number) {
  const cx = circles.reduce((s, c) => s + c.cx, 0) / circles.length;
  const cy = circles.reduce((s, c) => s + c.cy, 0) / circles.length;
  const dx = circles[i].cx - cx;
  const dy = circles[i].cy - cy;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: circles[i].cx + (dx / len) * circles[i].r * 0.52,
    y: circles[i].cy + (dy / len) * circles[i].r * 0.52,
  };
}

/** Label spot for a pairwise lens (between i & j, pushed away from third k). */
function pairCentroid(circles: Circle[], i: number, j: number, k: number) {
  const mx = (circles[i].cx + circles[j].cx) / 2;
  const my = (circles[i].cy + circles[j].cy) / 2;
  const dx = mx - circles[k].cx;
  const dy = my - circles[k].cy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mx + (dx / len) * circles[i].r * 0.34, y: my + (dy / len) * circles[i].r * 0.34 };
}

/** Centroid of the triple intersection (arrangement center). */
function triCentroid(circles: Circle[]) {
  return {
    x: circles.reduce((s, c) => s + c.cx, 0) / circles.length,
    y: circles.reduce((s, c) => s + c.cy, 0) / circles.length,
  };
}

/* ------------------------------------------------------------------ */
/* Hover chip                                                          */
/* ------------------------------------------------------------------ */

function HoverChip({
  hover,
  sets,
  values,
  colors,
  three,
}: {
  hover: string | null;
  sets: VennSet[];
  values: VennValues;
  colors: string[];
  three: boolean;
}) {
  const p = usePalette();
  if (!hover) return null;

  const map: Record<string, { label: string; idx: number[] }> = three
    ? {
        a: { label: sets[0].label, idx: [0] },
        b: { label: sets[1].label, idx: [1] },
        c: { label: sets[2].label, idx: [2] },
        ab: { label: `${sets[0].label} ∩ ${sets[1].label}`, idx: [0, 1] },
        ac: { label: `${sets[0].label} ∩ ${sets[2].label}`, idx: [0, 2] },
        bc: { label: `${sets[1].label} ∩ ${sets[2].label}`, idx: [1, 2] },
        abc: { label: `${sets[0].label} ∩ ${sets[1].label} ∩ ${sets[2].label}`, idx: [0, 1, 2] },
      }
    : {
        a: { label: sets[0].label, idx: [0] },
        b: { label: sets[1].label, idx: [1] },
        ab: { label: `${sets[0].label} ∩ ${sets[1].label}`, idx: [0, 1] },
      };

  const entry = map[hover];
  if (!entry) return null;
  const val = (values as Record<string, number>)[hover] ?? 0;
  const swatch =
    entry.idx.length === 1
      ? colors[entry.idx[0]]
      : entry.idx.reduce((acc, i) => mix(acc, colors[i], 0.5), colors[entry.idx[0]]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      className="pointer-events-none absolute left-0 top-0 flex items-center gap-2 rounded-lg border border-border bg-surface/90 px-3 py-1.5 shadow-float-lg backdrop-blur-sm"
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: swatch }}
      />
      <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
        {entry.label}
      </span>
      <span className="font-semibold tabular-nums text-ink" style={{ color: p.ink }}>
        {formatCompact(val)}
      </span>
    </motion.div>
  );
}

export const meta: RevizMeta = {
  id: "venn-diagram",
  name: "Venn Diagram",
  category: "diagrams",
  description:
    "Two or three overlapping sets with blended overlap fills, per-region counts, and hover highlighting — the clean way to show shared capabilities or data.",
  tags: ["venn", "sets", "overlap", "intersection", "diagram", "capabilities"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "VennDiagram",
  sourcePath: "diagrams/VennDiagram",
  aspect: 7 / 6,
  controls: [
    {
      key: "sets",
      label: "Sets",
      type: "json",
      group: "Data",
      help: "Array of { label, color? }. Use 2 or 3 entries. color is optional and defaults to the theme series ramp.",
      default: [
        { label: "Perception" },
        { label: "Reasoning" },
        { label: "Action" },
      ],
    },
    {
      key: "values",
      label: "Region counts",
      type: "json",
      group: "Data",
      help: "Counts per region: a, b, c (only-this-set), ab, ac, bc (pairwise), abc (all three). Omit c/ac/bc/abc for a 2-set diagram.",
      default: { a: 38, b: 44, c: 31, ab: 22, ac: 14, bc: 18, abc: 12 },
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    {
      key: "caption",
      label: "Caption",
      type: "text",
      group: "Labels",
      default: "Capabilities shared across agent skills",
    },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1100,
      min: 0,
      max: 3000,
      step: 100,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "agent-capabilities",
      name: "Agent capabilities",
      props: {
        sets: [{ label: "Perception" }, { label: "Reasoning" }, { label: "Action" }],
        values: { a: 38, b: 44, c: 31, ab: 22, ac: 14, bc: 18, abc: 12 },
        caption: "Capabilities shared across agent skills",
      },
    },
    {
      id: "modalities",
      name: "Multimodal coverage",
      props: {
        sets: [{ label: "Vision" }, { label: "Language" }, { label: "Audio" }],
        values: { a: 1240, b: 2180, c: 640, ab: 920, ac: 210, bc: 380, abc: 540 },
        caption: "Training examples by modality coverage",
        source: "Internal pretraining mix",
      },
    },
    {
      id: "benchmark-overlap",
      name: "Benchmark error overlap",
      props: {
        sets: [{ label: "Model A" }, { label: "Model B" }],
        values: { a: 142, b: 167, ab: 308 },
        caption: "Shared vs. unique failure cases on Knowledge-bench",
      },
    },
  ],
};
