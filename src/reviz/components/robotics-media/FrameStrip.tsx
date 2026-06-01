"use client";

import { motion } from "framer-motion";
import { Camera, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Figure,
  MonoLabel,
  ReplayButton,
  clamp,
  cn,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Frame {
  /** Optional image URL. When absent a numbered placeholder is drawn. */
  src?: string;
  /** Optional caption shown under the hero preview. */
  label?: string;
  /** Optional timestamp in seconds (for the playhead axis + time labels). */
  t?: number;
}

export interface FrameStripProps {
  frames?: Frame[];
  title?: string;
  caption?: string;
  source?: string;
  autoplay?: boolean;
  duration?: number;
}

const DEFAULT_FRAMES: Frame[] = [
  { label: "Reach to cabinet", t: 0 },
  { label: "Grasp handle", t: 0.8 },
  { label: "Open door", t: 1.6 },
  { label: "Locate mug", t: 2.4 },
  { label: "Approach mug", t: 3.2 },
  { label: "Close grasp", t: 4.0 },
  { label: "Lift object", t: 4.8 },
  { label: "Retract arm", t: 5.6 },
  { label: "Place on tray", t: 6.4 },
  { label: "Release + reset", t: 7.2 },
];

function fmtTime(t: number): string {
  if (!isFinite(t) || t < 0) return "0:00.0";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(1).padStart(4, "0");
  return `${m}:${ss}`;
}

export default function FrameStrip({
  frames = DEFAULT_FRAMES,
  title = "Episode rollout",
  caption = "",
  source = "",
  autoplay = true,
  duration = 4200,
}: FrameStripProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const safeFrames = frames.length > 0 ? frames : DEFAULT_FRAMES;
  const n = safeFrames.length;

  // Time domain — derived from explicit `t` values, else a unit index.
  const times = useMemo(
    () => safeFrames.map((f, i) => (typeof f.t === "number" ? f.t : i)),
    [safeFrames],
  );
  const t0 = times[0] ?? 0;
  const t1 = times[n - 1] ?? Math.max(1, n - 1);
  const span = Math.max(t1 - t0, 1e-6);
  const hasTime = useMemo(() => safeFrames.some((f) => typeof f.t === "number"), [safeFrames]);

  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Continuous 0..1 sweep position; the active frame is the nearest below it.
  const [head, setHead] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef<number>();

  const clampIndex = (i: number) => clamp(Math.round(i), 0, n - 1) | 0;

  // Kick off the sweep when scrolled into view (or on replay), if autoplay.
  useEffect(() => {
    if (!inView) return;
    if (reduced || !autoplay) {
      setHead(1);
      setActive(n - 1);
      setPlaying(false);
      return;
    }
    setPlaying(true);
    setHead(0);
    setActive(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, token, autoplay, reduced, n]);

  // The playhead sweep animation loop.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    startRef.current = undefined;
    const sweep = Math.max(duration, 1);
    const tick = (now: number) => {
      if (cancelled) return;
      if (startRef.current === undefined) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / sweep);
      setHead(t);
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

  // Manual selection / scrub stops playback and snaps the playhead.
  const select = (i: number) => {
    const idx = clampIndex(i);
    setPlaying(false);
    setActive(idx);
    setHead(n > 1 ? idx / (n - 1) : 0);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (head >= 0.999) {
      setHead(0);
      setActive(0);
    }
    setPlaying(true);
  };

  const heroFrame = safeFrames[active] ?? safeFrames[0];
  const heroTime = times[active] ?? 0;
  const elapsedFrac = clamp(head, 0, 1);
  const elapsedTime = hasTime ? t0 + elapsedFrac * span : active;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="flex flex-col gap-3">
        {/* Hero preview */}
        <div className="relative overflow-hidden rounded-reviz border border-border bg-surface-alt">
          <div className="relative aspect-[16/9] w-full">
            {safeFrames.map((f, i) => (
              <motion.div
                key={`${token}-hero-${i}`}
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: i === active ? 1 : 0 }}
                transition={{ duration: reduced ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
                style={{ pointerEvents: i === active ? "auto" : "none" }}
              >
                <FramePlate frame={f} index={i} total={n} hero palette={p} />
              </motion.div>
            ))}

            {/* Top overlay: frame index + timecode */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
              <span
                className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-label backdrop-blur-sm"
                style={{ background: withAlpha(p.ink, 0.62), color: p.canvas }}
              >
                Frame {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
              </span>
              <span
                className="rounded-md px-2 py-1 font-mono text-[10px] tabular-nums backdrop-blur-sm"
                style={{ background: withAlpha(p.ink, 0.62), color: p.canvas }}
              >
                {hasTime ? `${fmtTime(heroTime)}` : `#${active + 1}`}
              </span>
            </div>

            {/* Bottom overlay: caption */}
            {heroFrame?.label ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <div
                  className="inline-flex max-w-full items-center gap-2 rounded-md px-2.5 py-1.5 backdrop-blur-sm"
                  style={{ background: withAlpha(p.ink, 0.62) }}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: p.accent }}
                  />
                  <span
                    className="truncate font-sans text-[12.5px] font-medium leading-tight"
                    style={{ color: p.canvas }}
                  >
                    {heroFrame.label}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Scrub track + playhead */}
        <div className="px-0.5">
          <div className="relative h-1.5 w-full rounded-full bg-surface-alt">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: p.accent }}
              initial={false}
              animate={{ width: `${elapsedFrac * 100}%` }}
              transition={{ duration: playing ? 0 : reduced ? 0 : 0.2, ease: "linear" }}
            />
            {/* Tick per frame */}
            {n > 1 &&
              safeFrames.map((_, i) => (
                <span
                  key={`tick-${i}`}
                  className="absolute top-1/2 h-1 w-px -translate-y-1/2"
                  style={{
                    left: `${(i / (n - 1)) * 100}%`,
                    background: i <= active ? withAlpha(p.accent, 0.0) : p.border,
                  }}
                />
              ))}
            {/* Playhead knob */}
            <motion.span
              className="absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-float"
              style={{ background: p.surface, borderColor: p.accent }}
              initial={false}
              animate={{ left: `${elapsedFrac * 100}%` }}
              transition={{ duration: playing ? 0 : reduced ? 0 : 0.2, ease: "linear" }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <MonoLabel className="tabular-nums">
              {hasTime ? fmtTime(elapsedTime) : `Frame ${active + 1}`}
            </MonoLabel>
            <MonoLabel className="tabular-nums">{hasTime ? fmtTime(t1) : `of ${n}`}</MonoLabel>
          </div>
        </div>

        {/* Filmstrip thumbnails */}
        <div className="relative">
          <div
            className="flex gap-2 overflow-x-auto pb-2"
            style={{ scrollbarWidth: "thin" }}
            role="listbox"
            aria-label="Frames"
          >
            {safeFrames.map((f, i) => {
              const isActive = i === active;
              return (
                <motion.button
                  type="button"
                  key={`${token}-thumb-${i}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => select(i)}
                  onMouseEnter={() => !playing && setActive(i)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{
                    duration: reduced ? 0 : 0.4,
                    delay: reduced ? 0 : Math.min(i * 0.04, 0.5),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "group/thumb relative aspect-[16/10] w-[78px] shrink-0 overflow-hidden rounded-md border outline-none transition-colors sm:w-[92px]",
                    isActive ? "border-accent" : "border-border hover:border-border-strong",
                  )}
                  style={
                    isActive
                      ? { boxShadow: `0 0 0 2px ${withAlpha(p.accent, 0.35)}` }
                      : undefined
                  }
                >
                  <FramePlate frame={f} index={i} total={n} palette={p} dim={!isActive} />
                  <span
                    className="absolute left-1 top-1 rounded px-1 py-px font-mono text-[8.5px] tabular-nums leading-none"
                    style={{
                      background: withAlpha(isActive ? p.accent : p.ink, isActive ? 1 : 0.55),
                      color: isActive ? p.accentContrast : p.canvas,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </motion.button>
              );
            })}
          </div>
          {/* Edge fades hint at horizontal scroll */}
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-8"
            style={{ background: `linear-gradient(to right, transparent, ${p.canvas})` }}
          />
        </div>

        {/* Transport controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={togglePlay}
              whileTap={{ scale: 0.94 }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label transition-colors"
              style={{ background: p.accent, color: p.accentContrast }}
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {playing ? "Pause" : "Play"}
            </motion.button>
            <span className="inline-flex items-center gap-1.5 text-ink-faint">
              <Camera className="h-3.5 w-3.5" />
              <MonoLabel>
                {n} frames{hasTime ? ` · ${fmtTime(span)}` : ""}
              </MonoLabel>
            </span>
          </div>
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Frame plate — renders an image when `src` is set, else a generative */
/* numbered placeholder so the strip looks complete without assets.    */
/* ------------------------------------------------------------------ */

function FramePlate({
  frame,
  index,
  total,
  palette,
  hero = false,
  dim = false,
}: {
  frame: Frame;
  index: number;
  total: number;
  palette: ReturnType<typeof usePalette>;
  hero?: boolean;
  dim?: boolean;
}) {
  const p = palette;
  if (frame.src) {
    return (
      <img
        src={frame.src}
        alt={frame.label ?? `Frame ${index + 1}`}
        className="h-full w-full object-cover"
        style={{ opacity: dim ? 0.78 : 1 }}
        draggable={false}
      />
    );
  }

  // Deterministic placeholder: a subtle scanning gradient + grid that drifts
  // across the sequence, evoking a sensor frame without any external asset.
  const phase = total > 1 ? index / (total - 1) : 0;
  const hueA = p.series[index % p.series.length];
  const hueB = p.series[(index + 3) % p.series.length];
  const grid = hero ? 24 : 7;
  const lines = Array.from({ length: grid }, (_, k) => k);
  const cx = 18 + phase * 64;
  const cy = 30 + Math.sin(phase * Math.PI * 1.5) * 26;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${withAlpha(hueA, dim ? 0.1 : 0.16)}, ${withAlpha(
          hueB,
          dim ? 0.06 : 0.1,
        )})`,
      }}
    >
      {/* radial focus that drifts across the rollout */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${cx}% ${cy}%, ${withAlpha(
            p.accent,
            dim ? 0.12 : 0.22,
          )}, transparent 58%)`,
        }}
      />
      {/* faint grid */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        {lines.map((k) => (
          <line
            key={`v${k}`}
            x1={`${(k / grid) * 100}%`}
            x2={`${(k / grid) * 100}%`}
            y1="0%"
            y2="100%"
            stroke={withAlpha(p.ink, 0.05)}
            strokeWidth={0.5}
          />
        ))}
        {lines.slice(0, Math.round(grid * 0.62)).map((k) => (
          <line
            key={`h${k}`}
            x1="0%"
            x2="100%"
            y1={`${(k / (grid * 0.62)) * 100}%`}
            y2={`${(k / (grid * 0.62)) * 100}%`}
            stroke={withAlpha(p.ink, 0.05)}
            strokeWidth={0.5}
          />
        ))}
        {/* a moving "object" dot to imply motion across frames */}
        <circle cx={`${cx}%`} cy={`${cy}%`} r={hero ? 7 : 3.2} fill={withAlpha(p.accent, dim ? 0.5 : 0.95)} />
        <circle
          cx={`${cx}%`}
          cy={`${cy}%`}
          r={hero ? 14 : 6}
          fill="none"
          stroke={withAlpha(p.accent, dim ? 0.25 : 0.5)}
          strokeWidth={hero ? 1.4 : 0.8}
        />
      </svg>
      {/* big ghost index */}
      <span
        className={cn(
          "absolute inset-0 grid place-items-center font-mono font-semibold tabular-nums",
          hero ? "text-[64px]" : "text-[20px]",
        )}
        style={{ color: withAlpha(p.ink, dim ? 0.07 : 0.1) }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
    </div>
  );
}

export const meta: RevizMeta = {
  id: "frame-strip",
  name: "Frame Strip",
  category: "robotics-media",
  description:
    "A scrubbable filmstrip of a robot episode that sweeps a playhead across sequential frames and enlarges the current step into a hero preview.",
  tags: ["filmstrip", "rollout", "episode", "timeline", "robotics", "video", "scrubber"],
  badges: ["animated", "interactive", "responsive", "themed"],
  exportName: "FrameStrip",
  sourcePath: "robotics-media/FrameStrip",
  aspect: 16 / 10,
  controls: [
    {
      key: "frames",
      label: "Frames",
      type: "json",
      group: "Data",
      help: "Array of { src?, label?, t? }. Omit src for generated placeholders; t is seconds.",
      default: DEFAULT_FRAMES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Episode rollout" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "autoplay", label: "Autoplay on scroll", type: "boolean", group: "Animation", default: true },
    {
      key: "duration",
      label: "Sweep (ms)",
      type: "number",
      group: "Animation",
      default: 4200,
      min: 800,
      max: 12000,
      step: 100,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "rollout",
      name: "Manipulation rollout",
      props: {
        title: "Pick-and-place rollout — episode 0142",
        caption: "Ten keyframes from a successful cabinet retrieval, sampled at 1.25 Hz.",
        source: "Sim eval · v3",
        duration: 4200,
      },
    },
    {
      id: "nav",
      name: "Navigation trace",
      props: {
        title: "Indoor navigation rollout",
        caption: "Onboard RGB frames as the agent traverses to the goal.",
        autoplay: true,
        duration: 6000,
        frames: [
          { label: "Spawn at entrance", t: 0 },
          { label: "Detect hallway", t: 1.2 },
          { label: "Turn left", t: 2.4 },
          { label: "Avoid obstacle", t: 3.6 },
          { label: "Re-plan path", t: 4.8 },
          { label: "Enter room", t: 6.0 },
          { label: "Goal in view", t: 7.2 },
          { label: "Arrive at goal", t: 8.4 },
        ],
      },
    },
  ],
};
