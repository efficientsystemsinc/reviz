"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  Bot,
  Brain,
  Cloud,
  Cpu,
  Database,
  DoorOpen,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  type LucideIcon,
  MessageSquare,
  Network,
  Route,
  Search,
  Server,
  Shield,
  Workflow,
  Zap,
} from "lucide-react";
import {
  Figure,
  FloatingTooltip,
  Glow,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
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
/* Icons                                                               */
/* ------------------------------------------------------------------ */

/** Curated, lowercase-addressed icon set for service nodes. */
const ICONS: Record<string, LucideIcon> = {
  gateway: DoorOpen,
  globe: Globe,
  router: Route,
  network: Network,
  planner: Workflow,
  brain: Brain,
  bot: Bot,
  worldmodel: Layers,
  gpu: Cpu,
  server: Server,
  cluster: Boxes,
  db: Database,
  cache: HardDrive,
  store: HardDrive,
  search: Search,
  queue: Activity,
  message: MessageSquare,
  shield: Shield,
  auth: KeyRound,
  monitor: Gauge,
  cloud: Cloud,
  zap: Zap,
  branch: GitBranch,
};

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TopoNode {
  id: string;
  label: string;
  /** Zone / tier this node belongs to (matched against `zones`). */
  zone?: string;
  /** Icon key from the curated set above. */
  icon?: string;
  /** Optional sublabel (instance count, model, etc.). */
  sublabel?: string;
}

interface TopoLink {
  source: string;
  target: string;
  /** Protocol / latency / annotation rendered on the edge. */
  label?: string;
}

export interface SystemTopologyProps {
  nodes?: TopoNode[];
  links?: TopoLink[];
  zones?: string[];
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults — a model-serving topology                                 */
/* ------------------------------------------------------------------ */

const DEFAULT_ZONES = ["Edge", "Control Plane", "Compute"];

const DEFAULT_NODES: TopoNode[] = [
  { id: "gw", label: "API Gateway", zone: "Edge", icon: "gateway", sublabel: "TLS · auth" },
  { id: "lb", label: "Load Balancer", zone: "Edge", icon: "router", sublabel: "anycast" },
  { id: "planner", label: "Planner", zone: "Control Plane", icon: "planner", sublabel: "decomposes task" },
  { id: "wm", label: "World Model", zone: "Control Plane", icon: "worldmodel", sublabel: "state belief" },
  { id: "memory", label: "Memory Store", zone: "Control Plane", icon: "db", sublabel: "vector + kv" },
  { id: "gpu", label: "GPU Pool", zone: "Compute", icon: "gpu", sublabel: "64 × H100" },
  { id: "kv", label: "KV Cache", zone: "Compute", icon: "cache", sublabel: "paged attn" },
];

const DEFAULT_LINKS: TopoLink[] = [
  { source: "gw", target: "lb", label: "https" },
  { source: "lb", target: "planner", label: "grpc · 4ms" },
  { source: "planner", target: "wm", label: "state" },
  { source: "planner", target: "memory", label: "recall" },
  { source: "wm", target: "gpu", label: "rollout" },
  { source: "planner", target: "gpu", label: "infer · 38ms" },
  { source: "gpu", target: "kv", label: "cache" },
  { source: "memory", target: "gpu", label: "context" },
];

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

interface LaidNode extends TopoNode {
  /** Column index (zone order). */
  col: number;
  /** Row within the column. */
  row: number;
  /** Total rows in this column. */
  rows: number;
  /** Resolved zone name. */
  zoneName: string;
}

interface LaidZone {
  name: string;
  col: number;
  count: number;
}

/**
 * Group nodes into ordered zone columns. Zones listed in `zones` come first
 * (in order); any zone referenced only by a node is appended; nodes with no
 * zone fall into an implicit "Services" column.
 */
function layout(nodes: TopoNode[], zones: string[]) {
  const order: string[] = [];
  const push = (z: string) => {
    if (!order.includes(z)) order.push(z);
  };
  zones.forEach(push);
  nodes.forEach((n) => push(n.zone ?? "Services"));

  const byCol = new Map<string, TopoNode[]>();
  order.forEach((z) => byCol.set(z, []));
  nodes.forEach((n) => byCol.get(n.zone ?? "Services")!.push(n));

  // Drop empty zones (declared but unused) to keep columns tight.
  const usedOrder = order.filter((z) => (byCol.get(z)?.length ?? 0) > 0);

  const laid: LaidNode[] = [];
  const laidZones: LaidZone[] = [];
  usedOrder.forEach((zoneName, col) => {
    const bucket = byCol.get(zoneName)!;
    laidZones.push({ name: zoneName, col, count: bucket.length });
    bucket.forEach((n, row) => {
      laid.push({ ...n, col, row, rows: bucket.length, zoneName });
    });
  });

  return { laid, zones: laidZones, cols: usedOrder.length };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function SystemTopology({
  nodes = DEFAULT_NODES,
  links = DEFAULT_LINKS,
  zones = DEFAULT_ZONES,
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1300,
}: SystemTopologyProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const ids = useMemo(
    () => ({ shadow: uid("topo-shadow"), glow: uid("topo-glow"), arrow: uid("topo-arrow"), arrowHot: uid("topo-arrow-hot") }),
    [],
  );

  const { laid, zones: laidZones, cols } = useMemo(() => layout(nodes, zones), [nodes, zones]);

  // Adjacency for neighborhood highlight.
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    laid.forEach((n) => m.set(n.id, new Set()));
    links.forEach((l) => {
      if (m.has(l.source) && m.has(l.target)) {
        m.get(l.source)!.add(l.target);
        m.get(l.target)!.add(l.source);
      }
    });
    return m;
  }, [laid, links]);

  const validLinks = useMemo(() => {
    const idSet = new Set(laid.map((n) => n.id));
    return links.filter((l) => idSet.has(l.source) && idSet.has(l.target) && l.source !== l.target);
  }, [laid, links]);

  const maxRows = Math.max(1, ...laidZones.map((z) => z.count));

  const animBase = reduced ? 0 : duration / 1000;
  const play = inView || reduced;

  const nodeById = useMemo(() => {
    const m = new Map<string, LaidNode>();
    laid.forEach((n) => m.set(n.id, n));
    return m;
  }, [laid]);

  const neighbors = hover ? adjacency.get(hover.id) : undefined;
  const nodeActive = (id: string) => !hover || hover.id === id || (neighbors?.has(id) ?? false);
  const linkActive = (l: TopoLink) => !hover || l.source === hover.id || l.target === hover.id;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 9} margin={{ top: 30, right: 24, bottom: 22, left: 24 }}>
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;

            // Column geometry.
            const colW = W / Math.max(1, cols);
            const boxW = Math.max(96, Math.min(colW - 40, 168));
            const boxH = 50;
            const rowGap = 18;

            // Zone band geometry (top label sits above the band).
            const bandTop = 14;
            const bandBottom = H;

            const colCenter = (col: number) => col * colW + colW / 2;

            // Vertically center each column's nodes within the band.
            const nodeCenter = (n: LaidNode) => {
              const cx = colCenter(n.col);
              const stackH = n.rows * boxH + (n.rows - 1) * rowGap;
              const top = bandTop + (bandBottom - bandTop - stackH) / 2;
              const cy = top + n.row * (boxH + rowGap) + boxH / 2;
              return { cx, cy };
            };

            const posById = new Map<string, { cx: number; cy: number }>();
            laid.forEach((n) => posById.set(n.id, nodeCenter(n)));

            // Pre-compute edge-label anchors, then de-collide labels whose pills
            // would overlap: links between the same pair of columns (and same-col
            // hops routed to the same gutter) collapse into a narrow center band,
            // so their pills stack. Spread colliding pills vertically so each
            // annotation stays readable.
            const labelH = 15;
            const labelW = (s?: string) => (s ? s.length * 6.1 + 10 : 0);
            const labelPos = new Map<number, { mx: number; my: number }>();
            validLinks.forEach((l, i) => {
              if (!l.label) return;
              const a = posById.get(l.source);
              const b = posById.get(l.target);
              if (!a || !b) return;
              const sameCol = Math.abs(a.cx - b.cx) < 1;
              const hw = boxW / 2;
              const mx = sameCol ? a.cx + hw + 24 : (a.cx + b.cx) / 2;
              const my = (a.cy + b.cy) / 2;
              labelPos.set(i, { mx, my });
            });
            // Cluster labels by horizontal pill overlap, then fan each cluster out
            // vertically and re-center it around its original mean y.
            const ordered = [...labelPos.keys()].sort(
              (p, q) => labelPos.get(p)!.mx - labelPos.get(q)!.mx,
            );
            const clusters: number[][] = [];
            ordered.forEach((i) => {
              const li = labelPos.get(i)!;
              const halfI = labelW(validLinks[i].label) / 2;
              const last = clusters[clusters.length - 1];
              if (last) {
                const j = last[last.length - 1];
                const lj = labelPos.get(j)!;
                const halfJ = labelW(validLinks[j].label) / 2;
                if (li.mx - lj.mx < halfI + halfJ) {
                  last.push(i);
                  return;
                }
              }
              clusters.push([i]);
            });
            clusters.forEach((group) => {
              if (group.length < 2) return;
              group.sort((p, q) => labelPos.get(p)!.my - labelPos.get(q)!.my);
              const minGap = labelH + 4;
              const meanOrig =
                group.reduce((s, g) => s + labelPos.get(g)!.my, 0) / group.length;
              for (let k = 1; k < group.length; k++) {
                const prev = labelPos.get(group[k - 1])!;
                const cur = labelPos.get(group[k])!;
                if (cur.my - prev.my < minGap) cur.my = prev.my + minGap;
              }
              const meanNow =
                group.reduce((s, g) => s + labelPos.get(g)!.my, 0) / group.length;
              const shift = meanOrig - meanNow;
              group.forEach((g) => (labelPos.get(g)!.my += shift));
            });

            // Reveal scheduling: zones → nodes (by column) → links.
            const zoneDelay = (col: number) => (reduced ? 0 : col * 0.07 * animBase);
            const nodeDelay = (n: LaidNode) =>
              reduced ? 0 : (animBase * 0.22 + (n.col * 0.6 + n.row * 0.14) * (animBase / Math.max(1, cols)));
            const linkBaseDelay = reduced ? 0 : animBase * 0.55;

            return (
              <g transform={`translate(${margin.left},${margin.top})`}>
                <defs>
                  <SoftShadow id={ids.shadow} dy={3} blur={8} opacity={0.16} />
                  <Glow id={ids.glow} blur={5} />
                  <marker
                    id={ids.arrow}
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
                    id={ids.arrowHot}
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

                {/* Zone bands */}
                <g>
                  {laidZones.map((z) => {
                    const cx = colCenter(z.col);
                    const bx = cx - boxW / 2 - 16;
                    const bw = boxW + 32;
                    const active =
                      hover != null && nodeById.get(hover.id)?.zoneName === z.name;
                    return (
                      <motion.g
                        key={`${token}-zone-${z.name}`}
                        initial={{ opacity: reduced ? 1 : 0 }}
                        animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.5, delay: zoneDelay(z.col), ease: [0.22, 1, 0.36, 1] }}
                      >
                        <rect
                          x={bx}
                          y={bandTop}
                          width={bw}
                          height={bandBottom - bandTop}
                          rx={14}
                          fill={active ? withAlpha(fill, 0.05) : withAlpha(p.inkFaint, 0.035)}
                          stroke={active ? withAlpha(fill, 0.5) : p.border}
                          strokeWidth={1}
                          strokeDasharray="5 5"
                        />
                        <text
                          x={cx}
                          y={bandTop - 8}
                          textAnchor="middle"
                          className="font-mono uppercase tracking-label"
                          style={{ fontSize: 9.5 }}
                          fill={active ? fill : p.inkFaint}
                        >
                          {z.name}
                        </text>
                      </motion.g>
                    );
                  })}
                </g>

                {/* Links */}
                <g>
                  {validLinks.map((l, i) => {
                    const a = posById.get(l.source);
                    const b = posById.get(l.target);
                    if (!a || !b) return null;

                    const sameCol = Math.abs(a.cx - b.cx) < 1;
                    const hw = boxW / 2;
                    const hh = boxH / 2;

                    let x1 = a.cx;
                    let y1 = a.cy;
                    let x2 = b.cx;
                    let y2 = b.cy;
                    if (sameCol) {
                      // Vertical hop within a column — route off the right face.
                      x1 = a.cx + hw;
                      x2 = b.cx + hw;
                    } else {
                      // Horizontal flow between columns — connect facing edges.
                      const dir = b.cx > a.cx ? 1 : -1;
                      x1 = a.cx + dir * hw;
                      x2 = b.cx - dir * hw;
                    }

                    const active = linkActive(l);
                    const dim = hover != null && !active;

                    const d = sameCol
                      ? `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${x2 + 34} ${y2}, ${x2} ${y2}`
                      : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;

                    const anchor = labelPos.get(i);
                    const mx = anchor?.mx ?? (sameCol ? Math.max(x1, x2) + 24 : (x1 + x2) / 2);
                    const my = anchor?.my ?? (y1 + y2) / 2;

                    const delay = linkBaseDelay + (reduced ? 0 : i * 0.05);

                    return (
                      <g key={`${token}-link-${l.source}-${l.target}-${i}`}>
                        <motion.path
                          d={d}
                          fill="none"
                          stroke={active ? withAlpha(fill, 0.9) : withAlpha(p.borderStrong, 0.85)}
                          strokeWidth={active ? 2 : 1.4}
                          strokeLinecap="round"
                          markerEnd={`url(#${active && hover ? ids.arrowHot : ids.arrow})`}
                          style={{ opacity: dim ? 0.22 : 1 }}
                          initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
                          animate={{
                            pathLength: play ? 1 : reduced ? 1 : 0,
                            opacity: play ? (dim ? 0.22 : 1) : reduced ? 1 : 0,
                          }}
                          transition={{
                            pathLength: { duration: reduced ? 0 : animBase * 0.45, delay, ease: [0.22, 1, 0.36, 1] },
                            opacity: { duration: 0.2, delay },
                          }}
                        />
                        {l.label && (
                          <motion.g
                            initial={{ opacity: reduced ? 1 : 0 }}
                            animate={{ opacity: play ? (dim ? 0.25 : 1) : reduced ? 1 : 0 }}
                            transition={{ duration: 0.3, delay: delay + animBase * 0.3 }}
                          >
                            <rect
                              x={mx - l.label.length * 3.05 - 5}
                              y={my - 8}
                              width={l.label.length * 6.1 + 10}
                              height={15}
                              rx={4}
                              fill={p.canvas}
                              stroke={hover && active ? withAlpha(fill, 0.4) : p.border}
                              strokeWidth={1}
                            />
                            <text
                              x={mx}
                              y={my}
                              dy="0.32em"
                              textAnchor="middle"
                              className="font-mono"
                              style={{ fontSize: 8.5, letterSpacing: "0.03em" }}
                              fill={hover && active ? fill : p.inkMuted}
                            >
                              {l.label}
                            </text>
                          </motion.g>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Nodes */}
                <g>
                  {laid.map((n) => {
                    const pos = posById.get(n.id)!;
                    const x = pos.cx - boxW / 2;
                    const y = pos.cy - boxH / 2;
                    const Icon = n.icon ? ICONS[n.icon.toLowerCase()] : undefined;

                    const active = hover?.id === n.id;
                    const related = nodeActive(n.id);
                    const dim = hover != null && !related;

                    const surface = active ? mix(p.surface, fill, 0.08) : p.surface;
                    const stroke = active ? fill : related ? withAlpha(fill, 0.55) : p.border;
                    const delay = nodeDelay(n);

                    return (
                      <motion.g
                        key={`${token}-node-${n.id}`}
                        style={{ cursor: "pointer", opacity: dim ? 0.4 : 1 }}
                        onMouseMove={(e) => {
                          const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                          const box = svg.getBoundingClientRect();
                          setHover({ id: n.id, x: e.clientX - box.left, y: e.clientY - box.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.88 }}
                        animate={{
                          opacity: play ? (dim ? 0.4 : 1) : reduced ? 1 : 0,
                          scale: play ? 1 : reduced ? 1 : 0.88,
                        }}
                        transition={{ duration: reduced ? 0 : 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {/* Box */}
                        <rect
                          x={x}
                          y={y}
                          width={boxW}
                          height={boxH}
                          rx={10}
                          fill={surface}
                          stroke={stroke}
                          strokeWidth={active ? 2 : 1.25}
                          filter={`url(#${ids.shadow})`}
                        />
                        {/* Icon tile */}
                        <rect
                          x={x + 9}
                          y={y + boxH / 2 - 13}
                          width={26}
                          height={26}
                          rx={7}
                          fill={active ? fill : withAlpha(fill, 0.13)}
                          stroke={active ? "none" : withAlpha(fill, 0.3)}
                          strokeWidth={1}
                          filter={active ? `url(#${ids.glow})` : undefined}
                        />
                        {Icon ? (
                          <foreignObject
                            x={x + 9}
                            y={y + boxH / 2 - 13}
                            width={26}
                            height={26}
                            style={{ overflow: "visible", pointerEvents: "none" }}
                          >
                            <div className="flex h-full w-full items-center justify-center">
                              <Icon
                                width={15}
                                height={15}
                                strokeWidth={1.7}
                                color={active ? readableOn(fill) : fill}
                              />
                            </div>
                          </foreignObject>
                        ) : (
                          <circle cx={x + 22} cy={pos.cy} r={3.5} fill={active ? readableOn(fill) : fill} />
                        )}
                        {/* Label */}
                        <text
                          x={x + 44}
                          y={pos.cy - (n.sublabel ? 5 : 0)}
                          dy={n.sublabel ? 0 : "0.32em"}
                          textAnchor="start"
                          className="font-sans"
                          style={{ fontSize: 12, fontWeight: 600 }}
                          fill={p.ink}
                        >
                          {truncate(n.label, 16)}
                        </text>
                        {n.sublabel && (
                          <text
                            x={x + 44}
                            y={pos.cy + 10}
                            textAnchor="start"
                            className="font-mono"
                            style={{ fontSize: 8.5, letterSpacing: "0.02em" }}
                            fill={p.inkFaint}
                          >
                            {truncate(n.sublabel, 18)}
                          </text>
                        )}
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
                    style={{ fontSize: 11 }}
                    fill={p.inkFaint}
                  >
                    No services to display
                  </text>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null &&
            (() => {
              const n = nodeById.get(hover.id);
              if (!n) return null;
              const out = validLinks.filter((l) => l.source === n.id);
              const inc = validLinks.filter((l) => l.target === n.id);
              return (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {n.label}
                  </div>
                  <TooltipRow label="zone" value={n.zoneName} />
                  {n.sublabel && <TooltipRow label="detail" value={n.sublabel} />}
                  <TooltipRow label="upstream" value={inc.length} />
                  <TooltipRow label="downstream" value={out.length} />
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "system-topology",
  name: "System Topology",
  category: "diagrams",
  description:
    "A service topology that groups nodes into dashed zone columns and draws directed, labeled links between them; hovering a service traces its upstream and downstream dependencies.",
  tags: ["topology", "architecture", "services", "system", "diagram", "infra", "zones"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "SystemTopology",
  sourcePath: "diagrams/SystemTopology",
  aspect: 16 / 9,
  controls: [
    {
      key: "nodes",
      label: "Services",
      type: "json",
      group: "Data",
      help: "[{ id, label, zone?, icon?, sublabel? }] — icon keys: gateway, router, planner, worldmodel, gpu, db, cache, search, shield, monitor, …",
      default: DEFAULT_NODES,
    },
    {
      key: "links",
      label: "Links",
      type: "json",
      group: "Data",
      help: "[{ source, target, label? }] referencing service ids; label is protocol / latency.",
      default: DEFAULT_LINKS,
    },
    {
      key: "zones",
      label: "Zones",
      type: "json",
      group: "Layout",
      help: "Ordered tier names, e.g. [\"Edge\", \"Control Plane\", \"Compute\"]. Services join a zone by their `zone` field.",
      default: DEFAULT_ZONES,
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
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "serving",
      name: "Model serving topology",
      props: {
        title: "Inference serving topology",
        caption: "Requests flow edge → control plane → compute; the planner fans out to the GPU pool.",
        zones: DEFAULT_ZONES,
        nodes: DEFAULT_NODES,
        links: DEFAULT_LINKS,
      },
    },
    {
      id: "rag",
      name: "RAG service mesh",
      props: {
        title: "Retrieval-augmented serving mesh",
        zones: ["Edge", "Orchestration", "Retrieval", "Inference"],
        nodes: [
          { id: "gw", label: "Gateway", zone: "Edge", icon: "gateway", sublabel: "rate limit" },
          { id: "auth", label: "Auth", zone: "Edge", icon: "auth", sublabel: "oauth2" },
          { id: "orch", label: "Orchestrator", zone: "Orchestration", icon: "planner", sublabel: "pipeline" },
          { id: "embed", label: "Embedder", zone: "Retrieval", icon: "zap", sublabel: "text-3-large" },
          { id: "vec", label: "Vector DB", zone: "Retrieval", icon: "db", sublabel: "HNSW" },
          { id: "rerank", label: "Reranker", zone: "Retrieval", icon: "search", sublabel: "cross-enc" },
          { id: "llm", label: "LLM Pool", zone: "Inference", icon: "gpu", sublabel: "32 × H100" },
        ],
        links: [
          { source: "gw", target: "auth", label: "verify" },
          { source: "auth", target: "orch", label: "grpc" },
          { source: "orch", target: "embed", label: "query" },
          { source: "embed", target: "vec", label: "ann · 6ms" },
          { source: "vec", target: "rerank", label: "top-50" },
          { source: "rerank", target: "orch", label: "top-8" },
          { source: "orch", target: "llm", label: "ctx · 41ms" },
        ],
      },
    },
    {
      id: "robotics",
      name: "Robot fleet control",
      props: {
        title: "Robot fleet control plane",
        zones: ["Fleet", "Cloud Control", "Perception"],
        accent: "",
        nodes: [
          { id: "robot", label: "Robot Fleet", zone: "Fleet", icon: "bot", sublabel: "240 units" },
          { id: "edge", label: "Edge Agent", zone: "Fleet", icon: "cpu", sublabel: "on-device" },
          { id: "broker", label: "MQTT Broker", zone: "Cloud Control", icon: "message", sublabel: "telemetry" },
          { id: "planner", label: "Task Planner", zone: "Cloud Control", icon: "planner", sublabel: "scheduler" },
          { id: "monitor", label: "Monitor", zone: "Cloud Control", icon: "monitor", sublabel: "health" },
          { id: "vision", label: "Vision Model", zone: "Perception", icon: "brain", sublabel: "detector" },
          { id: "map", label: "Map Store", zone: "Perception", icon: "db", sublabel: "SLAM" },
        ],
        links: [
          { source: "robot", target: "edge", label: "sensors" },
          { source: "edge", target: "broker", label: "mqtt" },
          { source: "broker", target: "planner", label: "events" },
          { source: "broker", target: "monitor", label: "metrics" },
          { source: "planner", target: "vision", label: "frames" },
          { source: "vision", target: "map", label: "poses" },
          { source: "planner", target: "edge", label: "commands" },
        ],
      },
    },
  ],
};
