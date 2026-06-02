"use client";

import { motion } from "framer-motion";
import {
  Beaker,
  BrainCircuit,
  Compass,
  Eye,
  Feather,
  Gauge,
  Lightbulb,
  Microscope,
  Quote,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/** Curated, research-relevant lucide icons addressable by name. */
const ICONS: Record<string, LucideIcon> = {
  lightbulb: Lightbulb,
  sparkles: Sparkles,
  feather: Feather,
  brain: BrainCircuit,
  microscope: Microscope,
  beaker: Beaker,
  target: Target,
  gauge: Gauge,
  trending: TrendingUp,
  zap: Zap,
  eye: Eye,
  compass: Compass,
  quote: Quote,
};

export interface KeyInsightProps {
  title?: string;
  subtitle?: string;
  body?: string;
  eyebrow?: string;
  icon?: string;
  accent?: string;
  tone?: "neutral" | "highlight";
  caption?: string;
  source?: string;
  /** Figure title (chrome above the card). Distinct from the card's own title. */
  title_?: string;
  duration?: number;
}

export default function KeyInsight({
  title = "Planning in poetry",
  subtitle = "The model decides how a line will end before it begins writing it.",
  body = "When asked to complete a rhyming couplet, Aria appears to plan the rhyming word several tokens ahead — then composes the intervening words to land on that target. The forethought is visible in the residual stream long before the final token is produced, evidence that the model reasons over the whole line rather than generating it word by word.",
  eyebrow = "Key insight",
  icon = "feather",
  accent = "",
  tone = "highlight",
  caption = "",
  source = "",
  title_ = "",
  duration = 800,
}: KeyInsightProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const fill = accent || p.accent;
  const Icon = useMemo<LucideIcon | null>(() => {
    const key = icon.trim().toLowerCase();
    if (!key) return null;
    return ICONS[key] ?? Lightbulb;
  }, [icon]);

  const highlight = tone === "highlight";
  const sec = duration / 1000;
  const active = inView || reduced;

  // Soft tinted wash for the highlight tone; flat surface for neutral.
  const cardBg = highlight ? withAlpha(fill, p.mode === "dark" ? 0.08 : 0.05) : p.surface;
  const cardBorder = highlight ? withAlpha(fill, 0.32) : p.border;
  const iconWash = withAlpha(fill, p.mode === "dark" ? 0.16 : 0.12);

  const ease = [0.22, 1, 0.36, 1] as const;
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 12 },
    animate: active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 12 },
    transition: { duration: sec, delay: reduced ? 0 : delay, ease },
  });

  return (
    <Figure variant="plain" align="left" title={title_} caption={caption} source={source}>
      <div ref={ref} className="group/insight relative">
        <motion.article
          key={token}
          className="relative overflow-hidden rounded-reviz border"
          style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          initial={{ opacity: 0, y: reduced ? 0 : 16 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 16 }}
          transition={{ duration: sec, ease }}
        >
          {/* Left accent rail that wipes downward on entrance. */}
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] origin-top"
            style={{ backgroundColor: fill }}
            initial={{ scaleY: reduced ? 1 : 0 }}
            animate={{ scaleY: active ? 1 : reduced ? 1 : 0 }}
            transition={{ duration: sec * 0.9, delay: reduced ? 0 : 0.05, ease }}
          />

          {/* Faint quotation glyph in the corner for the highlight tone. */}
          {highlight && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -right-3 -top-5 select-none font-serif leading-none"
              style={{ color: withAlpha(fill, p.mode === "dark" ? 0.1 : 0.08), fontSize: 120 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: sec * 1.2, delay: reduced ? 0 : 0.1, ease }}
            >
              &rdquo;
            </motion.div>
          )}

          <div className="relative flex flex-col gap-4 px-6 py-5 sm:flex-row sm:gap-5 sm:px-7 sm:py-6">
            {Icon && (
              <motion.div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: iconWash, color: fill }}
                initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
                animate={
                  active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reduced ? 1 : 0.6 }
                }
                transition={{
                  duration: sec * 0.7,
                  delay: reduced ? 0 : 0.12,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </motion.div>
            )}

            <div className="min-w-0 flex-1">
              {eyebrow && (
                <motion.div
                  className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-label"
                  style={{ color: fill }}
                  {...rise(0.1)}
                >
                  <span>{eyebrow}</span>
                  <span
                    className="h-px w-8"
                    style={{ backgroundColor: withAlpha(fill, 0.4) }}
                    aria-hidden
                  />
                </motion.div>
              )}

              {title && (
                <motion.h3
                  className="text-balance font-sans text-[22px] font-semibold leading-tight text-ink sm:text-[26px]"
                  {...rise(0.16)}
                >
                  {title}
                </motion.h3>
              )}

              {subtitle && (
                <motion.p
                  className="mt-1.5 text-pretty font-serif text-[15px] italic leading-snug text-ink-muted sm:text-[16px]"
                  {...rise(0.22)}
                >
                  {subtitle}
                </motion.p>
              )}

              {body && (
                <>
                  <motion.div
                    aria-hidden
                    className="mt-4 h-px w-full origin-left"
                    style={{ backgroundColor: p.border }}
                    initial={{ scaleX: reduced ? 1 : 0 }}
                    animate={{ scaleX: active ? 1 : reduced ? 1 : 0 }}
                    transition={{ duration: sec, delay: reduced ? 0 : 0.28, ease }}
                  />
                  <motion.p
                    className="mt-4 text-pretty font-sans text-[14.5px] leading-relaxed text-ink-muted"
                    {...rise(0.34)}
                  >
                    {body}
                  </motion.p>
                </>
              )}
            </div>
          </div>

          {/* Bottom hairline accent that fades in last, anchoring the card. */}
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
        </motion.article>

        <div className="pointer-events-none absolute -bottom-2 right-0 translate-y-full pt-2 opacity-0 transition-opacity duration-200 group-hover/insight:pointer-events-auto group-hover/insight:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "key-insight",
  name: "Key Insight",
  category: "text-narrative",
  description:
    "An insight header that frames a single key finding with an eyebrow tag, bold title, serif subtitle, and supporting body in a softly accented card.",
  tags: ["insight", "callout", "header", "narrative", "finding", "takeaway"],
  badges: ["animated", "themed", "responsive"],
  exportName: "KeyInsight",
  sourcePath: "text-narrative/KeyInsight",
  aspect: 16 / 7,
  controls: [
    {
      key: "title",
      label: "Title",
      type: "text",
      group: "Labels",
      default: "Planning in poetry",
    },
    {
      key: "subtitle",
      label: "Subtitle",
      type: "text",
      group: "Labels",
      default: "The model decides how a line will end before it begins writing it.",
    },
    {
      key: "body",
      label: "Body",
      type: "textarea",
      group: "Labels",
      rows: 5,
      default:
        "When asked to complete a rhyming couplet, Aria appears to plan the rhyming word several tokens ahead — then composes the intervening words to land on that target. The forethought is visible in the residual stream long before the final token is produced, evidence that the model reasons over the whole line rather than generating it word by word.",
    },
    {
      key: "eyebrow",
      label: "Eyebrow tag",
      type: "text",
      group: "Labels",
      default: "Key insight",
    },
    {
      key: "icon",
      label: "Icon",
      type: "select",
      group: "Style",
      default: "feather",
      options: [
        { value: "", label: "None" },
        { value: "feather", label: "Feather" },
        { value: "lightbulb", label: "Lightbulb" },
        { value: "sparkles", label: "Sparkles" },
        { value: "brain", label: "Brain" },
        { value: "microscope", label: "Microscope" },
        { value: "beaker", label: "Beaker" },
        { value: "target", label: "Target" },
        { value: "gauge", label: "Gauge" },
        { value: "trending", label: "Trending up" },
        { value: "zap", label: "Zap" },
        { value: "eye", label: "Eye" },
        { value: "compass", label: "Compass" },
        { value: "quote", label: "Quote" },
      ],
    },
    {
      key: "tone",
      label: "Tone",
      type: "select",
      group: "Style",
      default: "highlight",
      options: [
        { value: "highlight", label: "Highlight (tinted)" },
        { value: "neutral", label: "Neutral (surface)" },
      ],
    },
    { key: "accent", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "title_", label: "Figure title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 800,
      min: 0,
      max: 2500,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "planning-poetry",
      name: "Planning in poetry",
      props: {
        eyebrow: "Key insight",
        icon: "feather",
        tone: "highlight",
        title: "Planning in poetry",
        subtitle: "The model decides how a line will end before it begins writing it.",
        body: "When asked to complete a rhyming couplet, Aria appears to plan the rhyming word several tokens ahead — then composes the intervening words to land on that target. The forethought is visible in the residual stream long before the final token is produced, evidence that the model reasons over the whole line rather than generating it word by word.",
        source: "Research lab · Tracing the thoughts of a language model",
      },
    },
    {
      id: "shared-feature-space",
      name: "Universal concepts",
      props: {
        eyebrow: "Finding",
        icon: "brain",
        tone: "highlight",
        title: "A shared conceptual space across languages",
        subtitle: "The same abstract feature fires for a concept whether the prompt is in English, French, or Chinese.",
        body: "Probing the model on the antonym of \"small\" reveals a language-agnostic representation of bigness that is activated before any specific word is chosen, then translated into the prompt's language at the output. The overlap grows with model scale, suggesting larger models build a more universal interlingua.",
      },
    },
    {
      id: "latency-takeaway",
      name: "Neutral takeaway",
      props: {
        eyebrow: "Takeaway",
        icon: "gauge",
        tone: "neutral",
        title: "Speculative decoding cut p50 latency by 2.3×",
        subtitle: "End-to-end serving latency dropped from 740 ms to 322 ms at the median.",
        body: "With a drafter accepting 3.1 tokens per verification step on average, throughput rose without measurable quality regression on held-out eval suites. Tail latency (p99) improved more modestly, gated by the verifier's batch-formation window under bursty load.",
        source: "Internal serving benchmark · n = 50k requests",
      },
    },
  ],
};
