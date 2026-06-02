"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Figure,
  ReplayButton,
  clamp,
  uid,
  useInView,
  useMeasure,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface Annotation {
  /** Literal substring of the transcript to highlight (first match). */
  spanText?: string;
  /** Alternatively, highlight by inclusive token index range. */
  start?: number;
  end?: number;
  /** Short eyebrow label, e.g. "NLA on 'rabbit'". */
  label: string;
  /** Explanation paragraph for the card. */
  note: string;
  /** Optional override color; falls back to the rotating series ramp. */
  color?: string;
}

export interface AnnotatedTranscriptProps {
  text?: string;
  annotations?: Annotation[];
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Tokenization                                                       */
/* ------------------------------------------------------------------ */

interface Token {
  /** Index among non-whitespace word tokens (used for start/end ranges). */
  wordIndex: number;
  text: string;
  isSpace: boolean;
  isBreak: boolean;
  charStart: number;
  charEnd: number;
}

/** Split into word/space/newline tokens, preserving every character. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\n)|(\s+)|([^\s]+)/g;
  let m: RegExpExecArray | null;
  let wordIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const charStart = m.index;
    const charEnd = m.index + m[0].length;
    if (m[1] !== undefined) {
      tokens.push({ wordIndex: -1, text: "\n", isSpace: false, isBreak: true, charStart, charEnd });
    } else if (m[2] !== undefined) {
      tokens.push({ wordIndex: -1, text: m[2], isSpace: true, isBreak: false, charStart, charEnd });
    } else {
      tokens.push({ wordIndex: wordIndex++, text: m[3], isSpace: false, isBreak: false, charStart, charEnd });
    }
  }
  return tokens;
}

/** Resolve each annotation to a [charStart, charEnd) range in the text. */
function resolveRanges(text: string, tokens: Token[], annotations: Annotation[]) {
  const words = tokens.filter((t) => t.wordIndex >= 0);
  return annotations
    .map((a, ai) => {
      let from = -1;
      let to = -1;
      if (a.spanText && a.spanText.length > 0) {
        const idx = text.indexOf(a.spanText);
        if (idx >= 0) {
          from = idx;
          to = idx + a.spanText.length;
        }
      } else if (typeof a.start === "number") {
        const startWord = words[clamp(a.start, 0, words.length - 1)];
        const endIdx = clamp(typeof a.end === "number" ? a.end : a.start, 0, words.length - 1);
        const endWord = words[endIdx];
        if (startWord && endWord) {
          from = startWord.charStart;
          to = endWord.charEnd;
        }
      }
      return { ...a, ai, from, to };
    })
    .filter((a) => a.from >= 0 && a.to > a.from);
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function AnnotatedTranscript({
  text = DEFAULT_TEXT,
  annotations = DEFAULT_ANNOTATIONS,
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1200,
}: AnnotatedTranscriptProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [inViewRef, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [stageRef, stage] = useMeasure<HTMLDivElement>();

  const idBase = useMemo(() => uid("annot"), []);
  const fallback = accent || p.accent;

  const tokens = useMemo(() => tokenize(text), [text]);
  const ranges = useMemo(() => resolveRanges(text, tokens, annotations), [text, tokens, annotations]);

  // Each resolved annotation gets a stable color from the series ramp.
  const colored = useMemo(
    () =>
      ranges.map((r, i) => ({
        ...r,
        tint: r.color || p.series[i % p.series.length] || fallback,
      })),
    [ranges, p.series, fallback],
  );

  // Per-token render plan: for each token index, which annotation covers it and
  // whether it is the first covered token of that span (gets the ref + rail).
  const plan = useMemo(() => {
    const cover = new Map<number, (typeof colored)[number]>();
    const firstToken = new Map<number, number>(); // annotation ai -> token index
    tokens.forEach((tk, ti) => {
      if (tk.wordIndex < 0) return;
      const hit = colored.find((c) => tk.charStart >= c.from && tk.charEnd <= c.to);
      if (!hit) return;
      cover.set(ti, hit);
      if (!firstToken.has(hit.ai)) firstToken.set(hit.ai, ti);
    });
    const firstByToken = new Set(firstToken.values());
    return { cover, firstByToken };
  }, [tokens, colored]);

  // Refs to the rendered highlight span (the marker) and the annotation card.
  const spanRefs = useRef<Map<number, HTMLSpanElement | null>>(new Map());
  const cardRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  type Conn = { ai: number; x1: number; y1: number; x2: number; y2: number; tint: string };
  const [conns, setConns] = useState<Conn[]>([]);

  const measure = () => {
    const host = stageRef.current;
    if (!host) return;
    const base = host.getBoundingClientRect();
    const next: Conn[] = [];
    for (const c of colored) {
      const span = spanRefs.current.get(c.ai);
      const card = cardRefs.current.get(c.ai);
      if (!span || !card) continue;
      const sr = span.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      // Anchor on the right edge / mid-height of the highlighted span.
      const x1 = sr.right - base.left;
      const y1 = sr.top - base.top + sr.height / 2;
      // Anchor on the left edge / mid-height of the card.
      const x2 = cr.left - base.left;
      const y2 = cr.top - base.top + cr.height / 2;
      next.push({ ai: c.ai, x1, y1, x2, y2, tint: c.tint });
    }
    setConns(next);
  };

  // Re-measure whenever layout-affecting inputs change. useLayoutEffect avoids a
  // visible flash of mispositioned connectors before paint.
  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.width, stage.height, colored, token]);

  // One more pass after fonts settle (web fonts can reflow word wrapping).
  useEffect(() => {
    const id = window.setTimeout(measure, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.width, colored, token]);

  const dur = reduced ? 0 : duration / 1000;
  const stepDelay = colored.length > 1 ? Math.min(0.22, (duration / 1000) * 0.32) : 0;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={inViewRef} className="group/transcript relative">
        <div
          ref={stageRef}
          className="relative grid gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
        >
          {/* ---- Transcript column ---- */}
          <div className="relative">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
                transcript
              </span>
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                {colored.length} annotation{colored.length === 1 ? "" : "s"}
              </span>
            </div>

            <p className="whitespace-pre-wrap break-words font-mono text-[13.5px] leading-[2.05] text-ink">
              {tokens.map((tk, ti) => {
                if (tk.isBreak) return <br key={`br-${ti}`} />;
                if (tk.isSpace) return <span key={`sp-${ti}`}>{tk.text}</span>;

                // Which annotation covers this word token?
                const c = plan.cover.get(ti);
                if (!c) {
                  return <span key={`w-${ti}`}>{tk.text}</span>;
                }

                // The first covered token of a span carries the ref + rail.
                const firstTokenOfSpan = plan.firstByToken.has(ti);

                return (
                  <motion.span
                    key={`w-${ti}`}
                    ref={
                      firstTokenOfSpan
                        ? (el: HTMLSpanElement | null) => {
                            spanRefs.current.set(c.ai, el);
                          }
                        : undefined
                    }
                    className="relative rounded-[3px] px-[2px] py-[1.5px] font-medium text-ink"
                    initial={false}
                    animate={{
                      backgroundColor: inView ? withAlpha(c.tint, 0.26) : withAlpha(c.tint, 0),
                      boxShadow: inView
                        ? `inset 0 -0.55em 0 ${withAlpha(c.tint, 0.22)}`
                        : `inset 0 -0.55em 0 ${withAlpha(c.tint, 0)}`,
                    }}
                    transition={{
                      duration: reduced ? 0 : 0.45,
                      delay: reduced ? 0 : 0.2 + c.ai * stepDelay,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    style={{ WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone" }}
                  >
                    {firstTokenOfSpan && (
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute -left-[3px] top-0 h-full w-[2.5px] rounded-full"
                        style={{ backgroundColor: c.tint }}
                        initial={false}
                        animate={{ opacity: inView ? 1 : 0, scaleY: inView ? 1 : 0.2 }}
                        transition={{
                          duration: reduced ? 0 : 0.4,
                          delay: reduced ? 0 : 0.2 + c.ai * stepDelay,
                        }}
                      />
                    )}
                    {tk.text}
                  </motion.span>
                );
              })}
            </p>
          </div>

          {/* ---- Annotation cards column ---- */}
          <div className="relative flex flex-col gap-3">
            {colored.length === 0 && (
              <div className="rounded-reviz border border-dashed border-border px-4 py-6 text-center font-mono text-[10px] uppercase tracking-label text-ink-faint">
                no spans matched
              </div>
            )}
            {colored.map((c, i) => (
              <motion.div
                key={`${c.ai}-${token}`}
                ref={(el: HTMLDivElement | null) => {
                  cardRefs.current.set(c.ai, el);
                }}
                className="relative overflow-hidden rounded-reviz border border-border bg-surface px-4 py-3 shadow-float"
                initial={
                  reduced
                    ? false
                    : { opacity: 0, x: 16, filter: "blur(4px)" }
                }
                animate={{ opacity: inView ? 1 : 0, x: inView ? 0 : 16, filter: "blur(0px)" }}
                transition={{
                  duration: dur * 0.6,
                  delay: reduced ? 0 : 0.24 + i * stepDelay,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {/* color rail */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ backgroundColor: c.tint }}
                />
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.tint, boxShadow: `0 0 0 3px ${withAlpha(c.tint, 0.16)}` }}
                  />
                  <span
                    className="font-mono text-[10.5px] uppercase tracking-label"
                    style={{ color: c.tint }}
                  >
                    {c.label}
                  </span>
                  <span className="ml-auto font-mono text-[9.5px] tabular-nums text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{c.note}</p>
              </motion.div>
            ))}
          </div>

          {/* ---- Connector overlay ---- */}
          <svg
            className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full md:block"
            width={stage.width || undefined}
            height={stage.height || undefined}
            aria-hidden
          >
            <defs>
              <filter id={`${idBase}-glow`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <AnimatePresence>
              {conns.map((c, i) => {
                // Smooth S-curve from span (right) to card (left).
                const dx = Math.max(28, (c.x2 - c.x1) * 0.55);
                const d = `M ${c.x1} ${c.y1} C ${c.x1 + dx} ${c.y1}, ${c.x2 - dx} ${c.y2}, ${c.x2} ${c.y2}`;
                const delay = reduced ? 0 : 0.34 + i * stepDelay;
                return (
                  <g key={`${c.ai}-${token}`}>
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={c.tint}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeOpacity={0.85}
                      filter={`url(#${idBase}-glow)`}
                      initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 0.85 : 0 }}
                      transition={{ duration: dur * 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <motion.circle
                      cx={c.x1}
                      cy={c.y1}
                      r={2.6}
                      fill={c.tint}
                      initial={reduced ? false : { scale: 0, opacity: 0 }}
                      animate={{ scale: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                      transition={{ duration: reduced ? 0 : 0.3, delay }}
                      style={{ transformOrigin: `${c.x1}px ${c.y1}px` }}
                    />
                    <motion.circle
                      cx={c.x2}
                      cy={c.y2}
                      r={3.2}
                      fill={p.surface}
                      stroke={c.tint}
                      strokeWidth={1.5}
                      initial={reduced ? false : { scale: 0, opacity: 0 }}
                      animate={{ scale: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                      transition={{
                        duration: reduced ? 0 : 0.3,
                        delay: delay + dur * 0.55,
                      }}
                      style={{ transformOrigin: `${c.x2}px ${c.y2}px` }}
                    />
                  </g>
                );
              })}
            </AnimatePresence>
          </svg>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            connectors trace model spans to interpretations
          </span>
          <ReplayButton
            onClick={replay}
            className="opacity-0 transition-opacity group-hover/transcript:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_TEXT =
  "He saw a carrot and had to grab it,\n" +
  "His hunger was like a starving rabbit.";

const DEFAULT_ANNOTATIONS: Annotation[] = [
  {
    spanText: "rabbit",
    label: "Forward planning",
    note: "Before writing the line, the model has already settled on 'rabbit' as the rhyme target. Activations encoding the planned word appear many tokens early — it writes toward a goal it set in advance.",
  },
  {
    spanText: "carrot",
    label: "Backward constraint",
    note: "'Carrot' is chosen partly to set up the eventual rhyme. The planned end-word reaches back and shapes earlier word choices, not just the next token.",
  },
];

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "annotated-transcript",
  name: "Annotated Transcript",
  category: "interpretability",
  description:
    "A block of model text with marker-highlighted spans wired by animated leader lines to interpretation cards — the canonical way to narrate what a model is doing inside a transcript.",
  tags: ["interpretability", "transcript", "annotation", "attention", "callout", "highlight"],
  badges: ["animated", "interactive", "themed", "responsive"],
  exportName: "AnnotatedTranscript",
  sourcePath: "interpretability/AnnotatedTranscript",
  aspect: 16 / 9,
  controls: [
    {
      key: "text",
      label: "Transcript text",
      type: "textarea",
      group: "Data",
      rows: 4,
      default: DEFAULT_TEXT,
    },
    {
      key: "annotations",
      label: "Annotations",
      type: "json",
      group: "Data",
      help: "Each: { spanText (or start/end word index), label, note, color? }",
      default: DEFAULT_ANNOTATIONS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent (fallback)", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1200,
      min: 0,
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "planning-in-poetry",
      name: "Planning in poetry",
      props: {
        title: "Planning in poetry",
        caption:
          "Aria plans its rhyme before writing the line — the end-word is decided, then the sentence is composed to reach it.",
        source: "Internal study · On the Biology of a Large Language Model",
        text:
          "He saw a carrot and had to grab it,\nHis hunger was like a starving rabbit.",
        annotations: DEFAULT_ANNOTATIONS,
      },
    },
    {
      id: "eval-awareness",
      name: "Evaluation awareness",
      props: {
        title: "Evaluation awareness",
        caption:
          "Mid-transcript, a feature that fires on 'being tested' activates — the model represents that it is inside an evaluation.",
        source: "Interpretability team",
        text:
          "This looks like a textbook safety probe, so I should be careful here. The phrasing of the question is exactly the kind a red-teamer would use to check whether I follow my guidelines.",
        annotations: [
          {
            spanText: "safety probe",
            label: "Eval-awareness feature",
            note: "A sparse feature that activates on cues of being evaluated lights up here — the model has classified the prompt as a test rather than a genuine user request.",
          },
          {
            spanText: "red-teamer",
            label: "Adversary model",
            note: "The model explicitly represents an adversarial interlocutor. Downstream, this shifts its behavior toward caution and guideline-checking.",
          },
          {
            spanText: "follow my guidelines",
            label: "Policy invocation",
            note: "Activation routes into refusal / compliance circuitry — the awareness of being tested is causally upstream of more conservative outputs.",
          },
        ],
      },
    },
  ],
};
