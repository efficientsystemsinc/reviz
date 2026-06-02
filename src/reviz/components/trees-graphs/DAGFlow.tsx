"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  Glow,
  ResponsiveSvg,
  SoftShadow,
  uid,
  usePalette,
  usePrefersReducedMotion,
  useInView,
  useReplay,
  withAlpha,
  mix,
  readableOn,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface DAGNode {
  id: string;
  label: string;
  /** Optional second line shown beneath the label. */
  sublabel?: string;
  /** Optional accent override for a single node. */
  tone?: "accent" | "ok" | "warn" | "bad" | "muted";
}

interface DAGEdge {
  source: string;
  target: string;
  label?: string;
}

export interface DAGFlowProps {
  nodes?: DAGNode[];
  edges?: DAGEdge[];
  direction?: "LR" | "TB";
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Topological layered layout                                          */
/* ------------------------------------------------------------------ */

interface LaidNode extends DAGNode {
  /** Topological layer (longest path from a root). */
  layer: number;
  /** Order within the layer. */
  slot: number;
  /** Number of nodes in this layer. */
  lane: number;
}

/**
 * Longest-path layering: every node sits one layer past its deepest parent.
 * Within a layer, nodes are ordered by the mean layer-position of their
 * parents (a barycenter pass) to reduce edge crossings, then by input order.
 */
function layout(nodes: DAGNode[], edges: DAGEdge[]) {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const valid = edges.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target,
  );

  const indeg = new Map<string, number>();
  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  ids.forEach((id) => {
    indeg.set(id, 0);
    outAdj.set(id, []);
    inAdj.set(id, []);
  });
  valid.forEach((e) => {
    outAdj.get(e.source)!.push(e.target);
    inAdj.get(e.target)!.push(e.source);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  });

