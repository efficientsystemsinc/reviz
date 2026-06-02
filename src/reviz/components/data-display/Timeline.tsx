"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  useInView,
  useProgress,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  mix,
  type RevizMeta,
} from "@/reviz";

/** The reviz signature mono label: uppercase, letter-spaced monospace. */
const MONO_LABEL_CLASS = "font-mono uppercase tracking-label leading-none";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  /** Optional category color (hex). Falls back to the accent. */
  color?: string;
}

type Layout = "left" | "alternating";

export interface TimelineProps {
  events?: TimelineEvent[];
  layout?: Layout;
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_EVENTS: TimelineEvent[] = [
  {
    date: "Mar 2024",
    title: "Project kickoff",
    description:
      "Scoped the vision-language-action agent, assembled the core team, and locked the eval suite.",
    color: "",
  },
  {
    date: "Jun 2024",
    title: "v0.1 — internal alpha",
    description:
      "First end-to-end policy clearing 12 tabletop tasks behind a feature flag for the research org.",
    color: "",
  },
  {
    date: "Sep 2024",
    title: "v0.5 — public preview",
    description:
      "Opened the API to design partners; added live telemetry, auto-rollback, and a safety reviewer.",
    color: "",
  },
  {
    date: "Jan 2025",
    title: "v1.0 — general availability",
    description:
      "Shipped the multimodal release with 40-task coverage, 3x lower latency, and SOC 2 compliance.",
    color: "",
  },
  {
    date: "May 2025",
    title: "Scaling milestone",
    description:
      "Crossed one billion served actions per week across robotics, agents, and document workflows.",
    color: "",
  },
];

const BASE_EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function Timeline({
  events = DEFAULT_EVENTS,
  layout = "alternating",
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1400,
}: TimelineProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fallback = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const clean = useMemo(
    () =>
      Array.isArray(events)
        ? events.filter((e) => e && (e.title || e.description || e.date))
        : [],
    [events],
  );
  const n = clean.length;

  // The spine draws top-down; events reveal in its wake.
  const progress = useProgress({
    duration: reduced ? 0 : Math.max(200, duration),
    enabled: inView,
    trigger: token,
  });

  // Per-event reveal threshold along the [0,1] spine progress.
  const threshold = (i: number) => (n > 1 ? (i / n) * 0.9 : 0);

  const isAlternating = layout === "alternating";

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative" key={token}>
        <ol
          className={
            isAlternating
              ? "relative mx-auto flex max-w-3xl flex-col"
              : "relative flex flex-col"
          }
        >
          {/* The spine: a static track with a filling overlay that draws top-down. */}
          <div
            className={
              isAlternating
                ? "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 overflow-hidden"
                : "pointer-events-none absolute inset-y-0 left-[7px] w-px overflow-hidden"
            }
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: withAlpha(p.borderStrong, 0.5) }}
            />
            <motion.div
              className="absolute inset-x-0 top-0 origin-top"
              style={{
                bottom: 0,
                background: `linear-gradient(${withAlpha(fallback, 0.85)}, ${withAlpha(fallback, 0.55)})`,
              }}
              initial={{ scaleY: reduced ? 1 : 0 }}
              animate={{ scaleY: reduced ? 1 : progress }}
              transition={{ duration: 0 }}
            />
          </div>

          {clean.map((e, i) => {
            const dotColor = e.color || fallback;
            const revealed = reduced || progress >= threshold(i);
            // Right side on odd indices when alternating.
            const right = isAlternating && i % 2 === 1;

            return (
              <li
                key={i}
                className={
                  isAlternating
                    ? "relative grid grid-cols-2 pb-9 last:pb-0"
                    : "relative flex gap-5 pb-9 pl-0 last:pb-0"
                }
              >
                {/* Node marker on the spine */}
                <div
                  className={
                    isAlternating
                      ? "absolute left-1/2 top-[6px] z-10 -translate-x-1/2"
                      : "absolute left-0 top-[6px] z-10"
                  }
                >
                  <motion.span
                    className="relative grid h-[16px] w-[16px] place-items-center rounded-full"
                    style={{
                      backgroundColor: p.surface,
                      boxShadow: `0 0 0 1.5px ${withAlpha(dotColor, revealed ? 0.95 : 0.35)}`,
                    }}
                    initial={{ scale: reduced ? 1 : 0.3, opacity: reduced ? 1 : 0 }}
                    animate={{
                      scale: revealed ? 1 : reduced ? 1 : 0.3,
                      opacity: revealed ? 1 : reduced ? 1 : 0,
                    }}
                    transition={{ duration: reduced ? 0 : 0.42, ease: BASE_EASE }}
                  >
                    <motion.span
                      className="block h-[7px] w-[7px] rounded-full"
                      style={{ backgroundColor: dotColor }}
                      initial={{ scale: reduced ? 1 : 0 }}
                      animate={{ scale: revealed ? 1 : reduced ? 1 : 0 }}
                      transition={{ duration: reduced ? 0 : 0.32, delay: reduced ? 0 : 0.06, ease: BASE_EASE }}
                    />
                    {/* Soft pulse halo on reveal */}
                    {!reduced && revealed && (
                      <span
                        className="pointer-events-none absolute inset-0 rounded-full"
                        style={{ boxShadow: `0 0 0 4px ${withAlpha(dotColor, 0.1)}` }}
                      />
                    )}
                  </motion.span>
                </div>

                {/* Body */}
                <motion.div
                  className={
                    isAlternating
                      ? right
                        ? "col-start-2 row-start-1 pl-9 text-left"
                        : "col-start-1 row-start-1 pr-9 text-right"
                      : "min-w-0 flex-1 pl-9"
                  }
                  initial={{
                    opacity: reduced ? 1 : 0,
                    x: reduced ? 0 : isAlternating ? (right ? 12 : -12) : 10,
                  }}
                  animate={{
                    opacity: revealed ? 1 : reduced ? 1 : 0,
                    x: revealed ? 0 : reduced ? 0 : isAlternating ? (right ? 12 : -12) : 10,
                  }}
                  transition={{ duration: reduced ? 0 : 0.5, ease: BASE_EASE }}
                >
                  <div
                    className={
                      isAlternating
                        ? `flex items-center gap-2 ${right ? "justify-start" : "justify-end"}`
                        : "flex items-center gap-2"
                    }
                  >
                    <span
                      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span
                      className={`${MONO_LABEL_CLASS} text-[10px]`}
                      style={{ color: mix(p.inkMuted, dotColor, 0.4) }}
                    >
                      {e.date || "—"}
                    </span>
                  </div>
                  <h4 className="mt-1.5 font-sans text-[15px] font-semibold leading-snug text-ink">
                    {e.title || "Untitled event"}
                  </h4>
                  {e.description && (
                    <p
                      className={`mt-1 font-serif text-[13px] italic leading-relaxed text-ink-muted ${
                        isAlternating ? "" : "max-w-prose"
                      }`}
                    >
                      {e.description}
                    </p>
                  )}
                </motion.div>
              </li>
            );
          })}

          {n === 0 && (
            <li className="py-8 text-center font-mono text-[11px] uppercase tracking-label text-ink-faint">
              No events to display
            </li>
          )}
        </ol>

        {n > 0 && (
          <div className="mt-2 flex justify-end">
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
  id: "timeline",
  name: "Timeline",
  category: "data-display",
  description:
    "A vertical event timeline whose spine draws top-down, revealing dated nodes — each a date, title, and description — in single-sided or alternating layout with per-event category colors.",
  tags: ["timeline", "events", "history", "roadmap", "release", "chronology", "milestones"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "Timeline",
  sourcePath: "data-display/Timeline",
  aspect: 3 / 4,
  controls: [
    {
      key: "events",
      label: "Events",
      type: "json",
      group: "Data",
      help: "[{ date, title, description?, color? }] — top to bottom in chronological order. color is an optional hex category dot.",
      default: DEFAULT_EVENTS,
    },
    {
      key: "layout",
      label: "Layout",
      type: "select",
      group: "Layout",
      help: "Single column to the right of the spine, or alternating left/right.",
      default: "alternating",
      options: [
        { value: "left", label: "Left (single-sided)" },
        { value: "alternating", label: "Alternating" },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Spine draw (ms)",
      type: "number",
      group: "Animation",
      default: 1400,
      min: 0,
      max: 4000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "release-timeline",
      name: "Product release timeline",
      props: {
        title: "From kickoff to a billion actions",
        caption: "Each release gated the next; deployment auto-rolled back on regression.",
        layout: "alternating",
        events: DEFAULT_EVENTS,
      },
    },
    {
      id: "model-history",
      name: "Model lineage (left)",
      props: {
        title: "Frontier model lineage",
        caption: "Successive pretraining runs, each scaling compute and context.",
        layout: "left",
        events: [
          { date: "2022", title: "Base-1", description: "12B params, 8k context, trained on 1.4T tokens of web + code.", color: "" },
          { date: "2023", title: "Base-2", description: "70B params, 32k context, with RLHF alignment and tool use.", color: "" },
          { date: "2024", title: "Frontier-3", description: "Mixture-of-experts, 200k context, native multimodal inputs.", color: "" },
          { date: "2025", title: "Frontier-4", description: "1M context, agentic planning, and verifiable reasoning traces.", color: "" },
        ],
      },
    },
    {
      id: "incident",
      name: "Incident postmortem",
      props: {
        title: "Latency regression — incident timeline",
        caption: "All times UTC. Color encodes severity of each phase.",
        layout: "left",
        accent: "#E0483B",
        events: [
          { date: "14:02", title: "Alert fired", description: "p99 inference latency crossed the 800 ms SLO on the us-east cluster.", color: "#E0A53B" },
          { date: "14:09", title: "Incident declared", description: "On-call paged; rollback of the new batching scheduler initiated.", color: "#E0483B" },
          { date: "14:21", title: "Mitigated", description: "Traffic shifted to the prior build; latency recovered to baseline.", color: "#2E9E6B" },
          { date: "15:40", title: "Root cause", description: "A lock contention bug in the dynamic batcher under high concurrency.", color: "#4A8DD6" },
        ],
      },
    },
  ],
};
