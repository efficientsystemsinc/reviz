"use client";

import { motion } from "framer-motion";
import {
  Boxes,
  Brain,
  CheckCircle2,
  Database,
  Filter,
  Layers,
  Network,
  Search,
  Send,
  Server,
  Shield,
  Sparkles,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Figure,
  Glow,
  ReplayButton,
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

type StageStatus = "default" | "ok" | "warn" | "bad" | "muted";

interface Stage {
  label: string;
  sublabel?: string;
  /** Named icon (see ICONS); falls back to a step glyph. */
  icon?: string;
  /** Per-stage status tint. */
  status?: StageStatus;
}

export interface PipelineDiagramProps {
  stages: Stage[];
  shape?: "chevron" | "rounded";
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Icon registry — string keys map to curated lucide glyphs.           */
/* ------------------------------------------------------------------ */

const ICONS: Record<string, LucideIcon> = {
  database: Database,
  data: Database,
  layers: Layers,
  embed: Boxes,
  boxes: Boxes,
  search: Search,
  retrieve: Search,
  filter: Filter,
  rerank: Filter,
  brain: Brain,
  synthesize: Sparkles,
  sparkles: Sparkles,
  generate: Sparkles,
  network: Network,
  server: Server,
  shield: Shield,
  guard: Shield,
  send: Send,
  deploy: Send,
  zap: Zap,
  check: CheckCircle2,
  done: CheckCircle2,
  workflow: Workflow,
};

function resolveIcon(name?: string): LucideIcon | null {
  if (!name) return null;
  return ICONS[name.toLowerCase().trim()] ?? null;
}

/* ------------------------------------------------------------------ */
/* Defaults — RAG serving pipeline                                     */
/* ------------------------------------------------------------------ */

const DEFAULT_STAGES: Stage[] = [
  { label: "Data", sublabel: "12.4M docs", icon: "database", status: "muted" },
  { label: "Embed", sublabel: "text-3-large", icon: "embed", status: "default" },
  { label: "Retrieve", sublabel: "top-k = 64", icon: "retrieve", status: "default" },
  { label: "Rerank", sublabel: "cross-encoder", icon: "rerank", status: "default" },
  { label: "Synthesize", sublabel: "Aria-L", icon: "synthesize", status: "ok" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function PipelineDiagram({
  stages = DEFAULT_STAGES,
  shape = "chevron",
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1300,
}: PipelineDiagramProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<number | null>(null);

  const ids = useMemo(() => uid("pipe"), []);

  const clean = useMemo(
    () => (Array.isArray(stages) ? stages.filter((s) => s && (s.label || s.sublabel)) : []),
    [stages],
  );
  const n = clean.length;

  const statusColor = (s: Stage): string => {
    switch (s.status) {
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

  const span = reduced ? 0 : duration / 1000;
  // Each stage gets a slice of the timeline; the connecting arrow flows just after.
  const slice = n > 0 ? span / (n + 0.5) : 0;
  const stageDelay = (i: number) => (reduced ? 0 : i * slice);
  const baseEase = [0.22, 1, 0.36, 1] as const;

  const isChevron = shape === "chevron";

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 6} margin={{ top: 20, right: 18, bottom: 22, left: 18 }}>
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;

            if (n === 0) {
              return (
                <g transform={`translate(${margin.left},${margin.top})`}>
                  <text
                    x={W / 2}
                    y={H / 2}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={11}
                    fill={p.inkFaint}
                  >
                    No stages to display
                  </text>
                </g>
              );
            }

            // Geometry: stages share the row width; arrows sit in the gaps.
            const GAP = Math.max(14, Math.min(34, W * 0.022));
            const cellW = (W - GAP * (n - 1)) / n;
            const boxH = Math.min(H, Math.max(58, H * 0.82));
            const cy = H / 2;
            const top = cy - boxH / 2;
            // Chevron notch depth scales with cell width but stays tasteful.
            const notch = isChevron ? Math.min(18, cellW * 0.16) : 0;
            const radius = isChevron ? 6 : 12;

            const xOf = (i: number) => i * (cellW + GAP);

            return (
              <g transform={`translate(${margin.left},${margin.top})`}>
                <defs>
                  <SoftShadow id={`${ids}-shadow`} dy={3} blur={8} opacity={0.16} />
                  <Glow id={`${ids}-glow`} blur={5} />
                  <marker
                    id={`${ids}-arrow`}
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke={p.borderStrong} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                  <marker
                    id={`${ids}-arrow-hot`}
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="7.5"
                    markerHeight="7.5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke={fill} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                </defs>

                {/* Connecting arrows (drawn behind stages) */}
                <g>
                  {clean.slice(0, -1).map((_, i) => {
                    const x1 = xOf(i) + cellW - notch * 0.5;
                    const x2 = xOf(i + 1) + (isChevron ? notch * 0.5 : 0);
                    const active = hover != null && (hover === i || hover === i + 1);
                    const dim = hover != null && !active;
                    // Arrow flows in right after its source stage appears.
                    const delay = stageDelay(i) + slice * 0.55;
                    return (
                      <g key={`${token}-arr-${i}`}>
                        {/* Faint rail */}
                        <line
                          x1={x1}
                          y1={cy}
                          x2={x2}
                          y2={cy}
                          stroke={withAlpha(p.borderStrong, 0.35)}
                          strokeWidth={1.5}
                          strokeDasharray="2 4"
                          strokeLinecap="round"
                          style={{ opacity: dim ? 0.3 : 0.8 }}
                        />
                        {/* Flowing arrow */}
                        <motion.line
                          x1={x1}
                          y1={cy}
                          x2={x2}
                          y2={cy}
                          stroke={active ? fill : p.borderStrong}
                          strokeWidth={active ? 2.4 : 1.8}
                          strokeLinecap="round"
                          markerEnd={`url(#${ids}-${active ? "arrow-hot" : "arrow"})`}
                          style={{ opacity: dim ? 0.25 : 1 }}
                          initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
                          animate={{
                            pathLength: inView ? 1 : reduced ? 1 : 0,
                            opacity: inView ? (dim ? 0.25 : 1) : reduced ? 1 : 0,
                          }}
                          transition={{
                            pathLength: { duration: reduced ? 0 : Math.max(0.2, slice * 0.7), delay, ease: baseEase },
                            opacity: { duration: 0.2, delay },
                          }}
                        />
                      </g>
                    );
                  })}
                </g>

                {/* Stages */}
                <g>
                  {clean.map((s, i) => {
                    const x = xOf(i);
                    const tone = statusColor(s);
                    const active = hover === i;
                    const dim = hover != null && !active;
                    const Icon = resolveIcon(s.icon);

                    const surface = active ? mix(p.surface, tone, 0.1) : p.surface;
                    const stroke = active ? tone : withAlpha(tone, 0.55);
                    const isFirst = i === 0;
                    const isLast = i === n - 1;
                    const delay = stageDelay(i);

                    const d = stagePath({
                      x,
                      y: top,
                      w: cellW,
                      h: boxH,
                      notch,
                      radius,
                      first: isFirst,
                      last: isLast,
                      chevron: isChevron,
                    });

                    // Inner padding accounts for the chevron point on the right.
                    const padL = isChevron && !isFirst ? notch + 14 : 16;
                    const contentX = x + padL;
                    const iconSize = Math.min(20, boxH * 0.26);
                    const hasIcon = Icon != null;

                    return (
                      <motion.g
                        key={`${token}-stage-${i}`}
                        style={{ cursor: "default", opacity: dim ? 0.45 : 1 }}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(null)}
                        initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -14 }}
                        animate={{
                          opacity: inView ? (dim ? 0.45 : 1) : reduced ? 1 : 0,
                          x: inView ? 0 : reduced ? 0 : -14,
                        }}
                        transition={{ duration: reduced ? 0 : 0.5, delay, ease: baseEase }}
                      >
                        <path
                          d={d}
                          fill={surface}
                          stroke={stroke}
                          strokeWidth={active ? 2 : 1.25}
                          strokeLinejoin="round"
                          filter={`url(#${ids}-shadow)`}
                        />
                        {/* Leading accent edge */}
                        <path
                          d={leadingEdge({
                            x,
                            y: top,
                            h: boxH,
                            notch,
                            radius,
                            first: isFirst,
                            chevron: isChevron,
                          })}
                          fill="none"
                          stroke={tone}
                          strokeWidth={3}
                          strokeLinecap="round"
                          filter={active ? `url(#${ids}-glow)` : undefined}
                          style={{ opacity: active ? 1 : 0.85 }}
                        />

                        {/* Icon chip */}
                        {hasIcon && Icon && (
                          <g transform={`translate(${contentX}, ${cy - boxH * 0.18 - iconSize / 2})`}>
                            <rect
                              x={0}
                              y={0}
                              width={iconSize + 10}
                              height={iconSize + 10}
                              rx={7}
                              fill={active ? tone : withAlpha(tone, 0.14)}
                              stroke={active ? "none" : withAlpha(tone, 0.35)}
                              strokeWidth={1}
                            />
                            <g transform={`translate(5, 5)`} style={{ color: active ? readableOn(tone) : tone }}>
                              <Icon width={iconSize} height={iconSize} strokeWidth={2} />
                            </g>
                          </g>
                        )}

                        {/* Label */}
                        <text
                          x={contentX}
                          y={hasIcon ? cy + boxH * 0.12 : cy - (s.sublabel ? 7 : 0)}
                          dy={!hasIcon && !s.sublabel ? "0.32em" : 0}
                          textAnchor="start"
                          className="font-sans"
                          fontSize={Math.min(14, cellW * 0.13)}
                          fontWeight={600}
                          fill={p.ink}
                        >
                          {truncate(s.label, Math.max(6, Math.floor((cellW - padL) / 8)))}
                        </text>

                        {/* Sublabel */}
                        {s.sublabel && (
                          <text
                            x={contentX}
                            y={hasIcon ? cy + boxH * 0.32 : cy + 11}
                            textAnchor="start"
                            className="font-mono"
                            fontSize={Math.min(9.5, cellW * 0.085)}
                            letterSpacing="0.03em"
                            fill={p.inkFaint}
                          >
                            {truncate(s.sublabel, Math.max(8, Math.floor((cellW - padL) / 6)))}
                          </text>
                        )}

                        {/* Step index chip (top-right corner, before chevron point) */}
                        <g transform={`translate(${x + cellW - (isChevron && !isLast ? notch + 12 : 14)}, ${top + 12})`}>
                          <circle
                            r={8}
                            fill={active ? tone : withAlpha(tone, 0.12)}
                            stroke={active ? "none" : withAlpha(tone, 0.35)}
                            strokeWidth={1}
                          />
                          <text
                            dy="0.34em"
                            textAnchor="middle"
                            className="font-mono"
                            fontSize={8.5}
                            fontWeight={600}
                            fill={active ? readableOn(tone) : tone}
                          >
                            {i + 1}
                          </text>
                        </g>
                      </motion.g>
                    );
                  })}
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        {n > 0 && (
          <div className="mt-1 flex justify-end">
            <ReplayButton onClick={replay} />
          </div>
        )}
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Path builders                                                       */
/* ------------------------------------------------------------------ */

interface ShapeArgs {
  x: number;
  y: number;
  w: number;
  h: number;
  notch: number;
  radius: number;
  first: boolean;
  last: boolean;
  chevron: boolean;
}

/** The full stage outline — rounded box, or a chevron with notched ends. */
function stagePath({ x, y, w, h, notch, radius, first, last, chevron }: ShapeArgs): string {
  if (!chevron) {
    return roundedRect(x, y, w, h, radius);
  }
  const r = radius;
  const left = x;
  const right = x + w;
  const top = y;
  const bottom = y + h;
  const midY = y + h / 2;

  // Left face: flat (first) or inward notch (chevron arrow tail).
  // Right face: outward chevron point (not last) or flat (last).
  const rightPoint = last ? right : right + 0; // right face notch handled via point
  const parts: string[] = [];

  // Start at top-left (after corner radius)
  parts.push(`M ${left + r} ${top}`);
  // top edge to top-right
  parts.push(`L ${last ? right - r : right - notch} ${top}`);
  if (last) {
    // rounded top-right + flat right edge + rounded bottom-right
    parts.push(`Q ${right} ${top} ${right} ${top + r}`);
    parts.push(`L ${right} ${bottom - r}`);
    parts.push(`Q ${right} ${bottom} ${right - r} ${bottom}`);
  } else {
    // chevron point on the right
    parts.push(`L ${rightPoint} ${midY}`);
    parts.push(`L ${right - notch} ${bottom}`);
  }
  // bottom edge to bottom-left
  parts.push(`L ${left + r} ${bottom}`);
  if (first) {
    // rounded bottom-left + flat left edge + rounded top-left
    parts.push(`Q ${left} ${bottom} ${left} ${bottom - r}`);
    parts.push(`L ${left} ${top + r}`);
    parts.push(`Q ${left} ${top} ${left + r} ${top}`);
  } else {
    // left notch matching the chevron tail
    parts.push(`L ${left} ${bottom}`);
    parts.push(`L ${left + notch} ${midY}`);
    parts.push(`L ${left} ${top}`);
    parts.push(`L ${left + r} ${top}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** Just the leading (left) edge of a stage, used for the accent stroke. */
function leadingEdge({
  x,
  y,
  h,
  notch,
  radius,
  first,
  chevron,
}: {
  x: number;
  y: number;
  h: number;
  notch: number;
  radius: number;
  first: boolean;
  chevron: boolean;
}): string {
  const top = y;
  const bottom = y + h;
  const midY = y + h / 2;
  if (!chevron || first) {
    const inset = 1.5;
    return `M ${x + inset} ${top + radius} L ${x + inset} ${bottom - radius}`;
  }
  // Trace the chevron notch so the accent hugs the arrow tail.
  return `M ${x} ${top + 1} L ${x + notch} ${midY} L ${x} ${bottom - 1}`;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h - rr}`,
    `Q ${x + w} ${y + h} ${x + w - rr} ${y + h}`,
    `L ${x + rr} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - rr}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    "Z",
  ].join(" ");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s;
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "pipeline-diagram",
  name: "Pipeline Diagram",
  category: "diagrams",
  description:
    "A horizontal pipeline of chevron or rounded stages joined by flowing arrows, each with a title, sublabel, icon, and status tint — stages reveal left to right as the arrows draw in.",
  tags: ["pipeline", "stages", "flow", "diagram", "chevron", "process", "etl"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "PipelineDiagram",
  sourcePath: "diagrams/PipelineDiagram",
  aspect: 16 / 6,
  controls: [
    {
      key: "stages",
      label: "Stages",
      type: "json",
      group: "Data",
      help: "[{ label, sublabel?, icon?, status? }] left → right. icon: database|embed|retrieve|rerank|synthesize|shield|… status: default|ok|warn|bad|muted.",
      default: DEFAULT_STAGES,
    },
    {
      key: "shape",
      label: "Stage shape",
      type: "select",
      group: "Layout",
      default: "chevron",
      options: [
        { value: "chevron", label: "Chevron" },
        { value: "rounded", label: "Rounded box" },
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
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "rag",
      name: "RAG pipeline",
      props: {
        title: "Retrieval-augmented generation pipeline",
        caption: "Documents are embedded, retrieved, reranked, and synthesized into a grounded answer.",
        shape: "chevron",
        stages: DEFAULT_STAGES,
      },
    },
    {
      id: "training",
      name: "Training pipeline",
      props: {
        title: "Model training pipeline",
        shape: "rounded",
        stages: [
          { label: "Ingest", sublabel: "raw corpus", icon: "database", status: "muted" },
          { label: "Tokenize", sublabel: "BPE 200k", icon: "layers", status: "default" },
          { label: "Pretrain", sublabel: "256 × GPU-B", icon: "brain", status: "default" },
          { label: "Evaluate", sublabel: "held-out", icon: "search", status: "warn" },
          { label: "Deploy", sublabel: "canary 5%", icon: "deploy", status: "ok" },
        ],
      },
    },
    {
      id: "inference",
      name: "Inference path",
      props: {
        title: "Production inference path",
        caption: "Each request is guarded, routed, served, and verified before the response is returned.",
        shape: "chevron",
        stages: [
          { label: "Request", sublabel: "user prompt", icon: "send", status: "muted" },
          { label: "Guardrail", sublabel: "safety filter", icon: "shield", status: "warn" },
          { label: "Route", sublabel: "MoE gate", icon: "network", status: "default" },
          { label: "Serve", sublabel: "vLLM batch", icon: "server", status: "default" },
          { label: "Verify", sublabel: "self-check", icon: "check", status: "ok" },
        ],
      },
    },
  ],
};
