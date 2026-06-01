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

interface FlowNode {
  id: string;
  label: string;
  sublabel?: string;
  /** Optional accent override for a single node. */
  tone?: "accent" | "ok" | "warn" | "bad" | "muted";
}

interface FlowEdge {
  source: string;
  target: string;
  label?: string;
}

export interface FlowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  direction?: "LR" | "TB";
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Layered layout                                                      */
/* ------------------------------------------------------------------ */

interface LaidNode extends FlowNode {
  layer: number;
  /** Order within the layer. */
  slot: number;
  /** Total nodes in this layer. */
  lane: number;
}

/** Assign every node a layer = longest dependency depth from a root. */
function layout(nodes: FlowNode[], edges: FlowEdge[]) {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const valid = edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));

  const incoming = new Map<string, number>();
  const outAdj = new Map<string, string[]>();
  ids.forEach((id) => {
    incoming.set(id, 0);
    outAdj.set(id, []);
  });
  valid.forEach((e) => {
    if (e.source === e.target) return;
    outAdj.get(e.source)!.push(e.target);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  });

  // Longest-path layering (Kahn with depth relaxation), cycle-tolerant.
  const layer = new Map<string, number>();
  ids.forEach((id) => layer.set(id, 0));
  const indeg = new Map(incoming);
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const seen = new Set(queue);
  let guard = 0;
  while (queue.length && guard < ids.length * ids.length + ids.length) {
    guard++;
    const u = queue.shift()!;
    const lu = layer.get(u) ?? 0;
    for (const v of outAdj.get(u) ?? []) {
      if ((layer.get(v) ?? 0) < lu + 1) layer.set(v, lu + 1);
      const d = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, d);
      if (d <= 0 && !seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  // Any node never reached (part of a cycle) keeps a sensible layer.
  ids.forEach((id) => {
    if (!seen.has(id)) {
      const preds = valid.filter((e) => e.target === id);
      const best = preds.reduce((m, e) => Math.max(m, (layer.get(e.source) ?? 0) + 1), layer.get(id) ?? 0);
      layer.set(id, best);
    }
  });

  // Bucket into layers, preserving input order within a layer.
  const maxLayer = Math.max(0, ...ids.map((id) => layer.get(id) ?? 0));
  const buckets: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  nodes.forEach((n) => buckets[layer.get(n.id) ?? 0].push(n.id));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const laid: LaidNode[] = [];
  buckets.forEach((bucket, l) => {
    bucket.forEach((id, slot) => {
      const n = byId.get(id)!;
      laid.push({ ...n, layer: l, slot, lane: bucket.length });
    });
  });

  return { laid, edges: valid, layers: maxLayer + 1 };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function FlowDiagram({
  nodes = DEFAULT_NODES,
  edges = DEFAULT_EDGES,
  direction = "LR",
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1100,
}: FlowDiagramProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<string | null>(null);

  const ids = useMemo(() => uid("flow"), []);
  const { laid, edges: cleanEdges, layers } = useMemo(() => layout(nodes, edges), [nodes, edges]);

  const horizontal = direction === "LR";

  // Box footprint in plot units. Layout normalizes coordinates to [0,1].
  const BOX_W = 0.165;
  const BOX_H = 0.165;
  const maxLane = Math.max(1, ...laid.map((n) => n.lane));

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

  const animBase = reduced ? 0 : duration / 1000;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={horizontal ? 16 / 9 : 4 / 5}
          margin={{ top: 22, right: 22, bottom: 22, left: 22 }}
        >
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;

            const bw = (horizontal ? BOX_W : BOX_W * 1.15) * W;
            const bh = (horizontal ? BOX_H * 1.05 : BOX_H) * H;
            // Clamp the box to leave breathing room at the edges of the plot.
            const boxW = Math.max(80, Math.min(bw, horizontal ? W / layers - 18 : W / maxLane - 18));
            const boxH = Math.max(48, Math.min(bh, horizontal ? H / maxLane - 16 : H / layers - 16));

            // Inset the primary axis so first/last layers sit fully inside the plot.
            const primaryExtent = horizontal ? boxW : boxH;
            const pad = primaryExtent / 2 + 4;
            const primaryLen = (horizontal ? W : H) - pad * 2;

            // Position helpers: place node centers on a normalized grid.
            const center = (n: LaidNode) => {
              const along = pad + (layers > 1 ? (n.layer / (layers - 1)) * primaryLen : primaryLen / 2); // primary axis
              const across = (horizontal ? H : W) * ((n.slot + 1) / (n.lane + 1)); // perpendicular axis
              if (horizontal) return { cx: along, cy: across };
              return { cx: across, cy: along };
            };

            const posById = new Map<string, { cx: number; cy: number }>();
            laid.forEach((n) => posById.set(n.id, center(n)));

            const totalNodes = laid.length;
            // Edges animate after both endpoints (by layer) have appeared.
            const nodeDelay = (n: LaidNode) => (reduced ? 0 : (n.layer * 0.9 + n.slot * 0.12) * (animBase / Math.max(1, layers)));

            return (
              <g transform={`translate(${margin.left},${margin.top})`}>
                <defs>
                  <SoftShadow id={`${ids}-shadow`} dy={3} blur={7} opacity={0.16} />
                  <Glow id={`${ids}-glow`} blur={5} />
                  <marker
                    id={`${ids}-arrow`}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={p.borderStrong} />
                  </marker>
                  <marker
                    id={`${ids}-arrow-hot`}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="7.5"
                    markerHeight="7.5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
                  </marker>
                </defs>

                {/* Edges */}
                <g>
                  {cleanEdges.map((e, i) => {
                    const a = posById.get(e.source);
                    const b = posById.get(e.target);
                    if (!a || !b) return null;

                    // Connect from the trailing face of source to the leading face of target.
                    const hw = boxW / 2;
                    const hh = boxH / 2;
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

                    // Smooth S-curve between the two faces.
                    const d = horizontal
                      ? `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
                      : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;

                    const active = hover != null && (e.source === hover || e.target === hover);
                    const dim = hover != null && !active;

                    const srcNode = laid.find((n) => n.id === e.source);
                    const delay = srcNode ? nodeDelay(srcNode) + animBase / Math.max(1, layers) : 0;

                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;

                    return (
                      <g key={`${token}-edge-${i}`}>
                        <motion.path
                          d={d}
                          fill="none"
                          stroke={active ? fill : p.borderStrong}
                          strokeWidth={active ? 2 : 1.5}
                          strokeLinecap="round"
                          markerEnd={`url(#${ids}-${active ? "arrow-hot" : "arrow"})`}
                          style={{ opacity: dim ? 0.25 : active ? 1 : 0.85 }}
                          initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? (dim ? 0.25 : 1) : 0 }}
                          animate={{
                            pathLength: inView ? 1 : reduced ? 1 : 0,
                            opacity: inView ? (dim ? 0.25 : active ? 1 : 0.85) : reduced ? 1 : 0,
                          }}
                          transition={{
                            pathLength: { duration: reduced ? 0 : animBase * 0.5, delay, ease: [0.22, 1, 0.36, 1] },
                            opacity: { duration: 0.2, delay },
                          }}
                        />
                        {e.label && (
                          <motion.g
                            initial={{ opacity: reduced ? 1 : 0 }}
                            animate={{ opacity: inView ? (dim ? 0.3 : 1) : reduced ? 1 : 0 }}
                            transition={{ duration: 0.3, delay: delay + animBase * 0.35 }}
                          >
                            <rect
                              x={mx - e.label.length * 3.2 - 5}
                              y={my - 8}
                              width={e.label.length * 6.4 + 10}
                              height={15}
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
                              letterSpacing="0.04em"
                              fill={active ? fill : p.inkMuted}
                            >
                              {e.label}
                            </text>
                          </motion.g>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Nodes */}
                <g>
                  {laid.map((n, i) => {
                    const pos = posById.get(n.id)!;
                    const x = pos.cx - boxW / 2;
                    const y = pos.cy - boxH / 2;
                    const tone = toneColor(n);
                    const active = hover === n.id;
                    const neighbor =
                      hover != null &&
                      cleanEdges.some(
                        (e) => (e.source === hover && e.target === n.id) || (e.target === hover && e.source === n.id),
                      );
                    const dim = hover != null && !active && !neighbor;

                    const surface = active ? mix(p.surface, tone, 0.1) : p.surface;
                    const stroke = active || neighbor ? tone : withAlpha(tone, 0.55);
                    const delay = nodeDelay(n);

                    return (
                      <motion.g
                        key={`${token}-node-${n.id}-${i}`}
                        style={{ cursor: "pointer", opacity: dim ? 0.4 : 1 }}
                        onMouseEnter={() => setHover(n.id)}
                        onMouseLeave={() => setHover(null)}
                        initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.86 }}
                        animate={{
                          opacity: inView ? (dim ? 0.4 : 1) : reduced ? 1 : 0,
                          scale: inView ? 1 : reduced ? 1 : 0.86,
                        }}
                        transition={{ duration: reduced ? 0 : 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {/* Accent rail along the leading edge */}
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
                        {/* Index chip */}
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
                          {n.layer + 1}
                        </text>
                        {/* Label */}
                        <text
                          x={x + 16}
                          y={pos.cy - (n.sublabel ? 6 : 0)}
                          dy={n.sublabel ? 0 : "0.32em"}
                          textAnchor="start"
                          className="font-sans"
                          fontSize={13}
                          fontWeight={600}
                          fill={p.ink}
                        >
                          {truncate(n.label, horizontal ? 16 : 20)}
                        </text>
                        {n.sublabel && (
                          <text
                            x={x + 16}
                            y={pos.cy + 11}
                            textAnchor="start"
                            className="font-mono"
                            fontSize={9.5}
                            letterSpacing="0.03em"
                            fill={p.inkFaint}
                          >
                            {truncate(n.sublabel, horizontal ? 18 : 24)}
                          </text>
                        )}
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_NODES: FlowNode[] = [
  { id: "ingest", label: "Ingest", sublabel: "12.4M samples", tone: "muted" },
  { id: "train", label: "Pretrain", sublabel: "256 × H100", tone: "accent" },
  { id: "eval", label: "Evaluate", sublabel: "held-out suite", tone: "accent" },
  { id: "ship", label: "Deploy", sublabel: "canary 5%", tone: "ok" },
  { id: "rollback", label: "Rollback", sublabel: "if regress", tone: "bad" },
];

const DEFAULT_EDGES: FlowEdge[] = [
  { source: "ingest", target: "train", label: "tokens" },
  { source: "train", target: "eval", label: "ckpt" },
  { source: "eval", target: "ship", label: "pass" },
  { source: "eval", target: "rollback", label: "fail" },
];

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "flow-diagram",
  name: "Flow Diagram",
  category: "diagrams",
  description:
    "A layered boxes-and-arrows flow that auto-routes nodes and edges into clean columns or rows, with branching, drawn-in arrows, and hover-traced paths.",
  tags: ["flow", "pipeline", "diagram", "boxes", "arrows", "dag", "branching"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "FlowDiagram",
  sourcePath: "diagrams/FlowDiagram",
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
      help: "[{ source, target, label? }] referencing node ids.",
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
      default: 1100,
      min: 0,
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "ml-pipeline",
      name: "ML pipeline (branch)",
      props: {
        title: "Training pipeline with eval gate",
        caption: "A passing eval ships a 5% canary; a failing eval triggers rollback.",
        direction: "LR",
        nodes: DEFAULT_NODES,
        edges: DEFAULT_EDGES,
      },
    },
    {
      id: "rag",
      name: "RAG serving path",
      props: {
        title: "Retrieval-augmented generation",
        direction: "LR",
        accent: "",
        nodes: [
          { id: "q", label: "Query", sublabel: "user prompt", tone: "muted" },
          { id: "embed", label: "Embed", sublabel: "text-3-large", tone: "accent" },
          { id: "retrieve", label: "Retrieve", sublabel: "top-k = 8", tone: "accent" },
          { id: "rerank", label: "Rerank", sublabel: "cross-encoder", tone: "accent" },
          { id: "gen", label: "Generate", sublabel: "Opus 4.8", tone: "ok" },
          { id: "guard", label: "Guardrail", sublabel: "safety check", tone: "warn" },
        ],
        edges: [
          { source: "q", target: "embed" },
          { source: "embed", target: "retrieve", label: "vec" },
          { source: "retrieve", target: "rerank", label: "8 docs" },
          { source: "rerank", target: "gen", label: "top 3" },
          { source: "gen", target: "guard", label: "draft" },
        ],
      },
    },
    {
      id: "agent",
      name: "Agent loop (vertical)",
      props: {
        title: "Tool-using agent loop",
        direction: "TB",
        nodes: [
          { id: "plan", label: "Plan", sublabel: "decompose task", tone: "accent" },
          { id: "act", label: "Act", sublabel: "call tool", tone: "accent" },
          { id: "observe", label: "Observe", sublabel: "parse result", tone: "muted" },
          { id: "reflect", label: "Reflect", sublabel: "self-critique", tone: "warn" },
          { id: "answer", label: "Answer", sublabel: "final output", tone: "ok" },
        ],
        edges: [
          { source: "plan", target: "act", label: "step" },
          { source: "act", target: "observe" },
          { source: "observe", target: "reflect" },
          { source: "reflect", target: "answer", label: "done" },
        ],
      },
    },
  ],
};
