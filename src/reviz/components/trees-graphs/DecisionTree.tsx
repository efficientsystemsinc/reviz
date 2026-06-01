"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
  cn,
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
  /** Split condition for internal nodes, e.g. "depth ≤ 0.5". */
  condition?: string;
  /** Class label for leaves, e.g. "grasp". */
  class?: string;
  /** Numeric value for regression leaves. */
  value?: number;
  /** Optional confidence / probability shown in the tooltip (0..1). */
  confidence?: number;
  /** Optional explicit edge label for the branch leading INTO this node. */
  branch?: string;
  children?: TreeNode[];
}

/** Internal laid-out node carrying geometry + provenance. */
interface Laid {
  node: TreeNode;
  x: number; // normalized cross-axis position (0..1)
  depth: number; // tree depth (0 = root)
  id: string;
  parentId: string | null;
  branchLabel: string; // label on the edge from parent → this node
  leafIndex: number; // assigned class index for coloring (-1 if internal)
  order: number; // stable draw order (BFS index)
}

interface Edge {
  from: string;
  to: string;
  label: string;
  order: number;
  branchIdx: number; // 0 = first/true branch, 1 = second/false branch, etc.
}

export interface DecisionTreeProps {
  tree?: TreeNode;
  title?: string;
  caption?: string;
  source?: string;
  orientation?: "vertical" | "horizontal";
  color?: string;
  showConfidence?: boolean;
  nodeWidth?: number;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Default data — a small robotics manipulation policy decision tree   */
/* ------------------------------------------------------------------ */

const DEFAULT_TREE: TreeNode = {
  condition: "object dist ≤ 0.30 m",
  children: [
    {
      branch: "true",
      condition: "gripper open?",
      children: [
        { branch: "yes", class: "grasp", confidence: 0.94 },
        { branch: "no", class: "release", confidence: 0.81 },
      ],
    },
    {
      branch: "false",
      condition: "obstacle ahead?",
      children: [
        {
          branch: "yes",
          condition: "clearance ≤ 0.1 m",
          children: [
            { branch: "true", class: "retreat", confidence: 0.88 },
            { branch: "false", class: "reroute", confidence: 0.72 },
          ],
        },
        { branch: "no", class: "approach", confidence: 0.96 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Tidy layout (first-walk leaf packing, parents centered over kids)   */
/* ------------------------------------------------------------------ */

function layout(root: TreeNode): {
  nodes: Laid[];
  edges: Edge[];
  maxDepth: number;
  classes: string[];
} {
  const nodes: Laid[] = [];
  const edges: Edge[] = [];
  const classes: string[] = [];
  let leafCursor = 0;
  let maxDepth = 0;
  let order = 0;

  const classIndex = (label: string): number => {
    const i = classes.indexOf(label);
    if (i >= 0) return i;
    classes.push(label);
    return classes.length - 1;
  };

  // Recursive first-walk: returns the normalized x of the node.
  const walk = (
    node: TreeNode,
    depth: number,
    parentId: string | null,
    branchLabel: string,
    branchIdx: number,
  ): Laid => {
    maxDepth = Math.max(maxDepth, depth);
    const id = uid("dt");
    const myOrder = order++;
    const kids = node.children ?? [];
    const isLeaf = kids.length === 0;

    let x: number;
    if (isLeaf) {
      x = leafCursor;
      leafCursor += 1;
    } else {
      const childLaid = kids.map((c, i) =>
        walk(c, depth + 1, id, edgeLabel(c, i, kids.length), i),
      );
      const first = childLaid[0].x;
      const last = childLaid[childLaid.length - 1].x;
      x = (first + last) / 2;
    }

    const laid: Laid = {
      node,
      x,
      depth,
      id,
      parentId,
      branchLabel,
      leafIndex: isLeaf ? classIndex(node.class ?? String(node.value ?? "")) : -1,
      order: myOrder,
    };
    nodes.push(laid);
    if (parentId != null) {
      edges.push({ from: parentId, to: id, label: branchLabel, order: myOrder, branchIdx });
    }
    return laid;
  };

  walk(root, 0, null, "", 0);

  // Normalize cross-axis positions into [0, 1].
  const span = Math.max(1, leafCursor - 1);
  for (const n of nodes) n.x = leafCursor <= 1 ? 0.5 : n.x / span;

  return { nodes, edges, maxDepth, classes };
}

/** Default edge label: prefer explicit `branch`, else true/false for binary. */
function edgeLabel(child: TreeNode, idx: number, total: number): string {
  if (child.branch != null) return child.branch;
  if (total === 2) return idx === 0 ? "true" : "false";
  return "";
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function DecisionTree({
  tree = DEFAULT_TREE,
  title = "",
  caption = "",
  source = "",
  orientation = "vertical",
  color = "",
  showConfidence = true,
  nodeWidth = 132,
  duration = 1100,
}: DecisionTreeProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const shadowId = useMemo(() => uid("dt-shadow"), []);

  const { nodes, edges, maxDepth, classes } = useMemo(() => layout(tree), [tree]);
  const horizontal = orientation === "horizontal";

  const nodeById = useMemo(() => {
    const m = new Map<string, Laid>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const leafColor = (idx: number) =>
    idx < 0 ? accent : idx === 0 ? accent : p.series[idx % p.series.length];

  const NODE_H = 30;
  const totalSteps = nodes.length;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={horizontal ? 16 / 9 : 16 / 11}
          margin={{ top: 22, right: 26, bottom: 22, left: 26 }}
        >
          {({ inner, margin }) => {
            // Cross-axis (where siblings spread) vs depth-axis (root → leaves).
            const crossSpan = horizontal ? inner.height : inner.width;
            const depthSpan = horizontal ? inner.width : inner.height;
            const levels = Math.max(1, maxDepth);

            // Position helpers in plot coordinates.
            const cross = (xNorm: number) => {
              const half = nodeWidth / 2 + 6;
              const lo = horizontal ? NODE_H / 2 + 4 : half;
              const hi = crossSpan - lo;
              return lo + xNorm * (hi - lo);
            };
            const along = (depth: number) => {
              const lo = horizontal ? nodeWidth / 2 : NODE_H / 2;
              const hi = depthSpan - lo;
              return lo + (depth / levels) * (hi - lo);
            };

            const px = (n: Laid) => (horizontal ? along(n.depth) : cross(n.x));
            const py = (n: Laid) => (horizontal ? cross(n.x) : along(n.depth));

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={3} blur={7} opacity={0.16} />
                </defs>

                {/* Edges: smooth elbow curves drawn before nodes. */}
                <g>
                  {edges.map((e) => {
                    const a = nodeById.get(e.from)!;
                    const b = nodeById.get(e.to)!;
                    const x1 = px(a);
                    const y1 = py(a);
                    const x2 = px(b);
                    const y2 = py(b);
                    const d = horizontal
                      ? `M ${x1 + nodeWidth / 2} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2 - nodeWidth / 2} ${y2}`
                      : `M ${x1} ${y1 + NODE_H / 2} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2 - NODE_H / 2}`;
                    const delay = (e.order / Math.max(1, totalSteps)) * (duration / 1000) * 0.6;
                    const active = hover != null && (hover.id === e.from || hover.id === e.to);
                    return (
                      <g key={`${token}-${e.to}`}>
                        <motion.path
                          d={d}
                          fill="none"
                          stroke={active ? accent : p.borderStrong}
                          strokeWidth={active ? 2 : 1.4}
                          strokeLinecap="round"
                          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                          animate={
                            reduced || inView
                              ? { pathLength: 1, opacity: 1 }
                              : { pathLength: 0, opacity: 0 }
                          }
                          transition={
                            reduced
                              ? { duration: 0 }
                              : { duration: duration / 1000 / 2.2, delay, ease: [0.22, 1, 0.36, 1] }
                          }
                        />
                        {e.label && (
                          <motion.g
                            initial={reduced ? false : { opacity: 0 }}
                            animate={reduced || inView ? { opacity: 1 } : { opacity: 0 }}
                            transition={
                              reduced
                                ? { duration: 0 }
                                : { delay: delay + duration / 1000 / 2.2, duration: 0.3 }
                            }
                          >
                            <EdgeLabel
                              x={(x1 + x2) / 2}
                              y={(y1 + y2) / 2}
                              text={e.label}
                              fg={e.branchIdx === 0 ? p.ok : p.inkMuted}
                              bg={p.surface}
                              stroke={withAlpha(p.border, 0.9)}
                            />
                          </motion.g>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Nodes */}
                <g>
                  {nodes.map((n) => {
                    const x = px(n);
                    const y = py(n);
                    const isLeaf = n.leafIndex >= 0;
                    const leafC = leafColor(n.leafIndex);
                    const active = hover?.id === n.id;
                    const w = nodeWidth;
                    const delay = (n.order / Math.max(1, totalSteps)) * (duration / 1000) * 0.6 + 0.08;

                    const label = isLeaf
                      ? n.node.class ?? formatVal(n.node.value)
                      : n.node.condition ?? "";

                    return (
                      <motion.g
                        key={`${token}-${n.id}`}
                        initial={reduced ? false : { opacity: 0, scale: 0.82 }}
                        animate={
                          reduced || inView
                            ? { opacity: 1, scale: 1 }
                            : { opacity: 0, scale: 0.82 }
                        }
                        transition={
                          reduced
                            ? { duration: 0 }
                            : { delay, duration: 0.42, ease: [0.22, 1, 0.36, 1] }
                        }
                        style={{ transformOrigin: `${x}px ${y}px`, transformBox: "fill-box" } as never}
                        onMouseMove={(ev) => {
                          const r = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ id: n.id, x: ev.clientX - r.left, y: ev.clientY - r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      >
                        {isLeaf ? (
                          <LeafNode
                            x={x}
                            y={y}
                            w={w}
                            h={NODE_H}
                            label={label}
                            chip={leafC}
                            confidence={showConfidence ? n.node.confidence : undefined}
                            active={active}
                            shadowId={shadowId}
                            p={p}
                          />
                        ) : (
                          <SplitNode
                            x={x}
                            y={y}
                            w={w}
                            h={NODE_H}
                            label={label}
                            accent={accent}
                            active={active}
                            shadowId={shadowId}
                            p={p}
                          />
                        )}
                      </motion.g>
                    );
                  })}
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* Class legend */}
        {classes.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            {classes.map((c, i) => (
              <div key={c} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: leafColor(i) }}
                />
                <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                  {c}
                </span>
              </div>
            ))}
          </div>
        )}

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (() => {
            const n = nodeById.get(hover.id);
            if (!n) return null;
            const isLeaf = n.leafIndex >= 0;
            return (
              <>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {isLeaf ? "leaf · prediction" : "split"}
                </div>
                {isLeaf ? (
                  <>
                    <TooltipRow label="class" value={n.node.class ?? formatVal(n.node.value)} />
                    {n.node.confidence != null && (
                      <TooltipRow label="confidence" value={`${Math.round(n.node.confidence * 100)}%`} />
                    )}
                  </>
                ) : (
                  <TooltipRow label="rule" value={n.node.condition ?? "—"} />
                )}
                <TooltipRow label="depth" value={n.depth} />
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
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Node renderers                                                      */
/* ------------------------------------------------------------------ */

type Pal = ReturnType<typeof usePalette>;

function SplitNode({
  x,
  y,
  w,
  h,
  label,
  accent,
  active,
  shadowId,
  p,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  accent: string;
  active: boolean;
  shadowId: string;
  p: Pal;
}) {
  return (
    <g style={{ cursor: "default" }}>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={7}
        fill={p.surface}
        stroke={active ? accent : p.borderStrong}
        strokeWidth={active ? 1.6 : 1.2}
        filter={`url(#${shadowId})`}
      />
      {/* accent rail on the left edge of the split node */}
      <rect x={x - w / 2} y={y - h / 2} width={3.5} height={h} rx={1.5} fill={accent} />
      <text
        x={x}
        y={y}
        dy="0.34em"
        textAnchor="middle"
        fill={p.ink}
        className="font-mono"
        style={{ fontSize: 10.5, letterSpacing: "0.01em" }}
      >
        {fit(label, w)}
      </text>
    </g>
  );
}

function LeafNode({
  x,
  y,
  w,
  h,
  label,
  chip,
  confidence,
  active,
  shadowId,
  p,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  chip: string;
  confidence?: number;
  active: boolean;
  shadowId: string;
  p: Pal;
}) {
  const hasConf = confidence != null;
  return (
    <g style={{ cursor: "default" }}>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={h / 2}
        fill={withAlpha(chip, active ? 0.22 : 0.13)}
        stroke={active ? chip : withAlpha(chip, 0.6)}
        strokeWidth={active ? 1.6 : 1.2}
        filter={`url(#${shadowId})`}
      />
      <circle cx={x - w / 2 + 13} cy={y} r={4.5} fill={chip} />
      <text
        x={x - w / 2 + 24}
        y={y}
        dy="0.34em"
        textAnchor="start"
        fill={p.ink}
        className="font-sans"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        {fit(label, w - (hasConf ? 64 : 36))}
      </text>
      {hasConf && (
        <text
          x={x + w / 2 - 11}
          y={y}
          dy="0.34em"
          textAnchor="end"
          fill={p.inkMuted}
          className="font-mono tabular-nums"
          style={{ fontSize: 9.5 }}
        >
          {Math.round(confidence! * 100)}%
        </text>
      )}
    </g>
  );
}

function EdgeLabel({
  x,
  y,
  text,
  fg,
  bg,
  stroke,
}: {
  x: number;
  y: number;
  text: string;
  fg: string;
  bg: string;
  stroke: string;
}) {
  const wEst = text.length * 5.6 + 12;
  return (
    <g>
      <rect
        x={x - wEst / 2}
        y={y - 8}
        width={wEst}
        height={16}
        rx={8}
        fill={bg}
        stroke={stroke}
        strokeWidth={1}
      />
      <text
        x={x}
        y={y}
        dy="0.32em"
        textAnchor="middle"
        fill={fg}
        className={cn("font-mono uppercase")}
        style={{ fontSize: 8.5, letterSpacing: "0.06em" }}
      >
        {text}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Truncate a label to fit a node width (rough monospace metric). */
function fit(text: string, w: number): string {
  const max = Math.max(3, Math.floor((w - 14) / 6.0));
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max - 1)) + "…";
}

function formatVal(v: number | undefined): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "decision-tree",
  name: "Decision Tree",
  category: "trees-graphs",
  description:
    "A tidy, recursively laid-out decision tree where split nodes pose a rule and color-chipped leaves report the predicted class with confidence.",
  tags: ["tree", "classifier", "decision", "hierarchy", "rules", "interpretability"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "DecisionTree",
  sourcePath: "trees-graphs/DecisionTree",
  aspect: 16 / 11,
  controls: [
    {
      key: "tree",
      label: "Tree",
      type: "json",
      group: "Data",
      help: "Nested node: { condition?, class?, value?, confidence?, branch?, children:[] }. Internal nodes have a condition + children; leaves have a class or value.",
      default: DEFAULT_TREE,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      group: "Layout",
      default: "vertical",
      options: [
        { value: "vertical", label: "Top-down" },
        { value: "horizontal", label: "Left-right" },
      ],
    },
    { key: "nodeWidth", label: "Node width", type: "number", group: "Layout", default: 132, min: 80, max: 220, step: 4, unit: "px" },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "showConfidence", label: "Show confidence", type: "boolean", group: "Style", default: true },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "robotics-policy",
      name: "Robotics policy",
      props: {
        title: "Manipulation policy decision tree",
        source: "rollout · n=4,096",
      },
    },
    {
      id: "loan-classifier",
      name: "Credit classifier",
      props: {
        title: "Credit-risk classifier",
        orientation: "horizontal",
        nodeWidth: 150,
        tree: {
          condition: "income ≤ 45k",
          children: [
            {
              branch: "true",
              condition: "debt ratio ≤ 0.4",
              children: [
                { branch: "true", class: "approve", confidence: 0.79 },
                { branch: "false", class: "deny", confidence: 0.91 },
              ],
            },
            {
              branch: "false",
              condition: "credit score ≤ 680",
              children: [
                { branch: "true", class: "review", confidence: 0.64 },
                { branch: "false", class: "approve", confidence: 0.97 },
              ],
            },
          ],
        },
      },
    },
    {
      id: "iris",
      name: "Iris species",
      props: {
        title: "Iris species classifier",
        nodeWidth: 140,
        tree: {
          condition: "petal len ≤ 2.45 cm",
          children: [
            { branch: "true", class: "setosa", confidence: 1.0 },
            {
              branch: "false",
              condition: "petal wid ≤ 1.75 cm",
              children: [
                { branch: "true", class: "versicolor", confidence: 0.91 },
                { branch: "false", class: "virginica", confidence: 0.98 },
              ],
            },
          ],
        },
      },
    },
  ],
};
