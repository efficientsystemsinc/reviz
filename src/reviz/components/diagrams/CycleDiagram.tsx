"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Activity,
  Award,
  BarChart3,
  Bot,
  Boxes,
  Brain,
  Camera,
  CheckCircle2,
  CircuitBoard,
  Cpu,
  Database,
  Dumbbell,
  Eye,
  FlaskConical,
  GitBranch,
  Hammer,
  Hand,
  Layers,
  type LucideIcon,
  MessageSquare,
  Microscope,
  Navigation,
  RefreshCw,
  Rocket,
  Route,
  Search,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Wand2,
  Workflow,
  Wrench,
} from "lucide-react";
import {
  Figure,
  ResponsiveSvg,
  SoftShadow,
  polarToCartesian,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/** Curated lucide set, addressed by lowercase name from the stage data. */
const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  brain: Brain,
  bot: Bot,
  hand: Hand,
  eye: Eye,
  camera: Camera,
  cpu: Cpu,
  message: MessageSquare,
  microscope: Microscope,
  navigation: Navigation,
  route: Route,
  target: Target,
  layers: Layers,
  boxes: Boxes,
  activity: Activity,
  workflow: Workflow,
  wand: Wand2,
  swords: Swords,
  dumbbell: Dumbbell,
  flask: FlaskConical,
  trophy: Trophy,
  award: Award,
  check: CheckCircle2,
  search: Search,
  database: Database,
  refresh: RefreshCw,
  rocket: Rocket,
  hammer: Hammer,
  wrench: Wrench,
  chart: BarChart3,
  branch: GitBranch,
  chip: CircuitBoard,
};

interface Stage {
  label: string;
  icon?: string;
}

