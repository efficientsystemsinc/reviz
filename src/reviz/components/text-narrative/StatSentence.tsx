"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  formatCompact,
  round,
  useAnimatedNumber,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/** A single inline statistic woven into the prose. */
export interface Stat {
  /** Numeric target the figure counts up to. */
  value: number;
  /** Text shown before the number (e.g. "$", "×"). */
  prefix?: string;
  /** Text shown after the number (e.g. "%", "ms", "pp"). */
  suffix?: string;
  /** Decimal places; inferred from the value when omitted. */
  decimals?: number;
  /** Per-stat color override; falls back to the component accent. */
  color?: string;
}

export interface StatSentenceProps {
  /** Prose with `{{stat}}` tokens, each consumed by the next entry in `stats`. */
  template?: string;
  /** Ordered statistics that replace the `{{stat}}` tokens in `template`. */
  stats?: Stat[];
  /** Mono eyebrow above the sentence. */
  eyebrow?: string;
  accent?: string;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

const TOKEN = /\{\{\s*stat\s*\}\}/g;

/** Count significant decimals on the source value, capped, so 0.882 → 3, 88 → 0. */
function inferDecimals(v: number): number {
  if (Number.isInteger(v)) return 0;
  const s = String(v);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(4, s.length - dot - 1);
}

/** Format an animated value: group thousands, fall back to compact for big magnitudes. */
function formatValue(v: number, decimals: number): string {
  if (Math.abs(v) >= 100000) return formatCompact(v, decimals > 0 ? 1 : 0);
  const fixed = round(v, decimals).toFixed(Math.max(0, decimals));
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac != null ? `${grouped}.${frac}` : grouped;
}

/**
 * One inline animated number. Isolated into its own component so each stat owns a
 * `useAnimatedNumber` hook call — hooks can't run inside a `.map()` in the parent.
 */
function InlineStat({
  stat,
  accent,
  index,
  active,
  reduced,
  duration,
  trigger,
}: {
  stat: Stat;
  accent: string;
  index: number;
  active: boolean;
  reduced: boolean;
  duration: number;
  trigger: unknown;
}) {
  const p = usePalette();
  const color = stat.color || accent;
  const decimals = stat.decimals ?? inferDecimals(stat.value);
  // Stagger each stat's count-up so the eye lands on them in reading order.
  const delay = reduced ? 0 : index * Math.min(180, duration * 0.18);
  const animated = useAnimatedNumber(stat.value, {
    duration,
    delay,
    easing: "easeOut",
    enabled: active,
    trigger,
  });

  const text = `${stat.prefix ?? ""}${formatValue(animated, decimals)}${stat.suffix ?? ""}`;
  const sec = duration / 1000;

  return (
    <motion.span
      className="relative mx-[0.06em] inline-flex items-baseline whitespace-nowrap rounded-[0.3em] px-[0.28em] py-[0.02em] align-baseline font-sans font-semibold tabular-nums"
      style={{ color, backgroundColor: withAlpha(color, p.mode === "dark" ? 0.16 : 0.1) }}
      initial={{ opacity: 0, y: reduced ? 0 : "0.18em" }}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : "0.18em" }}
      transition={{
        duration: Math.max(0.2, sec * 0.5),
        delay: reduced ? 0 : index * 0.12,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {/* underline accent that wipes in beneath the figure */}
      <motion.span
        aria-hidden
        className="absolute inset-x-[0.18em] bottom-[0.04em] h-[0.08em] origin-left rounded-full"
        style={{ backgroundColor: color }}
        initial={{ scaleX: reduced ? 1 : 0 }}
        animate={{ scaleX: active ? 1 : reduced ? 1 : 0 }}
        transition={{
          duration: Math.max(0.25, sec * 0.7),
          delay: reduced ? 0 : index * 0.12 + 0.12,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
      {text}
    </motion.span>
  );
}

export default function StatSentence({
  template = "We lifted recall@10 from {{stat}} to {{stat}} while cutting p50 latency by {{stat}} — at {{stat}} the throughput of the previous serving stack.",
  stats = [
    { value: 0.76, decimals: 2 },
    { value: 0.88, decimals: 2 },
    { value: 38, suffix: "%" },
    { value: 2.3, suffix: "×" },
  ],
  eyebrow = "Headline result",
  accent = "",
  title = "",
  caption = "",
  source = "",
  duration = 1200,
}: StatSentenceProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const fill = accent || p.accent;
  const active = inView || reduced;
  const safeStats = Array.isArray(stats) ? stats : [];

  // Split the template into prose fragments interleaved with token slots, so each
  // `{{stat}}` becomes the next inline statistic in order.
  const fragments = useMemo(() => template.split(TOKEN), [template]);
  const sec = duration / 1000;
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/sentence relative">
        <motion.div
          key={token}
          className="relative overflow-hidden rounded-reviz border border-border bg-surface px-6 py-7 sm:px-8 sm:py-9"
          initial={{ opacity: 0, y: reduced ? 0 : 14 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 14 }}
          transition={{ duration: sec, ease }}
        >
          {/* left accent rail that wipes down on entrance */}
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] origin-top"
            style={{ backgroundColor: fill }}
            initial={{ scaleY: reduced ? 1 : 0 }}
            animate={{ scaleY: active ? 1 : reduced ? 1 : 0 }}
            transition={{ duration: sec * 0.9, delay: reduced ? 0 : 0.05, ease }}
          />

          {eyebrow && (
            <motion.div
              className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-label"
              style={{ color: fill }}
              initial={{ opacity: 0, y: reduced ? 0 : 8 }}
              animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 8 }}
              transition={{ duration: sec, delay: reduced ? 0 : 0.08, ease }}
            >
              <span>{eyebrow}</span>
              <span
                className="h-px w-8"
                style={{ backgroundColor: withAlpha(fill, 0.4) }}
                aria-hidden
              />
            </motion.div>
          )}