  // Kahn topological sort with longest-path relaxation; cycle-tolerant.
  const layer = new Map<string, number>();
  ids.forEach((id) => layer.set(id, 0));
  const work = new Map(indeg);
  const queue = ids.filter((id) => (work.get(id) ?? 0) === 0);
  const seen = new Set(queue);
  let guard = 0;
  const cap = ids.length * ids.length + ids.length + 1;
  while (queue.length && guard < cap) {
    guard++;
    const u = queue.shift()!;
    const lu = layer.get(u) ?? 0;
    for (const v of outAdj.get(u) ?? []) {
      if ((layer.get(v) ?? 0) < lu + 1) layer.set(v, lu + 1);
      const d = (work.get(v) ?? 0) - 1;
      work.set(v, d);
      if (d <= 0 && !seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  // Nodes inside a cycle keep a layer one past their deepest reachable parent.
  ids.forEach((id) => {
    if (!seen.has(id)) {
      const best = (inAdj.get(id) ?? []).reduce(
        (m, s) => Math.max(m, (layer.get(s) ?? 0) + 1),
        layer.get(id) ?? 0,
      );
      layer.set(id, best);
    }
  });

  const maxLayer = Math.max(0, ...ids.map((id) => layer.get(id) ?? 0));
  const buckets: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  // Preserve input order so the first column is deterministic.
  nodes.forEach((n) => buckets[layer.get(n.id) ?? 0].push(n.id));

  // Barycenter ordering: sort each layer (after the first) by the average
  // slot of its parents in the previous arrangement to untangle fan-in/out.
  const slotOf = new Map<string, number>();
  buckets.forEach((bucket) => bucket.forEach((id, i) => slotOf.set(id, i)));
  for (let l = 1; l < buckets.length; l++) {
    const bucket = buckets[l];
    const bary = new Map<string, number>();
    bucket.forEach((id, i) => {
      const parents = inAdj.get(id) ?? [];
      const within = parents.filter((s) => (layer.get(s) ?? 0) === l - 1);
      const mean =
        within.length > 0
          ? within.reduce((sum, s) => sum + (slotOf.get(s) ?? 0), 0) / within.length
          : i;
      bary.set(id, mean);
    });
    bucket.sort((a, b) => (bary.get(a) ?? 0) - (bary.get(b) ?? 0));
    bucket.forEach((id, i) => slotOf.set(id, i));
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const laid: LaidNode[] = [];
  buckets.forEach((bucket, l) => {
    bucket.forEach((id, slot) => {
      laid.push({ ...byId.get(id)!, layer: l, slot, lane: bucket.length });
    });
  });

  // Assign a unique sequential index to every node (badge order), so nodes that
  // share a topological layer still get distinct numbers instead of duplicates.
  const indexOf = new Map<string, number>();
  laid.forEach((n, i) => indexOf.set(n.id, i));

  return { laid, edges: valid, layers: maxLayer + 1, indexOf };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_NODES: DAGNode[] = [
  { id: "data", label: "Dataset", sublabel: "12.4M docs", tone: "muted" },
  { id: "tok", label: "Tokenize", sublabel: "BPE 128k", tone: "muted" },
  { id: "pretrain", label: "Pretrain", sublabel: "256 × GPU-B", tone: "accent" },
  { id: "sft", label: "SFT", sublabel: "instruction", tone: "accent" },
  { id: "rm", label: "Reward Model", sublabel: "pairwise", tone: "accent" },
  { id: "rlhf", label: "RLHF", sublabel: "PPO", tone: "accent" },
  { id: "evalcap", label: "Capability", sublabel: "Knowledge-bench · GPQA", tone: "ok" },
  { id: "evalsafe", label: "Safety", sublabel: "red-team", tone: "warn" },
  { id: "ship", label: "Deploy", sublabel: "canary 5%", tone: "ok" },
];

const DEFAULT_EDGES: DAGEdge[] = [
  { source: "data", target: "tok", label: "raw" },
  { source: "tok", target: "pretrain", label: "tokens" },
  { source: "pretrain", target: "sft", label: "base" },
  { source: "pretrain", target: "rm", label: "base" },
  { source: "sft", target: "rlhf", label: "policy" },
  { source: "rm", target: "rlhf", label: "reward" },
  { source: "rlhf", target: "evalcap" },
  { source: "rlhf", target: "evalsafe" },
  { source: "evalcap", target: "ship", label: "pass" },
  { source: "evalsafe", target: "ship", label: "pass" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function DAGFlow({
  nodes = DEFAULT_NODES,
  edges = DEFAULT_EDGES,
  direction = "LR",
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1300,
}: DAGFlowProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<string | null>(null);

  const ids = useMemo(() => uid("dag"), []);
  const { laid, edges: cleanEdges, layers, indexOf } = useMemo(
    () => layout(nodes, edges),
    [nodes, edges],
  );

  const horizontal = direction === "LR";
  const maxLane = Math.max(1, ...laid.map((n) => n.lane));
  const animBase = reduced ? 0 : duration / 1000;

  const toneColor = (n: LaidNode): string => {
    switch (n.tone) {
      case "ok":
        return p.ok;
      case "warn":
        return p.warn;
      case "bad":
        return p.bad;
      case "muted":
        return p.inkMuted;
      default:
        return fill;
    }
  };

  // Reveal one layer at a time: each layer's nodes appear, then its outgoing
  // edges draw toward the next layer.
  const layerStep = animBase / Math.max(1, layers);
  const nodeDelay = (n: LaidNode) =>
    reduced ? 0 : n.layer * layerStep + n.slot * 0.05;
  const edgeDelay = (srcLayer: number) =>
    reduced ? 0 : (srcLayer + 0.55) * layerStep;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg
          aspect={horizontal ? 16 / 9 : 3 / 4}
          margin={{ top: 24, right: 24, bottom: 24, left: 24 }}
        >
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;

            // Box footprint, clamped to leave breathing room between layers/lanes.
            const bw = horizontal ? W / layers - 22 : W / maxLane - 16;
            const bh = horizontal ? H / maxLane - 16 : H / layers - 20;
            const boxW = Math.max(86, Math.min(150, bw));
            const boxH = Math.max(46, Math.min(64, bh));

            // Inset the primary (layer) axis so end layers sit fully inside,
            // with extra clearance so the first/last columns never crowd the frame.
            const primaryExtent = horizontal ? boxW : boxH;
            const pad = primaryExtent / 2 + 12;
            const primaryLen = (horizontal ? W : H) - pad * 2;

            const center = (n: LaidNode) => {
              const along =
                pad +
                (layers > 1 ? (n.layer / (layers - 1)) * primaryLen : primaryLen / 2);
              const across = (horizontal ? H : W) * ((n.slot + 1) / (n.lane + 1));
              return horizontal
                ? { cx: along, cy: across }
                : { cx: across, cy: along };
            };

            const posById = new Map<string, { cx: number; cy: number }>();
            laid.forEach((n) => posById.set(n.id, center(n)));

            // Layer band centers along the primary axis (for the faint guides).
            const bandAt = (l: number) =>
              pad + (layers > 1 ? (l / (layers - 1)) * primaryLen : primaryLen / 2);

            const hw = boxW / 2;
            const hh = boxH / 2;

            return (
              <g transform={`translate(${margin.left},${margin.top})`}>
                <defs>
                  <SoftShadow id={`${ids}-shadow`} dy={3} blur={8} opacity={0.16} />
                  <Glow id={`${ids}-glow`} blur={6} />
                  <marker
                    id={`${ids}-arrow`}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="6.5"
                    markerHeight="6.5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={p.borderStrong} />
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

                {/* Faint layer guides + topological index */}
                <g>
                  {Array.from({ length: layers }, (_, l) => {
                    const at = bandAt(l);
                    const x1 = horizontal ? at : pad - primaryExtent;
                    const x2 = horizontal ? at : W - (pad - primaryExtent);
                    const tx = horizontal ? at : 2;
                    const ty = horizontal ? 0 : at;
                    return (
                      <motion.g
                        key={`band-${l}`}
                        initial={{ opacity: reduced ? 1 : 0 }}
                        animate={{ opacity: inView ? 1 : reduced ? 1 : 0 }}
                        transition={{ duration: 0.4, delay: reduced ? 0 : l * layerStep }}
                      >
                        <line
                          x1={horizontal ? x1 : 0}
                          y1={horizontal ? 0 : x1}
                          x2={horizontal ? x2 : W}
                          y2={horizontal ? H : x2}
                          stroke={p.grid}
                          strokeWidth={1}
                          strokeDasharray="2 5"
                          style={{ opacity: 0.6 }}
                        />
                        <text
                          x={tx}
                          y={ty}
                          dy={horizontal ? "0.9em" : "0.32em"}
                          textAnchor={horizontal ? "middle" : "start"}
                          className="font-mono"
                          fontSize={8.5}
                          letterSpacing="0.12em"
                          fill={p.inkFaint}
                        >
                          {`L${l}`}
                        </text>
                      </motion.g>
                    );
                  })}
                </g>

                {/* Edges */}
                <g>
                  {cleanEdges.map((e, i) => {
                    const a = posById.get(e.source);
                    const b = posById.get(e.target);
                    if (!a || !b) return null;

                    let x1 = a.cx;
                    let y1 = a.cy;
                    let x2 = b.cx;
                    let y2 = b.cy;
                    if (horizontal) {
                      x1 = a.cx + hw;
                      x2 = b.cx - hw;
                    } else {
                      y1 = a.cy + hh;
                      y2 = b.cy - hh;
                    }

                    // Smooth cubic between trailing face of source and leading
                    // face of target — handles fan-in / fan-out cleanly.
                    const d = horizontal
                      ? `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
                      : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;

                    const active =
                      hover != null && (e.source === hover || e.target === hover);
                    const dim = hover != null && !active;
                    const srcNode = laid.find((n) => n.id === e.source);
                    const delay = edgeDelay(srcNode ? srcNode.layer : 0);

                    return (
                      <g key={`${token}-edge-${i}`}>
                        <motion.path
                          d={d}
                          fill="none"
                          stroke={active ? fill : p.borderStrong}
                          strokeWidth={active ? 2 : 1.4}
                          strokeLinecap="round"
                          markerEnd={`url(#${ids}-${active ? "arrow-hot" : "arrow"})`}
                          style={{ opacity: dim ? 0.22 : active ? 1 : 0.8 }}
                          initial={{
                            pathLength: reduced ? 1 : 0,
                            opacity: reduced ? (dim ? 0.22 : 1) : 0,
                          }}
                          animate={{
                            pathLength: inView ? 1 : reduced ? 1 : 0,
                            opacity: inView
                              ? dim
                                ? 0.22
                                : active
                                  ? 1
                                  : 0.8
                              : reduced
                                ? 1
                                : 0,
                          }}
                          transition={{
                            pathLength: {
                              duration: reduced ? 0 : layerStep * 0.75,
                              delay,
                              ease: [0.22, 1, 0.36, 1],
                            },
                            opacity: { duration: 0.2, delay },
                          }}
                        />
                      </g>
                    );
                  })}
                </g>

                {/* Nodes */}
                <g>
                  {laid.map((n, i) => {
                    const pos = posById.get(n.id)!;
                    const x = pos.cx - hw;
                    const y = pos.cy - hh;
                    const tone = toneColor(n);
                    const active = hover === n.id;
                    const neighbor =
                      hover != null &&
                      cleanEdges.some(
                        (e) =>
                          (e.source === hover && e.target === n.id) ||
                          (e.target === hover && e.source === n.id),
                      );
                    const dim = hover != null && !active && !neighbor;

                    const surface = active ? mix(p.surface, tone, 0.1) : p.surface;
                    const stroke = active || neighbor ? tone : withAlpha(tone, 0.5);
                    const delay = nodeDelay(n);

                    return (
                      <motion.g
                        key={`${token}-node-${n.id}-${i}`}
                        style={{ cursor: "pointer", opacity: dim ? 0.38 : 1 }}
                        onMouseEnter={() => setHover(n.id)}
                        onMouseLeave={() => setHover(null)}
                        initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.85 }}
                        animate={{
                          opacity: inView ? (dim ? 0.38 : 1) : reduced ? 1 : 0,
                          scale: inView ? 1 : reduced ? 1 : 0.85,
                        }}
                        transition={{
                          duration: reduced ? 0 : 0.42,
                          delay,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <rect
                          x={x}
                          y={y}
                          width={boxW}
                          height={boxH}
                          rx={9}
                          fill={surface}
                          stroke={stroke}
                          strokeWidth={active ? 2 : 1.25}
                          filter={`url(#${ids}-shadow)`}
                        />
                        {/* Accent rail along the leading edge */}
                        <rect
                          x={x}
                          y={y}
                          width={4.5}
                          height={boxH}
                          rx={2.25}
                          fill={tone}
                          filter={active ? `url(#${ids}-glow)` : undefined}
                          style={{ opacity: active ? 1 : 0.85 }}
                        />
                        {/* Layer chip */}
                        <circle
                          cx={x + boxW - 13}
                          cy={y + 13}
                          r={8}
                          fill={active ? tone : withAlpha(tone, 0.14)}
                          stroke={active ? "none" : withAlpha(tone, 0.4)}
                          strokeWidth={1}
                        />
                        <text
                          x={x + boxW - 13}
                          y={y + 13}
                          dy="0.34em"
                          textAnchor="middle"
                          className="font-mono"
                          fontSize={8.5}
                          fontWeight={600}
                          fill={active ? readableOn(tone) : tone}
                        >
                          {indexOf.get(n.id) ?? i}
                        </text>
                        {/* Label */}
                        <text
                          x={x + 15}
                          y={pos.cy - (n.sublabel ? 4 : 0)}
                          dy={n.sublabel ? 0 : "0.32em"}
                          textAnchor="start"
                          className="font-sans"
                          fontSize={12.5}
                          fontWeight={600}
                          fill={p.ink}
                        >
                          {truncate(n.label, horizontal ? 15 : 17)}
                        </text>
                        {n.sublabel && (
                          <text
                            x={x + 15}
                            y={pos.cy + 12}
                            textAnchor="start"
                            className="font-mono"
                            fontSize={9}
                            letterSpacing="0.02em"
                            fill={p.inkFaint}
                          >
                            {truncate(n.sublabel, horizontal ? 16 : 20)}
                          </text>
                        )}
                      </motion.g>
                    );
                  })}
                </g>

                {/* Edge labels — drawn last so their plates sit above the
                    node boxes and never get clipped by an adjacent column. */}
                <g>
                  {cleanEdges.map((e, i) => {
                    if (!e.label) return null;
                    const a = posById.get(e.source);
                    const b = posById.get(e.target);
                    if (!a || !b) return null;

                    let x1 = a.cx;
                    let y1 = a.cy;
                    let x2 = b.cx;
                    let y2 = b.cy;
                    if (horizontal) {
                      x1 = a.cx + hw;
                      x2 = b.cx - hw;
                    } else {
                      y1 = a.cy + hh;
                      y2 = b.cy - hh;
                    }

                    const active =
                      hover != null && (e.source === hover || e.target === hover);
                    const dim = hover != null && !active;
                    const srcNode = laid.find((n) => n.id === e.source);
                    const delay = edgeDelay(srcNode ? srcNode.layer : 0);

                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    const labelW = e.label.length * 6.2 + 12;

                    return (
                      <motion.g
                        key={`${token}-edge-label-${i}`}
                        initial={{ opacity: reduced ? 1 : 0 }}
                        animate={{
                          opacity: inView ? (dim ? 0.25 : 1) : reduced ? 1 : 0,
                        }}
                        transition={{ duration: 0.3, delay: delay + layerStep * 0.45 }}
                      >
                        <rect
                          x={mx - labelW / 2}
                          y={my - 8}
                          width={labelW}
                          height={16}
                          rx={4}
                          fill={p.canvas}
                          stroke={active ? withAlpha(fill, 0.4) : p.border}
                          strokeWidth={1}
                        />
                        <text
                          x={mx}
                          y={my}
                          dy="0.32em"
                          textAnchor="middle"
                          className="font-mono"
                          fontSize={9}
                          letterSpacing="0.03em"
                          fill={active ? fill : p.inkMuted}
                        >
                          {e.label}
                        </text>
                      </motion.g>
                    );
                  })}
                </g>

                {laid.length === 0 && (
                  <text
                    x={W / 2}
                    y={H / 2}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={11}
                    fill={p.inkFaint}
                  >
                    No nodes to display
                  </text>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

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
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "dag-flow",
  name: "DAG / Pipeline Flow",
  category: "trees-graphs",
  description:
    "A directed acyclic graph laid out in topological layers: rounded nodes auto-route into columns or rows, edges fan in and out with drawn-in arrowheads, and the whole graph reveals layer by layer with hover-traced dependencies.",
  tags: ["dag", "graph", "pipeline", "topological", "layers", "fan-out", "fan-in", "directed"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "DAGFlow",
  sourcePath: "trees-graphs/DAGFlow",
  aspect: 16 / 9,
  controls: [
    {
      key: "nodes",
      label: "Nodes",
      type: "json",
      group: "Data",
      help: "[{ id, label, sublabel?, tone? }] — tone is accent | ok | warn | bad | muted.",
      default: DEFAULT_NODES,
    },
    {
      key: "edges",
      label: "Edges",
      type: "json",
      group: "Data",
      help: "[{ source, target, label? }] referencing node ids. Multiple parents/children allowed.",
      default: DEFAULT_EDGES,
    },
    {
      key: "direction",
      label: "Direction",
      type: "select",
      group: "Layout",
      default: "LR",
      options: [
        { value: "LR", label: "Left → Right" },
        { value: "TB", label: "Top → Bottom" },
      ],
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
      default: 1300,
      min: 0,
      max: 4000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "train-eval",
      name: "Train + eval DAG (fan-in/out)",
      props: {
        title: "Post-training pipeline with paired eval gate",
        caption:
          "Pretrain fans out to SFT and a reward model; both feed RLHF, which fans out to capability and safety evals that must jointly pass before deploy.",
        direction: "LR",
        nodes: DEFAULT_NODES,
        edges: DEFAULT_EDGES,
      },
    },
    {
      id: "rag-graph",
      name: "RAG dependency graph",
      props: {
        title: "Retrieval-augmented generation graph",
        direction: "LR",
        nodes: [
          { id: "q", label: "Query", sublabel: "user prompt", tone: "muted" },
          { id: "embed", label: "Embed", sublabel: "text-3-large", tone: "accent" },
          { id: "dense", label: "Dense Search", sublabel: "HNSW top-k", tone: "accent" },
          { id: "sparse", label: "BM25", sublabel: "lexical", tone: "accent" },
          { id: "fuse", label: "Fuse", sublabel: "RRF", tone: "accent" },
          { id: "rerank", label: "Rerank", sublabel: "cross-encoder", tone: "accent" },
          { id: "gen", label: "Generate", sublabel: "grounded", tone: "ok" },
        ],
        edges: [
          { source: "q", target: "embed", label: "text" },
          { source: "q", target: "sparse", label: "text" },
          { source: "embed", target: "dense", label: "vec" },
          { source: "dense", target: "fuse" },
          { source: "sparse", target: "fuse" },
          { source: "fuse", target: "rerank", label: "candidates" },
          { source: "rerank", target: "gen", label: "top 3" },
        ],
      },
    },
    {
      id: "build-graph",
      name: "Build DAG (vertical)",
      props: {
        title: "CI build dependency graph",
        direction: "TB",
        accent: "",
        nodes: [
          { id: "src", label: "Source", sublabel: "git commit", tone: "muted" },
          { id: "lint", label: "Lint", sublabel: "eslint", tone: "accent" },
          { id: "compile", label: "Compile", sublabel: "tsc", tone: "accent" },
          { id: "unit", label: "Unit Tests", sublabel: "vitest", tone: "ok" },
          { id: "e2e", label: "E2E", sublabel: "playwright", tone: "warn" },
          { id: "release", label: "Release", sublabel: "tagged", tone: "ok" },
        ],
        edges: [
          { source: "src", target: "lint" },
          { source: "src", target: "compile" },
          { source: "compile", target: "unit", label: "artifact" },
          { source: "compile", target: "e2e", label: "artifact" },
          { source: "lint", target: "release", label: "ok" },
          { source: "unit", target: "release", label: "pass" },
          { source: "e2e", target: "release", label: "pass" },
        ],
      },
    },
  ],
};