export interface CycleDiagramProps {
  stages?: Stage[];
  centerLabel?: string;
  centerSublabel?: string;
  startAngle?: number;
  clockwise?: boolean;
  accent?: string;
  duration?: number;
  loop?: boolean;
  title?: string;
  caption?: string;
  source?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function CycleDiagram({
  stages = [
    { label: "Self-Play", icon: "swords" },
    { label: "Train", icon: "dumbbell" },
    { label: "Evaluate", icon: "flask" },
  ],
  centerLabel = "RL LOOP",
  centerSublabel = "self-improving",
  startAngle = -90,
  clockwise = true,
  accent = "",
  duration = 1600,
  loop = true,
  title = "",
  caption = "Each round bootstraps the next",
  source = "",
}: CycleDiagramProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<number | null>(null);

  const ids = useMemo(() => ({ shadow: uid("cd-shadow") }), []);

  const list = stages.length ? stages : [{ label: "Step" }];
  const play = inView && !reduced;
  const dur = duration / 1000;
  const n = list.length;
  const dir = clockwise ? 1 : -1;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={4 / 3} margin={{ top: 28, right: 28, bottom: 28, left: 28 }}>
          {({ inner, margin }) => {
            const cx = inner.width / 2;
            const cy = inner.height / 2;
            const minSide = Math.min(inner.width, inner.height);

            // Ring radius where the stage nodes are seated.
            const ringR = minSide * 0.4;
            // Stage node radius.
            const nodeR = Math.max(26, Math.min(46, minSide * 0.11));
            // The arc on which arrows ride sits just inside the node ring so
            // arrows curve cleanly between adjacent nodes.
            const arcR = ringR;
            // Center hub radius (only when a center label is set).
            const hasCenter = !!centerLabel;
            const coreR = Math.max(38, Math.min(70, minSide * 0.15));

            // Angle (deg, 12-o'clock origin) of stage i.
            const angleOf = (i: number) => startAngle + dir * (360 / n) * i;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={ids.shadow} dy={6} blur={16} opacity={0.16} />
                </defs>

                {/* Faint guide ring through the stage centers. */}
                <motion.circle
                  cx={cx}
                  cy={cy}
                  r={arcR}
                  fill="none"
                  stroke={p.border}
                  strokeWidth={1}
                  strokeDasharray="2 7"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{
                    opacity: play ? 1 : reduced ? 0.55 : 0,
                    scale: play || reduced ? 1 : 0.92,
                  }}
                  transition={{ duration: dur * 0.5, ease: "easeOut" }}
                  style={{ transformOrigin: `${cx}px ${cy}px` }}
                  key={`ring-${token}`}
                />

                {/* Curved connecting arrows: each spans from node i to node i+1
                    along the ring arc, drawing in sequence around the loop. */}
                {list.map((_, i) => {
                  const next = (i + 1) % n;
                  // Single-stage degenerate case: no arrow.
                  if (n < 2) return null;
                  // Don't draw the wrap-around closing arrow if not looping.
                  if (!loop && next === 0) return null;

                  const a0 = angleOf(i);
                  const a1 = angleOf(i + 1);
                  // Trim the arc so it starts/ends at the node rims, not centers.
                  const gapDeg = (Math.asin(nodeR / arcR) * 180) / Math.PI + 4;
                  const s = a0 + dir * gapDeg;
                  const e = a1 - dir * gapDeg;

                  const start = polarToCartesian(cx, cy, arcR, s);
                  const end = polarToCartesian(cx, cy, arcR, e);

                  // SVG arc flags: sweep follows the cycle direction.
                  const largeArc = 0;
                  const sweep = clockwise ? 1 : 0;
                  const arcPath = `M ${start.x} ${start.y} A ${arcR} ${arcR} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;

                  // Arrowhead at the end, tangent to the circle.
                  const headLen = Math.max(8, nodeR * 0.26);
                  const tip = end;
                  const back = polarToCartesian(cx, cy, arcR, e - dir * 2.5);
                  const tdx = tip.x - back.x;
                  const tdy = tip.y - back.y;
                  const tlen = Math.hypot(tdx, tdy) || 1;
                  const ux = tdx / tlen;
                  const uy = tdy / tlen;
                  const hb = { x: tip.x - ux * headLen, y: tip.y - uy * headLen };
                  const perp = { x: -uy, y: ux };
                  const w = headLen * 0.6;
                  const h1 = { x: hb.x + perp.x * w, y: hb.y + perp.y * w };
                  const h2 = { x: hb.x - perp.x * w, y: hb.y - perp.y * w };

                  const active = hover === i || hover === next;
                  const dim = hover != null && !active;
                  const delay = 0.25 + i * (dur * 0.55) / n;

                  return (
                    <g
                      key={`arc-${i}-${token}`}
                      style={{ opacity: dim ? 0.35 : 1, transition: "opacity 180ms" }}
                    >
                      <motion.path
                        d={arcPath}
                        fill="none"
                        stroke={active ? fill : p.borderStrong}
                        strokeWidth={active ? 2 : 1.5}
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                          pathLength: play ? 1 : reduced ? 1 : 0,
                          opacity: play || reduced ? 1 : 0,
                        }}
                        transition={{ duration: dur * 0.5, delay, ease: EASE }}
                      />
                      <motion.path
                        d={`M ${tip.x} ${tip.y} L ${h1.x} ${h1.y} L ${h2.x} ${h2.y} Z`}
                        fill={active ? fill : p.borderStrong}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{
                          opacity: play ? 1 : reduced ? 1 : 0,
                          scale: play || reduced ? 1 : 0,
                        }}
                        transition={{
                          duration: dur * 0.22,
                          delay: delay + dur * 0.45,
                          ease: "backOut",
                        }}
                        style={{ transformOrigin: `${tip.x}px ${tip.y}px` }}
                      />

                      {/* A traveling pulse riding the arc, suggesting flow. */}
                      {play && (
                        <circle r={2.6} fill={fill} opacity={0.9}>
                          <animateMotion
                            dur={`${Math.max(1.1, dur * 0.9)}s`}
                            begin={`${delay + dur * 0.5}s`}
                            repeatCount="indefinite"
                            path={arcPath}
                            calcMode="spline"
                            keyTimes="0;1"
                            keySplines="0.4 0 0.2 1"
                          />
                          <animate
                            attributeName="opacity"
                            dur={`${Math.max(1.1, dur * 0.9)}s`}
                            begin={`${delay + dur * 0.5}s`}
                            repeatCount="indefinite"
                            values="0;1;1;0"
                            keyTimes="0;0.15;0.8;1"
                          />
                        </circle>
                      )}
                    </g>
                  );
                })}

                {/* Center hub (optional). */}
                {hasCenter && (
                  <motion.g
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{
                      opacity: play || reduced ? 1 : 0,
                      scale: play || reduced ? 1 : 0.7,
                    }}
                    transition={{ duration: dur * 0.5, ease: EASE, delay: 0.1 }}
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                    key={`core-${token}`}
                  >
                    <motion.circle
                      cx={cx}
                      cy={cy}
                      r={coreR * 1.34}
                      fill={withAlpha(fill, 0.06)}
                      animate={
                        play
                          ? { scale: [1, 1.05, 1], opacity: [0.5, 0.8, 0.5] }
                          : { scale: 1, opacity: 0.55 }
                      }
                      transition={
                        play
                          ? { duration: 3.6, repeat: Infinity, ease: "easeInOut" }
                          : { duration: 0 }
                      }
                      style={{ transformOrigin: `${cx}px ${cy}px` }}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={coreR}
                      fill={p.surface}
                      stroke={withAlpha(fill, 0.35)}
                      strokeWidth={1.25}
                    />
                    {(() => {
                      const lines = fitLines(centerLabel);
                      const titleSize = coreR > 56 ? 13 : 11;
                      const lineH = titleSize * 1.15;
                      const subGap = centerSublabel ? titleSize * 1.5 : 0;
                      const blockH = (lines.length - 1) * lineH + subGap;
                      const top = cy - blockH / 2;
                      return (
                        <>
                          <text
                            x={cx}
                            y={top}
                            textAnchor="middle"
                            dy="0.34em"
                            className="font-mono uppercase tracking-label"
                            style={{ fontSize: titleSize, fontWeight: 600 }}
                            fill={p.ink}
                          >
                            {lines.map((ln, li) => (
                              <tspan key={li} x={cx} dy={li === 0 ? 0 : `${lineH}px`}>
                                {ln}
                              </tspan>
                            ))}
                          </text>
                          {centerSublabel && (
                            <text
                              x={cx}
                              y={top + (lines.length - 1) * lineH + titleSize * 1.5}
                              textAnchor="middle"
                              dy="0.34em"
                              className="font-mono uppercase tracking-label"
                              style={{ fontSize: 8.5 }}
                              fill={fill}
                            >
                              {centerSublabel}
                            </text>
                          )}
                        </>
                      );
                    })()}
                  </motion.g>
                )}

                {/* Stage nodes. */}
                {list.map((stage, i) => {
                  const angle = angleOf(i);
                  const pos = polarToCartesian(cx, cy, ringR, angle);
                  const active = hover === i;
                  const dim = hover != null && !active;
                  const delay = 0.18 + i * (dur * 0.55) / n;
                  const Icon = stage.icon ? ICONS[stage.icon.toLowerCase()] : undefined;
                  const iconSize = nodeR * 0.62;

                  // Label position: outside the node, pushed radially outward.
                  const labelPos = polarToCartesian(cx, cy, ringR + nodeR + 12, angle);
                  const cos = Math.cos(((angle - 90) * Math.PI) / 180);
                  const anchor: "start" | "middle" | "end" =
                    Math.abs(cos) < 0.4 ? "middle" : cos > 0 ? "start" : "end";
                  const sin = Math.sin(((angle - 90) * Math.PI) / 180);
                  const labelDy =
                    anchor === "middle" ? (sin >= 0 ? "0.85em" : "-0.2em") : "0.32em";

                  return (
                    <g
                      key={`node-${i}-${token}`}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: "default", opacity: dim ? 0.45 : 1, transition: "opacity 180ms" }}
                    >
                      <motion.g
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{
                          opacity: play ? 1 : reduced ? 1 : 0,
                          scale: play || reduced ? 1 : 0.5,
                        }}
                        transition={{ duration: dur * 0.4, delay, ease: "backOut" }}
                        style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                      >
                        {/* Index ring badge. */}
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={nodeR}
                          fill={active ? withAlpha(fill, 0.1) : p.surface}
                          stroke={active ? fill : p.border}
                          strokeWidth={active ? 1.75 : 1.25}
                          filter={`url(#${ids.shadow})`}
                        />
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={nodeR - 5}
                          fill="none"
                          stroke={active ? withAlpha(fill, 0.4) : p.grid}
                          strokeWidth={1}
                        />

                        {Icon ? (
                          <foreignObject
                            x={pos.x - iconSize / 2}
                            y={pos.y - iconSize / 2 - nodeR * 0.16}
                            width={iconSize}
                            height={iconSize}
                            style={{ overflow: "visible", pointerEvents: "none" }}
                          >
                            <div className="flex h-full w-full items-center justify-center">
                              <Icon
                                width={iconSize}
                                height={iconSize}
                                strokeWidth={1.6}
                                color={active ? fill : p.inkMuted}
                              />
                            </div>
                          </foreignObject>
                        ) : (
                          <text
                            x={pos.x}
                            y={pos.y - nodeR * 0.16}
                            textAnchor="middle"
                            dy="0.34em"
                            className="font-mono"
                            style={{ fontSize: nodeR * 0.5, fontWeight: 600 }}
                            fill={active ? fill : p.inkMuted}
                          >
                            {i + 1}
                          </text>
                        )}

                        {/* Step number chip below the icon. */}
                        <text
                          x={pos.x}
                          y={pos.y + nodeR * 0.52}
                          textAnchor="middle"
                          dy="0.32em"
                          className="font-mono uppercase tracking-label"
                          style={{ fontSize: nodeR * 0.24, fontWeight: 600 }}
                          fill={active ? fill : p.inkFaint}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </text>
                      </motion.g>

                      {/* Stage label outside the node. */}
                      <motion.text
                        x={labelPos.x}
                        y={labelPos.y}
                        dy={labelDy}
                        textAnchor={anchor}
                        className="font-mono uppercase tracking-label"
                        style={{ fontSize: 11 }}
                        fill={active ? p.ink : p.inkMuted}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: play ? 1 : reduced ? 1 : 0 }}
                        transition={{ duration: dur * 0.3, delay: delay + dur * 0.2 }}
                      >
                        {stage.label}
                      </motion.text>
                    </g>
                  );
                })}
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

/** Break a center label into at most two balanced lines for the hub. */
function fitLines(text: string): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return words;
  if (text.length <= 11) return [text];
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    const diff = Math.abs(a - b);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

export const meta: RevizMeta = {
  id: "cycle-diagram",
  name: "Cycle Diagram",
  category: "diagrams",
  description:
    "A circular process loop — N labeled stages seated around a ring, joined by curved arrows that draw themselves and pulse around the cycle, with an optional center label.",
  tags: ["cycle", "loop", "process", "diagram", "schematic", "pipeline", "flow"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "CycleDiagram",
  sourcePath: "diagrams/CycleDiagram",
  aspect: 4 / 3,
  controls: [
    {
      key: "stages",
      label: "Stages",
      type: "json",
      group: "Data",
      help: "Array of { label, icon? }. icon names: sparkles, brain, bot, hand, eye, camera, cpu, message, microscope, navigation, route, target, layers, boxes, activity, workflow, wand, swords, dumbbell, flask, trophy, award, check, search, database, refresh, rocket, hammer, wrench, chart, branch, chip.",
      default: [
        { label: "Self-Play", icon: "swords" },
        { label: "Train", icon: "dumbbell" },
        { label: "Evaluate", icon: "flask" },
      ],
    },
    { key: "centerLabel", label: "Center label", type: "text", group: "Labels", default: "RL LOOP" },
    {
      key: "centerSublabel",
      label: "Center sublabel",
      type: "text",
      group: "Labels",
      default: "self-improving",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    {
      key: "caption",
      label: "Caption",
      type: "text",
      group: "Labels",
      default: "Each round bootstraps the next",
    },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "startAngle",
      label: "Start angle",
      type: "number",
      group: "Layout",
      default: -90,
      min: -180,
      max: 180,
      step: 5,
      unit: "°",
    },
    { key: "clockwise", label: "Clockwise", type: "boolean", group: "Layout", default: true },
    { key: "loop", label: "Close the loop", type: "boolean", group: "Layout", default: true },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1600,
      min: 0,
      max: 4000,
      step: 100,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "rl-loop",
      name: "Self-play → train → eval",
      props: {
        stages: [
          { label: "Self-Play", icon: "swords" },
          { label: "Train", icon: "dumbbell" },
          { label: "Evaluate", icon: "flask" },
        ],
        centerLabel: "RL LOOP",
        centerSublabel: "self-improving",
        caption: "Each round bootstraps the next",
        clockwise: true,
        loop: true,
      },
    },
    {
      id: "rlhf",
      name: "RLHF pipeline",
      props: {
        stages: [
          { label: "Collect", icon: "database" },
          { label: "Reward Model", icon: "award" },
          { label: "Policy Update", icon: "cpu" },
          { label: "Deploy", icon: "rocket" },
          { label: "Feedback", icon: "message" },
        ],
        centerLabel: "RLHF",
        centerSublabel: "human-in-loop",
        caption: "Preferences steer the policy",
        clockwise: true,
        loop: true,
      },
    },
    {
      id: "research",
      name: "Research method",
      props: {
        stages: [
          { label: "Hypothesis", icon: "brain" },
          { label: "Experiment", icon: "microscope" },
          { label: "Analyze", icon: "chart" },
          { label: "Refine", icon: "refresh" },
        ],
        centerLabel: "SCIENTIFIC\nMETHOD",
        centerSublabel: "iterate",
        caption: "Knowledge compounds each cycle",
        startAngle: -90,
        clockwise: true,
        loop: true,
      },
    },
  ],
};
