"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  cn,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type Align = "left" | "center";
type Size = "md" | "lg" | "xl";

export interface PullQuoteProps {
  quote?: string;
  author?: string;
  role?: string;
  align?: Align;
  accent?: string;
  size?: Size;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Size scale                                                         */
/* ------------------------------------------------------------------ */

const SIZE: Record<Size, { quote: string; mark: string; gap: string; rule: string }> = {
  md: {
    quote: "text-[20px] leading-[1.5] sm:text-[24px] sm:leading-[1.5]",
    mark: "text-[64px] sm:text-[80px]",
    gap: "gap-4 sm:gap-5",
    rule: "w-[3px]",
  },
  lg: {
    quote: "text-[26px] leading-[1.42] sm:text-[34px] sm:leading-[1.4]",
    mark: "text-[88px] sm:text-[116px]",
    gap: "gap-5 sm:gap-7",
    rule: "w-[4px]",
  },
  xl: {
    quote: "text-[32px] leading-[1.34] sm:text-[46px] sm:leading-[1.32]",
    mark: "text-[120px] sm:text-[164px]",
    gap: "gap-6 sm:gap-9",
    rule: "w-[5px]",
  },
};

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function PullQuote({
  quote = "We are not building a chatbot. We are building a model of the world that can reason about it, act in it, and explain itself — and the benchmark for that is not a leaderboard, it is trust.",
  author = "Dr. Lena Okafor",
  role = "Director of Research, Frontier Systems Lab",
  align = "left",
  accent = "",
  size = "lg",
  title = "",
  caption = "",
  source = "",
  duration = 900,
}: PullQuoteProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const centered = align === "center";
  const s = SIZE[size];

  // Split into words for a soft, line-aware stagger. Keep punctuation attached.
  const words = useMemo(() => quote.trim().split(/\s+/).filter(Boolean), [quote]);

  const dur = Math.max(0, duration) / 1000;
  const perWord = words.length > 0 ? Math.min(0.05, (dur * 0.6) / words.length) : 0;

  // Animate (gated on inView). When reduced-motion, snap to final state.
  const show = reduced || inView;

  return (
    <Figure variant="plain" align={centered ? "center" : "left"} title={title} caption={caption} source={source}>
      <div
        ref={ref}
        key={token}
        className={cn(
          "group/quote relative isolate w-full",
          centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl text-left",
        )}
      >
        {/* Oversized opening quotation mark — decorative, accent-tinted */}
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -z-10 select-none font-serif leading-[0.72]",
            s.mark,
            centered ? "left-1/2 top-0 -translate-x-1/2 -translate-y-[18%]" : "-left-1 top-0 -translate-y-[14%]",
          )}
          style={{ color: withAlpha(fill, 0.14) }}
          initial={false}
          animate={{
            opacity: show ? 1 : 0,
            scale: show ? 1 : 0.86,
            y: show ? 0 : 8,
          }}
          transition={{ duration: reduced ? 0 : Math.min(0.9, dur), ease: [0.22, 1, 0.36, 1] }}
        >
          &ldquo;
        </motion.span>

        <figure className={cn("relative flex", centered ? "flex-col items-center" : "items-stretch", s.gap)}>
          {/* Accent vertical rule (left-aligned only) */}
          {!centered && (
            <motion.div
              aria-hidden
              className={cn("shrink-0 origin-top rounded-full", s.rule)}
              style={{
                background: `linear-gradient(to bottom, ${fill}, ${withAlpha(fill, 0.25)})`,
              }}
              initial={false}
              animate={{ scaleY: show ? 1 : 0, opacity: show ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : Math.min(0.7, dur * 0.8), ease: [0.16, 1, 0.3, 1] }}
            />
          )}

