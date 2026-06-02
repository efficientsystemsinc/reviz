"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  LinearGradient,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
  mix,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type NodeInput = string | { id: string; label?: string };

interface LinkInput {
  source: string;
  target: string;
  value: number;
}

export interface SankeyDiagramProps {
  nodes: NodeInput[];
  links: LinkInput[];
  title?: string;
  caption?: string;
  source?: string;
  colors?: string[];
  nodeWidth?: number;
  nodePadding?: number;
  linkOpacity?: number;
  curvature?: number;
  showValues?: boolean;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Layout (self-computed layered Sankey)                               */
/* ------------------------------------------------------------------ */

interface LaidNode {
  id: string;
  label: string;
  column: number;
  /** order within column */
  order: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  value: number;
  color: string;
}

interface LaidLink {
  index: number;
  source: LaidNode;
  target: LaidNode;
  value: number;
  width: number;
  sy: number; // source band center y
  ty: number; // target band center y
  color: string;
}

const DEFAULT_NODES: NodeInput[] = [
  { id: "raw", label: "Raw corpus" },
  { id: "dedup", label: "Deduplicated" },
  { id: "filtered", label: "Quality-filtered" },
  { id: "train", label: "Train split" },
  { id: "val", label: "Val split" },
  { id: "held", label: "Held-out eval" },
  { id: "discard", label: "Discarded" },
];

const DEFAULT_LINKS: LinkInput[] = [
  { source: "raw", target: "dedup", value: 820 },
  { source: "raw", target: "discard", value: 180 },
  { source: "dedup", target: "filtered", value: 610 },
  { source: "dedup", target: "discard", value: 210 },
  { source: "filtered", target: "train", value: 470 },
  { source: "filtered", target: "val", value: 90 },
  { source: "filtered", target: "held", value: 50 },
];

function normalizeNode(n: NodeInput): { id: string; label: string } {
  if (typeof n === "string") return { id: n, label: n };
  return { id: n.id, label: n.label ?? n.id };
}

/**
 * Assign each node to a column via the longest incoming path from any source.
 * Cycles are guarded by an iteration cap.
 */
function assignColumns(ids: string[], links: LinkInput[]): Map<string, number> {
  const col = new Map<string, number>();
  ids.forEach((id) => col.set(id, 0));
  const incoming = new Map<string, LinkInput[]>();
  ids.forEach((id) => incoming.set(id, []));
  links.forEach((l) => {
    if (incoming.has(l.target)) incoming.get(l.target)!.push(l);
  });
  // relax longest-path a bounded number of times
  for (let iter = 0; iter < ids.length + 1; iter++) {
    let changed = false;
    for (const id of ids) {
      const ins = incoming.get(id)!;
      let best = 0;
      for (const l of ins) {
        const sc = col.get(l.source);
        if (sc != null) best = Math.max(best, sc + 1);
      }
      if (best !== col.get(id)) {
        col.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return col;
}

/* ------------------------------------------------------------------ */
/* Ribbon path — cubic bezier between two node faces                   */
/* ------------------------------------------------------------------ */

function ribbonPath(
  x0: number,
  x1: number,
  sy0: number,
  sy1: number,
  ty0: number,
  ty1: number,
  curvature: number,
): string {
  const cx0 = x0 + (x1 - x0) * curvature;
  const cx1 = x1 - (x1 - x0) * curvature;
  return [
    `M${x0},${sy0}`,
    `C${cx0},${sy0} ${cx1},${ty0} ${x1},${ty0}`,
    `L${x1},${ty1}`,
    `C${cx1},${ty1} ${cx0},${sy1} ${x0},${sy1}`,
    "Z",
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function SankeyDiagram({
  nodes = DEFAULT_NODES,
  links = DEFAULT_LINKS,
  title = "Data pipeline flow",
  caption = "",
  source = "",
  colors = [],
  nodeWidth = 16,
  nodePadding = 16,
  linkOpacity = 0.42,
  curvature = 0.5,
  showValues = true,
  duration = 1100,
}: SankeyDiagramProps) {
  const p = usePalette();
  const ramp = colors.length ? colors : p.series;
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<
    | { kind: "node"; id: string; x: number; y: number }
    | { kind: "link"; index: number; x: number; y: number }
    | null
  >(null);

  const gradId = useMemo(() => uid("sankey-grad"), []);

  // Build a stable normalized model independent of geometry.
  const model = useMemo(() => {
    const normNodes = nodes.map(normalizeNode);
    const ids = normNodes.map((n) => n.id);
    const idSet = new Set(ids);
    const cleanLinks = links.filter(
      (l) => idSet.has(l.source) && idSet.has(l.target) && l.value > 0 && l.source !== l.target,
    );
    const colMap = assignColumns(ids, cleanLinks);

    const colorFor = new Map<string, string>();
    ids.forEach((id, i) => colorFor.set(id, ramp[i % ramp.length]));

    // node throughput = max(sum in, sum out)
    const inSum = new Map<string, number>();
    const outSum = new Map<string, number>();
    ids.forEach((id) => {
      inSum.set(id, 0);
      outSum.set(id, 0);
    });
    cleanLinks.forEach((l) => {
      outSum.set(l.source, (outSum.get(l.source) ?? 0) + l.value);
      inSum.set(l.target, (inSum.get(l.target) ?? 0) + l.value);
    });
    const value = new Map<string, number>();
    ids.forEach((id) => value.set(id, Math.max(inSum.get(id)!, outSum.get(id)!)));

    return { normNodes, ids, cleanLinks, colMap, colorFor, value, inSum, outSum };
  }, [nodes, links, ramp]);

  // Connectivity sets for hover highlight.
  const linkedNodes = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>();
    if (hover.kind === "node") {
      set.add(hover.id);
      model.cleanLinks.forEach((l) => {
        if (l.source === hover.id) set.add(l.target);
        if (l.target === hover.id) set.add(l.source);
      });
    } else {
      const l = model.cleanLinks[hover.index];
      if (l) {
        set.add(l.source);
        set.add(l.target);
      }
    }
    return set;
  }, [hover, model.cleanLinks]);

  const activeLinkIndices = useMemo(() => {
    if (!hover) return null;
    const set = new Set<number>();
    model.cleanLinks.forEach((l, i) => {
      if (hover.kind === "link") {
        if (i === hover.index) set.add(i);
      } else if (l.source === hover.id || l.target === hover.id) {
        set.add(i);
      }
    });
    return set;
  }, [hover, model.cleanLinks]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg aspect={16 / 9} margin={{ top: 22, right: 12, bottom: 22, left: 12 }}>
          {({ inner, margin }) => {
            const { normNodes, cleanLinks, colMap, colorFor, value, inSum, outSum } = model;

            // Group nodes by column.
            const maxCol = Math.max(0, ...normNodes.map((n) => colMap.get(n.id) ?? 0));
            const columns: { id: string; label: string }[][] = Array.from(
              { length: maxCol + 1 },
              () => [],
            );
            normNodes.forEach((n) => columns[colMap.get(n.id) ?? 0].push(n));

            // Vertical scale: pixels-per-unit so the busiest column fits.
            const colTotals = columns.map((c) => c.reduce((s, n) => s + (value.get(n.id) || 0), 0));
            const colCounts = columns.map((c) => c.length);
            const maxTotal = Math.max(1, ...colTotals);
            const maxPad = Math.max(...colCounts.map((c) => Math.max(0, c - 1) * nodePadding), 0);
            const ppu = (inner.height - maxPad) / maxTotal;

            // Node x positions.
            const colX = (c: number) =>
              maxCol === 0 ? 0 : (c / maxCol) * (inner.width - nodeWidth);

            // Lay out nodes.
            const laid = new Map<string, LaidNode>();
            columns.forEach((colNodes, c) => {
              const total =
                colNodes.reduce((s, n) => s + (value.get(n.id) || 0), 0) * ppu +
                Math.max(0, colNodes.length - 1) * nodePadding;
              let y = (inner.height - total) / 2;
              const x0 = colX(c);
              colNodes.forEach((n, order) => {
                const h = Math.max(1, (value.get(n.id) || 0) * ppu);
                laid.set(n.id, {
                  id: n.id,
                  label: n.label,
                  column: c,
                  order,
                  x0,
                  x1: x0 + nodeWidth,
                  y0: y,
                  y1: y + h,
                  value: value.get(n.id) || 0,
                  color: colorFor.get(n.id)!,
                });
                y += h + nodePadding;
              });
            });

            // Lay out links with cumulative offsets at each node face.
            const srcOffset = new Map<string, number>();
            const tgtOffset = new Map<string, number>();
            laid.forEach((_, id) => {
              srcOffset.set(id, 0);
              tgtOffset.set(id, 0);
            });
            // Order links within a face by the opposite node's vertical position
            // for clean, minimally-crossing ribbons.
            const indexed = cleanLinks.map((l, index) => ({ l, index }));
            const sortedForSource = [...indexed].sort(
              (a, b) => (laid.get(a.l.target)?.y0 ?? 0) - (laid.get(b.l.target)?.y0 ?? 0),
            );
            const sortedForTarget = [...indexed].sort(
              (a, b) => (laid.get(a.l.source)?.y0 ?? 0) - (laid.get(b.l.source)?.y0 ?? 0),
            );

            const sBand = new Map<number, { y0: number; y1: number }>();
            const tBand = new Map<number, { y0: number; y1: number }>();
            sortedForSource.forEach(({ l, index }) => {
              const sn = laid.get(l.source)!;
              const w = l.value * ppu;
              const off = srcOffset.get(l.source)!;
              sBand.set(index, { y0: sn.y0 + off, y1: sn.y0 + off + w });
              srcOffset.set(l.source, off + w);
            });
            sortedForTarget.forEach(({ l, index }) => {
              const tn = laid.get(l.target)!;
              const w = l.value * ppu;
              const off = tgtOffset.get(l.target)!;
              tBand.set(index, { y0: tn.y0 + off, y1: tn.y0 + off + w });
              tgtOffset.set(l.target, off + w);
            });

            const laidLinks: LaidLink[] = cleanLinks.map((l, index) => {
              const sn = laid.get(l.source)!;
              const tn = laid.get(l.target)!;
              const sb = sBand.get(index)!;
              const tb = tBand.get(index)!;
              return {
                index,
                source: sn,
                target: tn,
                value: l.value,
                width: l.value * ppu,
                sy: (sb.y0 + sb.y1) / 2,
                ty: (tb.y0 + tb.y1) / 2,
                color: sn.color,
              };
            });

            const dimmed = (active: boolean) => (hover && !active ? 0.12 : 1);
            const reveal = reduced ? 0 : duration / 1000;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {laidLinks.map((ln) => (
                    <LinearGradient
                      key={`${gradId}-${ln.index}`}
                      id={`${gradId}-${ln.index}`}
                      from={ln.source.color}
                      to={ln.target.color}
                      angle={0}
                    />
                  ))}
                </defs>

                {/* Ribbons */}
                <g>
                  {laidLinks.map((ln) => {
                    const sb = sBand.get(ln.index)!;
                    const tb = tBand.get(ln.index)!;
                    const active = !activeLinkIndices || activeLinkIndices.has(ln.index);
                    const d = ribbonPath(
                      ln.source.x1,
                      ln.target.x0,
                      sb.y0,
                      sb.y1,
                      tb.y0,
                      tb.y1,
                      curvature,
                    );
                    const isHot =
                      hover?.kind === "link" && hover.index === ln.index;
                    return (
                      <motion.path
                        key={`${token}-r-${ln.index}`}
                        d={d}
                        fill={`url(#${gradId}-${ln.index})`}
                        stroke="none"
                        style={{ mixBlendMode: p.mode === "dark" ? "screen" : "multiply" }}
                        initial={{ opacity: 0 }}
                        animate={{
                          opacity: inView
                            ? (isHot ? Math.min(1, linkOpacity + 0.32) : linkOpacity) *
                              dimmed(!!active)
                            : 0,
                        }}
                        transition={{
                          duration: reveal,
                          delay: reduced
                            ? 0
                            : 0.15 + (ln.source.column / Math.max(1, maxCol)) * reveal * 0.6,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        onMouseMove={(e) => {
                          const r = (
                            e.currentTarget.ownerSVGElement as SVGSVGElement
                          ).getBoundingClientRect();
                          setHover({
                            kind: "link",
                            index: ln.index,
                            x: e.clientX - r.left,
                            y: e.clientY - r.top,
                          });
                        }}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                </g>

                {/* Nodes */}
                <g>
                  {[...laid.values()].map((n, i) => {
                    const active = !linkedNodes || linkedNodes.has(n.id);
                    const onRight = n.column === maxCol;
                    const labelX = onRight ? n.x0 - 12 : n.x1 + 8;
                    const anchor = onRight ? "end" : "start";
                    const cy = (n.y0 + n.y1) / 2;
                    return (
                      <g key={`${token}-n-${n.id}`}>
                        <motion.rect
                          x={n.x0}
                          width={nodeWidth}
                          rx={3}
                          fill={n.color}
                          stroke={mix(n.color, p.ink, 0.18)}
                          strokeWidth={0.75}
                          initial={{ opacity: 0, height: 0, y: cy }}
                          animate={{
                            opacity: inView ? dimmed(active) : 0,
                            height: inView ? n.y1 - n.y0 : 0,
                            y: inView ? n.y0 : cy,
                          }}
                          transition={{
                            duration: reveal * 0.6,
                            delay: reduced ? 0 : 0.05 + i * 0.04,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          onMouseMove={(e) => {
                            const r = (
                              e.currentTarget.ownerSVGElement as SVGSVGElement
                            ).getBoundingClientRect();
                            setHover({
                              kind: "node",
                              id: n.id,
                              x: e.clientX - r.left,
                              y: e.clientY - r.top,
                            });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                        <motion.text
                          x={labelX}
                          y={cy}
                          dy="0.32em"
                          textAnchor={anchor}
                          fill={active ? p.ink : p.inkFaint}
                          className="font-mono text-[10.5px]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: inView ? (hover && !active ? 0.3 : 1) : 0 }}
                          transition={{ duration: reveal, delay: reduced ? 0 : 0.1 + i * 0.04 + reveal * 0.5 }}
                          style={{ pointerEvents: "none" }}
                        >
                          {n.label}
                          {showValues && (
                            <tspan fill={p.inkMuted} className="tabular-nums">
                              {"  "}
                              {formatCompact(n.value)}
                            </tspan>
                          )}
                        </motion.text>
                      </g>
                    );
                  })}
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover?.kind === "node" &&
            (() => {
              const lbl = model.normNodes.find((n) => n.id === hover.id)?.label ?? hover.id;
              return (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {lbl}
                  </div>
                  <TooltipRow label="in" value={formatCompact(model.inSum.get(hover.id) ?? 0, 2)} />
                  <TooltipRow
                    label="out"
                    value={formatCompact(model.outSum.get(hover.id) ?? 0, 2)}
                  />
                  <TooltipRow
                    label="throughput"
                    value={formatCompact(model.value.get(hover.id) ?? 0, 2)}
                  />
                </>
              );
            })()}
          {hover?.kind === "link" &&
            (() => {
              const l = model.cleanLinks[hover.index];
              if (!l) return null;
              const sl = model.normNodes.find((n) => n.id === l.source)?.label ?? l.source;
              const tl = model.normNodes.find((n) => n.id === l.target)?.label ?? l.target;
              return (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {sl} {"→"} {tl}
                  </div>
                  <TooltipRow label="flow" value={formatCompact(l.value, 2)} />
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
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "sankey-diagram",
  name: "Sankey Diagram",
  category: "trees-graphs",
  description:
    "A flowing layered diagram where curved gradient ribbons carry value from node to node, revealing how a budget, dataset, or population splits across a pipeline.",
  tags: ["sankey", "flow", "pipeline", "alluvial", "graph", "data-flow"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "SankeyDiagram",
  sourcePath: "trees-graphs/SankeyDiagram",
  aspect: 16 / 9,
  controls: [
    {
      key: "nodes",
      label: "Nodes",
      type: "json",
      group: "Data",
      help: "Array of node ids or { id, label } objects.",
      default: DEFAULT_NODES,
    },
    {
      key: "links",
      label: "Links",
      type: "json",
      group: "Data",
      help: "Array of { source, target, value } flows between node ids.",
      default: DEFAULT_LINKS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Data pipeline flow" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showValues", label: "Show node values", type: "boolean", group: "Labels", default: true },
    {
      key: "nodeWidth",
      label: "Node width",
      type: "number",
      group: "Layout",
      default: 16,
      min: 6,
      max: 40,
      step: 1,
      unit: "px",
    },
    {
      key: "nodePadding",
      label: "Node gap",
      type: "number",
      group: "Layout",
      default: 16,
      min: 4,
      max: 48,
      step: 1,
      unit: "px",
    },
    {
      key: "curvature",
      label: "Ribbon curvature",
      type: "number",
      group: "Layout",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
    },
    { key: "colors", label: "Node colors", type: "colorArray", group: "Style", default: [] },
    {
      key: "linkOpacity",
      label: "Ribbon opacity",
      type: "number",
      group: "Style",
      default: 0.42,
      min: 0.1,
      max: 0.9,
      step: 0.02,
    },
    {
      key: "duration",
      label: "Animation",
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
      id: "data-pipeline",
      name: "Data pipeline",
      props: {
        title: "Pretraining corpus flow (B tokens)",
        caption: "Each ribbon's width is proportional to tokens surviving that stage.",
      },
    },
    {
      id: "eval-funnel",
      name: "Agent eval funnel",
      props: {
        title: "Agent rollout outcomes",
        source: "n = 1,000 episodes",
        curvature: 0.6,
        nodes: [
          { id: "start", label: "Episodes" },
          { id: "plan", label: "Plan formed" },
          { id: "act", label: "Acted" },
          { id: "success", label: "Success" },
          { id: "partial", label: "Partial" },
          { id: "fail", label: "Failure" },
          { id: "noplan", label: "No plan" },
        ],
        links: [
          { source: "start", target: "plan", value: 880 },
          { source: "start", target: "noplan", value: 120 },
          { source: "plan", target: "act", value: 880 },
          { source: "act", target: "success", value: 560 },
          { source: "act", target: "partial", value: 190 },
          { source: "act", target: "fail", value: 130 },
        ],
      },
    },
    {
      id: "compute",
      name: "Compute budget",
      props: {
        title: "GPU-hours by workload",
        nodeWidth: 22,
        linkOpacity: 0.5,
        nodes: [
          { id: "cluster", label: "Cluster" },
          { id: "pretrain", label: "Pretraining" },
          { id: "finetune", label: "Fine-tuning" },
          { id: "infer", label: "Inference" },
          { id: "rl", label: "RLHF" },
          { id: "sft", label: "SFT" },
          { id: "serve", label: "Serving" },
          { id: "eval", label: "Eval" },
        ],
        links: [
          { source: "cluster", target: "pretrain", value: 620 },
          { source: "cluster", target: "finetune", value: 240 },
          { source: "cluster", target: "infer", value: 140 },
          { source: "finetune", target: "rl", value: 130 },
          { source: "finetune", target: "sft", value: 110 },
          { source: "infer", target: "serve", value: 100 },
          { source: "infer", target: "eval", value: 40 },
        ],
      },
    },
  ],
};
