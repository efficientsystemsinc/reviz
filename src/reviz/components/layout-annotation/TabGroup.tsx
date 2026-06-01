"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useMemo, useState } from "react";
import {
  Figure,
  cn,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Tab {
  /** Short label shown in the tab strip. */
  label: string;
  /** Body text shown in the panel (supports plain multi-paragraph strings split on blank lines). */
  content: string;
  /** Optional small eyebrow shown above the panel content. */
  eyebrow?: string;
}

export interface TabGroupProps {
  tabs?: Tab[];
  variant?: "underline" | "pill" | "segmented";
  labelStyle?: "mono" | "sans";
  align?: "left" | "center";
  color?: string;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

const DEFAULT_TABS: Tab[] = [
  {
    label: "Architecture",
    eyebrow: "Model",
    content:
      "Perseus-7B is a decoder-only transformer with 32 layers, 32 attention heads, and a 4,096-token context window. Grouped-query attention keeps the KV cache compact for long-horizon planning.\n\nRotary position embeddings let the model extrapolate cleanly past its training context, a property we lean on heavily during multi-step tool use.",
  },
  {
    label: "Training",
    eyebrow: "Recipe",
    content:
      "We pre-train on 1.4T tokens of curated web, code, and synthetic reasoning traces, then run two rounds of preference optimization against a learned reward model.\n\nThe final checkpoint at step 41k sits on the compute-optimal frontier — held-out loss is still descending, but the eval suite has plateaued within noise.",
  },
  {
    label: "Evaluation",
    eyebrow: "Results",
    content:
      "On the internal agentic benchmark, Perseus-7B reaches 88.2% recall@10 and a 74% stop-acceptance rate, beating the previous checkpoint by 4.1 points.\n\nLatency at p50 dropped to 650 ms after the KV-cache rewrite, with no measurable regression in task success.",
  },
];

/* ------------------------------------------------------------------ */

export default function TabGroup({
  tabs = DEFAULT_TABS,
  variant = "underline",
  labelStyle = "mono",
  align = "left",
  color = "",
  title = "",
  caption = "",
  source = "",
  duration = 420,
}: TabGroupProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const layoutId = useId();

  const list = useMemo(() => (Array.isArray(tabs) && tabs.length ? tabs : DEFAULT_TABS), [tabs]);
  const [active, setActive] = useState(0);

  // Keep the active index valid if the tabs array changes (e.g. from controls).
  useEffect(() => {
    if (active > list.length - 1) setActive(0);
  }, [list.length, active]);

  const current = list[Math.min(active, list.length - 1)] ?? list[0];
  const dur = reduced ? 0 : duration / 1000;
  const centered = align === "center";

  const labelCls = cn(
    "relative z-10 whitespace-nowrap transition-colors",
    labelStyle === "mono"
      ? "font-mono text-[11px] uppercase tracking-label"
      : "font-sans text-[13px] font-medium tracking-tight",
  );

  /* ---- Tab strip styling per variant ---- */

  const stripCls = cn(
    "relative flex w-full items-stretch",
    centered ? "justify-center" : "justify-start",
    variant === "underline" && "gap-1 border-b border-border",
    variant === "pill" && "gap-1",
    variant === "segmented" &&
      "gap-1 rounded-reviz border border-border bg-surface-alt p-1",
  );

  const motionTransition = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.8 };

  return (
    <Figure variant="plain" align={centered ? "center" : "left"} title={title} caption={caption} source={source}>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 10 }}
        transition={{ duration: reduced ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-4"
      >
        {/* Tab strip */}
        <div role="tablist" aria-label={typeof title === "string" && title ? title : "Tabs"} className={stripCls}>
          {list.map((tab, i) => {
            const isActive = i === Math.min(active, list.length - 1);
            return (
              <button
                key={`${tab.label}-${i}`}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActive(i)}
                style={{ color: isActive ? (variant === "pill" ? p.accentContrast : fill) : undefined }}
                className={cn(
                  "group/tab relative outline-none transition-colors",
                  "rounded-md focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                  variant === "underline" && "px-3 pb-2.5 pt-1",
                  variant === "pill" && "rounded-full px-3.5 py-1.5",
                  variant === "segmented" && "flex-1 rounded-md px-3 py-1.5 text-center",
                  !isActive && "text-ink-muted hover:text-ink",
                )}
              >
                {/* Animated indicator */}
                {isActive && variant === "underline" && (
                  <motion.span
                    layoutId={`${layoutId}-underline`}
                    aria-hidden
                    transition={motionTransition}
                    className="absolute inset-x-2 -bottom-px h-[2px] rounded-full"
                    style={{ background: fill }}
                  />
                )}
                {isActive && variant === "pill" && (
                  <motion.span
                    layoutId={`${layoutId}-pill`}
                    aria-hidden
                    transition={motionTransition}
                    className="absolute inset-0 rounded-full"
                    style={{ background: fill, boxShadow: `0 1px 8px ${withAlpha(fill, 0.35)}` }}
                  />
                )}
                {isActive && variant === "segmented" && (
                  <motion.span
                    layoutId={`${layoutId}-segment`}
                    aria-hidden
                    transition={motionTransition}
                    className="absolute inset-0 rounded-md border border-border bg-surface shadow-sm"
                    style={{ boxShadow: `0 1px 3px ${withAlpha(p.shadow, 0.16)}` }}
                  />
                )}
                <span className={labelCls}>{tab.label}</span>
                {/* Soft hover halo for underline/segmented when inactive */}
                {!isActive && variant === "pill" && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full opacity-0 transition-opacity group-hover/tab:opacity-100"
                    style={{ background: withAlpha(fill, 0.08) }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div className="relative min-h-[7.5rem] overflow-hidden rounded-reviz border border-border bg-surface px-5 py-4">
          {/* accent rule on the left edge */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-4 h-[calc(100%-2rem)] w-[2px] rounded-full"
            style={{ background: `linear-gradient(to bottom, ${fill}, ${withAlpha(fill, 0)})` }}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${active}-${current?.label ?? ""}`}
              initial={{ opacity: 0, y: reduced ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -8 }}
              transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
              className={cn("flex flex-col gap-2", centered && "items-center text-center")}
            >
              {current?.eyebrow && (
                <span className="font-mono text-[10px] uppercase tracking-label text-accent" style={{ color: fill }}>
                  {current.eyebrow}
                </span>
              )}
              {splitParagraphs(current?.content ?? "").map((para, pi) => (
                <p key={pi} className="font-serif text-[14px] leading-relaxed text-ink-muted">
                  {para}
                </p>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */

function splitParagraphs(text: string): string[] {
  const parts = String(text)
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [String(text).trim()];
}

/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "tab-group",
  name: "Tab Group",
  category: "layout-annotation",
  description:
    "An elegant animated tab switcher whose underline, pill, or segment indicator glides between tabs while the panel content cross-fades.",
  tags: ["tabs", "switcher", "navigation", "annotation", "layout"],
  badges: ["animated", "interactive", "responsive", "themed"],
  exportName: "TabGroup",
  sourcePath: "layout-annotation/TabGroup",
  aspect: 16 / 8,
  controls: [
    {
      key: "tabs",
      label: "Tabs",
      type: "json",
      group: "Data",
      help: "Array of { label, content, eyebrow? }. Blank lines in content become separate paragraphs.",
      default: DEFAULT_TABS,
    },
    {
      key: "variant",
      label: "Indicator",
      type: "select",
      group: "Style",
      default: "underline",
      options: [
        { value: "underline", label: "Underline" },
        { value: "pill", label: "Pill" },
        { value: "segmented", label: "Segmented" },
      ],
    },
    {
      key: "labelStyle",
      label: "Label style",
      type: "select",
      group: "Style",
      default: "mono",
      options: [
        { value: "mono", label: "Mono · uppercase" },
        { value: "sans", label: "Sans" },
      ],
    },
    {
      key: "align",
      label: "Alignment",
      type: "select",
      group: "Layout",
      default: "left",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
    },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "duration", label: "Cross-fade (ms)", type: "number", group: "Animation", default: 420, min: 0, max: 1200, step: 20 },
  ],
  presets: [
    {
      id: "model-card",
      name: "Model card",
      props: {
        title: "Perseus-7B · checkpoint 41k",
        variant: "underline",
        labelStyle: "mono",
        tabs: DEFAULT_TABS,
        caption: "Three views of the same release, one tab strip.",
      },
    },
    {
      id: "pill-overview",
      name: "Pill overview",
      props: {
        variant: "pill",
        labelStyle: "sans",
        align: "center",
        title: "Release notes",
        tabs: [
          {
            label: "What's new",
            eyebrow: "v2.4",
            content:
              "Streaming tool calls now interleave with generated text, so the agent can think and act in the same turn.\n\nThe planner emits structured sub-goals that the showcase renders as a live checklist.",
          },
          {
            label: "Fixes",
            eyebrow: "Stability",
            content:
              "Resolved a KV-cache eviction bug that occasionally truncated long contexts mid-rollout. p99 latency is back under 1.8s.",
          },
          {
            label: "Known issues",
            eyebrow: "Heads up",
            content:
              "Multi-modal inputs above 4k tokens can still trigger a re-tokenization pass. A streaming fix is slated for v2.5.",
          },
        ],
      },
    },
    {
      id: "segmented-compare",
      name: "Segmented compare",
      props: {
        variant: "segmented",
        labelStyle: "mono",
        title: "Decoding strategy",
        tabs: [
          {
            label: "Greedy",
            content:
              "Always take the argmax token. Deterministic and fast, but collapses into repetitive loops on open-ended prompts.",
          },
          {
            label: "Top-p",
            content:
              "Sample from the smallest set of tokens whose cumulative probability exceeds p = 0.92. Balances coherence and diversity.",
          },
          {
            label: "Beam",
            content:
              "Track the k = 4 highest-probability sequences in parallel. Strong for constrained tasks like translation, slower for chat.",
          },
        ],
      },
    },
  ],
};
