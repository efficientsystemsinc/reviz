"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Figure,
  cn,
  seededRandom,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Slide {
  /** Optional image URL. When omitted, a themed synthetic frame is drawn. */
  src?: string;
  /** Short title shown in the centered nav pill, e.g. "WORLD MODEL". */
  title?: string;
  /** Optional caption shown beneath the media for this slide. */
  caption?: string;
}

export interface MediaCarouselProps {
  slides?: Slide[];
  title?: string;
  autoplay?: boolean;
  duration?: number;
  aspect?: number;
  caption?: string;
  source?: string;
}

const DEFAULT_SLIDES: Slide[] = [
  {
    title: "World model",
    caption: "Imagined rollout — the learned dynamics model dreams the next 16 frames from a single context.",
  },
  {
    title: "Real",
    caption: "Ground-truth rollout — the same action sequence executed on the physical arm.",
  },
  {
    title: "Residual",
    caption: "Per-pixel prediction error between dream and reality, normalised across the horizon.",
  },
  {
    title: "Action overlay",
    caption: "End-effector trajectory and gripper state projected onto the predicted frame.",
  },
];

export default function MediaCarousel({
  slides = DEFAULT_SLIDES,
  title = "Sample rollout — world model vs. real",
  autoplay = false,
  duration = 600,
  aspect = 16 / 9,
  caption = "",
  source = "",
}: MediaCarouselProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const groupId = useMemo(() => uid("carousel"), []);

  const safeSlides = slides.length > 0 ? slides : DEFAULT_SLIDES;
  const n = safeSlides.length;

  const [active, setActive] = useState(0);
  // direction drives the slide's enter/exit travel (+1 next, -1 prev).
  const [dir, setDir] = useState(1);
  const [playing, setPlaying] = useState(false);

  // Keep the active index valid if the slide list changes (editor live edits).
  useEffect(() => {
    if (active > n - 1) setActive(0);
  }, [n, active]);

  const idx = Math.min(active, n - 1);
  const current = safeSlides[idx];

  const go = useCallback(
    (delta: number) => {
      setDir(delta >= 0 ? 1 : -1);
      setActive((a) => (a + (delta >= 0 ? 1 : -1) + n) % n);
    },
    [n],
  );

  const select = useCallback((i: number, fromIdx: number) => {
    setDir(i >= fromIdx ? 1 : -1);
    setActive(i);
  }, []);

  // Autoplay: advance once scrolled into view; pause on hover, resume on leave.
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    setPlaying(autoplay);
  }, [autoplay]);

  useEffect(() => {
    if (!playing || !inView || hovered || reduced || n <= 1) return;
    timerRef.current = setInterval(() => {
      setDir(1);
      setActive((a) => (a + 1) % n);
    }, Math.max(1600, duration + 2600));
    return () => clearInterval(timerRef.current);
  }, [playing, inView, hovered, reduced, n, duration]);

  const dur = reduced ? 0 : duration / 1000;
  const travel = reduced ? 0 : 28;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div
        ref={ref}
        className="relative w-full select-none"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Centered nav header: prev — title pill — next */}
        <div className="mb-3 flex items-center justify-center gap-3">
          <NavButton
            direction="prev"
            onClick={() => go(-1)}
            disabled={n <= 1}
            palette={p}
            reduced={reduced}
          />

          <div className="relative flex min-w-0 flex-1 items-center justify-center">
            <div
              className="relative flex items-center gap-2 overflow-hidden rounded-full border px-4 py-1.5"
              style={{
                borderColor: withAlpha(p.border, 0.9),
                backgroundColor: p.surface,
              }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: p.series[idx % p.series.length] }}
              />
              <div className="relative h-[1.2em] overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  <motion.span
                    key={`${groupId}-pill-${idx}`}
                    custom={dir}
                    initial={{ opacity: 0, y: reduced ? 0 : dir * 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduced ? 0 : dir * -12 }}
                    transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
                    className="block whitespace-nowrap font-mono text-[13px] uppercase tracking-label text-ink"
                  >
                    {current?.title || `Slide ${idx + 1}`}
                  </motion.span>
                </AnimatePresence>
              </div>
              <span
                className="shrink-0 font-mono text-[12px] tabular-nums tracking-label"
                style={{ color: p.inkFaint }}
              >
                {String(idx + 1).padStart(2, "0")}/{String(n).padStart(2, "0")}
              </span>
            </div>
          </div>

          <NavButton
            direction="next"
            onClick={() => go(1)}
            disabled={n <= 1}
            palette={p}
            reduced={reduced}
          />
        </div>

        {/* Media stage with cross-fading + sliding frames */}
        <div
          className="relative w-full overflow-hidden rounded-reviz border border-border bg-surface-alt"
          style={{ aspectRatio: String(aspect) }}
        >
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={`${groupId}-slide-${idx}`}
              custom={dir}
              initial={{ opacity: 0, x: dir * travel, scale: reduced ? 1 : 1.012 }}
              animate={{ opacity: inView ? 1 : 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: dir * -travel, scale: reduced ? 1 : 0.992 }}
              transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              {current?.src ? (
                <img
                  src={current.src}
                  alt={current.title ?? `Slide ${idx + 1}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <SyntheticFrame label={current?.title ?? ""} seriesIndex={idx} palette={p} />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Bottom scrim so caption + dots read on any frame */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
            style={{
              background: `linear-gradient(${withAlpha(p.canvas, 0)}, ${withAlpha(
                p.canvas,
                0.55,
              )})`,
            }}
          />

          {/* Caption overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pb-9">
            <AnimatePresence mode="wait" initial={false}>
              {current?.caption ? (
                <motion.p
                  key={`${groupId}-cap-${idx}`}
                  initial={{ opacity: 0, y: reduced ? 0 : 6 }}
                  animate={{ opacity: inView ? 1 : 0, y: 0 }}
                  exit={{ opacity: 0, y: reduced ? 0 : -6 }}
                  transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-block max-w-[44ch] rounded-md px-2 py-1 font-serif text-[14.5px] italic leading-snug"
                  style={{
                    color: withAlpha(p.ink, 0.92),
                    backgroundColor: withAlpha(p.canvas, 0.82),
                    backdropFilter: "blur(2px)",
                  }}
                >
                  {current.caption}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Dot indicators */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 p-2.5">
            {safeSlides.map((s, i) => {
              const isActive = i === idx;
              return (
                <button
                  key={`${s.title ?? "slide"}-${i}`}
                  type="button"
                  aria-label={`Go to slide ${i + 1}${s.title ? `: ${s.title}` : ""}`}
                  aria-current={isActive}
                  onClick={() => select(i, idx)}
                  className="group/dot grid h-4 place-items-center outline-none"
                >
                  <motion.span
                    layout
                    initial={false}
                    animate={{
                      width: isActive ? 18 : 6,
                      backgroundColor: isActive
                        ? p.series[i % p.series.length]
                        : withAlpha(p.ink, 0.28),
                    }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 32 }
                    }
                    className="block h-1.5 rounded-full"
                    style={{
                      boxShadow: isActive ? `0 0 0 3px ${withAlpha(p.canvas, 0.35)}` : "none",
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* Active color hairline */}
          <motion.div
            layout
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
            style={{ backgroundColor: p.series[idx % p.series.length] }}
            initial={false}
            animate={{ opacity: inView ? 1 : 0 }}
            transition={{ duration: dur }}
          />
        </div>

        {/* Footer: autoplay toggle + slide titles legend */}
        <div className="mt-3 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            disabled={reduced || n <= 1}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-label outline-none transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
            style={{
              backgroundColor: playing ? p.accent : withAlpha(p.accent, 0.12),
              color: playing ? p.accentContrast : p.accent,
              border: `1px solid ${playing ? p.accent : withAlpha(p.accent, 0.32)}`,
            }}
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {playing ? "Auto" : "Manual"}
          </button>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {safeSlides.map((s, i) => {
              const isActive = i === idx;
              return (
                <button
                  key={`${s.title ?? "slide"}-legend-${i}`}
                  type="button"
                  onClick={() => select(i, idx)}
                  className={cn(
                    "inline-flex items-center gap-1.5 font-mono text-[12.5px] uppercase tracking-label outline-none transition-colors",
                    isActive ? "text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? p.series[i % p.series.length]
                        : p.inkMuted,
                    }}
                  />
                  {s.title || `Slide ${i + 1}`}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Nav button — circular prev/next control with a hover lift.          */
/* ------------------------------------------------------------------ */

function NavButton({
  direction,
  onClick,
  disabled,
  palette,
  reduced,
}: {
  direction: "prev" | "next";
  onClick: () => void;
  disabled?: boolean;
  palette: ReturnType<typeof usePalette>;
  reduced: boolean;
}) {
  const p = palette;
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      type="button"
      aria-label={direction === "prev" ? "Previous slide" : "Next slide"}
      onClick={onClick}
      disabled={disabled}
      whileHover={reduced || disabled ? undefined : { scale: 1.06 }}
      whileTap={reduced || disabled ? undefined : { scale: 0.92 }}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-30"
      style={{
        backgroundColor: p.surface,
        color: p.inkMuted,
        border: `1px solid ${p.border}`,
      }}
    >
      <Icon className="h-4 w-4" />
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Synthetic frame — themed placeholder when a slide has no image src. */
/* ------------------------------------------------------------------ */

function SyntheticFrame({
  seriesIndex,
  palette,
}: {
  label?: string;
  seriesIndex: number;
  palette: ReturnType<typeof usePalette>;
}) {
  const p = palette;
  const accent = p.series[seriesIndex % p.series.length];
  const rng = useMemo(() => seededRandom(seriesIndex * 131 + 7), [seriesIndex]);

  // A drifting trajectory + tracked points to evoke a robot/vision rollout.
  const pts = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        x: 14 + (i / 5) * 70 + (rng() - 0.5) * 10,
        y: 30 + Math.sin(i * 0.9 + seriesIndex) * 22 + (rng() - 0.5) * 8,
      })),
    [rng, seriesIndex],
  );
  const path = useMemo(
    () => pts.map((d, i) => `${i === 0 ? "M" : "L"} ${d.x} ${d.y}`).join(" "),
    [pts],
  );

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 72% 16%, ${withAlpha(
            accent,
            0.24,
          )}, ${withAlpha(p.canvas, 0)} 58%), linear-gradient(150deg, ${withAlpha(
            p.surface,
            0.92,
          )}, ${withAlpha(p.surfaceAlt, 0.92)})`,
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 64"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={(i + 1) * 10}
            x2={(i + 1) * 10}
            y1={0}
            y2={64}
            stroke={withAlpha(p.grid, 0.6)}
            strokeWidth={0.18}
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`h${i}`}
            y1={(i + 1) * 10.6}
            y2={(i + 1) * 10.6}
            x1={0}
            x2={100}
            stroke={withAlpha(p.grid, 0.6)}
            strokeWidth={0.18}
          />
        ))}
        <path
          d={path}
          fill="none"
          stroke={accent}
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2.4 2"
        />
        {pts.map((d, i) => (
          <g key={i}>
            <circle cx={d.x} cy={d.y} r={1.5} fill={accent} stroke={p.canvas} strokeWidth={0.4} />
          </g>
        ))}
        <rect
          x={1.5}
          y={1.5}
          width={97}
          height={61}
          fill="none"
          stroke={withAlpha(accent, 0.32)}
          strokeWidth={0.3}
          strokeDasharray="2 2.5"
          rx={1.2}
        />
      </svg>
    </div>
  );
}

