"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  mix,
  readableOn,
  clamp,
  type RevizMeta,
} from "@/reviz";

/** The reviz signature mono label: uppercase, letter-spaced monospace. */
const MONO_LABEL_CLASS = "font-mono uppercase tracking-label leading-none";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Step {
  label: string;
  sublabel?: string;
}

export interface StepIndicatorProps {
  steps?: Step[];
  current?: number;
  accent?: string;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_STEPS: Step[] = [
  { label: "Curate data", sublabel: "1.2M pairs" },
  { label: "Pretrain", sublabel: "80k steps" },
  { label: "Fine-tune", sublabel: "RLHF" },
  { label: "Evaluate", sublabel: "40 tasks" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function StepIndicator({
  steps = DEFAULT_STEPS,
  current = 2,
  accent = "",
  title = "",
  caption = "",
  source = "",
  duration = 1100,
}: StepIndicatorProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const clean = useMemo(
    () => (Array.isArray(steps) ? steps.filter((s) => s && (s.label || s.sublabel)) : []),
    [steps],
  );
  const n = clean.length;
  const active = clamp(current, -1, n - 1);

  // Fraction of the connector rail to fill (0 = nothing done, 1 = all done).
  // Each gap between node i and i+1 fills once step i is complete (i < active).
  const fillFrac = n > 1 ? clamp(active, 0, n - 1) / (n - 1) : 0;

  const span = reduced ? 0 : duration / 1000;
  const stepDelay = n > 1 ? span / n : 0;
  const nodeDelay = (i: number) => (reduced ? 0 : i * stepDelay);

  const baseEase = [0.22, 1, 0.36, 1] as const;
  const contrastInk = readableOn(fill);

  // Connector geometry — half a node width of padding on each end so the rail
  // runs center-to-center across the row of badges.
  const railInset = `${100 / (n * 2)}%`;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative w-full" key={token}>
        {n === 0 ? (
          <div className="py-10 text-center font-mono text-[11px] uppercase tracking-label text-ink-faint">
            No steps to display
          </div>
        ) : (
          <>
            {/* Connector rail spanning the badge centers */}
            <div
              className="pointer-events-none absolute top-[19px] h-[3px] overflow-hidden rounded-full"
              style={{ left: railInset, right: railInset }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: withAlpha(p.borderStrong, 0.45) }}
              />
              <motion.div
                className="absolute inset-y-0 left-0 origin-left rounded-full"
                style={{ width: "100%", backgroundColor: fill }}
                initial={{ scaleX: reduced ? fillFrac : 0 }}
                animate={{ scaleX: inView ? fillFrac : reduced ? fillFrac : 0 }}
                transition={{
                  duration: reduced ? 0 : Math.max(0.4, span * 0.85),
                  delay: reduced ? 0 : stepDelay * 0.5,
                  ease: baseEase,
                }}
              />
            </div>

            <ol className="relative flex items-start" style={{ gap: 0 }}>
              {clean.map((s, i) => {
                const isActive = i === active;
                const isDone = active >= 0 && i < active;
                const d = nodeDelay(i);

                const badgeFill = isActive ? fill : isDone ? withAlpha(fill, 0.16) : p.surface;
                const badgeStroke = isActive
                  ? fill
                  : isDone
                    ? withAlpha(fill, 0.5)
                    : p.borderStrong;
                const badgeInk = isActive ? contrastInk : isDone ? fill : p.inkMuted;

                return (
                  <li
                    key={i}
                    className="relative flex min-w-0 flex-1 flex-col items-center text-center"
                  >
                    {/* Numbered badge */}
                    <motion.div
                      className="relative z-10 shrink-0"
                      initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.6 }}
                      animate={{
                        opacity: inView ? 1 : reduced ? 1 : 0,
                        scale: inView ? 1 : reduced ? 1 : 0.6,
                      }}
                      transition={{ duration: reduced ? 0 : 0.5, delay: d, ease: baseEase }}
                    >
                      {/* Active halo */}
                      <AnimatePresence>
                        {isActive && (
                          <motion.span
                            className="pointer-events-none absolute inset-0 rounded-full"
                            style={{ boxShadow: `0 0 0 5px ${withAlpha(fill, 0.16)}` }}
                            initial={{ opacity: 0, scale: 0.7 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4, delay: reduced ? 0 : d, ease: baseEase }}
                          />
                        )}
                      </AnimatePresence>
                      <div
                        className="relative grid h-[38px] w-[38px] place-items-center rounded-full border font-mono text-[13px] font-semibold tabular-nums transition-colors duration-300"
                        style={{
                          backgroundColor: badgeFill,
                          borderColor: badgeStroke,
                          color: badgeInk,
                        }}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {isDone ? (
                            <motion.span
                              key="check"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.25 }}
                              className="grid place-items-center"
                            >
                              <Check className="h-[18px] w-[18px]" strokeWidth={2.6} />
                            </motion.span>
                          ) : (
                            <motion.span
                              key="num"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              {i + 1}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>

                    {/* Labels */}
                    <motion.div
                      className="mt-3 min-w-0 px-2"
                      initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
                      animate={{
                        opacity: inView
                          ? isActive || isDone || active < 0
                            ? 1
                            : 0.6
                          : reduced
                            ? 1
                            : 0,
                        y: inView ? 0 : reduced ? 0 : 6,
                      }}
                      transition={{ duration: reduced ? 0 : 0.5, delay: d + 0.08, ease: baseEase }}
                    >
                      <div
                        className="truncate font-sans text-[13px] font-semibold leading-snug text-ink"
                        style={isActive ? { color: mix(p.ink, fill, 0.3) } : undefined}
                      >
                        {s.label || `Step ${i + 1}`}
                      </div>
                      {s.sublabel && (
                        <div
                          className={`${MONO_LABEL_CLASS} mt-1 truncate text-[9.5px]`}
                          style={{ color: isActive ? fill : p.inkFaint }}
                        >
                          {s.sublabel}
                        </div>
                      )}
                    </motion.div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-3 flex justify-end">
              <ReplayButton onClick={replay} />
            </div>
          </>
        )}
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "step-indicator",
  name: "Step Indicator",
  category: "layout-annotation",
  description:
    "A horizontal stepper of numbered circles joined by a connector that fills to the current step — completed steps check off, the active step is emphasized, and upcoming steps stay muted.",
  tags: ["steps", "stepper", "progress", "wizard", "process", "indicator", "onboarding"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "StepIndicator",
  sourcePath: "layout-annotation/StepIndicator",
  aspect: 16 / 5,
  controls: [
    {
      key: "steps",
      label: "Steps",
      type: "json",
      group: "Data",
      help: "[{ label, sublabel? }] — one entry per step, left to right.",
      default: DEFAULT_STEPS,
    },
    {
      key: "current",
      label: "Current step",
      type: "number",
      group: "Data",
      help: "0-based index of the active step; earlier steps show as complete. Use -1 for none.",
      default: 2,
      min: -1,
      max: 9,
      step: 1,
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
      default: 1100,
      min: 0,
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "training-wizard",
      name: "Training pipeline wizard",
      props: {
        title: "Model training pipeline",
        caption: "Fine-tuning is in progress; data curation and pretraining are complete.",
        current: 2,
        steps: DEFAULT_STEPS,
      },
    },
    {
      id: "deploy-flow",
      name: "Deployment flow (final step)",
      props: {
        title: "Ship to production",
        current: 3,
        steps: [
          { label: "Build", sublabel: "CI green" },
          { label: "Stage", sublabel: "Canary 5%" },
          { label: "Verify", sublabel: "SLOs ok" },
          { label: "Release", sublabel: "100% live" },
        ],
      },
    },
    {
      id: "experiment-setup",
      name: "Experiment setup (first step)",
      props: {
        title: "New experiment",
        current: 0,
        steps: [
          { label: "Dataset", sublabel: "Vision-1k" },
          { label: "Config", sublabel: "Sweep" },
          { label: "Launch", sublabel: "64 GPUs" },
        ],
      },
    },
  ],
};