          <div className={cn("min-w-0", centered && "flex flex-col items-center")}>
            {/* The quote — serif italic, word-staggered reveal */}
            <blockquote
              className={cn(
                "font-serif italic tracking-tight text-ink",
                s.quote,
                centered ? "text-balance" : "",
              )}
              style={{ textWrap: "balance" }}
            >
              {words.map((w, i) => (
                <motion.span
                  key={`${i}-${w}`}
                  className="inline-block whitespace-pre"
                  initial={false}
                  animate={{
                    opacity: show ? 1 : 0,
                    y: show ? 0 : "0.5em",
                    filter: show ? "blur(0px)" : "blur(4px)",
                  }}
                  transition={{
                    duration: reduced ? 0 : Math.min(0.55, Math.max(0.28, dur * 0.5)),
                    delay: reduced ? 0 : 0.12 + i * perWord,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {w}
                  {i < words.length - 1 ? " " : ""}
                </motion.span>
              ))}
            </blockquote>

            {/* Attribution */}
            {(author || role) && (
              <motion.figcaption
                className={cn(
                  "mt-5 flex items-center gap-3 sm:mt-6",
                  centered ? "justify-center" : "",
                )}
                initial={false}
                animate={{ opacity: show ? 1 : 0, y: show ? 0 : 6 }}
                transition={{
                  duration: reduced ? 0 : Math.min(0.6, dur),
                  delay: reduced ? 0 : 0.12 + words.length * perWord + 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {/* Short accent tick before the name (left-aligned) */}
                {!centered && (
                  <span
                    aria-hidden
                    className="h-px w-7 shrink-0"
                    style={{ background: withAlpha(fill, 0.55) }}
                  />
                )}
                <div className={cn(centered ? "text-center" : "text-left")}>
                  {author && (
                    <cite
                      className="block font-mono text-[13px] not-italic uppercase tracking-label text-ink"
                      style={{ color: fill }}
                    >
                      {author}
                    </cite>
                  )}
                  {role && (
                    <span className="mt-1 block font-mono text-[11.5px] uppercase tracking-label text-ink-muted">
                      {role}
                    </span>
                  )}
                </div>
              </motion.figcaption>
            )}
          </div>
        </figure>

        {/* Replay affordance — appears on hover */}
        <div
          className={cn(
            "mt-6 flex opacity-0 transition-opacity duration-200 group-hover/quote:opacity-100",
            centered ? "justify-center" : "justify-start",
          )}
        >
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "pull-quote",
  name: "Pull Quote",
  category: "text-narrative",
  description:
    "An elegant serif pull quote with an oversized quotation mark, accent rule, and a soft word-by-word reveal — the editorial pause between figures.",
  tags: ["quote", "narrative", "editorial", "blockquote", "attribution"],
  badges: ["animated", "themed", "responsive"],
  exportName: "PullQuote",
  sourcePath: "text-narrative/PullQuote",
  aspect: 16 / 7,
  controls: [
    {
      key: "quote",
      label: "Quote",
      type: "textarea",
      group: "Data",
      rows: 4,
      default:
        "We are not building a chatbot. We are building a model of the world that can reason about it, act in it, and explain itself — and the benchmark for that is not a leaderboard, it is trust.",
    },
    { key: "author", label: "Author", type: "text", group: "Labels", default: "Dr. Lena Okafor" },
    {
      key: "role",
      label: "Role",
      type: "text",
      group: "Labels",
      default: "Director of Research, Frontier Systems Lab",
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
    {
      key: "size",
      label: "Size",
      type: "select",
      group: "Layout",
      default: "lg",
      options: [
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
        { value: "xl", label: "Extra large" },
      ],
    },
    { key: "title", label: "Figure title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 900, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "research-vision",
      name: "Research vision",
      props: {
        quote:
          "The goal was never to memorize the internet. It was to compress understanding so densely that a single forward pass could feel like thought.",
        author: "Aria Venkatesh",
        role: "Chief Scientist, Helix AI",
        align: "left",
        size: "xl",
      },
    },
    {
      id: "centered-manifesto",
      name: "Centered manifesto",
      props: {
        quote:
          "Interpretability is not a luxury we add after capability. It is the only honest definition of capability.",
        author: "Marcus Hadley",
        role: "Head of Alignment",
        align: "center",
        size: "lg",
      },
    },
    {
      id: "compact-aside",
      name: "Compact aside",
      props: {
        quote:
          "Every benchmark we beat was a benchmark someone designed to be beaten. The hard part is the questions no one thought to ask.",
        author: "Soonja Park",
        role: "Research Lead, Eval Team",
        align: "left",
        size: "md",
      },
    },
  ],
};