export const meta: RevizMeta = {
  id: "media-carousel",
  name: "Media Carousel",
  category: "robotics-media",
  description:
    "A media carousel with prev/next nav and a centered title pill that cross-fades and slides between rollout frames, with dot indicators and optional autoplay.",
  tags: ["carousel", "media", "rollout", "slideshow", "switcher", "robotics", "world-model"],
  badges: ["animated", "interactive", "themed", "responsive"],
  exportName: "MediaCarousel",
  sourcePath: "robotics-media/MediaCarousel",
  aspect: 16 / 10,
  controls: [
    {
      key: "slides",
      label: "Slides",
      type: "json",
      group: "Data",
      help: "Array of { src?, title?, caption? }. Omit src for a themed placeholder frame.",
      default: DEFAULT_SLIDES,
    },
    {
      key: "title",
      label: "Title",
      type: "text",
      group: "Labels",
      default: "Sample rollout — world model vs. real",
    },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "aspect",
      label: "Media aspect",
      type: "number",
      group: "Layout",
      default: 16 / 9,
      min: 0.6,
      max: 2.5,
      step: 0.01,
    },
    { key: "autoplay", label: "Autoplay", type: "boolean", group: "Animation", default: false },
    {
      key: "duration",
      label: "Crossfade (ms)",
      type: "number",
      group: "Animation",
      default: 600,
      min: 0,
      max: 2000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "wm-vs-real",
      name: "World model vs. real",
      props: {
        title: "Sample rollout — world model vs. real",
        source: "Diffusion world model · eval split",
        autoplay: true,
        slides: DEFAULT_SLIDES,
      },
    },
    {
      id: "viewpoints",
      name: "Multi-view rollout",
      props: {
        title: "Manipulation episode across camera views",
        aspect: 4 / 3,
        duration: 700,
        slides: [
          { title: "Wrist", caption: "Egocentric wrist camera — tracks the gripper through contact." },
          { title: "Front", caption: "Fixed front view — full scene context, occluded grasp." },
          { title: "Top", caption: "Overhead view — clean object layout, no depth cue." },
          { title: "Side", caption: "Lateral view — best read on approach height and timing." },
        ],
      },
    },
    {
      id: "diffusion-steps",
      name: "Denoising steps",
      props: {
        title: "Action diffusion — denoising the trajectory",
        autoplay: true,
        duration: 500,
        slides: [
          { title: "t = 50", caption: "Pure noise prior over the 16-step action chunk." },
          { title: "t = 30", caption: "Coarse structure emerges — reach direction resolved." },
          { title: "t = 10", caption: "Trajectory sharpens — grasp timing locks in." },
          { title: "t = 0", caption: "Final denoised actions dispatched to the controller." },
        ],
      },
    },
  ],
};
