"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ImageOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Figure,
  ReplayButton,
  cn,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Tab {
  /** Short uppercase tab label, e.g. "EGO HUMAN DATA". */
  label: string;
  /** Optional image URL. When omitted, a themed synthetic frame is drawn. */
  src?: string;
  /** Optional caption shown beneath the media for this tab. */
  caption?: string;
  /** Optional metric chip, e.g. "62% success". */
  badge?: string;
}

export interface TabbedCompareProps {
  tabs?: Tab[];
  title?: string;
  caption?: string;
  source?: string;
  aspect?: number;
  duration?: number;
}

const FALLBACK_TABS: Tab[] = [
  {
    label: "Ego human data",
    caption: "Policy trained on egocentric human video only — fluent reach, brittle grasp.",
    badge: "41% success",
  },
  {
    label: "Only Neo data",
    caption: "Policy trained on teleoperated robot rollouts only — precise, slower onset.",
    badge: "58% success",
  },
  {
    label: "Neo + Ego",
    caption: "Co-training on robot rollouts and human video transfers grasp priors end to end.",
    badge: "73% success",
  },
];

export default function TabbedCompare({
  tabs = FALLBACK_TABS,
  title = "Data ablation: what each source teaches the policy",
  caption = "",
  source = "",
  aspect = 16 / 9,
  duration = 600,
}: TabbedCompareProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const layoutGroup = useMemo(() => uid("tab"), []);

  const safeTabs = tabs.length > 0 ? tabs : FALLBACK_TABS;
  const [active, setActive] = useState(0);

  // Keep the active index valid if the tab list changes (editor live edits).
  useEffect(() => {
    if (active > safeTabs.length - 1) setActive(0);
  }, [safeTabs.length, active]);

  const idx = Math.min(active, safeTabs.length - 1);
  const current = safeTabs[idx];
  const dur = reduced ? 0 : duration / 1000;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative w-full">
        {/* Tab strip */}
        <div
          role="tablist"
          aria-label="Comparison conditions"
          className="relative flex flex-wrap items-stretch gap-x-1 gap-y-1 border-b border-border"
        >
          {safeTabs.map((t, i) => {
            const isActive = i === idx;
            return (
              <button
                key={`${t.label}-${i}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(i)}
                className={cn(
                  "group/tab relative -mb-px px-3 pb-2.5 pt-1 outline-none",
                  "font-mono text-[13px] uppercase tracking-label transition-colors",
                  isActive ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? p.series[i % p.series.length]
                        : withAlpha(p.inkFaint, 0.5),
                    }}
                  />
                  {t.label}
                </span>
                {isActive && (
                  <motion.span
                    layout
                    layoutId={`${layoutGroup}-underline`}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 34 }
                    }
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                    style={{ backgroundColor: p.series[i % p.series.length] }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Media area */}
        <div
          className="relative mt-3 w-full overflow-hidden rounded-reviz border border-border bg-surface-alt"
          style={{ aspectRatio: String(aspect) }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={`${token}-${idx}`}
              initial={{ opacity: 0, scale: reduced ? 1 : 1.015 }}
              animate={{ opacity: inView ? 1 : 0, scale: 1 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.992 }}
              transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              {current?.src ? (
                <img
                  src={current.src}
                  alt={current.label}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <SyntheticFrame
                  label={current?.label ?? ""}
                  seriesIndex={idx}
                  tabs={safeTabs}
                  activeIndex={idx}
                />
              )}

              {/* Top scrim + index/metric pills (pills stay clickable-free) */}
              <div
                className="absolute inset-x-0 top-0 flex items-center justify-between p-2.5"
                style={{
                  background: `linear-gradient(${withAlpha(p.canvas, 0.32)}, ${withAlpha(
                    p.canvas,
                    0,
                  )})`,
                }}
              >
                <span
                  className="rounded-md px-2 py-1 font-mono text-[12px] uppercase tracking-label backdrop-blur-sm"
                  style={{
                    backgroundColor: withAlpha(p.canvas, 0.82),
                    color: p.ink,
                    border: `1px solid ${withAlpha(p.border, 0.9)}`,
                  }}
                >
                  {String(idx + 1).padStart(2, "0")} / {String(safeTabs.length).padStart(2, "0")}
                </span>
                {current?.badge && (
                  <span
                    className="rounded-md px-2 py-1 font-mono text-[12px] uppercase tracking-label backdrop-blur-sm"
                    style={{
                      backgroundColor: withAlpha(p.canvas, 0.82),
                      color: p.series[idx % p.series.length],
                      border: `1px solid ${withAlpha(p.series[idx % p.series.length], 0.5)}`,
                    }}
                  >
                    {current.badge}
                  </span>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Active color hairline at the bottom of the media frame */}
          <motion.div
            layout
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5"
            style={{ backgroundColor: p.series[idx % p.series.length] }}
            initial={false}
            animate={{ opacity: inView ? 1 : 0 }}
            transition={{ duration: dur }}
          />
        </div>

        {/* Caption + replay row */}
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-h-[2.4em] flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={`${token}-cap-${idx}`}
                initial={{ opacity: 0, y: reduced ? 0 : 4 }}
                animate={{ opacity: inView ? 1 : 0, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : -4 }}
                transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
                className="font-serif text-[14px] italic leading-snug text-ink-muted"
              >
                {current?.caption ?? ""}
              </motion.p>
            </AnimatePresence>
          </div>
          <ReplayButton onClick={replay} label="Replay" className="shrink-0" />
        </div>
      </div>
    </Figure>
  );
}

/** Pull the first numeric value out of a metric badge, e.g. "41% success" -> 41. */
function parseMetric(badge?: string): number | null {
  if (!badge) return null;
  const m = badge.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * A themed synthetic "frame" used when a tab has no image src. When the tabs
 * carry numeric metric badges it renders a real cross-condition comparison
 * (one labelled bar per tab, active one highlighted) so the panel shows actual
 * data; otherwise it falls back to a clean themed placeholder mark.
 */
function SyntheticFrame({
  label,
  seriesIndex,
  tabs,
  activeIndex,
}: {
  label: string;
  seriesIndex: number;
  tabs: Tab[];
  activeIndex: number;
}) {
  const p = usePalette();
  const accent = p.series[seriesIndex % p.series.length];

  const metrics = tabs.map((t) => parseMetric(t.badge));
  const hasComparison = metrics.filter((m) => m != null).length >= 2;
  const maxMetric = Math.max(100, ...metrics.map((m) => m ?? 0));

  return (
    <div className="absolute inset-0">
      {/* Soft themed gradient field */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 70% 18%, ${withAlpha(
            accent,
            0.18,
          )}, ${withAlpha(p.canvas, 0)} 60%), linear-gradient(150deg, ${withAlpha(
            p.surface,
            0.92,
          )}, ${withAlpha(p.surfaceAlt, 0.92)})`,
        }}
      />

      {hasComparison ? (
        <div className="absolute inset-0 flex flex-col justify-between px-[8%] py-[9%]">
          {tabs.map((t, i) => {
            const v = metrics[i];
            const color = p.series[i % p.series.length];
            const isActive = i === activeIndex;
            const frac = v == null ? 0 : Math.max(0, Math.min(1, v / maxMetric));
            return (
              <div key={`${t.label}-${i}`} className="flex flex-1 flex-col justify-center gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className="font-mono text-[12px] uppercase tracking-label"
                    style={{ color: isActive ? p.ink : p.inkMuted }}
                  >
                    {t.label}
                  </span>
                  <span
                    className="font-mono text-[12px] tabular-nums"
                    style={{ color: isActive ? color : p.inkMuted, fontWeight: isActive ? 600 : 400 }}
                  >
                    {t.badge ?? (v != null ? String(v) : "")}
                  </span>
                </div>
                <div
                  className="h-3.5 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: withAlpha(p.border, 0.6) }}
                >
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: `${frac * 100}%`,
                      backgroundColor: isActive ? color : withAlpha(color, 0.5),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{
              backgroundColor: withAlpha(accent, 0.14),
              color: accent,
              border: `1px solid ${withAlpha(accent, 0.4)}`,
            }}
          >
            <ImageOff className="h-4 w-4" />
          </div>
          <span className="max-w-[80%] text-center font-mono text-[12px] uppercase tracking-label text-ink-muted">
            {label || "No media"}
          </span>
        </div>
      )}
    </div>
  );
}

export const meta: RevizMeta = {
  id: "tabbed-compare",
  name: "Tabbed Media Compare",
  category: "robotics-media",
  description:
    "Tabbed media comparator that cross-fades frames and captions across data-ablation conditions, with an animated underline gliding to the active tab.",
  tags: ["tabs", "compare", "media", "ablation", "rollout", "data"],
  badges: ["animated", "interactive", "themed", "responsive"],
  exportName: "TabbedCompare",
  sourcePath: "robotics-media/TabbedCompare",
  aspect: 16 / 10,
  controls: [
    {
      key: "tabs",
      label: "Tabs",
      type: "json",
      group: "Data",
      help: "Array of { label, src?, caption?, badge? }. Omit src for a themed placeholder frame.",
      default: FALLBACK_TABS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Data ablation: what each source teaches the policy" },
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
    { key: "duration", label: "Crossfade (ms)", type: "number", group: "Animation", default: 600, min: 0, max: 2000, step: 50 },
  ],
  presets: [
    {
      id: "ablation",
      name: "3-way data ablation",
      props: {
        title: "Data ablation: what each source teaches the policy",
        source: "Internal eval, n=120",
        tabs: FALLBACK_TABS,
      },
    },
    {
      id: "viewpoints",
      name: "Camera viewpoints",
      props: {
        title: "Manipulation rollout across camera views",
        aspect: 4 / 3,
        tabs: [
          { label: "Wrist cam", caption: "Egocentric wrist view — tracks the gripper through contact.", badge: "30 fps" },
          { label: "Front cam", caption: "Fixed front view — full scene context, occluded grasp.", badge: "30 fps" },
          { label: "Top cam", caption: "Overhead view — clean object layout, no depth cue.", badge: "30 fps" },
        ],
      },
    },
    {
      id: "checkpoints",
      name: "Training checkpoints",
      props: {
        title: "Same task, three checkpoints",
        duration: 800,
        tabs: [
          { label: "Step 10k", caption: "Early policy — reaches, fumbles the grasp.", badge: "22% success" },
          { label: "Step 80k", caption: "Mid training — consistent grasp, drops on transfer.", badge: "54% success" },
          { label: "Step 240k", caption: "Converged — smooth pick-and-place across seeds.", badge: "81% success" },
        ],
      },
    },
  ],
};
