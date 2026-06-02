"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Glow,
  Legend,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
  clamp,
  seededRandom,
  uid,
  usePalette,
  useInView,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface GraphNode {
  id: string;
  label?: string;
  group?: string;
  value?: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight?: number;
}

export interface ForceGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  layout?: "radial" | "grid" | "force-static";
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  showLabels?: boolean;
  duration?: number;
}

interface Placed extends GraphNode {
  x: number;
  y: number;
  degree: number;
  groupIndex: number;
}

const DEFAULT_NODES: GraphNode[] = [
  { id: "transformer", label: "Transformer", group: "architecture", value: 9 },
  { id: "attention", label: "Self-Attention", group: "architecture", value: 8 },
  { id: "mha", label: "Multi-Head", group: "architecture", value: 5 },
  { id: "ffn", label: "Feed-Forward", group: "architecture", value: 4 },
  { id: "embed", label: "Embeddings", group: "architecture", value: 5 },
  { id: "rope", label: "RoPE", group: "method", value: 3 },
  { id: "pretrain", label: "Pretraining", group: "training", value: 7 },
  { id: "rlhf", label: "RLHF", group: "training", value: 6 },
  { id: "sft", label: "SFT", group: "training", value: 4 },
  { id: "scaling", label: "Scaling Laws", group: "method", value: 5 },
  { id: "mmlu", label: "Knowledge-bench", group: "eval", value: 4 },
  { id: "gsm8k", label: "Math-bench", group: "eval", value: 3 },
  { id: "agent", label: "Agents", group: "eval", value: 5 },
];

const DEFAULT_LINKS: GraphLink[] = [
  { source: "transformer", target: "attention", weight: 3 },
  { source: "transformer", target: "ffn", weight: 2 },
  { source: "transformer", target: "embed", weight: 2 },
  { source: "attention", target: "mha", weight: 3 },
  { source: "attention", target: "rope", weight: 1 },
  { source: "embed", target: "rope", weight: 1 },
  { source: "transformer", target: "pretrain", weight: 2 },
  { source: "pretrain", target: "scaling", weight: 2 },
  { source: "pretrain", target: "sft", weight: 1 },
  { source: "sft", target: "rlhf", weight: 2 },
  { source: "rlhf", target: "agent", weight: 2 },
  { source: "pretrain", target: "mmlu", weight: 1 },
  { source: "scaling", target: "mmlu", weight: 1 },
  { source: "rlhf", target: "gsm8k", weight: 1 },
  { source: "agent", target: "gsm8k", weight: 1 },
  { source: "agent", target: "mmlu", weight: 1 },
];