          <p className="text-balance font-sans text-[24px] font-medium leading-[1.45] tracking-tight text-ink sm:text-[30px] sm:leading-[1.42]">
            {fragments.map((frag, i) => {
              const stat = i < fragments.length - 1 ? safeStats[i] : undefined;
              return (
                <span key={i}>
                  {frag}
                  {stat && (
                    <InlineStat
                      stat={stat}
                      accent={fill}
                      index={i}
                      active={active}
                      reduced={reduced}
                      duration={duration}
                      trigger={token}
                    />
                  )}
                </span>
              );
            })}
          </p>

          {/* bottom hairline accent that fades in last */}
          <motion.span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px"
            style={{
              background: `linear-gradient(to right, ${withAlpha(fill, 0.5)}, ${withAlpha(fill, 0)})`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: active ? 1 : 0 }}
            transition={{ duration: sec, delay: reduced ? 0 : 0.4, ease }}
          />
        </motion.div>

        <div className="pointer-events-none absolute -bottom-2 right-0 translate-y-full pt-2 opacity-0 transition-opacity duration-200 group-hover/sentence:pointer-events-auto group-hover/sentence:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "stat-sentence",
  name: "Stat Sentence",
  category: "text-narrative",
  description:
    "A large narrative sentence with key statistics woven inline as emphasized accent numbers that count up on entrance — the one-line headline result of a paper or launch.",
  tags: ["narrative", "stat", "headline", "count-up", "result", "prose"],
  badges: ["animated", "themed", "responsive"],
  exportName: "StatSentence",
  sourcePath: "text-narrative/StatSentence",
  aspect: 16 / 7,
  controls: [
    {
      key: "template",
      label: "Template",
      type: "textarea",
      group: "Data",
      rows: 4,
      default:
        "We lifted recall@10 from {{stat}} to {{stat}} while cutting p50 latency by {{stat}} — at {{stat}} the throughput of the previous serving stack.",
    },
    {
      key: "stats",
      label: "Stats",
      type: "json",
      group: "Data",
      default: [
        { value: 0.76, decimals: 2 },
        { value: 0.88, decimals: 2 },
        { value: 38, suffix: "%" },
        { value: 2.3, suffix: "×" },
      ],
    },
    {
      key: "eyebrow",
      label: "Eyebrow tag",
      type: "text",
      group: "Labels",
      default: "Headline result",
    },
    { key: "title", label: "Figure title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1200,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "headline-result",
      name: "Headline result",
      props: {
        eyebrow: "Headline result",
        template:
          "We lifted recall@10 from {{stat}} to {{stat}} while cutting p50 latency by {{stat}} — at {{stat}} the throughput of the previous serving stack.",
        stats: [
          { value: 0.76, decimals: 2 },
          { value: 0.88, decimals: 2 },
          { value: 38, suffix: "%" },
          { value: 2.3, suffix: "×" },
        ],
        source: "Internal serving benchmark · n = 50k requests",
      },
    },
    {
      id: "scaling",
      name: "Scaling run",
      props: {
        eyebrow: "Pretraining",
        template:
          "Scaling to {{stat}} parameters on {{stat}} tokens drove validation loss to {{stat}}, a {{stat}} reduction over the prior checkpoint.",
        stats: [
          { value: 70, suffix: "B" },
          { value: 15, suffix: "T" },
          { value: 1.84, decimals: 2 },
          { value: 12, suffix: "%" },
        ],
      },
    },
    {
      id: "efficiency",
      name: "Efficiency win",
      props: {
        eyebrow: "Inference",
        template:
          "Speculative decoding pushed throughput to {{stat}} tokens/sec while holding accuracy at {{stat}}, all at {{stat}} the GPU cost.",
        stats: [
          { value: 12840, decimals: 0 },
          { value: 0.918, decimals: 3 },
          { value: 0.41, suffix: "×", decimals: 2 },
        ],
        source: "GPU-A · batched serving",
      },
    },
  ],
};
