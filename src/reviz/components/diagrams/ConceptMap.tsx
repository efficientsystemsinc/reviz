"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Glow,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
  clamp,
  uid,
  usePalette,
  useInView,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  mix,
  readableOn,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ConceptNode {
  id: string;
  label: string;
}

interface ConceptEdge {
  source: string;
  target: string;
  /** The relationship verb shown on the edge, e.g. "enables". */
  label?: string;
}

export interface ConceptMapProps {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  layout?: "radial" | "grid";
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

interface Placed extends ConceptNode {
  x: number;
  y: number;
  degree: number;
}

/* ------------------------------------------------------------------ */
/* Defaults — a small knowledge map of ML training concepts            */
/* ------------------------------------------------------------------ */

const DEFAULT_NODES: ConceptNode[] = [
  { id: "data", label: "Training Data" },
  { id: "model", label: "Neural Network" },
  { id: "loss", label: "Loss Function" },
  { id: "grad", label: "Gradient" },
  { id: "optim", label: "Optimizer" },
  { id: "overfit", label: "Overfitting" },
  { id: "reg", label: "Regularization" },
  { id: "gen", label: "Generalization" },
];

const DEFAULT_EDGES: ConceptEdge[] = [
  { source: "data", target: "model", label: "trains" },
  { source: "model", target: "loss", label: "measured by" },
  { source: "loss", target: "grad", label: "produces" },
  { source: "grad", target: "optim", label: "drives" },
  { source: "optim", target: "model", label: "updates" },
  { source: "model", target: "overfit", label: "risks" },
  { source: "reg", target: "overfit", label: "reduces" },
  { source: "reg", target: "gen", label: "improves" },
  { source: "gen", target: "model", label: "evaluates" },
];

/* ------------------------------------------------------------------ */
/* Deterministic layout in a unit box [0,1]^2                          */
/* ------------------------------------------------------------------ */

function buildLayout(
  nodes: ConceptNode[],
  edges: ConceptEdge[],
  layout: "radial" | "grid",
): Placed[] {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const degree = new Map<string, number>();
  for (const id of ids) degree.set(id, 0);
  for (const e of edges) {
    if (idSet.has(e.source)) degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    if (idSet.has(e.target)) degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const n = nodes.length;
  const pts: { x: number; y: number }[] = [];

  if (layout === "grid") {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      pts.push({
        x: cols > 1 ? c / (cols - 1) : 0.5,
        y: rows > 1 ? r / (rows - 1) : 0.5,
      });
    }
  } else {
    // Radial: the highest-degree concept anchors the center; the rest fan
    // out on an even ring, ordered by descending degree so hubs sit first.
    const order = [...nodes].sort(
      (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
    );
    const rank = new Map(order.map((node, i) => [node.id, i]));
    for (let i = 0; i < n; i++) {
      const idx = rank.get(nodes[i].id) ?? i;
      if (idx === 0 && n > 2) {
        pts.push({ x: 0.5, y: 0.5 });
      } else {
        const ringCount = n > 2 ? n - 1 : n;
        const ringIdx = n > 2 ? idx - 1 : idx;
        const angle = (ringIdx / ringCount) * Math.PI * 2 - Math.PI / 2;
        pts.push({
          x: 0.5 + 0.46 * Math.cos(angle),
          y: 0.5 + 0.46 * Math.sin(angle),
        });
      }
    }
  }

  // Normalize to a padded [0,1] box so the map always fills the frame.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pt of pts) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const pad = 0.08;

  return nodes.map((node, i) => ({
    ...node,
    x: pad + ((pts[i].x - minX) / spanX) * (1 - 2 * pad),
    y: pad + ((pts[i].y - minY) / spanY) * (1 - 2 * pad),
    degree: degree.get(node.id) ?? 0,
  }));
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function ConceptMap({
  nodes = DEFAULT_NODES,
  edges = DEFAULT_EDGES,
  layout = "radial",
  title = "Concept map",
  caption = "",
  source = "",
  accent = "",
  duration = 1200,
}: ConceptMapProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const ids = useMemo(() => uid("concept"), []);

  const placed = useMemo(
    () => buildLayout(nodes, edges, layout),
    [nodes, edges, layout],
  );

  const posById = useMemo(() => {
    const m = new Map<string, Placed>();
    for (const d of placed) m.set(d.id, d);
    return m;
  }, [placed]);

  const validEdges = useMemo(
    () => edges.filter((e) => posById.has(e.source) && posById.has(e.target)),
    [edges, posById],
  );

  // Adjacency for neighborhood highlight on hover.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const d of placed) map.set(d.id, new Set());
    for (const e of validEdges) {
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [placed, validEdges]);

  const maxDegree = useMemo(
    () => Math.max(1, ...placed.map((d) => d.degree)),
    [placed],
  );
  const radiusFor = (d: Placed) => 16 + 12 * Math.sqrt(d.degree / maxDegree);

  const neighbors = hover ? adjacency.get(hover.id) : undefined;
  const nodeActive = (id: string) =>
    !hover || hover.id === id || (neighbors?.has(id) ?? false);
  const edgeActive = (e: ConceptEdge) =>
    !hover || e.source === hover.id || e.target === hover.id;

  const animBase = reduced ? 0 : duration / 1000;
  const ease = [0.22, 1, 0.36, 1] as const;
  const totalNodes = placed.length;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={16 / 11}
          margin={{ top: 14, right: 14, bottom: 14, left: 14 }}
        >
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;
            const px = (d: Placed | undefined) => (d ? d.x * W : 0);
            const py = (d: Placed | undefined) => (d ? d.y * H : 0);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={`${ids}-shadow`} dy={3} blur={7} opacity={0.18} />
                  <Glow id={`${ids}-glow`} blur={5} />
                  <marker
                    id={`${ids}-arrow`}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="6.5"
                    markerHeight="6.5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={withAlpha(p.borderStrong, 0.9)} />
                  </marker>
                  <marker
                    id={`${ids}-arrow-hot`}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
                  </marker>
                </defs>

                {/* Labeled relationship edges */}
                <g>
                  {validEdges.map((e, i) => {
                    const a = posById.get(e.source)!;
                    const b = posById.get(e.target)!;
                    const ra = radiusFor(a);
                    const rb = radiusFor(b);

                    const ax = px(a);
                    const ay = py(a);
                    const bx = px(b);
                    const by = py(b);
                    const dx = bx - ax;
                    const dy = by - ay;
                    const dist = Math.hypot(dx, dy) || 1;
                    const ux = dx / dist;
                    const uy = dy / dist;

                    // Trim endpoints to the node rims so the arrow lands cleanly.
                    const x1 = ax + ux * ra;
                    const y1 = ay + uy * ra;
                    const x2 = bx - ux * (rb + 3);
                    const y2 = by - uy * (rb + 3);
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;

                    const active = edgeActive(e);
                    const dim = hover != null && !active;
                    const stroke = active && hover ? fill : withAlpha(p.borderStrong, 0.75);

                    const delay = reduced ? 0 : 0.1 + i * 0.05;
                    const label = e.label ?? "";
                    const labelW = label.length * 5.6 + 12;

                    return (
                      <g key={`${token}-edge-${i}`} style={{ opacity: dim ? 0.22 : 1 }}>
                        <motion.line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={stroke}
                          strokeWidth={active && hover ? 2 : 1.4}
                          strokeLinecap="round"
                          markerEnd={`url(#${ids}-${active && hover ? "arrow-hot" : "arrow"})`}
                          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                          animate={
                            reduced
                              ? { opacity: 1 }
                              : { pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }
                          }
                          transition={{
                            pathLength: { duration: animBase * 0.5, delay, ease },
                            opacity: { duration: 0.25, delay },
                          }}
                        />
                        {label && (
                          <motion.g
                            initial={reduced ? false : { opacity: 0 }}
                            animate={{ opacity: inView ? 1 : reduced ? 1 : 0 }}
                            transition={{ duration: 0.3, delay: delay + animBase * 0.4 }}
                          >
                            <rect
                              x={mx - labelW / 2}
                              y={my - 8}
                              width={labelW}
                              height={16}
                              rx={4}
                              fill={p.canvas}
                              stroke={active && hover ? withAlpha(fill, 0.45) : p.border}
                              strokeWidth={1}
                            />
                            <text
                              x={mx}
                              y={my}
                              dy="0.32em"
                              textAnchor="middle"
                              className="font-mono lowercase"
                              fontSize={9}
                              letterSpacing="0.03em"
                              fill={active && hover ? fill : p.inkMuted}
                              style={{ pointerEvents: "none" }}
                            >
                              {label}
                            </text>
                          </motion.g>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Concept nodes */}
                <g>
                  {placed.map((d, i) => {
                    const r = radiusFor(d);
                    const cx = px(d);
                    const cy = py(d);
                    const active = nodeActive(d.id);
                    const focused = hover?.id === d.id;
                    const dim = hover != null && !active;

                    const surface = focused ? mix(p.surface, fill, 0.14) : p.surface;
                    const stroke = focused ? fill : active && hover ? withAlpha(fill, 0.7) : withAlpha(fill, 0.5);
                    const delay = reduced ? 0 : 0.1 + i * 0.06;

                    return (
                      <motion.g
                        key={`${token}-node-${d.id}`}
                        style={{ cursor: "pointer", opacity: dim ? 0.32 : 1 }}
                        initial={reduced ? false : { opacity: 0, scale: 0 }}
                        animate={
                          reduced
                            ? { opacity: 1, scale: 1 }
                            : {
                                opacity: inView ? (dim ? 0.32 : 1) : 0,
                                scale: inView ? 1 : 0,
                              }
                        }
                        transition={{
                          duration: animBase * 0.45,
                          delay,
                          ease: [0.34, 1.56, 0.64, 1],
                        }}
                        onMouseMove={(ev) => {
                          const svg = ev.currentTarget.ownerSVGElement as SVGSVGElement;
                          const box = svg.getBoundingClientRect();
                          setHover({
                            id: d.id,
                            x: ev.clientX - box.left,
                            y: ev.clientY - box.top,
                          });
                        }}
                        onMouseLeave={() => setHover(null)}
                      >
                        {focused && (
                          <circle cx={cx} cy={cy} r={r + 7} fill={withAlpha(fill, 0.14)} />
                        )}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={focused ? surface : p.surface}
                          stroke={stroke}
                          strokeWidth={focused ? 2 : 1.4}
                          filter={focused ? `url(#${ids}-glow)` : `url(#${ids}-shadow)`}
                        />
                        <text
                          x={cx}
                          y={cy}
                          dy="0.32em"
                          textAnchor="middle"
                          className="font-sans"
                          fontSize={r > 24 ? 10.5 : 9.5}
                          fontWeight={600}
                          fill={focused ? readableOn(surface) : p.ink}
                          style={{ pointerEvents: "none" }}
                        >
                          {wrapLabel(d.label, r)}
                        </text>
                      </motion.g>
                    );
                  })}
                </g>

                {totalNodes === 0 && (
                  <text
                    x={W / 2}
                    y={H / 2}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={11}
                    fill={p.inkFaint}
                  >
                    No concepts to display
                  </text>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null &&
            (() => {
              const d = posById.get(hover.id);
              if (!d) return null;
              const rels = validEdges.filter(
                (e) => e.source === d.id || e.target === d.id,
              );
              return (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {d.label}
                  </div>
                  <TooltipRow label="relations" value={d.degree} />
                  {rels.slice(0, 4).map((e, i) => {
                    const out = e.source === d.id;
                    const other = posById.get(out ? e.target : e.source);
                    return (
                      <TooltipRow
                        key={i}
                        label={e.label ?? (out ? "→" : "←")}
                        value={`${out ? "→ " : "← "}${other?.label ?? ""}`}
                      />
                    );
                  })}
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
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Soft single-line truncation tuned to the node radius. */
function wrapLabel(label: string, r: number): string {
  const maxChars = clamp(Math.round(r / 2.6), 6, 14);
  return label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "concept-map",
  name: "Concept Map",
  category: "diagrams",
  description:
    "A knowledge map of concept nodes joined by labeled relationship verbs, laid out deterministically in a radial or grid arrangement, where hovering a concept lights up its neighborhood and the rest fades back.",
  tags: ["concept-map", "knowledge", "relationships", "diagram", "graph", "semantic"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ConceptMap",
  sourcePath: "diagrams/ConceptMap",
  aspect: 16 / 11,
  controls: [
    {
      key: "nodes",
      label: "Concepts",
      type: "json",
      group: "Data",
      help: "[{ id, label }] — one entry per concept node.",
      default: DEFAULT_NODES,
    },
    {
      key: "edges",
      label: "Relationships",
      type: "json",
      group: "Data",
      help: "[{ source, target, label? }] — label is the verb shown on the edge; ids must match concepts.",
      default: DEFAULT_EDGES,
    },
    {
      key: "layout",
      label: "Layout",
      type: "select",
      group: "Layout",
      default: "radial",
      options: [
        { value: "radial", label: "Radial (hub-centered)" },
        { value: "grid", label: "Grid" },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Concept map" },
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
    },
  ],
  presets: [
    {
      id: "ml-training",
      name: "ML training loop",
      props: {
        title: "How a model learns",
        caption: "Concepts and the relationships that connect them in supervised training.",
        layout: "radial",
        nodes: DEFAULT_NODES,
        edges: DEFAULT_EDGES,
      },
    },
    {
      id: "transformer",
      name: "Transformer concepts",
      props: {
        title: "Transformer building blocks",
        layout: "radial",
        nodes: [
          { id: "tok", label: "Tokens" },
          { id: "embed", label: "Embeddings" },
          { id: "attn", label: "Attention" },
          { id: "ctx", label: "Context" },
          { id: "ffn", label: "Feed-Forward" },
          { id: "logits", label: "Logits" },
          { id: "softmax", label: "Softmax" },
        ],
        edges: [
          { source: "tok", target: "embed", label: "mapped to" },
          { source: "embed", target: "attn", label: "feeds" },
          { source: "attn", target: "ctx", label: "builds" },
          { source: "ctx", target: "ffn", label: "transforms" },
          { source: "ffn", target: "logits", label: "yields" },
          { source: "logits", target: "softmax", label: "normalized by" },
          { source: "softmax", target: "tok", label: "predicts" },
        ],
      },
    },
    {
      id: "grid",
      name: "Grid layout",
      props: {
        title: "Reinforcement learning concepts",
        layout: "grid",
        nodes: [
          { id: "agent", label: "Agent" },
          { id: "env", label: "Environment" },
          { id: "state", label: "State" },
          { id: "action", label: "Action" },
          { id: "reward", label: "Reward" },
          { id: "policy", label: "Policy" },
          { id: "value", label: "Value" },
          { id: "return", label: "Return" },
        ],
        edges: [
          { source: "agent", target: "action", label: "takes" },
          { source: "action", target: "env", label: "affects" },
          { source: "env", target: "state", label: "emits" },
          { source: "env", target: "reward", label: "emits" },
          { source: "state", target: "agent", label: "observed by" },
          { source: "reward", target: "return", label: "accumulates" },
          { source: "policy", target: "action", label: "selects" },
          { source: "value", target: "policy", label: "guides" },
          { source: "return", target: "value", label: "estimates" },
        ],
      },
    },
  ],
};
