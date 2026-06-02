"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Figure,
  FloatingTooltip,
  GridLines,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  clamp,
  mapRange,
  mix,
  usePalette,
  useInView,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ClusterNode {
  /** Leaf label (ignored on internal nodes). */
  label?: string;
  /** Merge distance at which the children fuse. Leaves omit this (0). */
  height?: number;
  children?: ClusterNode[];
}

/** Internal laid-out node. */
interface LaidNode {
  node: ClusterNode;
  /** Position along the leaf axis, in slot units (0..leafCount-1). */
  pos: number;
  /** Merge height (0 for leaves). */
  height: number;
  isLeaf: boolean;
  children: LaidNode[];
  /** Stable index in flattened, draw-ordered array. */
  index: number;
  /** Cluster id when this subtree is entirely below the color cut. */
  clusterId: number;
  /** Resolved pixel coordinates. */
  px: number;
  py: number;
}

export interface DendrogramProps {
  tree?: ClusterNode;
  orientation?: "bottom-up" | "left-right";
  colorThreshold?: number;
  showThreshold?: boolean;
  color?: string;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Default data — hierarchical clustering of 8 ML embedding clusters   */
/* ------------------------------------------------------------------ */

const DEFAULT_TREE: ClusterNode = {
  height: 0.92,
  children: [
    {
      height: 0.58,
      children: [
        {
          height: 0.26,
          children: [
            { label: "Orion-50" },
            { label: "Iris-B/16" },
          ],
        },
        {
          height: 0.34,
          children: [
            { label: "Halo-T" },
            {
              height: 0.15,
              children: [{ label: "Vega-E" }, { label: "Vega-Y" }],
            },
          ],
        },
      ],
    },
    {
      height: 0.41,
      children: [
        {
          height: 0.19,
          children: [{ label: "Nova-base" }, { label: "Nova-R" }],
        },
        { label: "Atlas-2" },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/**
 * Flatten the tree depth-first. Leaves are assigned sequential positions along
 * the leaf axis; internal nodes sit at the midpoint of their two outermost
 * children. Returns nodes in child-before-parent order so brackets draw
 * bottom-up. Also tags each subtree fully below `cut` with a cluster id.
 */
function layout(
  root: ClusterNode,
  cut: number,
): { nodes: LaidNode[]; leafCount: number; maxHeight: number; clusterCount: number } {
  const nodes: LaidNode[] = [];
  let leafCursor = 0;
  let maxHeight = 0;

  function walk(node: ClusterNode): LaidNode {
    const children = node.children ?? [];
    const isLeaf = children.length === 0;
    const height = isLeaf ? 0 : node.height ?? 0;
    maxHeight = Math.max(maxHeight, height);

    let pos: number;
    const laidKids: LaidNode[] = [];
    if (isLeaf) {
      pos = leafCursor;
      leafCursor += 1;
    } else {
      for (const c of children) laidKids.push(walk(c));
      pos = (laidKids[0].pos + laidKids[laidKids.length - 1].pos) / 2;
    }

    const laid: LaidNode = {
      node,
      pos,
      height,
      isLeaf,
      children: laidKids,
      index: nodes.length,
      clusterId: -1,
      px: 0,
      py: 0,
    };
    nodes.push(laid);
    return laid;
  }

  walk(root);

  // Assign cluster ids: the highest subtree whose merge height is <= cut and
  // whose parent's height is > cut forms one colored cluster.
  let clusterCount = 0;
  function tag(n: LaidNode, inherited: number) {
    let id = inherited;
    if (id < 0 && (n.isLeaf || n.height <= cut)) {
      id = clusterCount;
      clusterCount += 1;
    }
    n.clusterId = id;
    for (const c of n.children) tag(c, id);
  }
  // Root carries inherited = -1; if the whole tree is below the cut it becomes
  // a single cluster, otherwise descend until a subtree fits under the cut.
  if (nodes.length) {
    const rootNode = nodes[nodes.length - 1];
    tag(rootNode, -1);
  }

  return { nodes, leafCount: Math.max(1, leafCursor), maxHeight, clusterCount };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function Dendrogram({
  tree = DEFAULT_TREE,
  orientation = "bottom-up",
  colorThreshold = 0.45,
  showThreshold = true,
  color = "",
  title = "",
  caption = "",
  source = "",
  duration = 1200,
}: DendrogramProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const horizontal = orientation === "left-right";

  const { nodes, leafCount, maxHeight, clusterCount } = useMemo(
    () => layout(tree, colorThreshold),
    [tree, colorThreshold],
  );

  // Domain top with a little headroom above the root merge.
  const heightTop = useMemo(() => {
    const t = maxHeight > 0 ? maxHeight * 1.08 : 1;
    return Math.max(t, colorThreshold * 1.08);
  }, [maxHeight, colorThreshold]);

  const palette = useMemo(() => {
    if (clusterCount <= 1) return [accent];
    return Array.from({ length: clusterCount }, (_, i) =>
      clusterCount <= p.series.length ? p.series[i % p.series.length] : mix(accent, p.series[i % p.series.length], 0.6),
    );
  }, [clusterCount, accent, p.series]);

  const clusterColor = (n: LaidNode) =>
    n.clusterId >= 0 ? palette[n.clusterId % palette.length] : p.borderStrong;

  const dur = reduced ? 0 : duration / 1000;
  // Lower merges draw first; deeper (taller) merges follow.
  const heightDelay = (h: number) =>
    reduced ? 0 : mapRange(h, 0, heightTop, 0, 1) * dur * 0.65;

  const leaves = useMemo(() => nodes.filter((n) => n.isLeaf), [nodes]);
  const merges = useMemo(() => nodes.filter((n) => !n.isLeaf), [nodes]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={horizontal ? 16 / 12 : 16 / 11}
          margin={
            horizontal
              ? { top: 22, right: 120, bottom: 40, left: 52 }
              : { top: 26, right: 28, bottom: 78, left: 72 }
          }
        >
          {({ inner, margin }) => {
            // leafExtent = the axis along which leaves are spread.
            // heightExtent = the axis encoding merge distance.
            const leafExtent = horizontal ? inner.height : inner.width;
            const heightExtent = horizontal ? inner.width : inner.height;

            const leafGap = leafExtent / (leafCount + 1);
            const leafCoord = (pos: number) => (pos + 1) * leafGap;
            // height -> pixel along the height axis. In bottom-up, larger height
            // is higher up (smaller y). In left-right, larger height to the right.
            const heightCoord = (h: number) => {
              const frac = h / heightTop;
              return horizontal ? frac * heightExtent : heightExtent - frac * heightExtent;
            };

            // Resolve pixel centers.
            for (const n of nodes) {
              const lc = leafCoord(n.pos);
              const hc = heightCoord(n.height);
              if (horizontal) {
                n.px = hc;
                n.py = lc;
              } else {
                n.px = lc;
                n.py = hc;
              }
            }

            const cutPx = heightCoord(colorThreshold);

            // Linear scale shim for the height axis primitive.
            const heightScale = makeScale(0, heightTop, horizontal ? 0 : heightExtent, horizontal ? heightExtent : 0);

            // Rectangular linkage path for one merge (parent over its kids).
            const bracketPath = (parent: LaidNode) => {
              const kids = parent.children;
              const first = kids[0];
              const last = kids[kids.length - 1];
              if (horizontal) {
                // vertical connector at parent's x, verticals down to each child y
                const segs = kids.map(
                  (k) => `M${parent.px},${k.py} L${parent.px},${parent.py}`,
                );
                segs.push(`M${parent.px},${first.py} L${parent.px},${last.py}`);
                // arms from spine to each child anchor
                kids.forEach((k) => segs.push(`M${parent.px},${k.py} L${k.px},${k.py}`));
                return segs.join(" ");
              }
              const segs: string[] = [];
              // horizontal spine at parent height across the kid span
              segs.push(`M${first.px},${parent.py} L${last.px},${parent.py}`);
              // vertical arms down to each child anchor
              kids.forEach((k) => segs.push(`M${k.px},${parent.py} L${k.px},${k.py}`));
              return segs.join(" ");
            };

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {/* Height grid + axis */}
                {!horizontal && (
                  <GridLines scale={heightScale} width={inner.width} count={5} />
                )}
                {horizontal && (
                  <g aria-hidden>
                    {heightScale.ticks(5).map((t, i) => (
                      <line
                        key={i}
                        x1={heightScale(t)}
                        x2={heightScale(t)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.grid}
                        strokeWidth={1}
                        strokeDasharray="2 4"
                        shapeRendering="crispEdges"
                      />
                    ))}
                  </g>
                )}

                {horizontal ? (
                  <AxisBottom
                    scale={heightScale}
                    y={inner.height}
                    linearCount={5}
                    linearFormat={(v) => v.toFixed(2)}
                  />
                ) : (
                  <>
                    <AxisLeft
                      scale={heightScale}
                      count={5}
                      format={(v) => v.toFixed(2)}
                      height={inner.height}
                    />
                    {/* Axis title placed clear of the tick labels (which end near x=-10). */}
                    <text
                      aria-hidden
                      transform={`translate(${-52}, ${inner.height / 2}) rotate(-90)`}
                      textAnchor="middle"
                      fill={p.inkMuted}
                      className="font-mono uppercase"
                      style={{ fontSize: 10.5, letterSpacing: "0.14em" }}
                    >
                      merge distance
                    </text>
                  </>
                )}

                {/* Color-threshold cut line */}
                {showThreshold && (
                  <g>
                    <motion.line
                      x1={horizontal ? cutPx : 0}
                      x2={horizontal ? cutPx : inner.width}
                      y1={horizontal ? 0 : cutPx}
                      y2={horizontal ? inner.height : cutPx}
                      stroke={accent}
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      strokeOpacity={0.7}
                      initial={{ opacity: 0 }}
                      animate={inView ? { opacity: 1 } : { opacity: 0 }}
                      transition={{ duration: dur * 0.4, delay: dur * 0.1 }}
                    />
                    <motion.text
                      x={horizontal ? cutPx + 4 : inner.width}
                      y={horizontal ? -8 : cutPx - 6}
                      textAnchor={horizontal ? "start" : "end"}
                      fill={accent}
                      className="font-mono uppercase"
                      style={{ fontSize: 9, letterSpacing: "0.08em" }}
                      initial={{ opacity: 0 }}
                      animate={inView ? { opacity: 0.85 } : { opacity: 0 }}
                      transition={{ duration: dur * 0.4, delay: dur * 0.1 }}
                    >
                      {`cut ${colorThreshold.toFixed(2)}`}
                    </motion.text>
                  </g>
                )}

                {/* Merge brackets (bottom-up draw) */}
                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {merges.map((m) => {
                    const active = hover?.i === m.index;
                    const stroke = clusterColor(m);
                    const aboveCut = m.height > colorThreshold;
                    return (
                      <motion.path
                        key={`${token}-bracket-${m.index}`}
                        d={bracketPath(m)}
                        stroke={aboveCut ? p.borderStrong : stroke}
                        strokeWidth={active ? 3 : aboveCut ? 1.6 : 2.2}
                        strokeOpacity={aboveCut ? 0.85 : 1}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={inView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                        transition={{
                          duration: dur * 0.5,
                          delay: heightDelay(m.height),
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => moveHover(e, m.index, setHover)}
                        onMouseMove={(e) => moveHover(e, m.index, setHover)}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                </g>

                {/* Merge junction dots */}
                <g>
                  {merges.map((m) => {
                    const aboveCut = m.height > colorThreshold;
                    return (
                      <motion.circle
                        key={`${token}-dot-${m.index}`}
                        cx={m.px}
                        cy={m.py}
                        r={3}
                        fill={aboveCut ? p.surface : clusterColor(m)}
                        stroke={aboveCut ? p.borderStrong : clusterColor(m)}
                        strokeWidth={1.4}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                        transition={{
                          duration: dur * 0.3,
                          delay: heightDelay(m.height) + dur * 0.25,
                          ease: [0.34, 1.56, 0.64, 1],
                        }}
                        style={{ originX: `${m.px}px`, originY: `${m.py}px` }}
                      />
                    );
                  })}
                </g>

                {/* Leaf markers + labels */}
                <g>
                  {leaves.map((leaf) => {
                    const c = clusterColor(leaf);
                    const lx = leaf.px;
                    const ly = leaf.py;
                    const labelX = horizontal ? lx + 10 : lx;
                    const labelY = horizontal ? ly : ly + 16;
                    return (
                      <motion.g
                        key={`${token}-leaf-${leaf.index}`}
                        initial={{ opacity: 0 }}
                        animate={inView ? { opacity: 1 } : { opacity: 0 }}
                        transition={{ duration: dur * 0.4, delay: dur * 0.05 }}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => moveHover(e, leaf.index, setHover)}
                        onMouseMove={(e) => moveHover(e, leaf.index, setHover)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <circle cx={lx} cy={ly} r={3.5} fill={c} stroke={p.surface} strokeWidth={1} />
                        <text
                          x={labelX}
                          y={labelY}
                          textAnchor={horizontal ? "start" : "end"}
                          transform={horizontal ? undefined : `rotate(-40, ${labelX}, ${labelY})`}
                          dy={horizontal ? "0.32em" : 0}
                          fill={withAlpha(c, 0.95)}
                          className="font-mono"
                          style={{ fontSize: 10, fontWeight: 500 }}
                        >
                          {truncate(leaf.node.label ?? "·", 16)}
                        </text>
                      </motion.g>
                    );
                  })}
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {nodes[hover.i].isLeaf ? "leaf" : "merge"}
              </div>
              {nodes[hover.i].isLeaf ? (
                <TooltipRow label="item" value={nodes[hover.i].node.label ?? "—"} />
              ) : (
                <>
                  <TooltipRow label="merge distance" value={nodes[hover.i].height.toFixed(3)} />
                  <TooltipRow label="members" value={String(countLeaves(nodes[hover.i]))} />
                  <TooltipRow
                    label="below cut"
                    value={nodes[hover.i].height <= colorThreshold ? "yes" : "no"}
                  />
                </>
              )}
            </>
          )}
        </FloatingTooltip>

        {/* legend */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-px w-5"
              style={{ borderTop: `1.5px dashed ${accent}` }}
            />
            color cut
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-5 rounded-full" style={{ background: p.borderStrong }} />
            above cut
          </span>
          <span className="text-ink-faint/80">
            {clusterCount > 1 ? `${clusterCount} clusters` : "1 cluster"} below cut
          </span>
        </div>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function moveHover(
  e: React.MouseEvent,
  i: number,
  setHover: (v: { i: number; x: number; y: number } | null) => void,
) {
  const svg = (e.currentTarget as SVGElement).ownerSVGElement as SVGSVGElement | null;
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
}

function countLeaves(n: LaidNode): number {
  if (n.isLeaf) return 1;
  return n.children.reduce((acc, c) => acc + countLeaves(c), 0);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Minimal d3-like linear scale with `.ticks()` for the axis/grid primitives. */
function makeScale(d0: number, d1: number, r0: number, r1: number) {
  const fn = (v: number) => {
    const t = d1 === d0 ? 0 : (v - d0) / (d1 - d0);
    return r0 + t * (r1 - r0);
  };
  fn.ticks = (count = 5) => {
    const out: number[] = [];
    const step = (d1 - d0) / Math.max(1, count);
    for (let i = 0; i <= count; i += 1) out.push(clamp(d0 + step * i, d0, d1));
    return out;
  };
  fn.domain = (): number[] => [d0, d1];
  fn.range = (): number[] => [r0, r1];
  return fn;
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "dendrogram",
  name: "Dendrogram",
  category: "trees-graphs",
  description:
    "A hierarchical-clustering dendrogram — leaves spread along the baseline, merge brackets rising to their fusion distance, with a color cut that paints the flat clusters below a chosen threshold.",
  tags: ["dendrogram", "clustering", "hierarchical", "tree", "linkage", "unsupervised"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "Dendrogram",
  sourcePath: "trees-graphs/Dendrogram",
  aspect: 16 / 11,
  controls: [
    {
      key: "tree",
      label: "Tree",
      type: "json",
      group: "Data",
      help: "Nested cluster node: { label? (leaves), height? (merge distance), children[] }",
      default: DEFAULT_TREE,
    },
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      group: "Layout",
      default: "bottom-up",
      options: [
        { value: "bottom-up", label: "Bottom-up" },
        { value: "left-right", label: "Left-right" },
      ],
    },
    {
      key: "colorThreshold",
      label: "Color threshold",
      type: "number",
      group: "Style",
      default: 0.45,
      min: 0,
      max: 1,
      step: 0.01,
      help: "Subtrees fully below this merge distance are colored as flat clusters.",
    },
    {
      key: "showThreshold",
      label: "Show cut line",
      type: "boolean",
      group: "Style",
      default: true,
    },
    { key: "color", label: "Accent", type: "color", group: "Style", default: "" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1200,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "model-embeddings",
      name: "Vision/NLP model clusters",
      props: {
        title: "Hierarchical clustering of model embeddings",
        caption:
          "Vision backbones fuse early into one branch; language models form a second; the cut at 0.45 yields four interpretable clusters.",
        source: "embedding index · ward linkage",
        orientation: "bottom-up",
        colorThreshold: 0.45,
      },
    },
    {
      id: "tight-cut",
      name: "Tight cut",
      props: {
        title: "Fine-grained clusters",
        caption: "A lower cut height splits the dataset into many small, tight clusters.",
        orientation: "bottom-up",
        colorThreshold: 0.22,
      },
    },
    {
      id: "left-right",
      name: "Left-right linkage",
      props: {
        title: "Agglomerative clustering (left-to-right)",
        orientation: "left-right",
        colorThreshold: 0.45,
        caption: "Leaves at left, merges extending rightward to their fusion distance.",
      },
    },
  ],
};
