"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Check } from "lucide-react";
import {
  Figure,
  ReplayButton,
  cn,
  clamp,
  mix,
  readableOn,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  type RevizMeta,
} from "@/reviz";

interface Candidate {
  /** The candidate token text (rendered mono, on the left). */
  token: string;
  /** Probability in [0,1]. */
  prob: number;
  /** Whether this is the chosen / ground-truth token (accented). */
  chosen?: boolean;
}

export interface TokenProbabilitiesProps {
  candidates?: Candidate[];
  context?: string;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  showPercent?: boolean;
  duration?: number;
}

const DEFAULT_CANDIDATES: Candidate[] = [
  { token: "Paris", prob: 0.612, chosen: true },
  { token: "the", prob: 0.121 },
  { token: "located", prob: 0.083 },
  { token: "a", prob: 0.052 },
  { token: "France", prob: 0.038 },
  { token: "famous", prob: 0.027 },
  { token: "home", prob: 0.019 },
  { token: "known", prob: 0.014 },
];

/** Render a visible glyph for whitespace / newline tokens. */
function displayToken(t: string): string {
  if (t === " ") return "␣";
  if (t === "\n") return "\\n";
  if (t === "\t") return "\\t";
  if (t === "") return "∅";
  return t.replace(/^ /, "␣").replace(/\n/g, "\\n");
}