export default function ForceGraph({
  nodes = DEFAULT_NODES,
  links = DEFAULT_LINKS,
  layout = "force-static",
  title = "Concept network",
  caption = "",
  source = "",
  color = "",
  showLabels = true,
  duration = 1100,
}: ForceGraphProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const shadowId = useMemo(() => uid("fg-shadow"), []);
  const glowId = useMemo(() => uid("fg-glow"), []);

  // ----- group color mapping (stable, palette-driven) -----
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const n of nodes) {
      const g = n.group ?? "default";
      if (!seen.includes(g)) seen.push(g);
    }
    return seen;
  }, [nodes]);

  const groupColor = (gi: number) => (gi === 0 ? accent : p.series[gi % p.series.length]);

  // ----- adjacency (for neighborhood highlight) -----
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of nodes) map.set(n.id, new Set());
    for (const l of links) {
      if (map.has(l.source) && map.has(l.target)) {
        map.get(l.source)!.add(l.target);
        map.get(l.target)!.add(l.source);
      }
    }
    return map;
  }, [nodes, links]);

  // ----- deterministic layout in a unit box [0,1]^2 -----
  const placed = useMemo<Placed[]>(() => {
    const ids = nodes.map((n) => n.id);
    const idSet = new Set(ids);
    const degree = new Map<string, number>();
    for (const id of ids) degree.set(id, 0);
    for (const l of links) {
      if (idSet.has(l.source)) degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      if (idSet.has(l.target)) degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    }

    const n = nodes.length;
    const rand = seededRandom(1337 + n * 7);
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
    } else if (layout === "radial") {
      // sort by degree so hubs sit toward the center rings
      const order = [...nodes].sort(
        (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
      );
      const rank = new Map(order.map((node, i) => [node.id, i]));
      for (let i = 0; i < n; i++) {
        const idx = rank.get(nodes[i].id) ?? i;
        // golden-angle spiral → even, deterministic spread
        const t = n > 1 ? idx / (n - 1) : 0;
        const radius = 0.12 + 0.42 * Math.sqrt(t);
        const angle = idx * 2.399963229728653; // golden angle (rad)
        pts.push({
          x: 0.5 + radius * Math.cos(angle),
          y: 0.5 + radius * Math.sin(angle),
        });
      }
    } else {
      // force-static: seeded init on a circle, then a few iterations of
      // repulsion + spring relaxation, fully deterministic in a useMemo.
      const pos = nodes.map((_, i) => {
        const a = (i / n) * Math.PI * 2;
        return {
          x: 0.5 + 0.32 * Math.cos(a) + (rand() - 0.5) * 0.08,
          y: 0.5 + 0.32 * Math.sin(a) + (rand() - 0.5) * 0.08,
        };
      });
      const index = new Map(ids.map((id, i) => [id, i]));
      const edges = links
        .filter((l) => index.has(l.source) && index.has(l.target))
        .map((l) => ({ a: index.get(l.source)!, b: index.get(l.target)!, w: l.weight ?? 1 }));

      const ITER = 280;
      const kRep = 0.0016; // repulsion strength
      const kSpring = 0.018; // spring pull
      const kCenter = 0.012; // gravity to center
      for (let it = 0; it < ITER; it++) {
        const fx = new Array(n).fill(0);
        const fy = new Array(n).fill(0);
        // pairwise repulsion
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            let dx = pos[i].x - pos[j].x;
            let dy = pos[i].y - pos[j].y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1e-6) {
              dx = (rand() - 0.5) * 1e-3;
              dy = (rand() - 0.5) * 1e-3;
              d2 = dx * dx + dy * dy + 1e-6;
            }
            const f = kRep / d2;
            const inv = 1 / Math.sqrt(d2);
            fx[i] += dx * inv * f;
            fy[i] += dy * inv * f;
            fx[j] -= dx * inv * f;
            fy[j] -= dy * inv * f;
          }
        }
        // spring attraction along edges
        for (const e of edges) {
          const dx = pos[e.b].x - pos[e.a].x;
          const dy = pos[e.b].y - pos[e.a].y;
          const f = kSpring * Math.sqrt(e.w);
          fx[e.a] += dx * f;
          fy[e.a] += dy * f;
          fx[e.b] -= dx * f;
          fy[e.b] -= dy * f;
        }
        // gravity toward center
        const cool = 1 - it / ITER;
        for (let i = 0; i < n; i++) {
          fx[i] += (0.5 - pos[i].x) * kCenter;
          fy[i] += (0.5 - pos[i].y) * kCenter;
          pos[i].x += clamp(fx[i], -0.05, 0.05) * (0.6 + cool);
          pos[i].y += clamp(fy[i], -0.05, 0.05) * (0.6 + cool);
        }
      }
      pts.push(...pos);
    }

    // normalize to padded [0,1] box so it always fills the frame
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
    const pad = 0.06;

    return nodes.map((node, i) => {
      const gi = Math.max(0, groups.indexOf(node.group ?? "default"));
      return {
        ...node,
        x: pad + ((pts[i].x - minX) / spanX) * (1 - 2 * pad),
        y: pad + ((pts[i].y - minY) / spanY) * (1 - 2 * pad),
        degree: degree.get(node.id) ?? 0,
        groupIndex: gi,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, layout, groups]);

  const posById = useMemo(() => {
    const m = new Map<string, Placed>();
    for (const pt of placed) m.set(pt.id, pt);
    return m;
  }, [placed]);

  const maxValue = useMemo(
    () => Math.max(1, ...placed.map((d) => d.value ?? d.degree ?? 1)),
    [placed],
  );
  const radiusFor = (d: Placed) => {
    const v = d.value ?? d.degree ?? 1;
    return 5 + 12 * Math.sqrt(v / maxValue);
  };

  const validLinks = useMemo(
    () => links.filter((l) => posById.has(l.source) && posById.has(l.target)),
    [links, posById],
  );

  const neighbors = hover ? adjacency.get(hover.id) : undefined;
  const isActive = (id: string) => !hover || hover.id === id || (neighbors?.has(id) ?? false);
  const linkActive = (l: GraphLink) =>
    !hover || l.source === hover.id || l.target === hover.id;

  const legendItems: LegendItem[] = groups.map((g, i) => ({
    label: g,
    color: groupColor(i),
    shape: "circle",
  }));

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        {legendItems.length > 1 && (
          <Legend items={legendItems} align="center" className="mb-2" />
        )}

        <ResponsiveSvg aspect={16 / 11} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;
            const px = (d: Placed | undefined) => (d ? d.x * W : 0);
            const py = (d: Placed | undefined) => (d ? d.y * H : 0);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={2} blur={5} opacity={0.22} />
                  <Glow id={glowId} blur={4} />
                </defs>

                {/* edges */}
                <g>
                  {validLinks.map((l, i) => {
                    const a = posById.get(l.source)!;
                    const b = posById.get(l.target)!;
                    const active = linkActive(l);
                    const w = 0.6 + 0.7 * (l.weight ?? 1);
                    const stroke = hover
                      ? active
                        ? withAlpha(accent, 0.55)
                        : withAlpha(p.inkFaint, 0.12)
                      : withAlpha(p.borderStrong, 0.7);
                    return (
                      <motion.line
                        key={`${token}-${l.source}-${l.target}-${i}`}
                        x1={px(a)}
                        y1={py(a)}
                        x2={px(b)}
                        y2={py(b)}
                        stroke={stroke}
                        strokeWidth={active ? w + 0.4 : w}
                        strokeLinecap="round"
                        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                        animate={
                          reduced
                            ? { opacity: 1 }
                            : { pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }
                        }
                        transition={{
                          duration: (duration / 1000) * 0.55,
                          delay: 0.12 + i * 0.012,
                          ease,
                        }}
                      />
                    );
                  })}
                </g>

                {/* nodes */}
                <g>
                  {placed.map((d, i) => {
                    const r = radiusFor(d);
                    const active = isActive(d.id);
                    const focused = hover?.id === d.id;
                    const c = groupColor(d.groupIndex);
                    const dim = !!hover && !active;

                    return (
                      <motion.g
                        key={`${token}-${d.id}`}
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
                          duration: (duration / 1000) * 0.45,
                          delay: 0.12 + i * 0.045,
                          ease: [0.34, 1.56, 0.64, 1],
                        }}
                        onMouseMove={(e) => {
                          const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                          const box = svg.getBoundingClientRect();
                          setHover({
                            id: d.id,
                            x: e.clientX - box.left,
                            y: e.clientY - box.top,
                          });
                        }}
                        onMouseLeave={() => setHover(null)}
                        className="cursor-pointer"
                      >
                        {/* soft halo on focus */}
                        {focused && (
                          <circle
                            cx={px(d)}
                            cy={py(d)}
                            r={r + 6}
                            fill={withAlpha(c, 0.16)}
                          />
                        )}
                        <circle
                          cx={px(d)}
                          cy={py(d)}
                          r={r}
                          fill={c}
                          stroke={p.surface}
                          strokeWidth={1.5}
                          filter={focused ? `url(#${glowId})` : `url(#${shadowId})`}
                        />
                        {showLabels &&
                          (() => {
                            const text = d.label ?? d.id;
                            // monospace at 9.5px ≈ 5.7px/char; opaque plate
                            // masks any edge passing behind the label.
                            const plateW = text.length * 5.7 + 8;
                            const labelY = py(d) + r + 11;
                            return (
                              <g style={{ pointerEvents: "none" }}>
                                <rect
                                  x={px(d) - plateW / 2}
                                  y={labelY - 8}
                                  width={plateW}
                                  height={13}
                                  rx={2}
                                  fill={p.canvas}
                                />
                                <text
                                  x={px(d)}
                                  y={labelY}
                                  textAnchor="middle"
                                  fill={dim ? p.inkFaint : p.inkMuted}
                                  className="font-mono text-[9.5px]"
                                >
                                  {text}
                                </text>
                              </g>
                            );
                          })()}
                      </motion.g>
                    );
                  })}
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null &&
            (() => {
              const d = posById.get(hover.id);
              if (!d) return null;
              return (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {d.label ?? d.id}
                  </div>
                  {d.group && <TooltipRow label="group" value={d.group} />}
                  <TooltipRow label="connections" value={d.degree} />
                  {d.value != null && <TooltipRow label="weight" value={d.value} />}
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

export const meta: RevizMeta = {
  id: "force-graph",
  name: "Network Graph",
  category: "trees-graphs",
  description:
    "A deterministic node-link network where hubs grow by degree, groups carry color, and hovering a node lights up its neighborhood while the rest fades back.",
  tags: ["graph", "network", "node-link", "force", "relationships", "knowledge-graph"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ForceGraph",
  sourcePath: "trees-graphs/ForceGraph",
  aspect: 16 / 11,
  controls: [
    {
      key: "nodes",
      label: "Nodes",
      type: "json",
      group: "Data",
      help: "[{ id, label?, group?, value? }] — value (or degree) drives node size.",
      default: DEFAULT_NODES,
    },
    {
      key: "links",
      label: "Links",
      type: "json",
      group: "Data",
      help: "[{ source, target, weight? }] — ids must match node ids.",
      default: DEFAULT_LINKS,
    },
    {
      key: "layout",
      label: "Layout",
      type: "select",
      group: "Layout",
      default: "force-static",
      options: [
        { value: "force-static", label: "Force (static)" },
        { value: "radial", label: "Radial spiral" },
        { value: "grid", label: "Grid" },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Concept network" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showLabels", label: "Show labels", type: "boolean", group: "Labels", default: true },
    { key: "color", label: "Primary color", type: "color", group: "Style", default: "" },
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
      id: "concept",
      name: "LLM concept map",
      props: { title: "How a transformer LLM fits together", layout: "force-static" },
    },
    {
      id: "radial",
      name: "Radial hubs",
      props: { title: "Concept network", layout: "radial", showLabels: true },
    },
    {
      id: "pipeline",
      name: "Agent system",
      props: {
        title: "Research agent — component graph",
        layout: "force-static",
        nodes: [
          { id: "planner", label: "Planner", group: "control", value: 9 },
          { id: "memory", label: "Memory", group: "control", value: 6 },
          { id: "router", label: "Tool Router", group: "control", value: 7 },
          { id: "search", label: "Web Search", group: "tools", value: 4 },
          { id: "code", label: "Code Exec", group: "tools", value: 5 },
          { id: "retr", label: "Retrieval", group: "tools", value: 4 },
          { id: "verify", label: "Verifier", group: "eval", value: 5 },
          { id: "report", label: "Synthesizer", group: "eval", value: 6 },
          { id: "llm", label: "Reasoning LLM", group: "model", value: 10 },
        ],
        links: [
          { source: "planner", target: "llm", weight: 3 },
          { source: "planner", target: "memory", weight: 2 },
          { source: "planner", target: "router", weight: 3 },
          { source: "router", target: "search", weight: 2 },
          { source: "router", target: "code", weight: 2 },
          { source: "router", target: "retr", weight: 2 },
          { source: "retr", target: "memory", weight: 1 },
          { source: "llm", target: "verify", weight: 2 },
          { source: "verify", target: "report", weight: 2 },
          { source: "report", target: "planner", weight: 1 },
          { source: "code", target: "verify", weight: 1 },
        ],
      },
    },
  ],
};
