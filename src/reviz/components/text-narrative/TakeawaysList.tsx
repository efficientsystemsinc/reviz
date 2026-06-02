"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check, Star, Dot as DotIcon, type LucideIcon } from "lucide-react";
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
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

/** Bullet glyphs addressable by name; falls back to a check. */
const ICONS: Record<string, LucideIcon> = {
  check: Check,
  arrow: ArrowRight,
  star: Star,
  dot: DotIcon,
};

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Takeaway {
  lead: string;
  text?: string;
  /** Optional per-item icon override: check | arrow | star | dot. */
  icon?: string;
}

export interface TakeawaysListProps {
  title?: string;
  items?: Takeaway[];
  icon?: "check" | "arrow" | "star" | "dot";
  accent?: string;
  tone?: "neutral" | "highlight";
  caption?: string;
  source?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_ITEMS: Takeaway[] = [
  {
    lead: "Scale unlocks emergent reasoning.",
    text: "Chain-of-thought accuracy on Math-bench stays near chance until ~60B parameters, then climbs sharply — the capability is latent, not gradual.",
  },
  {
    lead: "RLHF aligns behavior, not knowledge.",
    text: "Preference tuning reshapes how the model answers without measurably changing what it knows on closed-book QA benchmarks.",
  },
  {
    lead: "Most pretraining tokens are redundant.",
    text: "Deduplicating the corpus removed 31% of tokens while improving held-out perplexity, suggesting quality dominates raw volume.",
  },
  {
    lead: "Interpretability scales with effort, not luck.",
    text: "Sparse autoencoders recover monosemantic features reliably once dictionary width exceeds the residual dimension by ~8×.",
  },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function TakeawaysList({
  title = "Key takeaways",
  items = DEFAULT_ITEMS,
  icon = "check",
  accent = "",
  tone = "highlight",
  caption = "",
  source = "",
  duration = 900,
}: TakeawaysListProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const clean = useMemo(
    () => (Array.isArray(items) ? items.filter((it) => it && (it.lead || it.text)) : []),
    [items],
  );
  const n = clean.length;
  const active = inView || reduced;
  const highlight = tone === "highlight";

  // Per-item stagger (seconds). Items rise in sequence after the header.
  const span = reduced ? 0 : duration / 1000;
  const step = n > 0 ? Math.min(0.12, (span * 0.55) / Math.max(1, n)) : 0;
  const ease = [0.22, 1, 0.36, 1] as const;

  // Card chrome: tinted wash for highlight, flat surface for neutral.
  const cardBg = highlight ? withAlpha(fill, p.mode === "dark" ? 0.06 : 0.04) : p.surface;
  const cardBorder = highlight ? withAlpha(fill, 0.3) : p.border;
  const iconWash = withAlpha(fill, p.mode === "dark" ? 0.18 : 0.13);
  const isDot = (name: string) => name === "dot";

  return (
    <Figure variant="plain" align="left" title="" caption={caption} source={source}>
      <div ref={ref} className="group/takeaways relative">
        <motion.section
          key={token}
          className="relative overflow-hidden rounded-reviz border"
          style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          initial={{ opacity: 0, y: reduced ? 0 : 14 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 14 }}
          transition={{ duration: reduced ? 0 : span * 0.9, ease }}
        >
          {/* Top accent rail that wipes across on entrance. */}
          <motion.span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[2.5px] origin-left"
            style={{
              background: `linear-gradient(to right, ${fill}, ${withAlpha(fill, 0.15)})`,
            }}
            initial={{ scaleX: reduced ? 1 : 0 }}
            animate={{ scaleX: active ? 1 : reduced ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : span, delay: reduced ? 0 : 0.05, ease }}
          />

          <div className="relative px-6 py-6 sm:px-7 sm:py-7">
            {/* Header: eyebrow-style mono title with a count chip. */}
            {title && (
              <motion.div
                className="mb-5 flex items-center gap-3"
                initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 8 }}
                transition={{ duration: reduced ? 0 : span * 0.6, delay: reduced ? 0 : 0.08, ease }}
              >
                <h3
                  className="font-mono text-[11px] font-semibold uppercase tracking-label leading-none"
                  style={{ color: fill }}
                >
                  {title}
                </h3>
                <span className="h-px flex-1" style={{ backgroundColor: withAlpha(fill, 0.25) }} aria-hidden />
                {n > 0 && (
                  <span
                    className="shrink-0 rounded-full px-2 py-[3px] font-mono text-[10px] font-semibold tabular-nums leading-none"
                    style={{ backgroundColor: withAlpha(fill, 0.14), color: fill }}
                  >
                    {n}
                  </span>
                )}
              </motion.div>
            )}

            <ul className="flex flex-col">
              {clean.map((it, i) => {
                const name = (it.icon || icon || "check").trim().toLowerCase();
                const Icon = ICONS[name] ?? Check;
                const dot = isDot(name);
                const d = reduced ? 0 : 0.14 + i * step;

                return (
                  <motion.li
                    key={i}
                    className="relative flex gap-3.5 border-t py-4 first:border-t-0 first:pt-0 last:pb-0 sm:gap-4"
                    style={{ borderColor: withAlpha(p.border, 0.7) }}
                    initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -10 }}
                    animate={{
                      opacity: active ? 1 : reduced ? 1 : 0,
                      x: active ? 0 : reduced ? 0 : -10,
                    }}
                    transition={{ duration: reduced ? 0 : span * 0.55, delay: d, ease }}
                  >
                    {/* Bullet glyph */}
                    <motion.span
                      className="mt-0.5 grid shrink-0 place-items-center rounded-full"
                      style={
                        dot
                          ? { height: 22, width: 22, color: fill }
                          : { height: 22, width: 22, backgroundColor: iconWash, color: fill }
                      }
                      initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.5 }}
                      animate={{
                        opacity: active ? 1 : reduced ? 1 : 0,
                        scale: active ? 1 : reduced ? 1 : 0.5,
                      }}
                      transition={{
                        duration: reduced ? 0 : 0.45,
                        delay: reduced ? 0 : d + 0.04,
                        ease: [0.34, 1.56, 0.64, 1],
                      }}
                    >
                      {dot ? (
                        <span
                          className="block rounded-full"
                          style={{ height: 7, width: 7, backgroundColor: fill }}
                          aria-hidden
                        />
                      ) : (
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
                      )}
                    </motion.span>

                    {/* Lead + supporting text */}
                    <div className="min-w-0 flex-1">
                      <span
                        className="font-sans text-[15px] font-semibold leading-snug text-ink"
                        style={highlight ? { color: mix(p.ink, fill, 0.18) } : undefined}
                      >
                        {it.lead}
                      </span>
                      {it.text && (
                        <p className="mt-1 max-w-prose text-pretty font-serif text-[13.5px] italic leading-relaxed text-ink-muted">
                          {it.text}
                        </p>
                      )}
                    </div>
                  </motion.li>
                );
              })}

              {n === 0 && (
                <li className="py-8 text-center font-mono text-[11px] uppercase tracking-label text-ink-faint">
                  No takeaways to display
                </li>
              )}
            </ul>
          </div>
        </motion.section>

        {n > 0 && (
          <div className="pointer-events-none absolute -bottom-2 right-0 translate-y-full pt-2 opacity-0 transition-opacity duration-200 group-hover/takeaways:pointer-events-auto group-hover/takeaways:opacity-100">
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
  id: "takeaways",
  name: "Takeaways List",
  category: "text-narrative",
  description:
    "A titled card of key takeaways — each a bullet glyph with a bold lead and a serif supporting line — that stagger in beneath a mono header with a live count.",
  tags: ["takeaways", "summary", "list", "narrative", "findings", "callout", "bullets"],
  badges: ["animated", "themed", "responsive"],
  exportName: "TakeawaysList",
  sourcePath: "text-narrative/TakeawaysList",
  aspect: 16 / 11,
  controls: [
    {
      key: "items",
      label: "Takeaways",
      type: "json",
      group: "Data",
      help: "[{ lead, text?, icon? }] — icon overrides the default per item (check | arrow | star | dot).",
      default: DEFAULT_ITEMS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Key takeaways" },
    {
      key: "icon",
      label: "Bullet icon",
      type: "select",
      group: "Style",
      default: "check",
      options: [
        { value: "check", label: "Check" },
        { value: "arrow", label: "Arrow" },
        { value: "star", label: "Star" },
        { value: "dot", label: "Dot" },
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
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 900,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "scaling-laws",
      name: "Scaling-laws paper",
      props: {
        title: "Key takeaways",
        icon: "check",
        tone: "highlight",
        items: DEFAULT_ITEMS,
        source: "Synthesized from public LLM scaling literature",
      },
    },
    {
      id: "robotics-eval",
      name: "Robotics eval report",
      props: {
        title: "What the eval taught us",
        icon: "arrow",
        tone: "highlight",
        items: [
          {
            lead: "Vision dominates failure modes.",
            text: "78% of dropped trajectories trace to perception, not control — the policy acts correctly on the states it actually perceives.",
          },
          {
            lead: "Latency is the silent regression.",
            text: "Success rate held at 91%, but p99 inference latency rose 40 ms after the encoder upgrade, breaching the real-time budget.",
          },
          {
            lead: "Sim-to-real gap narrows with domain randomization.",
            text: "Randomizing lighting and friction closed the gap from 14 to 4 points without any real-world fine-tuning.",
          },
        ],
        source: "Internal manipulation benchmark · 40 held-out tasks",
      },
    },
    {
      id: "neutral-summary",
      name: "Neutral summary",
      props: {
        title: "Summary",
        icon: "dot",
        tone: "neutral",
        items: [
          {
            lead: "Speculative decoding cut median latency 2.3×.",
            text: "End-to-end serving dropped from 740 ms to 322 ms with no measurable quality regression.",
          },
          {
            lead: "Quantization to 4-bit was free below 7B params.",
            text: "Eval scores stayed within noise; above 13B, a 0.6-point drop appeared on reasoning suites.",
          },
          {
            lead: "Batching beats hardware upgrades for throughput.",
            text: "Continuous batching delivered a larger gain than moving from GPU-A to GPU-B at the same batch policy.",
          },
        ],
      },
    },
  ],
};