export default function TokenProbabilities({
  candidates = DEFAULT_CANDIDATES,
  context = "The capital of France is",
  title = "",
  caption = "",
  source = "",
  color = "",
  showPercent = true,
  duration = 900,
}: TokenProbabilitiesProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token: replayToken, replay } = useReplay();

  const rows = useMemo(() => {
    const list = (candidates ?? []).filter((c) => c && typeof c.prob === "number");
    const max = Math.max(1e-6, ...list.map((c) => c.prob));
    return list.map((c) => ({
      ...c,
      prob: clamp(c.prob, 0, 1),
      // Bar width is relative to the top candidate so the leader fills the track.
      frac: clamp(c.prob / max, 0, 1),
    }));
  }, [candidates]);

  const animate = inView && !reduced;
  const step = rows.length > 1 ? 0.055 : 0;
  const barDur = duration / 1000;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/tp relative flex flex-col gap-3">
        {context !== "" && (
          <motion.div
            key={`ctx-${replayToken}`}
            initial={animate ? { opacity: 0, y: -4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
          >
            <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
              context
            </span>
            <span className="rounded-md bg-surface-alt px-2 py-1 font-mono text-[12px] leading-snug text-ink-muted">
              {context}
              <span className="text-ink-faint"> &#9135;</span>
            </span>
          </motion.div>
        )}

        <ul className="flex flex-col gap-[7px]">
          {rows.map((row, i) => {
            const chosen = !!row.chosen;
            const barColor = chosen ? fill : mix(fill, p.inkFaint, 0.55);
            const labelColor = chosen ? p.ink : p.inkMuted;
            const pct = (row.prob * 100).toFixed(row.prob >= 0.1 ? 1 : 2);

            return (
              <li
                key={`${i}-${row.token}`}
                className="flex items-center gap-3"
                style={{ minWidth: 0 }}
              >
                {/* Token text */}
                <div className="flex w-[7.5rem] shrink-0 items-center justify-end gap-1.5 overflow-hidden">
                  {chosen && (
                    <motion.span
                      key={`chk-${replayToken}-${i}`}
                      initial={animate ? { scale: 0, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        delay: animate ? i * step + barDur * 0.55 : 0,
                        type: "spring",
                        stiffness: 420,
                        damping: 22,
                      }}
                      className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full"
                      style={{ background: fill, color: readableOn(fill) }}
                      title="Chosen token"
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </motion.span>
                  )}
                  <span
                    className={cn(
                      "truncate font-mono text-[12.5px] tabular-nums",
                      chosen && "font-semibold",
                    )}
                    style={{ color: labelColor }}
                    title={row.token}
                  >
                    {displayToken(row.token)}
                  </span>
                </div>

                {/* Probability track + bar */}
                <div className="relative h-6 min-w-0 flex-1">
                  <div
                    className="absolute inset-0 rounded-[5px]"
                    style={{ background: mix(p.surfaceAlt, p.canvas, 0.35) }}
                  />
                  <motion.div
                    key={`bar-${replayToken}-${i}`}
                    className="absolute inset-y-0 left-0 rounded-[5px]"
                    style={{
                      background: chosen
                        ? `linear-gradient(90deg, ${mix(barColor, p.surface, 0.18)}, ${barColor})`
                        : barColor,
                      boxShadow: chosen ? `0 0 0 1px ${mix(fill, p.ink, 0.12)}` : undefined,
                    }}
                    initial={animate ? { width: 0 } : false}
                    animate={{ width: `${Math.max(row.frac * 100, 0.5)}%` }}
                    transition={{
                      duration: barDur,
                      delay: animate ? i * step : 0,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                  {showPercent && (
                    <motion.span
                      key={`pct-${replayToken}-${i}`}
                      initial={animate ? { opacity: 0 } : false}
                      animate={{ opacity: 1 }}
                      transition={{ delay: animate ? i * step + barDur * 0.7 : 0, duration: 0.3 }}
                      className="absolute inset-y-0 right-2.5 flex items-center font-mono text-[11px] tabular-nums"
                      style={{ color: chosen ? p.ink : p.inkMuted }}
                    >
                      {pct}%
                    </motion.span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <ReplayButton
          onClick={replay}
          className="absolute -top-1 right-0 opacity-0 transition-opacity group-hover/tp:opacity-100"
        />
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "token-probabilities",
  name: "Token Probabilities",
  category: "interpretability",
  description:
    "The model's next-token distribution as a ranked bar list — token text on the left, probability bars growing in on the right, with the chosen token accented.",
  tags: ["tokens", "logits", "next-token", "distribution", "llm", "decoding"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "TokenProbabilities",
  sourcePath: "interpretability/TokenProbabilities",
  aspect: 16 / 11,
  controls: [
    {
      key: "candidates",
      label: "Candidates",
      type: "json",
      group: "Data",
      help: "Top-k tokens: [{ token, prob (0–1), chosen? }]",
      default: DEFAULT_CANDIDATES,
    },
    { key: "context", label: "Context", type: "text", group: "Data", default: "The capital of France is" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Bar color", type: "color", group: "Style", default: "" },
    { key: "showPercent", label: "Show percent", type: "boolean", group: "Style", default: true },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 900, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "capital",
      name: "Top-8 next tokens",
      props: {
        title: "Next-token distribution",
        context: "The capital of France is",
        caption: "Top-8 candidates ranked by probability after the prompt.",
        candidates: DEFAULT_CANDIDATES,
      },
    },
    {
      id: "code",
      name: "Code completion",
      props: {
        title: "Next-token prediction",
        context: "def fibonacci(n):\\n    return",
        candidates: [
          { token: " fib", prob: 0.41, chosen: true },
          { token: " n", prob: 0.22 },
          { token: " (", prob: 0.11 },
          { token: " fibonacci", prob: 0.09 },
          { token: " 1", prob: 0.07 },
          { token: " sum", prob: 0.05 },
          { token: " self", prob: 0.03 },
          { token: " a", prob: 0.02 },
        ],
        source: "greedy decode",
      },
    },
    {
      id: "sentiment",
      name: "Low-confidence step",
      props: {
        title: "Uncertain next token",
        context: "The review was overwhelmingly",
        caption: "A flat, high-entropy distribution where the model is unsure.",
        candidates: [
          { token: "positive", prob: 0.21, chosen: true },
          { token: "negative", prob: 0.19 },
          { token: "mixed", prob: 0.16 },
          { token: "good", prob: 0.13 },
          { token: "favorable", prob: 0.11 },
          { token: "critical", prob: 0.1 },
          { token: "harsh", prob: 0.06 },
          { token: "kind", prob: 0.04 },
        ],
      },
    },
  ],
};
