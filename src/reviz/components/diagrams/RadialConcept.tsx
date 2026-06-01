"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  Bot,
  Brain,
  Camera,
  Cpu,
  Eye,
  Footprints,
  Gamepad2,
  Hand,
  Languages,
  Layers,
  type LucideIcon,
  MessageSquare,
  Microscope,
  Move3d,
  Navigation,
  Route,
  Shapes,
  Sparkles,
  Target,
  Wand2,
  Workflow,
} from "lucide-react";
import {
  Figure,
  Glow,
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

/** Optional lucide icon, addressed by name from a curated set. */
const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  brain: Brain,
  bot: Bot,
  hand: Hand,
  eye: Eye,
  camera: Camera,
  cpu: Cpu,
  languages: Languages,
  message: MessageSquare,
  microscope: Microscope,
  navigation: Navigation,
  route: Route,
  target: Target,
  footprints: Footprints,
  gamepad: Gamepad2,
  layers: Layers,
  boxes: Boxes,
  shapes: Shapes,
  move: Move3d,
  activity: Activity,
  workflow: Workflow,
  wand: Wand2,
};

interface Spoke {
  label: string;
  icon?: string;
}

export interface RadialConceptProps {
  center?: string;
  centerSublabel?: string;
  spokes?: Spoke[];
  caption?: string;
  source?: string;
  accent?: string;
  startAngle?: number;
  duration?: number;
  title?: string;
}

