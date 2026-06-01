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
  type RevizMeta,
} from "@/reviz";

/** The reviz signature mono label: uppercase, letter-spaced monospace. */
const MONO_LABEL_CLASS = "font-mono uppercase tracking-label leading-none";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Step {
  title: string;
  description?: string;
}

export interface NumberedStepsProps {
  steps: Step[];
  activeStep: number;
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_STEPS: Step[] = [
  {
    title: "Collect demonstrations",
    description:
      "Teleoperate the robot through 1,200 expert trajectories spanning kitchen and tabletop tasks.",
  },
  {
    title: "Pretrain the policy",
    description:
      "Train a vision-language-action transformer on the demo corpus for 80k gradient steps across 64 H100s.",
  },
  {
    title: "Evaluate held-out suite",
    description:
      "Score the checkpoint on 40 unseen tasks, tracking success rate, latency, and intervention count.",
  },
  {
    title: "Deploy with monitoring",
    description:
      "Roll out behind a 5% canary, auto-rolling back if the live success rate regresses below threshold.",
  },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function NumberedSteps({
  steps = DEFAULT_STEPS,
  activeStep = 2,
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1100,
}: NumberedStepsProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const clean = useMemo(
    () => (Array.isArray(steps) ? steps.filter((s) => s && (s.title || s.description)) : []),
    [steps],
  );
  const n = clean.length;
  const active = Math.max(-1, Math.min(activeStep, n - 1));

  // Per-step entrance delay (seconds). Connector fills slightly behind each node.
  const span = reduced ? 0 : duration / 1000;
  const step = n > 1 ? span / n : 0;
  const nodeDelay = (i: number) => (reduced ? 0 : i * step);

  const baseEase = [0.22, 1, 0.36, 1] as const;
  const contrastInk = readableOn(fill);

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ol className="relative flex flex-col" key={token}>
          {clean.map((s, i) => {
            const isActive = i === active;
            const isDone = active >= 0 && i < active;
            const isLast = i === n - 1;

            // State-driven tones.
            const badgeFill = isActive
              ? fill
              : isDone
                ? withAlpha(fill, 0.16)
                : p.surface;
            const badgeStroke = isActive ? fill : isDone ? withAlpha(fill, 0.5) : p.borderStrong;
            const badgeInk = isActive ? contrastInk : isDone ? fill : p.inkMuted;

            const d = nodeDelay(i);

            return (
              <li key={i} className="relative flex gap-4 pb-7 last:pb-0">
                {/* Connector rail (drawn behind the badge column) */}
                {!isLast && (
                  <div className="absolute left-[17px] top-[34px] bottom-0 w-px overflow-hidden">
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: withAlpha(p.borderStrong, 0.4) }}
                    />
                    <motion.div
                      className="absolute inset-x-0 top-0 origin-top"
                      style={{
                        bottom: 0,
                        backgroundColor: i < active ? fill : withAlpha(fill, 0.45),
                      }}
                      initial={{ scaleY: reduced ? 1 : 0 }}
                      animate={{ scaleY: inView ? (i < active ? 1 : 0) : reduced ? 1 : 0 }}
                      transition={{ duration: reduced ? 0 : Math.max(0.25, step * 1.6), delay: d + step * 0.5, ease: baseEase }}
                    />
                  </div>
                )}

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
                    className="relative grid h-[34px] w-[34px] place-items-center rounded-full border font-mono text-[13px] font-semibold tabular-nums transition-colors duration-300"
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
                          <Check className="h-4 w-4" strokeWidth={2.6} />
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

                {/* Body */}
                <motion.div
                  className="min-w-0 flex-1 pt-[2px]"
                  initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -8 }}
                  animate={{
                    opacity: inView ? (isActive || isDone || active < 0 ? 1 : 0.62) : reduced ? 1 : 0,
                    x: inView ? 0 : reduced ? 0 : -8,
                  }}
                  transition={{ duration: reduced ? 0 : 0.5, delay: d + 0.06, ease: baseEase }}
                >
                  <div className="flex items-center gap-2.5">
                    <h4
                      className="font-sans text-[15px] font-semibold leading-snug text-ink"
                      style={isActive ? { color: mix(p.ink, fill, 0.25) } : undefined}
                    >
                      {s.title || `Step ${i + 1}`}
                    </h4>
                    {isActive && (
                      <motion.span
                        className={`${MONO_LABEL_CLASS} shrink-0 rounded-full px-2 py-[3px] text-[9px]`}
                        style={{ backgroundColor: withAlpha(fill, 0.14), color: fill }}
                        initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, delay: reduced ? 0 : d + 0.12 }}
                      >
                        Current
                      </motion.span>
                    )}
                  </div>
                  {s.description && (
                    <p className="mt-1 max-w-prose font-serif text-[13.5px] italic leading-relaxed text-ink-muted">
                      {s.description}
                    </p>
                  )}
                </motion.div>
              </li>
            );
          })}

          {n === 0 && (
            <li className="py-8 text-center font-mono text-[11px] uppercase tracking-label text-ink-faint">
              No steps to display
            </li>
          )}
        </ol>

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
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "numbered-steps",
  name: "Numbered Steps",
  category: "diagrams",
  description:
    "A vertical how-it-works list of circular numbered badges joined by a filling connector, with a highlighted current step and completed checkmarks that draw in sequentially.",
  tags: ["steps", "process", "how-it-works", "timeline", "list", "onboarding", "stepper"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "NumberedSteps",
  sourcePath: "diagrams/NumberedSteps",
  aspect: 4 / 5,
  controls: [
    {
      key: "steps",
      label: "Steps",
      type: "json",
      group: "Data",
      help: "[{ title, description? }] — one entry per step, top to bottom.",
      default: DEFAULT_STEPS,
    },
    {
      key: "activeStep",
      label: "Current step",
      type: "number",
      group: "Data",
      help: "0-based index of the highlighted step; earlier steps show as done. Use -1 for none.",
      default: 2,
      min: -1,
      max: 11,
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
      id: "robot-policy",
      name: "Robot policy lifecycle",
      props: {
        title: "How we ship a manipulation policy",
        caption: "Each stage gates the next; deployment auto-rolls back on regression.",
        activeStep: 2,
        steps: DEFAULT_STEPS,
      },
    },
    {
      id: "rag",
      name: "RAG request (all done)",
      props: {
        title: "Anatomy of a retrieval-augmented answer",
        activeStep: 4,
        steps: [
          { title: "Embed the query", description: "Encode the user prompt with text-3-large into a 3,072-dim vector." },
          { title: "Retrieve candidates", description: "Pull the top-50 nearest chunks from the vector index." },
          { title: "Rerank", description: "Score candidates with a cross-encoder and keep the top 8." },
          { title: "Generate", description: "Condition Opus 4.8 on the retrieved context to draft an answer." },
          { title: "Cite and guard", description: "Attach source spans and run a final safety check before returning." },
        ],
      },
    },
    {
      id: "onboarding",
      name: "Getting started",
      props: {
        title: "Get started in four steps",
        activeStep: 0,
        steps: [
          { title: "Install the SDK", description: "Add the package and set your API key as an environment variable." },
          { title: "Load a dataset", description: "Point the loader at your eval suite or a built-in benchmark." },
          { title: "Run an experiment", description: "Launch a sweep and stream metrics to the live dashboard." },
          { title: "Publish results", description: "Export publication-ready figures and share a read-only link." },
        ],
      },
    },
  ],
};
