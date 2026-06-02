"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Glow,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  clamp,
  mapRange,
  polarToCartesian,
  uid,
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

interface TreeNode {
  /** Label shown for this node (printed at leaves, abbreviated internally). */
  name: string;
  /** Optional weight — drives edge thickness & node size (e.g. count, size). */
  value?: number;
  children?: TreeNode[];
}

/** Internal laid-out node. */
interface LaidNode {
  node: TreeNode;
  depth: number;
  /** Angle in degrees (0 = up), resolved from leaf order. */
  angle: number;
  /** Radius in pixels (depth → radius). */
  radius: number;
  parent: LaidNode | null;
  cx: number;
  cy: number;
  /** Sequential index among all nodes (stagger / hover keys). */
  i: number;
  /** True when the node has no children. */
  leaf: boolean;
  /** Effective weight for sizing. */
  weight: number;
}

export interface RadialTreeProps {
  tree?: TreeNode;
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Default data — a machine-learning taxonomy                          */
/* ------------------------------------------------------------------ */

const DEFAULT_TREE: TreeNode = {
  name: "Machine Learning",
  children: [
    {
      name: "Supervised",
      children: [
        {
          name: "Classification",
          children: [
            { name: "SVM", value: 7 },
            { name: "Random Forest", value: 9 },
            { name: "k-NN", value: 5 },
          ],
        },
        {
          name: "Regression",
          children: [
            { name: "Linear", value: 6 },
            { name: "GBM", value: 8 },
          ],
        },
      ],
    },
    {
      name: "Unsupervised",
      children: [
        {
          name: "Clustering",
          children: [
            { name: "k-Means", value: 7 },
            { name: "DBSCAN", value: 5 },
          ],
        },
        {
          name: "Dim. Reduction",
          children: [
            { name: "PCA", value: 6 },
            { name: "t-SNE", value: 5 },
            { name: "UMAP", value: 6 },
          ],
        },
      ],
    },
    {
      name: "Deep Learning",
      children: [
        {
          name: "Vision",
          children: [
            { name: "CNN", value: 9 },
            { name: "ViT", value: 8 },
          ],
        },
        {
          name: "Sequence",
          children: [
            { name: "RNN", value: 5 },
            { name: "Transformer", value: 12 },
          ],
        },
        {
          name: "Generative",
          children: [
            { name: "GAN", value: 7 },
            { name: "Diffusion", value: 10 },
          ],
        },
      ],
    },
    {
      name: "Reinforcement",
      children: [
        { name: "Q-Learning", value: 6 },
        { name: "Policy Grad.", value: 7 },
        { name: "Actor-Critic", value: 8 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Layout — radial tidy tree (leaf-equal-angle, depth → radius)        */
/* ------------------------------------------------------------------ */

function layout(root: TreeNode): {
  nodes: LaidNode[];
  maxDepth: number;
  leafCount: number;
} {
  const nodes: LaidNode[] = [];
  let leafCursor = 0;
  let maxDepth = 0;
  let i = 0;

  // First pass: count leaves to know the angular slice per leaf.
  function countLeaves(node: TreeNode): number {
    const kids = node.children ?? [];
    if (kids.length === 0) return 1;
    return kids.reduce((s, c) => s + countLeaves(c), 0);
  }
  const leafCount = Math.max(1, countLeaves(root));

  // Second pass: assign angles. Leaves take equal slices; internal nodes sit at
  // the angular midpoint of their children.
  function walk(node: TreeNode, depth: number, parent: LaidNode | null): LaidNode {
    maxDepth = Math.max(maxDepth, depth);
    const kids = node.children ?? [];
    const leaf = kids.length === 0;
    const weight = node.value ?? (leaf ? 1 : 0);

    const laid: LaidNode = {
      node,
      depth,
      angle: 0,
      radius: 0,
      parent,
      cx: 0,
      cy: 0,
      i: i++,
      leaf,
      weight,
    };

    if (leaf) {
      // Center each leaf inside its slice; tiny gap keeps the ring from closing.
      laid.angle = ((leafCursor + 0.5) / leafCount) * 360;
      leafCursor += 1;
    } else {
      const laidKids = kids.map((c) => walk(c, depth + 1, laid));
      laid.angle = (laidKids[0].angle + laidKids[laidKids.length - 1].angle) / 2;
    }

    nodes.push(laid);
    return laid;
  }

  walk(root, 0, null);
  return { nodes, maxDepth, leafCount };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function RadialTree({
  tree = DEFAULT_TREE,
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1200,
}: RadialTreeProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const glowId = useMemo(() => uid("rt-glow"), []);

  const { nodes, maxDepth } = useMemo(() => layout(tree), [tree]);
  const maxWeight = useMemo(() => Math.max(1, ...nodes.map((d) => d.weight)), [nodes]);

  const dur = reduced ? 0 : duration / 1000;
  const depthDelay = (d: number) => (reduced ? 0 : d * (duration / 1000) * 0.34);

  // Series-tinted ramp by the root's branch index, so each major subtree reads
  // as its own family while still anchored to the accent.
  const branchColor = (n: LaidNode): string => {
    let cur: LaidNode | null = n;
    while (cur && cur.depth > 1) cur = cur.parent;
    if (!cur || cur.depth === 0) return fill;
    const root = cur.parent; // depth-0 root
    const idx = root?.node.children?.indexOf(cur.node) ?? -1;
    if (idx < 0) return fill;
    return idx === 0 ? fill : p.series[idx % p.series.length];
  };

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={1} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
          {({ inner, margin }) => {
            const cx = inner.width / 2;
            const cy = inner.height / 2;

            // Leave a ring of headroom for leaf labels around the rim.
            const labelPad = clamp(Math.min(inner.width, inner.height) * 0.14, 44, 96);
            const maxR = Math.max(10, Math.min(inner.width, inner.height) / 2 - labelPad);
            const radiusOf = (depth: number) => (maxDepth > 0 ? (depth / maxDepth) * maxR : 0);

            for (const d of nodes) {
              d.radius = radiusOf(d.depth);
              const pt = polarToCartesian(cx, cy, d.radius, d.angle);
              d.cx = pt.x;
              d.cy = pt.y;
            }

            const nodeR = (d: LaidNode) => {
              const base = clamp(maxR / (maxDepth + 1) * 0.16, 4.5, 9);
              const bump = mapRange(d.weight, 0, maxWeight, 0, base * 0.9);
              if (d.depth === 0) return base * 1.7;
              return clamp(base + bump, 4, 13);
            };

            const edges = nodes
              .filter((d) => d.parent)
              .map((d) => ({ from: d.parent as LaidNode, to: d }));

            // Curved radial edge: step out from the parent's radius along the
            // parent's angle, then sweep to the child's angle — the classic
            // "radial dendrogram" look, approximated with a cubic Bézier.
            const edgePath = (a: LaidNode, b: LaidNode) => {
              const ar = a.radius;
              const br = b.radius;
              const midR = (ar + br) / 2;
              // Control points share the mid radius but keep each end's angle,
              // bending the curve so it leaves/arrives radially.
              const c1 = polarToCartesian(cx, cy, midR, a.angle);
              const c2 = polarToCartesian(cx, cy, midR, b.angle);
              return `M${a.cx},${a.cy} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.cx},${b.cy}`;
            };

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <Glow id={glowId} blur={5} />
                </defs>

                {/* faint depth rings for orientation */}
                <g fill="none" stroke={p.grid} strokeWidth={1}>
                  {Array.from({ length: maxDepth }, (_, k) => k + 1).map((d) => (
                    <motion.circle
                      key={`${token}-ring-${d}`}
                      cx={cx}
                      cy={cy}
                      r={radiusOf(d)}
                      strokeDasharray="2 5"
                      initial={{ opacity: 0 }}
                      animate={inView ? { opacity: 0.5 } : { opacity: 0 }}
                      transition={{ duration: dur * 0.6, delay: depthDelay(d) }}
                    />
                  ))}
                </g>

                {/* edges */}
                <g fill="none" strokeLinecap="round">
                  {edges.map(({ from, to }, k) => {
                    const stroke = branchColor(to);
                    const w = mapRange(to.weight, 0, maxWeight, 1.1, 4.5);
                    return (
                      <motion.path
                        key={`${token}-edge-${k}`}
                        d={edgePath(from, to)}
                        stroke={stroke}
                        strokeWidth={to.depth <= 1 ? Math.max(w, 2.6) : w}
                        strokeOpacity={to.depth <= 1 ? 0.85 : 0.62}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={
                          inView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }
                        }
                        transition={{
                          duration: dur * 0.75,
                          delay: depthDelay(to.depth),
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    );
                  })}
                </g>

                {/* nodes + rim labels */}
                <g>
                  {nodes.map((d) => {
                    const r = nodeR(d);
                    const isRoot = d.depth === 0;
                    const active = hover?.i === d.i;
                    const col = branchColor(d);
                    const nodeFill = isRoot
                      ? withAlpha(fill, 0.18)
                      : d.leaf
                        ? p.surface
                        : withAlpha(col, 0.14);
                    const nodeStroke = isRoot ? fill : col;

                    // Rim labels for leaves; rotate to follow the radial angle and
                    // flip on the left half so text stays upright.
                    const labelR = d.radius + r + 7;
                    const lp = polarToCartesian(cx, cy, labelR, d.angle);
                    const onLeft = d.angle > 180;
                    const rot = d.angle - 90 + (onLeft ? 180 : 0);
                    const anchor = onLeft ? "end" : "start";

                    return (
                      <motion.g
                        key={`${token}-node-${d.i}`}
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
                        transition={{
                          duration: dur * 0.45,
                          delay: depthDelay(d.depth) + dur * 0.16,
                          ease: [0.34, 1.56, 0.64, 1],
                        }}
                        style={{ originX: `${d.cx}px`, originY: `${d.cy}px`, cursor: "pointer" }}
                        onMouseEnter={(e) => {
                          const box = (
                            e.currentTarget.ownerSVGElement as SVGSVGElement
                          ).getBoundingClientRect();
                          setHover({ i: d.i, x: e.clientX - box.left, y: e.clientY - box.top });
                        }}
                        onMouseMove={(e) => {
                          const box = (
                            e.currentTarget.ownerSVGElement as SVGSVGElement
                          ).getBoundingClientRect();
                          setHover({ i: d.i, x: e.clientX - box.left, y: e.clientY - box.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      >
                        {/* hover halo */}
                        {active && (
                          <circle
                            cx={d.cx}
                            cy={d.cy}
                            r={r + 5}
                            fill="none"
                            stroke={withAlpha(col, 0.4)}
                            strokeWidth={2}
                          />
                        )}

                        <circle
                          cx={d.cx}
                          cy={d.cy}
                          r={r}
                          fill={nodeFill}
                          stroke={nodeStroke}
                          strokeWidth={isRoot ? 2.4 : d.leaf ? 1.4 : 1.8}
                          filter={active ? `url(#${glowId})` : undefined}
                        />

                        {/* root label sits centered */}
                        {isRoot && (
                          <text
                            x={d.cx}
                            y={d.cy - r - 8}
                            textAnchor="middle"
                            fill={p.ink}
                            className="font-mono uppercase tracking-label"
                            style={{ fontSize: 10, fontWeight: 600 }}
                          >
                            {truncate(d.node.name, 22)}
                          </text>
                        )}

                        {/* leaf rim labels */}
                        {d.leaf && (
                          <text
                            transform={`translate(${lp.x},${lp.y}) rotate(${rot})`}
                            textAnchor={anchor}
                            dy="0.32em"
                            fill={active ? col : p.ink}
                            className="font-mono"
                            style={{ fontSize: 9.5, fontWeight: active ? 600 : 500 }}
                          >
                            {truncate(d.node.name, 16)}
                          </text>
                        )}

                        {/* internal (non-root) node labels, set just outside */}
                        {!d.leaf && !isRoot && (
                          <text
                            transform={`translate(${lp.x},${lp.y}) rotate(${rot})`}
                            textAnchor={anchor}
                            dy="0.32em"
                            fill={active ? col : p.inkMuted}
                            className="font-mono uppercase tracking-label"
                            style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: "0.04em" }}
                          >
                            {truncate(d.node.name, 14)}
                          </text>
                        )}
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
                {truncate(nodes[hover.i].node.name, 32)}
              </div>
              <TooltipRow label="depth" value={String(nodes[hover.i].depth)} />
              <TooltipRow
                label="kind"
                value={nodes[hover.i].leaf ? "leaf" : nodes[hover.i].depth === 0 ? "root" : "branch"}
              />
              {nodes[hover.i].node.value != null && (
                <TooltipRow label="weight" value={String(nodes[hover.i].node.value)} />
              )}
              <TooltipRow
                label="children"
                value={String(nodes[hover.i].node.children?.length ?? 0)}
              />
            </>
          )}
        </FloatingTooltip>

        {/* legend */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: fill }} />
            root
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-5 rounded-full" style={{ background: fill }} />
            branch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full border bg-surface"
              style={{ borderColor: p.borderStrong }}
            />
            leaf
          </span>
          <span className="text-ink-faint/80">depth = radius · width = weight</span>
        </div>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Small local formatter                                               */
/* ------------------------------------------------------------------ */

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "radial-tree",
  name: "Radial Tree",
  category: "trees-graphs",
  description:
    "A node-link tree in radial layout — the root anchored at center, depth mapped to radius, curved dendrogram edges sweeping outward, and leaf labels arranged around the rim.",
  tags: ["tree", "radial", "dendrogram", "taxonomy", "node-link", "hierarchy"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "RadialTree",
  sourcePath: "trees-graphs/RadialTree",
  aspect: 1,
  controls: [
    {
      key: "tree",
      label: "Tree",
      type: "json",
      group: "Data",
      help: "Nested node: { name, value?, children[] }",
      default: DEFAULT_TREE,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
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
      id: "ml-taxonomy",
      name: "ML taxonomy",
      props: {
        title: "A taxonomy of machine-learning methods",
        caption:
          "Each radial branch is a learning paradigm; leaves are concrete algorithms, sized by relative prevalence.",
        source: "reviz · survey 2026",
      },
    },
    {
      id: "life-tree",
      name: "Tree of life",
      props: {
        title: "Domains of life",
        caption: "Depth encodes taxonomic rank; the rim lists representative clades.",
        tree: {
          name: "Life",
          children: [
            {
              name: "Bacteria",
              children: [
                { name: "Proteobacteria", value: 8 },
                { name: "Cyanobacteria", value: 6 },
                { name: "Firmicutes", value: 7 },
              ],
            },
            {
              name: "Archaea",
              children: [
                { name: "Euryarchaeota", value: 5 },
                { name: "Crenarchaeota", value: 4 },
              ],
            },
            {
              name: "Eukarya",
              children: [
                {
                  name: "Animalia",
                  children: [
                    { name: "Chordata", value: 9 },
                    { name: "Arthropoda", value: 10 },
                  ],
                },
                {
                  name: "Plantae",
                  children: [
                    { name: "Angiosperms", value: 8 },
                    { name: "Gymnosperms", value: 5 },
                  ],
                },
                {
                  name: "Fungi",
                  children: [
                    { name: "Ascomycota", value: 6 },
                    { name: "Basidiomycota", value: 6 },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  ],
};
