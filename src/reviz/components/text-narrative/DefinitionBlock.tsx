"use client";

import { motion } from "framer-motion";
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

export interface DefinitionBlockProps {
  /** The headword being defined (bold, large). */
  term?: string;
  /** A mono tag beside the term — pronunciation, part of speech, or abbreviation. */
  tag?: string;
  /** The definition body. */
  definition?: string;
  /** Optional worked example, shown in a tinted sub-box. */
  example?: string;
  /** Label shown above the example box. */
  exampleLabel?: string;
  /** Accent color; defaults to the palette accent. */
  accent?: string;
  /** Figure title (chrome above the card). */
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

export default function DefinitionBlock({
  term = "Monte Carlo Tree Search",
  tag = "MCTS · noun",
  definition = "A best-first search algorithm that incrementally builds a game tree by simulating rollouts. Each iteration runs four phases — selection, expansion, simulation, and backpropagation — balancing exploration and exploitation via an upper-confidence bound (UCB) over visited nodes. Given more compute, its value estimates provably converge toward the minimax optimum.",
  example = "AlphaGo paired MCTS with a policy network (to bias which moves to expand) and a value network (to replace random rollouts), letting the search spend simulations where they mattered most — the key to defeating a human Go champion.",
  exampleLabel = "Example",
  accent = "",
  title = "",
  caption = "",
  source = "",
  duration = 800,
}: DefinitionBlockProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const fill = accent || p.accent;
  const sec = duration / 1000;
  const active = inView || reduced;

  const dark = p.mode === "dark";
  const exampleBg = withAlpha(fill, dark ? 0.09 : 0.06);
  const exampleBorder = withAlpha(fill, 0.28);

  const ease = [0.22, 1, 0.36, 1] as const;
  // When the entrance is already triggered at mount (reduced motion, or the
  // headless-QA "eager" path), skip `initial` so the element renders directly
  // at its resting state. This guarantees a correct *static* frame even if a
  // delayed entrance tween never gets to start; otherwise we keep the full
  // staggered rise on a normal scroll-into-view.
  const rise = (delay: number) => ({
    initial: active ? (false as const) : { opacity: 0, y: reduced ? 0 : 10 },
    animate: active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 10 },
    transition: { duration: sec, delay: reduced ? 0 : delay, ease },
  });

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/def relative">
        <motion.article
          key={token}
          className="relative overflow-hidden rounded-reviz border bg-surface"
          style={{ borderColor: p.border }}
          initial={active ? false : { opacity: 0, y: reduced ? 0 : 14 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 14 }}
          transition={{ duration: sec, ease }}
        >
          {/* Left accent rail that wipes downward on entrance. */}
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] origin-top"
            style={{ backgroundColor: fill }}
            initial={active ? false : { scaleY: reduced ? 1 : 0 }}
            animate={{ scaleY: active ? 1 : reduced ? 1 : 0 }}
            transition={{ duration: sec * 0.9, delay: reduced ? 0 : 0.05, ease }}
          />

          <div className="relative flex flex-col gap-4 px-6 py-5 sm:px-8 sm:py-7">
            {/* Term + mono tag, sitting on an accent underline. */}
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                {term && (
                  <motion.h3
                    className="text-balance font-sans text-[24px] font-semibold leading-tight text-ink sm:text-[28px]"
                    {...rise(0.08)}
                  >
                    {term}
                  </motion.h3>
                )}
                {tag && (
                  <motion.span
                    className="font-mono text-[11px] uppercase tracking-label"
                    style={{ color: fill }}
                    {...rise(0.14)}
                  >
                    {tag}
                  </motion.span>
                )}
              </div>

              {/* Accent rule that draws in beneath the term. */}
              <motion.div
                aria-hidden
                className="mt-3 h-[2px] origin-left rounded-full"
                style={{
                  background: `linear-gradient(to right, ${fill}, ${withAlpha(fill, 0)})`,
                }}
                initial={active ? false : { scaleX: reduced ? 1 : 0 }}
                animate={{ scaleX: active ? 1 : reduced ? 1 : 0 }}
                transition={{ duration: sec * 1.1, delay: reduced ? 0 : 0.18, ease }}
              />
            </div>

            {/* Definition body. */}
            {definition && (
              <motion.p
                className="text-pretty font-sans text-[15px] leading-relaxed text-ink-muted sm:text-[15.5px]"
                {...rise(0.26)}
              >
                {definition}
              </motion.p>
            )}

            {/* Optional example in a tinted sub-box. */}
            {example && (
              <motion.div
                className="relative overflow-hidden rounded-xl border px-5 py-4"
                style={{ backgroundColor: exampleBg, borderColor: exampleBorder }}
                initial={active ? false : { opacity: 0, y: reduced ? 0 : 12 }}
                animate={
                  active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 12 }
                }
                transition={{ duration: sec, delay: reduced ? 0 : 0.36, ease }}
              >
                {exampleLabel && (
                  <div
                    className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-label"
                    style={{ color: fill }}
                  >
                    <span>{exampleLabel}</span>
                    <span
                      aria-hidden
                      className="h-px flex-1"
                      style={{ backgroundColor: withAlpha(fill, 0.3) }}
                    />
                  </div>
                )}
                <p className="text-pretty font-serif text-[14px] italic leading-relaxed text-ink">
                  {example}
                </p>
              </motion.div>
            )}
          </div>

          {/* Bottom hairline accent that fades in last, anchoring the card. */}
          <motion.span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px"
            style={{
              background: `linear-gradient(to right, ${withAlpha(fill, 0.5)}, ${withAlpha(fill, 0)})`,
            }}
            initial={active ? false : { opacity: 0 }}
            animate={{ opacity: active ? 1 : 0 }}
            transition={{ duration: sec, delay: reduced ? 0 : 0.46, ease }}
          />
        </motion.article>

        <div className="pointer-events-none absolute -bottom-2 right-0 translate-y-full pt-2 opacity-0 transition-opacity duration-200 group-hover/def:pointer-events-auto group-hover/def:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "definition-block",
  name: "Definition Block",
  category: "text-narrative",
  description:
    "A glossary-style term definition: a bold headword with a mono pronunciation/part-of-speech tag, an accent rule, the definition body, and an optional worked example in a tinted sub-box.",
  tags: ["definition", "glossary", "term", "narrative", "callout", "explainer"],
  badges: ["animated", "themed", "responsive"],
  exportName: "DefinitionBlock",
  sourcePath: "text-narrative/DefinitionBlock",
  aspect: 16 / 8,
  controls: [
    {
      key: "term",
      label: "Term",
      type: "text",
      group: "Labels",
      default: "Monte Carlo Tree Search",
    },
    {
      key: "tag",
      label: "Tag (pronunciation / part of speech)",
      type: "text",
      group: "Labels",
      default: "MCTS · noun",
    },
    {
      key: "definition",
      label: "Definition",
      type: "textarea",
      group: "Labels",
      rows: 5,
      default:
        "A best-first search algorithm that incrementally builds a game tree by simulating rollouts. Each iteration runs four phases — selection, expansion, simulation, and backpropagation — balancing exploration and exploitation via an upper-confidence bound (UCB) over visited nodes. Given more compute, its value estimates provably converge toward the minimax optimum.",
    },
    {
      key: "example",
      label: "Example",
      type: "textarea",
      group: "Labels",
      rows: 4,
      default:
        "AlphaGo paired MCTS with a policy network (to bias which moves to expand) and a value network (to replace random rollouts), letting the search spend simulations where they mattered most — the key to defeating a human Go champion.",
    },
    {
      key: "exampleLabel",
      label: "Example label",
      type: "text",
      group: "Labels",
      default: "Example",
    },
    { key: "accent", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "title", label: "Figure title", type: "text", group: "Labels", default: "" },
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
      id: "mcts",
      name: "MCTS",
      props: {
        term: "Monte Carlo Tree Search",
        tag: "MCTS · noun",
        definition:
          "A best-first search algorithm that incrementally builds a game tree by simulating rollouts. Each iteration runs four phases — selection, expansion, simulation, and backpropagation — balancing exploration and exploitation via an upper-confidence bound (UCB) over visited nodes. Given more compute, its value estimates provably converge toward the minimax optimum.",
        example:
          "AlphaGo paired MCTS with a policy network (to bias which moves to expand) and a value network (to replace random rollouts), letting the search spend simulations where they mattered most — the key to defeating a human Go champion.",
        exampleLabel: "Example",
        source: "Glossary · Reinforcement learning",
      },
    },
    {
      id: "softmax",
      name: "Softmax temperature",
      props: {
        term: "Temperature",
        tag: "τ · scalar",
        definition:
          "A scalar that rescales logits before the softmax: probabilities are computed over zᵢ / τ. As τ → 0 the distribution sharpens toward a hard argmax (deterministic, repetitive); as τ grows it flattens toward uniform (diverse, but incoherent). Sampling temperature is the simplest knob for trading off determinism against creativity at decode time.",
        example:
          "Setting τ = 0.7 keeps a chat model on-topic while still varying phrasing between runs; τ = 1.4 is common for brainstorming, where surprising continuations are desirable.",
        exampleLabel: "In practice",
        source: "Glossary · Decoding strategies",
      },
    },
    {
      id: "overfitting",
      name: "Overfitting",
      props: {
        term: "Overfitting",
        tag: "/ˈoʊvərˌfɪtɪŋ/ · noun",
        definition:
          "The failure mode in which a model memorizes idiosyncrasies and noise of its training set instead of the underlying signal, yielding low training error but poor generalization to unseen data. It is diagnosed by a widening gap between training and validation loss and mitigated with regularization, early stopping, more data, or reduced capacity.",
        example:
          "A classifier reaching 99.8% train accuracy but only 71% on a held-out split is almost certainly overfitting — the validation curve turns upward while the training curve keeps falling.",
        exampleLabel: "Diagnostic",
        source: "Glossary · Generalization",
      },
    },
  ],
};