export default function RadialConcept({
  center = "WORLD MODEL",
  centerSublabel = "single network",
  spokes = [
    { label: "Manipulation", icon: "hand" },
    { label: "Navigation", icon: "navigation" },
    { label: "Perception", icon: "eye" },
    { label: "Planning", icon: "route" },
    { label: "Dialogue", icon: "message" },
    { label: "Reasoning", icon: "brain" },
  ],
  caption = "Zero-shot any task",
  source = "",
  accent = "",
  startAngle = -90,
  duration = 1400,
  title = "",
}: RadialConceptProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<number | null>(null);

  const ids = useMemo(
    () => ({ shadow: uid("rc-shadow"), glow: uid("rc-glow") }),
    [],
  );

  const list = spokes.length ? spokes : [{ label: "Task" }];
  const play = inView && !reduced;
  const dur = duration / 1000;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={4 / 3} margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
          {({ inner, margin }) => {
            const cx = inner.width / 2;
            const cy = inner.height / 2;
            const minSide = Math.min(inner.width, inner.height);

            // Central node radius scales with the figure.
            const coreR = Math.max(46, Math.min(86, minSide * 0.18));
            // Where spoke endpoints (the labeled outputs) sit.
            const ringR = minSide * 0.46;
            // Halo around core.
            const haloR = coreR * 1.42;

            const n = list.length;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={ids.shadow} dy={6} blur={14} opacity={0.16} />
                  <Glow id={ids.glow} blur={7} />
                </defs>

                {/* Faint guide ring connecting the outputs. */}
                <motion.circle
                  cx={cx}
                  cy={cy}
                  r={ringR}
                  fill="none"
                  stroke={p.border}
                  strokeWidth={1}
                  strokeDasharray="2 6"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: play ? 1 : reduced ? 0.6 : 0, scale: play || reduced ? 1 : 0.92 }}
                  transition={{ duration: dur * 0.6, ease: "easeOut" }}
                  style={{ transformOrigin: `${cx}px ${cy}px` }}
                  key={`ring-${token}`}
                />

                {/* Spokes: arrows + labeled outputs. */}
                {list.map((s, i) => {
                  const angle = startAngle + (360 / n) * i;
                  const start = polarToCartesian(cx, cy, coreR + 6, angle);
                  const end = polarToCartesian(cx, cy, ringR - coreR * 0.5, angle);
                  const node = polarToCartesian(cx, cy, ringR, angle);

                  // Direction & arrowhead geometry.
                  const dx = end.x - start.x;
                  const dy = end.y - start.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const ux = dx / len;
                  const uy = dy / len;
                  const head = 7;
                  const hb = { x: end.x - ux * head, y: end.y - uy * head };
                  const perp = { x: -uy, y: ux };
                  const a1 = { x: hb.x + perp.x * head * 0.55, y: hb.y + perp.y * head * 0.55 };
                  const a2 = { x: hb.x - perp.x * head * 0.55, y: hb.y - perp.y * head * 0.55 };

                  // Place the output label on the outer side, anchored toward
                  // the rim so text reads outward from the hub.
                  const cos = Math.cos(((angle - 90) * Math.PI) / 180);
                  const anchor: "start" | "middle" | "end" =
                    Math.abs(cos) < 0.35 ? "middle" : cos > 0 ? "start" : "end";
                  const labelOff = polarToCartesian(cx, cy, ringR + 14, angle);

                  const delay = 0.18 + i * (0.9 / n) * dur * 0.6;
                  const active = hover === i;
                  const dim = hover != null && !active;

                  const Icon = s.icon ? ICONS[s.icon.toLowerCase()] : undefined;
                  const nodeR = 17;

                  return (
                    <g
                      key={`${s.label}-${i}`}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: "default", opacity: dim ? 0.42 : 1, transition: "opacity 160ms" }}
                    >
                      {/* Arrow shaft. */}
                      <motion.line
                        x1={start.x}
                        y1={start.y}
                        x2={hb.x}
                        y2={hb.y}
                        stroke={active ? fill : p.borderStrong}
                        strokeWidth={active ? 1.6 : 1.2}
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: play ? 1 : reduced ? 1 : 0, opacity: play || reduced ? 1 : 0 }}
                        transition={{ duration: dur * 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
                        key={`shaft-${i}-${token}`}
                      />
                      {/* Arrowhead. */}
                      <motion.path
                        d={`M ${end.x} ${end.y} L ${a1.x} ${a1.y} L ${a2.x} ${a2.y} Z`}
                        fill={active ? fill : p.borderStrong}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: play ? 1 : reduced ? 1 : 0, scale: play || reduced ? 1 : 0 }}
                        transition={{ duration: dur * 0.25, delay: delay + dur * 0.4, ease: "backOut" }}
                        style={{ transformOrigin: `${end.x}px ${end.y}px` }}
                        key={`head-${i}-${token}`}
                      />

                      {/* Output node + label. */}
                      <motion.g
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: play ? 1 : reduced ? 1 : 0, scale: play || reduced ? 1 : 0.6 }}
                        transition={{ duration: dur * 0.32, delay: delay + dur * 0.42, ease: "backOut" }}
                        style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                        key={`node-${i}-${token}`}
                      >
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={nodeR}
                          fill={active ? withAlpha(fill, 0.12) : p.surface}
                          stroke={active ? fill : p.border}
                          strokeWidth={active ? 1.5 : 1}
                        />
                        {Icon ? (
                          <foreignObject
                            x={node.x - 9}
                            y={node.y - 9}
                            width={18}
                            height={18}
                            style={{ overflow: "visible", pointerEvents: "none" }}
                          >
                            <div className="flex h-full w-full items-center justify-center">
                              <Icon
                                width={15}
                                height={15}
                                strokeWidth={1.6}
                                color={active ? fill : p.inkMuted}
                              />
                            </div>
                          </foreignObject>
                        ) : (
                          <circle cx={node.x} cy={node.y} r={3} fill={active ? fill : p.inkFaint} />
                        )}
                        <text
                          x={labelOff.x}
                          y={labelOff.y}
                          dy={anchor === "middle" ? (cos >= 0 ? "0.9em" : "-0.3em") : "0.32em"}
                          textAnchor={anchor}
                          className="font-mono uppercase tracking-label"
                          style={{ fontSize: 10.5 }}
                          fill={active ? p.ink : p.inkMuted}
                        >
                          {s.label}
                        </text>
                      </motion.g>
                    </g>
                  );
                })}

                {/* Central node. */}
                <motion.g
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: play || reduced ? 1 : 0, scale: play || reduced ? 1 : 0.7 }}
                  transition={{ duration: dur * 0.5, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: `${cx}px ${cy}px` }}
                  key={`core-${token}`}
                >
                  {/* Soft pulsing halo. */}
                  <motion.circle
                    cx={cx}
                    cy={cy}
                    r={haloR}
                    fill={withAlpha(fill, 0.07)}
                    stroke="none"
                    animate={
                      play
                        ? { scale: [1, 1.06, 1], opacity: [0.55, 0.85, 0.55] }
                        : { scale: 1, opacity: 0.6 }
                    }
                    transition={
                      play
                        ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
                        : { duration: 0 }
                    }
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={coreR}
                    fill={p.surface}
                    stroke={fill}
                    strokeWidth={1.5}
                    filter={`url(#${ids.shadow})`}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={coreR - 6}
                    fill="none"
                    stroke={withAlpha(fill, 0.28)}
                    strokeWidth={1}
                  />
                  {(() => {
                    const lines = fitLines(center);
                    const titleSize = coreR > 64 ? 13 : 11;
                    const lineH = titleSize * 1.15;
                    // Vertical extent of the title block, plus the sublabel.
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

/** Break a center label into at most two balanced lines for the circle. */
function fitLines(text: string): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return words;
  if (text.length <= 11) return [text];
  // balance two lines by total length
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
  id: "radial-concept",
  name: "Radial Concept Map",
  category: "diagrams",
  description:
    "A central concept radiating thin arrows to labeled outputs — the elegant 'one model, every task' figure that draws itself in.",
  tags: ["concept", "radial", "hub", "diagram", "world-model", "schematic"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "RadialConcept",
  sourcePath: "diagrams/RadialConcept",
  aspect: 4 / 3,
  controls: [
    {
      key: "center",
      label: "Center label",
      type: "text",
      group: "Data",
      default: "WORLD MODEL",
    },
    {
      key: "centerSublabel",
      label: "Center sublabel",
      type: "text",
      group: "Data",
      default: "single network",
    },
    {
      key: "spokes",
      label: "Spokes",
      type: "json",
      group: "Data",
      help: "Array of { label, icon? }. icon names: sparkles, brain, bot, hand, eye, camera, cpu, languages, message, microscope, navigation, route, target, footprints, gamepad, layers, boxes, shapes, move, activity, workflow, wand.",
      default: [
        { label: "Manipulation", icon: "hand" },
        { label: "Navigation", icon: "navigation" },
        { label: "Perception", icon: "eye" },
        { label: "Planning", icon: "route" },
        { label: "Dialogue", icon: "message" },
        { label: "Reasoning", icon: "brain" },
      ],
    },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "Zero-shot any task" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
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
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1400,
      min: 0,
      max: 3500,
      step: 100,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "world-model",
      name: "World model → tasks",
      props: {
        center: "WORLD MODEL",
        centerSublabel: "single network",
        caption: "Zero-shot any task",
        spokes: [
          { label: "Manipulation", icon: "hand" },
          { label: "Navigation", icon: "navigation" },
          { label: "Perception", icon: "eye" },
          { label: "Planning", icon: "route" },
          { label: "Dialogue", icon: "message" },
          { label: "Reasoning", icon: "brain" },
        ],
      },
    },
    {
      id: "foundation",
      name: "Foundation model",
      props: {
        center: "FOUNDATION MODEL",
        centerSublabel: "pretrained",
        caption: "One backbone, many heads",
        spokes: [
          { label: "Vision", icon: "camera" },
          { label: "Language", icon: "languages" },
          { label: "Code", icon: "cpu" },
          { label: "Audio", icon: "activity" },
          { label: "Robotics", icon: "bot" },
        ],
      },
    },
    {
      id: "agent",
      name: "Agent capabilities",
      props: {
        center: "AGENT",
        centerSublabel: "tool-using",
        caption: "Plans, acts, and reflects across tools",
        startAngle: -90,
        spokes: [
          { label: "Search", icon: "target" },
          { label: "Browse", icon: "navigation" },
          { label: "Execute", icon: "cpu" },
          { label: "Reason", icon: "brain" },
          { label: "Reflect", icon: "sparkles" },
          { label: "Plan", icon: "route" },
          { label: "Observe", icon: "eye" },
        ],
      },
    },
  ],
};
