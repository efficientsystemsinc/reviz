"use client";

import { motion } from "framer-motion";
import { Info, MousePointerClick } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Figure,
  MonoLabel,
  ReplayButton,
  cn,
  mix,
  useInView,
  useMeasure,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface Step {
  /** Timestamp label for the frame, e.g. "1s". */
  t: string;
  /** Target action label printed on the chip, e.g. "NOOP" or "ACT". */
  label: string;
}

export interface SyntheticDataTimelineProps {
  steps?: Step[];
  instruction?: string;
  note?: string;
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Schematic frame                                                    */
/* ------------------------------------------------------------------ */

/**
 * A tiny identical schematic "observation" — a tabletop with a block, the same
 * at every timestep. When `acting` the gripper has descended onto the block,
 * signalling the moment the policy stops waiting and starts manipulating.
 */
function SchematicFrame({
  acting,
  ink,
  faint,
  panel,
  surface,
  blockColor,
  gripColor,
}: {
  acting: boolean;
  ink: string;
  faint: string;
  panel: string;
  surface: string;
  blockColor: string;
  gripColor: string;
}) {
  // Gripper rest height vs. lowered height onto the block.
  const gripY = acting ? 23 : 8;
  const fingerLen = acting ? 7 : 9;
  return (
    <svg viewBox="0 0 48 40" className="h-full w-full" aria-hidden>
      {/* frame backdrop */}
      <rect x="0.6" y="0.6" width="46.8" height="38.8" rx="4" fill={surface} stroke={panel} strokeWidth="1" />
      {/* table surface */}
      <line x1="6" y1="32" x2="42" y2="32" stroke={faint} strokeWidth="1.1" strokeLinecap="round" />
      <line x1="9" y1="35.5" x2="39" y2="35.5" stroke={faint} strokeWidth="0.8" strokeLinecap="round" strokeOpacity={0.5} />
      {/* the block on the table */}
      <rect x="20" y="25.5" width="8.5" height="6.5" rx="1" fill={withAlpha(blockColor, acting ? 0.95 : 0.85)} stroke={blockColor} strokeWidth="0.8" />
      {/* gripper arm dropping down from the top */}
      <line x1="24.25" y1="4" x2="24.25" y2={gripY} stroke={gripColor} strokeWidth="1.6" strokeLinecap="round" />
      <line x1={24.25 - 4} y1={gripY} x2={24.25 + 4} y2={gripY} stroke={gripColor} strokeWidth="1.6" strokeLinecap="round" />
      {/* fingers */}
      <line x1={24.25 - 4} y1={gripY} x2={24.25 - 4} y2={gripY + fingerLen} stroke={gripColor} strokeWidth="1.6" strokeLinecap="round" />
      <line x1={24.25 + 4} y1={gripY} x2={24.25 + 4} y2={gripY + fingerLen} stroke={gripColor} strokeWidth="1.6" strokeLinecap="round" />
      {/* a faint sensor reticle in the corner for flavor */}
      <circle cx="40" cy="7" r="1.4" fill="none" stroke={ink} strokeWidth="0.7" strokeOpacity={0.35} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function SyntheticDataTimeline({
  steps = DEFAULT_STEPS,
  instruction = DEFAULT_INSTRUCTION,
  note = DEFAULT_NOTE,
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1400,
}: SyntheticDataTimelineProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<number | null>(null);

  const fill = accent || p.accent;
  // The "action" accent is always the warning/danger red feel; we lean on the
  // palette's `bad` so it reads as the decisive moment regardless of theme.
  const actColor = p.bad;
  const blockColor = mix(fill, p.ink, 0.15);

  const n = steps.length;

  // The playhead sits at the first step whose label differs from step 0's —
  // i.e. the transition from waiting (NOOP) to acting (ACT).
  const transition = useMemo(() => {
    if (n === 0) return -1;
    const base = steps[0].label;
    const idx = steps.findIndex((s) => s.label !== base);
    return idx;
  }, [steps, n]);

  const dur = reduced ? 0 : duration / 1000;
  const stepDelay = n > 0 ? Math.min(0.085, (duration / 1000) / Math.max(1, n)) : 0;

  // Measure the exact left edge of the transition frame so the playhead lands
  // precisely on the wait→act boundary regardless of pixel-width gutters.
  const [trackRef, trackBox] = useMeasure<HTMLDivElement>();
  const frameRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [headLeft, setHeadLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const cell = transition > 0 ? frameRefs.current[transition] : null;
    if (!track || !cell) {
      setHeadLeft(null);
      return;
    }
    const tb = track.getBoundingClientRect();
    const cb = cell.getBoundingClientRect();
    // Boundary sits midway in the gutter between the previous frame's right edge
    // and this frame's left edge, falling back to the frame's left edge.
    const prev = frameRefs.current[transition - 1];
    const left = prev
      ? (prev.getBoundingClientRect().right + cb.left) / 2 - tb.left
      : cb.left - tb.left;
    setHeadLeft(left);
  }, [trackRef, trackBox.width, transition, n, steps]);

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/syn relative">
        {/* ---- Instruction header ---- */}
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <MonoLabel className="text-ink-faint">instruction</MonoLabel>
          <motion.span
            className="rounded-md border border-border bg-surface-alt px-2.5 py-1 font-serif text-[13.5px] italic text-ink"
            initial={reduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : -4 }}
            transition={{ duration: dur * 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            “{instruction}”
          </motion.span>
          <span className="ml-auto hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint sm:flex">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: withAlpha(p.inkMuted, 0.7) }} />
            wait
            <span className="ml-1 h-2 w-2 rounded-sm" style={{ backgroundColor: actColor }} />
            act
          </span>
        </div>

        {/* ---- Timeline grid ----
            Two columns: a left label rail and a single relative track that holds
            both rows stacked. The playhead lives in that track so it can span
            the full height and align to the equal-width step cells. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-x-3 sm:gap-x-4">
          {/* Left label rail */}
          <div className="flex flex-col justify-between py-1">
            <MonoLabel className="whitespace-nowrap text-ink-faint">observations</MonoLabel>
            <MonoLabel className="whitespace-nowrap text-ink-faint">target&nbsp;labels</MonoLabel>
          </div>

          {/* Right track */}
          <div ref={trackRef} className="relative">
            {/* Row 1: observations */}
            <div className="flex items-stretch">
              {steps.map((s, i) => {
                const acting = transition >= 0 && i >= transition;
                const isHover = hover === i;
                const lastCell = i === n - 1;
                return (
                  <div key={`obs-${i}-${token}`} className="flex min-w-0 flex-1 items-center">
                    <motion.div
                      ref={(el: HTMLDivElement | null) => {
                        frameRefs.current[i] = el;
                      }}
                      className="relative flex-1"
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      initial={reduced ? false : { opacity: 0, y: 8, scale: 0.92 }}
                      animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 8, scale: inView ? 1 : 0.92 }}
                      transition={{ duration: dur * 0.45, delay: reduced ? 0 : i * stepDelay, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div
                        className={cn(
                          "aspect-[48/40] w-full overflow-hidden rounded-[5px] transition-shadow",
                          isHover && "shadow-float",
                        )}
                        style={{
                          outline: acting ? `1.5px solid ${withAlpha(actColor, isHover ? 0.9 : 0.55)}` : "none",
                          outlineOffset: "-1px",
                        }}
                      >
                        <SchematicFrame
                          acting={acting}
                          ink={p.ink}
                          faint={p.inkFaint}
                          panel={acting ? withAlpha(actColor, 0.45) : p.border}
                          surface={isHover ? p.surfaceAlt : p.surface}
                          blockColor={acting ? actColor : blockColor}
                          gripColor={acting ? actColor : p.inkMuted}
                        />
                      </div>
                      <div className="mt-1.5 text-center font-mono text-[9.5px] tabular-nums text-ink-faint">{s.t}</div>
                    </motion.div>
                    {/* fixed-width "~" gutter, mirrored exactly in the labels row */}
                    {!lastCell && (
                      <motion.span
                        aria-hidden
                        className="w-4 shrink-0 pb-3.5 text-center font-mono text-[13px] leading-none text-ink-faint"
                        initial={reduced ? false : { opacity: 0 }}
                        animate={{ opacity: inView ? 0.7 : 0 }}
                        transition={{ duration: dur * 0.4, delay: reduced ? 0 : i * stepDelay + 0.04 }}
                      >
                        ~
                      </motion.span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* gap between rows */}
            <div className="h-3" />

            {/* Row 2: target labels */}
            <div className="flex items-stretch">
              {steps.map((s, i) => {
                const acting = transition >= 0 && i >= transition;
                const isHover = hover === i;
                const lastCell = i === n - 1;
                const chipBg = acting ? withAlpha(actColor, 0.14) : p.surfaceAlt;
                const chipBorder = acting ? withAlpha(actColor, 0.55) : p.border;
                const chipInk = acting ? actColor : p.inkMuted;
                return (
                  <div key={`tgt-${i}-${token}`} className="flex min-w-0 flex-1 items-center">
                    <motion.div
                      className="relative flex-1"
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 8 }}
                      transition={{ duration: dur * 0.45, delay: reduced ? 0 : i * stepDelay + 0.12, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div
                        className="flex h-7 w-full items-center justify-center rounded-md border font-mono text-[10px] uppercase tracking-label tabular-nums transition-colors"
                        style={{
                          backgroundColor: isHover && acting ? withAlpha(actColor, 0.22) : chipBg,
                          borderColor: chipBorder,
                          color: chipInk,
                        }}
                      >
                        {s.label}
                      </div>
                    </motion.div>
                    {/* spacer matching the "~" gutter width above */}
                    {!lastCell && <span aria-hidden className="w-4 shrink-0" />}
                  </div>
                );
              })}
            </div>

            {/* ---- Playhead: a red vertical line at the transition boundary ---- */}
            {transition > 0 && headLeft != null && (
              <Playhead
                left={headLeft}
                label={steps[transition]?.t ?? ""}
                actColor={actColor}
                surface={p.surface}
                inView={inView}
                reduced={reduced}
                dur={dur}
                delay={reduced ? 0 : transition * stepDelay + 0.18}
              />
            )}
          </div>
        </div>

        {/* ---- Callout box ---- */}
        <motion.div
          className="relative mt-6 overflow-hidden rounded-reviz border bg-surface px-4 py-3.5 shadow-float"
          style={{ borderColor: withAlpha(actColor, 0.4) }}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 10 }}
          transition={{ duration: dur * 0.55, delay: reduced ? 0 : 0.2 + n * stepDelay, ease: [0.22, 1, 0.36, 1] }}
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: actColor }} />
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
              style={{ backgroundColor: withAlpha(actColor, 0.14), color: actColor }}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-label" style={{ color: actColor }}>
                decisive timestep · {transition >= 0 ? steps[transition]?.t : "—"}
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{note}</p>
            </div>
          </div>
        </motion.div>

        {/* ---- Info line + replay ---- */}
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint">
            <Info className="h-3 w-3" />
            {n} frames · {transition >= 0 ? transition : n} noop · {transition >= 0 ? n - transition : 0} act
          </span>
          <ReplayButton
            onClick={replay}
            className="opacity-0 transition-opacity group-hover/syn:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Playhead — a red vertical line sweeping to the transition boundary  */
/* ------------------------------------------------------------------ */

function Playhead({
  left,
  label,
  actColor,
  surface,
  inView,
  reduced,
  dur,
  delay,
}: {
  /** Measured x-offset (px) of the wait→act boundary within the track. */
  left: number;
  label: string;
  actColor: string;
  surface: string;
  inView: boolean;
  reduced: boolean;
  dur: number;
  delay: number;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-y-0 z-10"
      style={{ left, transform: "translateX(-50%)" }}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: inView ? 1 : 0 }}
      transition={{ duration: dur * 0.3, delay }}
    >
      {/* the vertical line, grown from the top */}
      <motion.div
        className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 origin-top rounded-full"
        style={{ backgroundColor: actColor, boxShadow: `0 0 8px ${withAlpha(actColor, 0.55)}` }}
        initial={reduced ? false : { scaleY: 0 }}
        animate={{ scaleY: inView ? 1 : 0 }}
        transition={{ duration: dur * 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* top cap + timestamp flag */}
      <motion.div
        className="absolute -top-2 left-1/2 flex -translate-x-1/2 flex-col items-center"
        initial={reduced ? false : { opacity: 0, y: -4, scale: 0.8 }}
        animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : -4, scale: inView ? 1 : 0.8 }}
        transition={{ duration: reduced ? 0 : 0.3, delay: delay + dur * 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-label tabular-nums"
          style={{ backgroundColor: actColor, color: surface }}
        >
          {label}
        </span>
        <svg width="12" height="6" viewBox="0 0 12 6" className="-mt-px" aria-hidden>
          <path d="M0 0 H12 L6 6 Z" fill={actColor} />
        </svg>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_STEPS: Step[] = [
  { t: "1s", label: "NOOP" },
  { t: "2s", label: "NOOP" },
  { t: "3s", label: "NOOP" },
  { t: "4s", label: "NOOP" },
  { t: "5s", label: "NOOP" },
  { t: "6s", label: "NOOP" },
  { t: "7s", label: "NOOP" },
  { t: "8s", label: "NOOP" },
  { t: "9s", label: "NOOP" },
  { t: "10s", label: "ACT" },
];

const DEFAULT_INSTRUCTION = "Wait 10 seconds, then pick up the block.";

const DEFAULT_NOTE =
  "Nine identical observations carry a NOOP target — the policy must hold still and resist acting. Only at t=10s does the label flip to ACT, teaching the model to ground a temporal instruction in the clock rather than the scene, which never changes.";

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "synthetic-data-timeline",
  name: "Synthetic Data Timeline",
  category: "robotics-media",
  description:
    "A frame strip of identical robot observations paired with per-step target action labels and a red playhead marking the exact timestep a temporal instruction flips from waiting to acting.",
  tags: ["robotics", "synthetic-data", "timeline", "imitation-learning", "policy", "frames"],
  badges: ["animated", "interactive", "themed", "responsive"],
  exportName: "SyntheticDataTimeline",
  sourcePath: "robotics-media/SyntheticDataTimeline",
  aspect: 16 / 9,
  controls: [
    {
      key: "steps",
      label: "Steps",
      type: "json",
      group: "Data",
      help: "Array of { t: timestamp label, label: target action }. The playhead marks the first step whose label differs from the first.",
      default: DEFAULT_STEPS,
    },
    { key: "instruction", label: "Instruction", type: "text", group: "Labels", default: DEFAULT_INSTRUCTION },
    { key: "note", label: "Callout note", type: "textarea", group: "Labels", rows: 4, default: DEFAULT_NOTE },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1400,
      min: 0,
      max: 3500,
      step: 50,
    },
  ],
  presets: [
    {
      id: "wait-then-pick",
      name: "Wait, then pick up the block",
      props: {
        title: "Teaching a clock-grounded wait",
        caption:
          "A synthetic episode where the scene is static but the target action is time-conditioned — the policy learns to count, not to react.",
        source: "Robotics · synthetic data pipeline",
        instruction: "Wait 10 seconds, then pick up the block.",
        steps: DEFAULT_STEPS,
        note: DEFAULT_NOTE,
      },
    },
    {
      id: "short-delay",
      name: "Short delay grasp",
      props: {
        title: "Wait 4 seconds, then grasp",
        instruction: "Hold position, then grasp on cue.",
        steps: [
          { t: "0.5s", label: "NOOP" },
          { t: "1.0s", label: "NOOP" },
          { t: "1.5s", label: "NOOP" },
          { t: "2.0s", label: "NOOP" },
          { t: "2.5s", label: "NOOP" },
          { t: "3.0s", label: "ACT" },
          { t: "3.5s", label: "ACT" },
        ],
        note:
          "Here the policy waits five frames, then the target switches to ACT and stays high — the model learns both when to start and that the grasp persists across subsequent steps.",
      },
    },
  ],
};
