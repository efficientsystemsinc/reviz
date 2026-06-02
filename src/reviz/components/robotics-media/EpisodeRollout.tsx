"use client";

import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { extent } from "d3-array";
import { motion } from "framer-motion";
import { Gauge, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Figure,
  MonoLabel,
  ReplayButton,
  clamp,
  cn,
  mix,
  round,
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

interface RolloutStep {
  /** Primitive action the policy took at this step, e.g. "reach", "grasp". */
  action: string;
  /** Scalar reward received after the action. */
  reward: number;
  /** Optional annotation shown in the detail readout for the active step. */
  note?: string;
}

export interface EpisodeRolloutProps {
  steps?: RolloutStep[];
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
  autoplay?: boolean;
}

/* ------------------------------------------------------------------ */
/* Defaults — a 10-step manipulation rollout                          */
/* ------------------------------------------------------------------ */

const DEFAULT_STEPS: RolloutStep[] = [
  { action: "reach", reward: -0.02, note: "Servo end-effector toward the cabinet handle." },
  { action: "align", reward: 0.04, note: "Pre-grasp pose aligned with the handle axis." },
  { action: "grasp", reward: 0.18, note: "Close gripper — contact force within tolerance." },
  { action: "pull", reward: 0.31, note: "Door swings open; latch clears." },
  { action: "search", reward: 0.05, note: "Scan interior; localize the target mug." },
  { action: "reach", reward: 0.12, note: "Approach the mug, avoiding the shelf edge." },
  { action: "grasp", reward: 0.44, note: "Stable top grasp acquired on the mug." },
  { action: "lift", reward: 0.58, note: "Clear the shelf without collision." },
  { action: "place", reward: 0.73, note: "Transport to tray and lower gently." },
  { action: "release", reward: 1.0, note: "Object placed upright — task success." },
];

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function EpisodeRollout({
  steps = DEFAULT_STEPS,
  title = "Episode rollout",
  caption = "",
  source = "",
  accent = "",
  duration = 5200,
  autoplay = true,
}: EpisodeRolloutProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const fill = accent || p.accent;
  const safeSteps = steps.length > 0 ? steps : DEFAULT_STEPS;
  const n = safeSteps.length;

  const rewards = useMemo(() => safeSteps.map((s) => s.reward), [safeSteps]);
  const cumulative = useMemo(() => {
    let acc = 0;
    return rewards.map((r) => (acc += r));
  }, [rewards]);
  const total = cumulative[n - 1] ?? 0;

  /* ---- Playhead stepping ---- */
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number>();
  const startRef = useRef<number>();
  const clampIndex = (i: number) => clamp(Math.round(i), 0, n - 1) | 0;

  // Kick the stepper when scrolled into view (or on replay) when autoplay is on.
  useEffect(() => {
    if (!inView) return;
    if (reduced || !autoplay) {
      setActive(n - 1);
      setPlaying(false);
      return;
    }
    setActive(0);
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, token, autoplay, reduced, n]);

  // Discrete step sweep across the timeline.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    startRef.current = undefined;
    const sweep = Math.max(duration, 1);
    const tick = (now: number) => {
      if (cancelled) return;
      if (startRef.current === undefined) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / sweep);
      setActive(clampIndex(t * (n - 1)));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration, n]);

  const select = (i: number) => {
    setPlaying(false);
    setActive(clampIndex(i));
  };
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (active >= n - 1) setActive(0);
    setPlaying(true);
  };

  const activeStep = safeSteps[active] ?? safeSteps[0];

  const dur = reduced ? 0 : duration / 1000;
  const stepDelay = n > 0 ? Math.min(0.06, dur / Math.max(1, n)) : 0;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/ep flex flex-col gap-4">
        {/* ---- Header: instruction + running return ---- */}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <MonoLabel className="text-ink-faint">timestep · action · reward</MonoLabel>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-ink-faint">
              <Gauge className="h-3.5 w-3.5" />
              <MonoLabel>return</MonoLabel>
            </span>
            <motion.span
              key={`ret-${active}`}
              initial={reduced ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-md px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums"
              style={{ background: withAlpha(fill, 0.14), color: fill }}
            >
              {fmtReward(cumulative[active] ?? 0)}
            </motion.span>
          </div>
        </div>

        {/* ---- The step sequence ---- */}
        <div
          className="flex gap-1.5 overflow-x-auto px-0.5 pb-1 pt-1.5"
          style={{ scrollbarWidth: "thin" }}
          role="listbox"
          aria-label="Rollout steps"
        >
          {safeSteps.map((s, i) => {
            const isActive = i === active;
            const passed = i <= active;
            const tone = rewardTone(s.reward, p, fill);
            return (
              <motion.button
                type="button"
                key={`${token}-step-${i}`}
                role="option"
                aria-selected={isActive}
                onClick={() => select(i)}
                onMouseEnter={() => !playing && setActive(i)}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{
                  duration: reduced ? 0 : 0.42,
                  delay: reduced ? 0 : Math.min(i * 0.045, 0.5),
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "group/step relative flex min-w-0 flex-1 basis-0 flex-col items-stretch gap-1.5 rounded-md border p-1.5 outline-none transition-colors",
                  isActive ? "border-accent bg-surface-alt" : "border-border bg-surface hover:border-border-strong",
                )}
                style={{
                  borderColor: isActive ? fill : undefined,
                  boxShadow: isActive ? `0 0 0 2px ${withAlpha(fill, 0.3)}` : undefined,
                  opacity: passed || isActive ? 1 : 0.55,
                }}
              >
                {/* step index */}
                <span
                  className="absolute -top-1.5 left-1.5 z-10 rounded px-1 py-px font-mono text-[8px] tabular-nums leading-none"
                  style={{
                    background: isActive ? fill : withAlpha(p.ink, 0.5),
                    color: isActive ? p.accentContrast : p.canvas,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                {/* schematic frame */}
                <div className="aspect-square w-full overflow-hidden rounded-[4px]">
                  <SchematicFrame
                    phase={n > 1 ? i / (n - 1) : 0}
                    progress={s.reward}
                    active={isActive}
                    palette={p}
                    accent={fill}
                  />
                </div>

                {/* action label */}
                <span
                  className="truncate text-center font-mono text-[9px] uppercase tracking-label"
                  style={{ color: isActive ? p.ink : p.inkMuted }}
                  title={s.action}
                >
                  {s.action}
                </span>

                {/* reward chip */}
                <span
                  className="rounded-[4px] py-0.5 text-center font-mono text-[9.5px] font-semibold tabular-nums"
                  style={{ background: tone.bg, color: tone.ink }}
                >
                  {fmtReward(s.reward)}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* ---- Reward sparkline + playhead ---- */}
        <RewardSparkline
          rewards={rewards}
          cumulative={cumulative}
          active={active}
          accent={fill}
          palette={p}
          inView={inView}
          reduced={reduced}
          dur={dur}
          stepDelay={stepDelay}
          token={token}
          onScrub={select}
        />

        {/* ---- Active-step detail readout ---- */}
        <motion.div
          className="flex items-start gap-3 rounded-reviz border border-border bg-surface px-3.5 py-3"
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 8 }}
          transition={{ duration: dur * 0.5, delay: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md font-mono text-[11px] font-semibold tabular-nums"
            style={{ background: withAlpha(fill, 0.14), color: fill }}
          >
            {String(active + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono text-[10px] uppercase tracking-label text-ink">
                {activeStep?.action}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
                · reward {fmtReward(activeStep?.reward ?? 0)} · return{" "}
                {fmtReward(cumulative[active] ?? 0)}
              </span>
            </div>
            <p className="mt-0.5 font-serif text-[12.5px] italic leading-snug text-ink-muted">
              {activeStep?.note ?? "—"}
            </p>
          </div>
        </motion.div>

        {/* ---- Transport ---- */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={togglePlay}
              whileTap={{ scale: 0.94 }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label transition-colors"
              style={{ background: fill, color: p.accentContrast }}
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {playing ? "Pause" : "Play"}
            </motion.button>
            <MonoLabel className="text-ink-faint tabular-nums">
              {n} steps · Σr {fmtReward(total)}
            </MonoLabel>
          </div>
          <ReplayButton
            onClick={replay}
            className="opacity-0 transition-opacity group-hover/ep:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Reward sparkline — per-step reward bars + cumulative return line   */
/* with a stepping playhead that snaps to the active step.            */
/* ------------------------------------------------------------------ */

function RewardSparkline({
  rewards,
  cumulative,
  active,
  accent,
  palette,
  inView,
  reduced,
  dur,
  stepDelay,
  token,
  onScrub,
}: {
  rewards: number[];
  cumulative: number[];
  active: number;
  accent: string;
  palette: ReturnType<typeof usePalette>;
  inView: boolean;
  reduced: boolean;
  dur: number;
  stepDelay: number;
  token: number;
  onScrub: (i: number) => void;
}) {
  const p = palette;
  const [measRef, box] = useMeasure<HTMLDivElement>();
  const w = box.width || 640;
  const h = 92;
  const m = { top: 10, right: 8, bottom: 8, left: 8 };
  const iw = Math.max(1, w - m.left - m.right);
  const ih = Math.max(1, h - m.top - m.bottom);
  const n = rewards.length;

  const xAt = (i: number) => (n > 1 ? (i / (n - 1)) * iw : iw / 2);

  // Bars: per-step reward (can be negative), centered on a zero baseline.
  const rExt = extent(rewards) as [number, number];
  const rMin = Math.min(0, rExt[0] ?? 0);
  const rMax = Math.max(0, rExt[1] ?? 1);
  const barScale = scaleLinear().domain([rMin, rMax || 1]).range([ih, 0]).nice();
  const zeroY = barScale(0);
  const barW = n > 1 ? Math.max(2, (iw / n) * 0.42) : 8;

  // Cumulative return line, normalized into the same panel.
  const cExt = extent(cumulative) as [number, number];
  const cScale = scaleLinear()
    .domain([Math.min(0, cExt[0] ?? 0), cExt[1] ?? 1])
    .range([ih - 2, 4]);

  const linePath = useMemo(() => {
    const gen = line<number>()
      .x((_, i) => xAt(i))
      .y((d) => cScale(d))
      .curve(curveMonotoneX);
    return gen(cumulative) ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cumulative, iw]);

  const areaPath = useMemo(() => {
    const gen = area<number>()
      .x((_, i) => xAt(i))
      .y0(ih)
      .y1((d) => cScale(d))
      .curve(curveMonotoneX);
    return gen(cumulative) ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cumulative, iw, ih]);

  const headX = xAt(active);
  const gradId = `ep-grad-${token}`;

  return (
    <div ref={measRef} className="relative w-full">
      <svg width={w} height={h} className="block w-full" role="img" aria-label="Reward sparkline">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={withAlpha(accent, 0.22)} />
            <stop offset="100%" stopColor={withAlpha(accent, 0)} />
          </linearGradient>
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          {/* zero baseline for the reward bars */}
          <line
            x1={0}
            x2={iw}
            y1={zeroY}
            y2={zeroY}
            stroke={p.border}
            strokeWidth={1}
            strokeDasharray="2 3"
          />

          {/* reward bars */}
          {rewards.map((r, i) => {
            const top = r >= 0 ? barScale(r) : zeroY;
            const bh = Math.max(1.5, Math.abs(barScale(r) - zeroY));
            const isActive = i === active;
            const passed = i <= active;
            const tone = r >= 0 ? accent : p.bad;
            return (
              <motion.rect
                key={`${token}-bar-${i}`}
                x={xAt(i) - barW / 2}
                width={barW}
                rx={1.5}
                fill={withAlpha(tone, isActive ? 0.95 : passed ? 0.5 : 0.22)}
                initial={reduced ? false : { y: zeroY, height: 0 }}
                animate={
                  inView
                    ? { y: top, height: bh }
                    : { y: zeroY, height: 0 }
                }
                transition={{
                  duration: dur * 0.5,
                  delay: reduced ? 0 : i * stepDelay,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            );
          })}

          {/* cumulative return area + line */}
          <motion.path
            d={areaPath}
            fill={`url(#${gradId})`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: inView ? 1 : 0 }}
            transition={{ duration: dur * 0.6, delay: reduced ? 0 : dur * 0.2 }}
          />
          <motion.path
            d={linePath}
            fill="none"
            stroke={accent}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
            transition={{ duration: dur, delay: reduced ? 0 : dur * 0.2, ease: "easeInOut" }}
          />

          {/* dot on the cumulative line at the active step */}
          <motion.circle
            cx={headX}
            cy={cScale(cumulative[active] ?? 0)}
            r={3}
            fill={p.surface}
            stroke={accent}
            strokeWidth={1.6}
            initial={false}
            animate={{ cx: headX, cy: cScale(cumulative[active] ?? 0) }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          />

          {/* playhead */}
          <motion.line
            x1={headX}
            x2={headX}
            y1={-m.top + 2}
            y2={ih}
            stroke={accent}
            strokeWidth={1.5}
            initial={false}
            animate={{ x1: headX, x2: headX }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          />
        </g>

        {/* invisible scrub hit-targets, one per step */}
        {rewards.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={m.left + xAt(i) - (iw / n) / 2}
            y={0}
            width={iw / n}
            height={h}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onScrub(i)}
            onClick={() => onScrub(i)}
          />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between">
        <MonoLabel className="text-ink-faint">per-step reward</MonoLabel>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-3 rounded-full" style={{ background: accent }} />
          <MonoLabel className="text-ink-faint">cumulative return</MonoLabel>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schematic frame — a tiny inline SVG of a tabletop manipulation     */
/* state. The gripper descends and the object rises as the rollout    */
/* advances (phase 0→1), giving each step a distinct, legible state.  */
/* ------------------------------------------------------------------ */

function SchematicFrame({
  phase,
  progress,
  active,
  palette,
  accent,
}: {
  /** 0..1 position within the rollout, drives gripper/object motion. */
  phase: number;
  /** This step's reward, lightly modulates the object glow. */
  progress: number;
  active: boolean;
  palette: ReturnType<typeof usePalette>;
  accent: string;
}) {
  const p = palette;
  const a = clamp(phase, 0, 1);
  // Gripper sweeps left→right and descends toward mid-rollout, then the object
  // is lifted up and carried in the final third.
  const gripX = 10 + a * 28;
  const gripY = 5 + Math.sin(a * Math.PI) * 13;
  const lifted = clamp((a - 0.6) / 0.4, 0, 1);
  const objX = gripX;
  const objY = 30 - lifted * 14;
  const onTable = lifted < 0.05;
  const glow = clamp(progress, 0, 1);

  const ink = active ? p.ink : p.inkMuted;
  const faint = p.inkFaint;
  const objColor = mix(accent, p.ink, 0.1);

  return (
    <svg viewBox="0 0 48 40" className="h-full w-full" aria-hidden>
      <rect
        x="0.6"
        y="0.6"
        width="46.8"
        height="38.8"
        rx="4"
        fill={active ? p.surface : p.surfaceAlt}
        stroke={active ? withAlpha(accent, 0.5) : p.border}
        strokeWidth="1"
      />
      {/* table surface */}
      <line x1="5" y1="34" x2="43" y2="34" stroke={faint} strokeWidth="1.1" strokeLinecap="round" />
      <line
        x1="8"
        y1="37"
        x2="40"
        y2="37"
        stroke={faint}
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeOpacity={0.5}
      />

      {/* faint target zone on the right (tray) */}
      <rect
        x="32"
        y="31.5"
        width="10"
        height="3"
        rx="1"
        fill="none"
        stroke={withAlpha(accent, active ? 0.45 : 0.25)}
        strokeWidth="0.8"
        strokeDasharray="1.5 1.5"
      />

      {/* gripper arm + jaws */}
      <line x1={gripX} y1="3" x2={gripX} y2={gripY} stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={gripX - 3.4} y1={gripY} x2={gripX + 3.4} y2={gripY} stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={gripX - 3.4} y1={gripY} x2={gripX - 3.4} y2={gripY + (onTable ? 4 : 6)} stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={gripX + 3.4} y1={gripY} x2={gripX + 3.4} y2={gripY + (onTable ? 4 : 6)} stroke={ink} strokeWidth="1.5" strokeLinecap="round" />

      {/* the manipulated object */}
      {active && glow > 0.4 ? (
        <circle cx={objX + 3} cy={objY + 2.5} r={7} fill={withAlpha(accent, 0.18 * glow)} />
      ) : null}
      <rect
        x={objX}
        y={objY}
        width="6"
        height="5"
        rx="1"
        fill={withAlpha(objColor, active ? 0.95 : 0.7)}
        stroke={objColor}
        strokeWidth="0.7"
      />

      {/* sensor reticle */}
      <circle cx="41" cy="6" r="1.3" fill="none" stroke={ink} strokeWidth="0.6" strokeOpacity={0.35} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtReward(r: number): string {
  const v = round(r, 2);
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}

function rewardTone(
  r: number,
  p: ReturnType<typeof usePalette>,
  accent: string,
): { bg: string; ink: string } {
  if (r < 0) return { bg: withAlpha(p.bad, 0.14), ink: p.bad };
  if (r === 0) return { bg: withAlpha(p.inkMuted, 0.12), ink: p.inkMuted };
  // Positive rewards trend toward the accent / "ok" feel.
  const c = r >= 0.5 ? p.ok : accent;
  return { bg: withAlpha(c, 0.16), ink: c };
}

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "episode-rollout",
  name: "Episode Rollout",
  category: "robotics-media",
  description:
    "A horizontal sequence of policy timesteps — each a tiny schematic state, the action taken, and a reward chip — with a per-step reward and cumulative-return sparkline and a playhead that steps through the episode.",
  tags: ["robotics", "rollout", "episode", "reinforcement-learning", "reward", "policy", "timeline"],
  badges: ["animated", "interactive", "responsive", "themed"],
  exportName: "EpisodeRollout",
  sourcePath: "robotics-media/EpisodeRollout",
  aspect: 16 / 9,
  controls: [
    {
      key: "steps",
      label: "Steps",
      type: "json",
      group: "Data",
      help: "Array of { action, reward, note? }. One entry per timestep; reward may be negative.",
      default: DEFAULT_STEPS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Episode rollout" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    { key: "autoplay", label: "Autoplay on scroll", type: "boolean", group: "Animation", default: true },
    {
      key: "duration",
      label: "Sweep (ms)",
      type: "number",
      group: "Animation",
      default: 5200,
      min: 800,
      max: 12000,
      step: 100,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "manipulation",
      name: "Manipulation rollout",
      props: {
        title: "Cabinet retrieval — episode 0142",
        caption:
          "A ten-step pick-and-place rollout: per-step reward bars beneath, cumulative return climbing to task success.",
        source: "Sim eval · policy v3",
        duration: 5200,
        steps: DEFAULT_STEPS,
      },
    },
    {
      id: "sparse-reward",
      name: "Sparse-reward locomotion",
      props: {
        title: "Locomotion rollout — sparse reward",
        caption:
          "Reward stays near zero until the terminal step, where the goal-reaching bonus arrives all at once.",
        source: "Sim eval · gait policy",
        duration: 4600,
        accent: "",
        steps: [
          { action: "stand", reward: 0.0, note: "Initialize balanced stance." },
          { action: "step", reward: 0.0, note: "First gait cycle; no shaping reward." },
          { action: "step", reward: -0.05, note: "Slight lateral drift penalized." },
          { action: "step", reward: 0.0, note: "Recover heading toward the goal." },
          { action: "step", reward: 0.0, note: "Cross the midpoint of the corridor." },
          { action: "step", reward: 0.0, note: "Maintain cadence; energy within budget." },
          { action: "step", reward: -0.02, note: "Minor foot-slip penalty." },
          { action: "stride", reward: 0.0, note: "Approach the goal marker." },
          { action: "stride", reward: 0.0, note: "Final approach; decelerate." },
          { action: "reach-goal", reward: 1.0, note: "Goal reached — sparse terminal reward." },
        ],
      },
    },
  ],
};
