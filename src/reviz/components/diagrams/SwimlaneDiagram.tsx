"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Glow,
  ReplayButton,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
  mix,
  readableOn,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Step {
  /** Lane (actor) name — must match an entry in `lanes`. */
  lane: string;
  /** Short step label shown inside the box. */
  label: string;
  /** Left-to-right ordinal position (1-based column). */
  order: number;
  /** Optional secondary line (latency, status, payload …). */
  detail?: string;
  /** Optional per-step tone override. */
  tone?: "accent" | "ok" | "warn" | "bad" | "muted";
}

interface Edge {
  /** Source step label. */
  from: string;
  /** Target step label. */
  to: string;
  /** Optional edge annotation. */
  label?: string;
}

export interface SwimlaneDiagramProps {
  lanes?: string[];
  steps?: Step[];
  edges?: Edge[];
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults — a request lifecycle across services                      */
/* ------------------------------------------------------------------ */

const DEFAULT_LANES: string[] = ["Client", "Gateway", "Auth", "Inference", "Cache"];

const DEFAULT_STEPS: Step[] = [
  { lane: "Client", label: "Send prompt", order: 1, detail: "POST /v1/chat", tone: "muted" },
  { lane: "Gateway", label: "Route", order: 2, detail: "rate-limit", tone: "accent" },
  { lane: "Auth", label: "Verify token", order: 3, detail: "JWT · 4ms", tone: "warn" },
  { lane: "Cache", label: "Lookup", order: 4, detail: "semantic key", tone: "muted" },
  { lane: "Inference", label: "Generate", order: 5, detail: "Aria-L · 820ms", tone: "accent" },
  { lane: "Cache", label: "Store", order: 6, detail: "ttl 1h", tone: "ok" },
  { lane: "Gateway", label: "Stream back", order: 7, detail: "SSE", tone: "accent" },
  { lane: "Client", label: "Render", order: 8, detail: "tokens/s 96", tone: "ok" },
];

const DEFAULT_EDGES: Edge[] = [
  { from: "Send prompt", to: "Route", label: "request" },
  { from: "Route", to: "Verify token", label: "authz" },
  { from: "Verify token", to: "Lookup", label: "ok" },
  { from: "Lookup", to: "Generate", label: "miss" },
  { from: "Generate", to: "Store", label: "result" },
  { from: "Store", to: "Stream back" },
  { from: "Stream back", to: "Render", label: "200" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function SwimlaneDiagram({
  lanes = DEFAULT_LANES,
  steps = DEFAULT_STEPS,
  edges = DEFAULT_EDGES,
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1400,
}: SwimlaneDiagramProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);

  const ids = useMemo(() => uid("swim"), []);

  /* --- Normalize: clean lanes + place steps on a (lane, column) grid -- */
  const model = useMemo(() => layout(lanes, steps, edges), [lanes, steps, edges]);
  const { laneList, placed, columns, cleanEdges } = model;

  /* --- Geometry --------------------------------------------------- */
  const laneCount = Math.max(1, laneList.length);
  const colCount = Math.max(1, columns);
  const aspect = colCount >= 6 ? 16 / 9 : colCount >= 4 ? 16 / 8 : 4 / 3;

  const animBase = reduced ? 0 : Math.max(0, duration) / 1000;
  // Each step reveals in `order`; edges follow their source step.
  const totalSteps = placed.length;
  const stepDelay = (orderIdx: number) =>
    reduced ? 0 : (orderIdx / Math.max(1, totalSteps)) * animBase * 0.85;

  const toneColor = (s: PlacedStep): string => {
    switch (s.tone) {
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

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={aspect} margin={{ top: 16, right: 22, bottom: 16, left: 116 }}>
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;

            const laneH = H / laneCount;
            const colW = W / colCount;

            // Box footprint inside each (lane, column) cell.
            const boxW = Math.max(64, Math.min(colW - 22, 150));
            const boxH = Math.max(38, Math.min(laneH - 18, 58));

            const laneY = (li: number) => li * laneH;
            const laneCY = (li: number) => laneY(li) + laneH / 2;
            const colCX = (c: number) => (c + 0.5) * colW;

            const center = (s: PlacedStep) => ({ cx: colCX(s.col), cy: laneCY(s.laneIndex) });
            const posByLabel = new Map<string, { cx: number; cy: number }>();
            placed.forEach((s) => posByLabel.set(s.label, center(s)));

            const hw = boxW / 2;
            const hh = boxH / 2;

            // Character budgets so labels stay inside the box (left pad 15 + right pad ~10).
            const textW = Math.max(0, boxW - 25);
            const labelMax = Math.max(4, Math.floor(textW / 7)); // font-sans 12
            const detailMax = Math.max(4, Math.floor(textW / 5.1)); // font-mono 8.5

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

                {/* Lane bands + left labels */}
                <g>
                  {laneList.map((name, li) => {
                    const y = laneY(li);
                    const banded = li % 2 === 1;
                    const laneActive =
                      hover != null &&
                      placed.some((s) => s.laneIndex === li && s.label === hover.key);
                    return (
                      <g key={`lane-${li}`}>
                        <motion.rect
                          x={0}
                          y={y}
                          width={W}
                          height={laneH}
                          fill={banded ? withAlpha(p.ink, 0.025) : "transparent"}
                          initial={{ opacity: reduced ? 1 : 0 }}
                          animate={{ opacity: inView ? 1 : reduced ? 1 : 0 }}
                          transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : li * 0.05 }}
                        />
                        {/* Lane divider */}
                        {li > 0 && (
                          <line x1={0} y1={y} x2={W} y2={y} stroke={p.border} strokeWidth={1} strokeDasharray="2 4" />
                        )}
                        {/* Left label gutter rail */}
                        <rect
                          x={-margin.left + 12}
                          y={y + laneH / 2 - 11}
                          width={3.5}
                          height={22}
                          rx={1.75}
                          fill={laneActive ? fill : withAlpha(p.ink, 0.18)}
                          style={{ opacity: laneActive ? 1 : 0.7 }}
                        />
                        <text
                          x={-margin.left + 22}
                          y={laneCY(li)}
                          dy="0.32em"
                          textAnchor="start"
                          className="font-mono uppercase"
                          fontSize={10.5}
                          letterSpacing="0.06em"
                          fontWeight={600}
                          fill={laneActive ? p.ink : p.inkMuted}
                        >
                          {truncate(name, 13)}
                        </text>
                      </g>
                    );
                  })}
                  {/* Outer frame */}
                  <rect x={0} y={0} width={W} height={H} fill="none" stroke={p.border} strokeWidth={1} rx={4} />
                  {/* Gutter divider */}
                  <line x1={0} y1={0} x2={0} y2={H} stroke={p.borderStrong} strokeWidth={1.25} />
                </g>

                {/* Edges (crossing lanes) */}
                <g>
                  {cleanEdges.map((e, i) => {
                    const a = posByLabel.get(e.from);
                    const b = posByLabel.get(e.to);
                    if (!a || !b) return null;

                    // Attach to box faces; route via an S-curve. Same-lane edges
                    // exit the right face; cross-lane edges bow vertically.
                    const sameLane = Math.abs(a.cy - b.cy) < 1;
                    let x1 = a.cx + hw;
                    let y1 = a.cy;
                    let x2 = b.cx - hw;
                    let y2 = b.cy;

                    let d: string;
                    if (sameLane) {
                      const mx = (x1 + x2) / 2;
                      d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
                    } else if (Math.abs(b.cx - a.cx) < 1) {
                      // Vertical hop within (roughly) the same column.
                      x1 = a.cx;
                      y1 = a.cy + (b.cy > a.cy ? hh : -hh);
                      x2 = b.cx;
                      y2 = b.cy + (b.cy > a.cy ? -hh : hh);
                      const my = (y1 + y2) / 2;
                      d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
                    } else {
                      const mx = (x1 + x2) / 2;
                      d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
                    }

                    const active = hover != null && (e.from === hover.key || e.to === hover.key);
                    const dim = hover != null && !active;

                    const src = placed.find((s) => s.label === e.from);
                    const delay = src ? stepDelay(src.orderIdx) + animBase * 0.12 : 0;

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
                          style={{ opacity: dim ? 0.22 : active ? 1 : 0.8 }}
                          initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
                          animate={{
                            pathLength: inView ? 1 : reduced ? 1 : 0,
                            opacity: inView ? (dim ? 0.22 : active ? 1 : 0.8) : reduced ? 1 : 0,
                          }}
                          transition={{
                            pathLength: { duration: reduced ? 0 : animBase * 0.32, delay, ease: [0.22, 1, 0.36, 1] },
                            opacity: { duration: 0.2, delay },
                          }}
                        />
                        {e.label && (
                          <motion.g
                            initial={{ opacity: reduced ? 1 : 0 }}
                            animate={{ opacity: inView ? (dim ? 0.28 : 1) : reduced ? 1 : 0 }}
                            transition={{ duration: 0.3, delay: delay + animBase * 0.18 }}
                          >
                            <rect
                              x={mx - e.label.length * 3.1 - 5}
                              y={my - 8}
                              width={e.label.length * 6.2 + 10}
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
                              fontSize={8.5}
                              letterSpacing="0.03em"
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

                {/* Steps */}
                <g>
                  {placed.map((s) => {
                    const pos = posByLabel.get(s.label)!;
                    const x = pos.cx - boxW / 2;
                    const y = pos.cy - boxH / 2;
                    const tone = toneColor(s);
                    const active = hover?.key === s.label;
                    const neighbor =
                      hover != null &&
                      cleanEdges.some(
                        (e) =>
                          (e.from === hover.key && e.to === s.label) ||
                          (e.to === hover.key && e.from === s.label),
                      );
                    const dim = hover != null && !active && !neighbor;

                    const surface = active ? mix(p.surface, tone, 0.1) : p.surface;
                    const stroke = active || neighbor ? tone : withAlpha(tone, 0.5);
                    const delay = stepDelay(s.orderIdx);

                    return (
                      <motion.g
                        key={`${token}-step-${s.label}-${s.order}`}
                        style={{ cursor: "pointer", opacity: dim ? 0.4 : 1 }}
                        onMouseMove={(ev) => {
                          const svg = (ev.currentTarget as SVGGElement).ownerSVGElement;
                          if (!svg) return;
                          const r = svg.getBoundingClientRect();
                          setHover({ key: s.label, x: ev.clientX - r.left, y: ev.clientY - r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.86 }}
                        animate={{
                          opacity: inView ? (dim ? 0.4 : 1) : reduced ? 1 : 0,
                          scale: inView ? 1 : reduced ? 1 : 0.86,
                        }}
                        transition={{ duration: reduced ? 0 : 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
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
                        {/* Leading accent rail */}
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
                        {/* Order chip */}
                        <circle
                          cx={x + boxW - 13}
                          cy={y + 12}
                          r={8}
                          fill={active ? tone : withAlpha(tone, 0.14)}
                          stroke={active ? "none" : withAlpha(tone, 0.4)}
                          strokeWidth={1}
                        />
                        <text
                          x={x + boxW - 13}
                          y={y + 12}
                          dy="0.34em"
                          textAnchor="middle"
                          className="font-mono"
                          fontSize={8.5}
                          fontWeight={600}
                          fill={active ? readableOn(tone) : tone}
                        >
                          {s.order}
                        </text>
                        {/* Label */}
                        <text
                          x={x + 15}
                          y={pos.cy - (s.detail ? 6 : 0)}
                          dy={s.detail ? 0 : "0.32em"}
                          textAnchor="start"
                          className="font-sans"
                          fontSize={12}
                          fontWeight={600}
                          fill={p.ink}
                        >
                          {truncate(s.label, labelMax)}
                        </text>
                        {s.detail && (
                          <text
                            x={x + 15}
                            y={pos.cy + 10}
                            textAnchor="start"
                            className="font-mono"
                            fontSize={8.5}
                            letterSpacing="0.02em"
                            fill={p.inkFaint}
                          >
                            {truncate(s.detail, detailMax)}
                          </text>
                        )}
                      </motion.g>
                    );
                  })}
                </g>

                {totalSteps === 0 && (
                  <text
                    x={W / 2}
                    y={H / 2}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={11}
                    fill={p.inkFaint}
                  >
                    No steps to display
                  </text>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null &&
            (() => {
              const s = placed.find((x) => x.label === hover.key);
              if (!s) return null;
              return (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {s.lane}
                  </div>
                  <TooltipRow label="step" value={`${s.order} · ${s.label}`} />
                  {s.detail && <TooltipRow label="detail" value={s.detail} />}
                </>
              );
            })()}
        </FloatingTooltip>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

interface PlacedStep extends Step {
  laneIndex: number;
  /** Zero-based column derived from `order`. */
  col: number;
  /** Zero-based reveal index in ascending order. */
  orderIdx: number;
}

function layout(lanesIn: string[], stepsIn: Step[], edgesIn: Edge[]) {
  // Clean lane list (non-empty, unique, in input order).
  const seen = new Set<string>();
  const laneList: string[] = [];
  (lanesIn ?? []).forEach((l) => {
    const name = (l ?? "").toString();
    if (name && !seen.has(name)) {
      seen.add(name);
      laneList.push(name);
    }
  });
  // Ensure every step's lane exists (append unknown lanes so nothing is dropped).
  (stepsIn ?? []).forEach((s) => {
    if (s && s.lane && !seen.has(s.lane)) {
      seen.add(s.lane);
      laneList.push(s.lane);
    }
  });
  if (laneList.length === 0) laneList.push("Lane");

  const laneIndexOf = new Map(laneList.map((l, i) => [l, i]));

  // Sort steps by `order`, then assign dense, conflict-free columns.
  const valid = (stepsIn ?? []).filter((s) => s && s.label);
  const sorted = [...valid].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Map distinct order values to dense column indices so gaps don't waste space.
  const distinctOrders = Array.from(new Set(sorted.map((s) => s.order ?? 0))).sort((a, b) => a - b);
  const colOf = new Map(distinctOrders.map((o, i) => [o, i]));

  const placed: PlacedStep[] = sorted.map((s, orderIdx) => ({
    ...s,
    laneIndex: laneIndexOf.get(s.lane) ?? 0,
    col: colOf.get(s.order ?? 0) ?? orderIdx,
    orderIdx,
  }));

  const columns = Math.max(1, distinctOrders.length);

  // Keep only edges whose endpoints resolve to placed steps.
  const labelSet = new Set(placed.map((s) => s.label));
  const cleanEdges = (edgesIn ?? []).filter(
    (e) => e && e.from && e.to && labelSet.has(e.from) && labelSet.has(e.to),
  );

  return { laneList, placed, columns, cleanEdges };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "swimlane-diagram",
  name: "Swimlane Diagram",
  category: "diagrams",
  description:
    "A horizontal-lane process diagram where each actor owns a lane, steps fall into left-to-right columns by order, and arrows cross lanes to trace a request through a system — steps reveal in sequence.",
  tags: ["swimlane", "process", "diagram", "actors", "lanes", "sequence", "pipeline"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "SwimlaneDiagram",
  sourcePath: "diagrams/SwimlaneDiagram",
  aspect: 16 / 9,
  controls: [
    {
      key: "lanes",
      label: "Lanes",
      type: "json",
      group: "Data",
      help: "string[] of actor/lane names, top to bottom.",
      default: DEFAULT_LANES,
    },
    {
      key: "steps",
      label: "Steps",
      type: "json",
      group: "Data",
      help: "[{ lane, label, order, detail?, tone? }] — tone is accent | ok | warn | bad | muted. Order sets the left→right column.",
      default: DEFAULT_STEPS,
    },
    {
      key: "edges",
      label: "Edges",
      type: "json",
      group: "Data",
      help: "[{ from, to, label? }] referencing step labels.",
      default: DEFAULT_EDGES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1400,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "request-lifecycle",
      name: "Request lifecycle",
      props: {
        title: "Request lifecycle across services",
        caption: "A chat request flows through gateway, auth, cache, and inference, then streams back to the client.",
        source: "edge · us-east-1",
        lanes: DEFAULT_LANES,
        steps: DEFAULT_STEPS,
        edges: DEFAULT_EDGES,
      },
    },
    {
      id: "training-run",
      name: "Training run handoff",
      props: {
        title: "Training run handoff",
        caption: "Researcher submits a job; the scheduler, cluster, and registry coordinate the run.",
        lanes: ["Researcher", "Scheduler", "Cluster", "Registry"],
        steps: [
          { lane: "Researcher", label: "Submit", order: 1, detail: "config.yaml", tone: "muted" },
          { lane: "Scheduler", label: "Queue", order: 2, detail: "priority hi", tone: "accent" },
          { lane: "Cluster", label: "Allocate", order: 3, detail: "256 × H100", tone: "accent" },
          { lane: "Cluster", label: "Train", order: 4, detail: "12h · 3 epochs", tone: "accent" },
          { lane: "Registry", label: "Checkpoint", order: 5, detail: "step 40k", tone: "ok" },
          { lane: "Scheduler", label: "Release", order: 6, detail: "free nodes", tone: "muted" },
          { lane: "Researcher", label: "Notify", order: 7, detail: "slack ping", tone: "ok" },
        ],
        edges: [
          { from: "Submit", to: "Queue", label: "job" },
          { from: "Queue", to: "Allocate", label: "schedule" },
          { from: "Allocate", to: "Train" },
          { from: "Train", to: "Checkpoint", label: "weights" },
          { from: "Checkpoint", to: "Release" },
          { from: "Release", to: "Notify", label: "done" },
        ],
      },
    },
    {
      id: "incident",
      name: "Incident response",
      props: {
        title: "On-call incident response",
        accent: "",
        lanes: ["Monitor", "On-call", "Service", "Postmortem"],
        steps: [
          { lane: "Monitor", label: "Alert fires", order: 1, detail: "p99 > 2s", tone: "bad" },
          { lane: "On-call", label: "Acknowledge", order: 2, detail: "2m SLA", tone: "warn" },
          { lane: "Service", label: "Diagnose", order: 3, detail: "trace logs", tone: "muted" },
          { lane: "Service", label: "Mitigate", order: 4, detail: "rollback v3", tone: "ok" },
          { lane: "Monitor", label: "Verify", order: 5, detail: "p99 < 400ms", tone: "ok" },
          { lane: "Postmortem", label: "Write-up", order: 6, detail: "blameless", tone: "muted" },
        ],
        edges: [
          { from: "Alert fires", to: "Acknowledge", label: "page" },
          { from: "Acknowledge", to: "Diagnose" },
          { from: "Diagnose", to: "Mitigate", label: "fix" },
          { from: "Mitigate", to: "Verify", label: "confirm" },
          { from: "Verify", to: "Write-up", label: "resolved" },
        ],
      },
    },
  ],
};
