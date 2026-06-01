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

type NodeStatus = "continue" | "stop" | "give_up";

interface TreeNode {
  /** Action / move label shown on the node. */
  label: string;
  /** Visit count N. */
  n: number;
  /** Mean action value Q in [0,1]. */
  q: number;
  /** Prior probability P in [0,1]. */
  p: number;
  /** Policy status for this node. */
  status?: NodeStatus;
  /** Marks this node as on the principal variation (best path). */
  pv?: boolean;
  /** Rejected / pruned branch — drawn dimmed + dashed. */
  rejected?: boolean;
  children?: TreeNode[];
}

/** Internal laid-out node. */
interface LaidNode {
  node: TreeNode;
  depth: number;
  /** Position along the layout's cross-axis (sibling spread), in slot units. */
  cross: number;
  parent: LaidNode | null;
  /** Resolved pixel center. */
  cx: number;
  cy: number;
  onPv: boolean;
  rejected: boolean;
}

export interface SearchTreeProps {
  tree: TreeNode;
  orientation?: "top-down" | "left-right";
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  showStats?: boolean;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Layout — a small tidy-tree (no d3-hierarchy)                        */
/* ------------------------------------------------------------------ */

const DEFAULT_TREE: TreeNode = {
  label: "root",
  n: 1600,
  q: 0.71,
  p: 1,
  pv: true,
  status: "continue",
  children: [
    {
      label: "grep('parse_args')",
      n: 980,
      q: 0.78,
      p: 0.46,
      pv: true,
      status: "continue",
      children: [
        {
          label: "open cli/parser.py",
          n: 612,
          q: 0.83,
          p: 0.58,
          pv: true,
          status: "continue",
          children: [
            { label: "edit L142 flag", n: 421, q: 0.91, p: 0.64, pv: true, status: "stop" },
            { label: "edit L88 default", n: 154, q: 0.57, p: 0.27, status: "continue" },
          ],
        },
        {
          label: "open utils/io.py",
          n: 261,
          q: 0.49,
          p: 0.31,
          status: "continue",
          children: [
            { label: "trace caller", n: 142, q: 0.44, p: 0.55, status: "continue" },
            { label: "add logging", n: 71, q: 0.33, p: 0.2, rejected: true, status: "give_up" },
          ],
        },
      ],
    },
    {
      label: "ls src/cli/",
      n: 432,
      q: 0.52,
      p: 0.34,
      status: "continue",
      children: [
        { label: "read README", n: 188, q: 0.4, p: 0.42, status: "continue" },
        { label: "git blame", n: 96, q: 0.29, p: 0.18, rejected: true, status: "give_up" },
      ],
    },
    {
      label: "search tests/",
      n: 173,
      q: 0.31,
      p: 0.2,
      rejected: true,
      status: "give_up",
      children: [{ label: "run pytest", n: 58, q: 0.22, p: 0.5, rejected: true, status: "give_up" }],
    },
  ],
};

/**
 * Flatten + lay out the tree. Leaves get sequential cross-positions; internal
 * nodes are centered over their children. PV / rejected flags propagate down so
 * a child of a rejected branch is also rejected.
 */
function layout(root: TreeNode): { nodes: LaidNode[]; maxDepth: number; crossSpan: number } {
  const nodes: LaidNode[] = [];
  let leafCursor = 0;
  let maxDepth = 0;

  function walk(
    node: TreeNode,
    depth: number,
    parent: LaidNode | null,
    parentRejected: boolean,
    parentOnPv: boolean,
  ): LaidNode {
    maxDepth = Math.max(maxDepth, depth);
    const rejected = parentRejected || !!node.rejected;
    const onPv = (parentOnPv || depth === 0) && !!node.pv && !rejected;

    const laid: LaidNode = {
      node,
      depth,
      cross: 0,
      parent,
      cx: 0,
      cy: 0,
      onPv,
      rejected,
    };

    const children = node.children ?? [];
    if (children.length === 0) {
      laid.cross = leafCursor;
      leafCursor += 1;
    } else {
      const kids = children.map((c) => walk(c, depth + 1, laid, rejected, onPv));
      laid.cross = (kids[0].cross + kids[kids.length - 1].cross) / 2;
    }
    nodes.push(laid);
    return laid;
  }

  walk(root, 0, null, false, true);
  const crossSpan = Math.max(1, leafCursor - 1);
  return { nodes, maxDepth, crossSpan };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<NodeStatus, string> = {
  continue: "continue",
  stop: "stop · accept",
  give_up: "give up · prune",
};

export default function SearchTree({
  tree = DEFAULT_TREE,
  orientation = "top-down",
  title = "",
  caption = "",
  source = "",
  accent = "",
  showStats = true,
  duration = 1100,
}: SearchTreeProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const glowId = useMemo(() => uid("st-glow"), []);

  const { nodes, maxDepth, crossSpan } = useMemo(() => layout(tree), [tree]);
  const horizontal = orientation === "left-right";

  // Max visit count drives edge thickness.
  const maxN = useMemo(() => Math.max(1, ...nodes.map((d) => d.node.n)), [nodes]);

  const dur = reduced ? 0 : duration / 1000;
  const depthDelay = (d: number) => (reduced ? 0 : d * (duration / 1000) * 0.32);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={horizontal ? 16 / 11 : 16 / 12}
          margin={
            horizontal
              ? { top: 30, right: 118, bottom: 24, left: 64 }
              : { top: 34, right: 56, bottom: 30, left: 56 }
          }
        >
          {({ inner, margin }) => {
            // Resolve pixel centers from depth (main axis) and cross slot.
            const depthExtent = horizontal ? inner.width : inner.height;
            const crossExtent = horizontal ? inner.height : inner.width;
            const depthStep = maxDepth > 0 ? depthExtent / maxDepth : 0;

            for (const d of nodes) {
              const along = d.depth * depthStep;
              const across = crossSpan > 0 ? (d.cross / crossSpan) * crossExtent : crossExtent / 2;
              if (horizontal) {
                d.cx = along;
                d.cy = across;
              } else {
                d.cx = across;
                d.cy = along;
              }
            }

            const nodeR = clamp(Math.min(depthStep, crossExtent / (crossSpan + 1)) * 0.26, 11, 22);

            // Build parent→child edge list, ordered by depth for stagger.
            const edges = nodes
              .filter((d) => d.parent)
              .map((d) => ({ from: d.parent as LaidNode, to: d }));

            const edgePath = (a: LaidNode, b: LaidNode) => {
              if (horizontal) {
                const mx = (a.cx + b.cx) / 2;
                return `M${a.cx},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${b.cx},${b.cy}`;
              }
              const my = (a.cy + b.cy) / 2;
              return `M${a.cx},${a.cy} C${a.cx},${my} ${b.cx},${my} ${b.cx},${b.cy}`;
            };

            const labelAlongRight = horizontal; // place labels to the right of nodes in LR mode

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <Glow id={glowId} blur={5} />
                </defs>

                {/* edges */}
                <g fill="none" strokeLinecap="round">
                  {edges.map(({ from, to }, i) => {
                    const onPv = to.onPv && from.onPv;
                    const rejected = to.rejected;
                    const w = mapRange(to.node.n, 0, maxN, 1, 7);
                    const stroke = rejected ? p.inkFaint : onPv ? fill : p.borderStrong;
                    const op = rejected ? 0.45 : onPv ? 0.95 : 0.7;
                    const d = edgePath(from, to);
                    return (
                      <motion.path
                        key={`${token}-edge-${i}`}
                        d={d}
                        stroke={stroke}
                        strokeWidth={onPv ? Math.max(w, 2.4) : w}
                        strokeOpacity={op}
                        strokeDasharray={rejected ? "1 6" : undefined}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={inView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                        transition={{
                          duration: dur * 0.8,
                          delay: depthDelay(to.depth),
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    );
                  })}
                </g>

                {/* nodes */}
                <g>
                  {nodes.map((d, i) => {
                    const onPv = d.onPv;
                    const rejected = d.rejected;
                    const active = hover?.i === i;
                    const stroke = rejected ? p.inkFaint : onPv ? fill : p.borderStrong;
                    const nodeFill = rejected
                      ? withAlpha(p.inkFaint, 0.1)
                      : onPv
                        ? withAlpha(fill, 0.16)
                        : p.surface;
                    const labelColor = rejected ? p.inkFaint : onPv ? fill : p.ink;

                    // Stat ring fraction = Q value.
                    const qFrac = clamp(d.node.q, 0, 1);
                    const ringC = 2 * Math.PI * (nodeR + 3.5);

                    const labelDx = labelAlongRight ? nodeR + 9 : 0;
                    const labelDy = labelAlongRight ? 0 : -nodeR - 9;
                    const labelAnchor = labelAlongRight ? "start" : "middle";

                    return (
                      <motion.g
                        key={`${token}-node-${i}`}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={
                          inView
                            ? { opacity: rejected ? 0.6 : 1, scale: 1 }
                            : { opacity: 0, scale: 0.5 }
                        }
                        transition={{
                          duration: dur * 0.5,
                          delay: depthDelay(d.depth) + dur * 0.18,
                          ease: [0.34, 1.56, 0.64, 1],
                        }}
                        style={{
                          originX: `${d.cx}px`,
                          originY: `${d.cy}px`,
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                        }}
                        onMouseMove={(e) => {
                          const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      >
                        {/* Q ring (value indicator) */}
                        {!rejected && (
                          <circle
                            cx={d.cx}
                            cy={d.cy}
                            r={nodeR + 3.5}
                            fill="none"
                            stroke={withAlpha(onPv ? fill : p.borderStrong, 0.28)}
                            strokeWidth={2}
                            strokeDasharray={`${ringC * qFrac} ${ringC}`}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${d.cx} ${d.cy})`}
                          />
                        )}

                        {/* node body */}
                        <circle
                          cx={d.cx}
                          cy={d.cy}
                          r={nodeR}
                          fill={nodeFill}
                          stroke={stroke}
                          strokeWidth={onPv ? 2.4 : 1.4}
                          strokeDasharray={rejected ? "2 3" : undefined}
                          filter={onPv && active ? `url(#${glowId})` : undefined}
                        />

                        {/* N visit count inside the node */}
                        <text
                          x={d.cx}
                          y={d.cy}
                          dy="0.34em"
                          textAnchor="middle"
                          fill={labelColor}
                          className="font-mono tabular-nums"
                          style={{ fontSize: nodeR > 16 ? 11 : 9.5, fontWeight: onPv ? 600 : 500 }}
                        >
                          {compact(d.node.n)}
                        </text>

                        {/* action label */}
                        <text
                          x={d.cx + labelDx}
                          y={d.cy + labelDy}
                          dy={labelAlongRight ? "0.32em" : 0}
                          textAnchor={labelAnchor}
                          fill={labelColor}
                          className="font-mono"
                          style={{
                            fontSize: 10,
                            fontWeight: onPv ? 600 : 500,
                            opacity: rejected ? 0.85 : 1,
                          }}
                        >
                          {truncate(d.node.label, horizontal ? 22 : 18)}
                        </text>

                        {/* secondary stat line: Q / P */}
                        {showStats && (
                          <text
                            x={d.cx + labelDx}
                            y={d.cy + (labelAlongRight ? 12 : labelDy - 12)}
                            dy={labelAlongRight ? "0.32em" : 0}
                            textAnchor={labelAnchor}
                            fill={p.inkFaint}
                            className="font-mono tabular-nums"
                            style={{ fontSize: 8.5, letterSpacing: "0.02em" }}
                          >
                            {`Q ${d.node.q.toFixed(2)}  P ${d.node.p.toFixed(2)}`}
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
                {truncate(nodes[hover.i].node.label, 32)}
              </div>
              <TooltipRow label="visits N" value={nodes[hover.i].node.n.toLocaleString()} />
              <TooltipRow label="value Q" value={nodes[hover.i].node.q.toFixed(3)} />
              <TooltipRow label="prior P" value={nodes[hover.i].node.p.toFixed(3)} />
              <TooltipRow
                label="status"
                value={STATUS_LABEL[nodes[hover.i].node.status ?? "continue"]}
              />
            </>
          )}
        </FloatingTooltip>

        {/* legend */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-5 rounded-full" style={{ background: fill }} />
            principal variation
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-5 rounded-full bg-border-strong" />
            explored
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-px w-5"
              style={{
                borderTop: `1px dashed ${p.inkFaint}`,
              }}
            />
            pruned
          </span>
          <span className="text-ink-faint/80">ring = Q · width = N</span>
        </div>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Small local formatters                                              */
/* ------------------------------------------------------------------ */

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "search-tree",
  name: "MCTS Search Tree",
  category: "trees-graphs",
  description:
    "A Monte-Carlo Tree Search rollout drawn as a tidy node-link tree — the bold principal variation, explored branches, and pruned dead-ends laid bare with per-node N / Q / P stats.",
  tags: ["mcts", "tree", "search", "node-link", "rollout", "planning"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "SearchTree",
  sourcePath: "trees-graphs/SearchTree",
  aspect: 16 / 12,
  controls: [
    {
      key: "tree",
      label: "Tree",
      type: "json",
      group: "Data",
      help: "Nested node: { label, n, q, p, status, pv?, rejected?, children[] }",
      default: DEFAULT_TREE,
    },
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      group: "Layout",
      default: "top-down",
      options: [
        { value: "top-down", label: "Top-down" },
        { value: "left-right", label: "Left-right" },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showStats", label: "Show Q / P stats", type: "boolean", group: "Style", default: true },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1100,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "code-retrieval",
      name: "Code retrieval search",
      props: {
        title: "MCTS over a code-retrieval agent",
        caption:
          "Search prefers the high-prior grep → open → edit path; low-value branches are pruned after a few visits.",
        source: "Perseus · sim run #4412",
        orientation: "top-down",
      },
    },
    {
      id: "left-right",
      name: "Left-right rollout",
      props: {
        title: "Planning rollout (left-to-right)",
        orientation: "left-right",
        caption: "Edge thickness encodes visit count N; the accent path is the principal variation.",
      },
    },
  ],
};
