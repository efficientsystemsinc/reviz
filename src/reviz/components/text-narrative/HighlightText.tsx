"use client";

import { motion } from "framer-motion";
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

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * A segment of the paragraph. Plain runs are just text; highlighted runs set
 * `highlight: true` and may override the sweep `color`. Authors normally write
 * a single `text` string with `{{double-brace}}` spans and we parse it into
 * these segments, but a structured `segments` array takes precedence when given.
 */
interface Segment {
  text: string;
  highlight?: boolean;
  color?: string;
}

type MarkStyle = "marker" | "underline" | "box";

export interface HighlightTextProps {
  /** Paragraph text. Wrap spans to highlight in `{{double braces}}`. */
  text?: string;
  /** Optional structured override — takes precedence over `text` when non-empty. */
  segments?: Segment[];
  /** Highlight color; overrides the palette accent. */
  color?: string;
  /** Visual treatment of the sweep. */
  style?: MarkStyle;
  /** Type scale of the paragraph in px. */
  fontSize?: number;
  /** Use a serif face for the body (the reviz prose look). */
  serif?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  /** Total time (ms) for every highlight to sweep in, end to end. */
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_TEXT =
  "Scaling the model to 405B parameters lifted held-out accuracy to {{91.4%}}, " +
  "but the decisive gain came from {{reinforcement learning on verifier feedback}} — " +
  "which alone closed two thirds of the remaining error.";

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** Split a `{{…}}` annotated string into ordered plain / highlighted segments. */
function parseMarkup(src: string): Segment[] {
  if (!src) return [];
  const out: Segment[] = [];
  const re = /\{\{([\s\S]*?)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[1]) out.push({ text: m[1], highlight: true });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1] as const;

export default function HighlightText({
  text = DEFAULT_TEXT,
  segments = [],
  color = "",
  style = "marker",
  fontSize = 22,
  serif = true,
  title = "",
  caption = "",
  source = "",
  duration = 1600,
}: HighlightTextProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const accent = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  // Structured segments win; otherwise parse the markup string.
  const parsed = useMemo<Segment[]>(() => {
    const arr = Array.isArray(segments) ? segments.filter((s) => s && typeof s.text === "string" && s.text.length) : [];
    if (arr.length) return arr;
    return parseMarkup(text);
  }, [segments, text]);

  // Index each highlighted segment so sweeps can play in sequence.
  const highlightOrder = useMemo(() => {
    let k = -1;
    return parsed.map((s) => (s.highlight ? ++k : -1));
  }, [parsed]);
  const total = Math.max(1, highlightOrder.filter((i) => i >= 0).length);

  // Per-sweep timing. Each highlight gets a slice of the total duration, with a
  // little overlap so the reveal feels continuous rather than stop-start.
  const span = reduced ? 0 : duration / 1000;
  const per = reduced ? 0 : Math.min(0.7, (span / total) * 1.25);
  const gap = total > 1 ? (span - per) / (total - 1) : 0;
  const delayFor = (order: number) => (reduced ? 0 : 0.15 + order * gap);

  const contrastInk = readableOn(accent);

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <p
          key={token}
          className={`max-w-prose ${serif ? "font-serif" : "font-sans"} leading-relaxed text-ink`}
          style={{ fontSize, lineHeight: 1.65 }}
        >
          {parsed.map((seg, i) => {
            if (!seg.highlight) {
              return <span key={i}>{seg.text}</span>;
            }
            const order = highlightOrder[i];
            const hl = seg.color || accent;
            const delay = delayFor(order);
            return (
              <Mark
                key={i}
                text={seg.text}
                style={style}
                color={hl}
                contrastInk={contrastInk}
                ink={p.ink}
                inView={inView}
                reduced={reduced}
                duration={per}
                delay={delay}
              />
            );
          })}
        </p>

        {total > 0 && (
          <div className="mt-5 flex justify-end">
            <ReplayButton onClick={replay} />
          </div>
        )}
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Mark — a single animated highlight                                  */
/* ------------------------------------------------------------------ */

function Mark({
  text,
  style,
  color,
  contrastInk,
  ink,
  inView,
  reduced,
  duration,
  delay,
}: {
  text: string;
  style: MarkStyle;
  color: string;
  contrastInk: string;
  ink: string;
  inView: boolean;
  reduced: boolean;
  duration: number;
  delay: number;
}) {
  const shown = inView || reduced;

  if (style === "underline") {
    return (
      <span className="relative inline whitespace-pre-wrap font-medium" style={{ color: mix(ink, color, 0.45) }}>
        {text}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 origin-left rounded-full"
          style={{ height: 3, bottom: "-2px", backgroundColor: color }}
          initial={{ scaleX: reduced ? 1 : 0 }}
          animate={{ scaleX: shown ? 1 : reduced ? 1 : 0 }}
          transition={{ duration: reduced ? 0 : duration, delay, ease: EASE }}
        />
      </span>
    );
  }

  if (style === "box") {
    return (
      <span className="relative inline whitespace-pre-wrap px-[3px] font-medium" style={{ color: mix(ink, color, 0.55) }}>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 rounded-[3px] border"
          style={{ borderColor: color, backgroundColor: withAlpha(color, 0.08), top: "-0.08em", bottom: "-0.08em" }}
          initial={{ opacity: reduced ? 1 : 0, scaleX: reduced ? 1 : 0.82 }}
          animate={{ opacity: shown ? 1 : reduced ? 1 : 0, scaleX: shown ? 1 : reduced ? 1 : 0.82 }}
          transition={{ duration: reduced ? 0 : duration, delay, ease: EASE }}
        />
        <span className="relative">{text}</span>
      </span>
    );
  }

  // marker — a highlighter pen sweeping left to right behind the text.
  // The band animates by width and the ink crossfades from body to readable-on-fill.
  return (
    <span className="relative inline whitespace-pre-wrap px-[2px] font-medium">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-0 origin-left overflow-hidden rounded-[2px]"
        style={{ backgroundColor: color, top: "0.08em", bottom: "0.02em", boxShadow: `0 1px 0 ${withAlpha(color, 0.5)}` }}
        initial={{ width: reduced ? "100%" : "0%" }}
        animate={{ width: shown ? "100%" : reduced ? "100%" : "0%" }}
        transition={{ duration: reduced ? 0 : duration, delay, ease: EASE }}
      />
      <motion.span
        className="relative"
        initial={{ color: reduced ? contrastInk : ink }}
        animate={{ color: shown ? contrastInk : reduced ? contrastInk : ink }}
        transition={{ duration: reduced ? 0 : duration * 0.5, delay: reduced ? 0 : delay + duration * 0.35 }}
      >
        {text}
      </motion.span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "highlight-text",
  name: "Highlight Text",
  category: "text-narrative",
  description:
    "A paragraph of prose where the key terms light up one by one under a highlighter-pen sweep, an underline draw, or a box reveal — perfect for narrating a result.",
  tags: ["highlight", "prose", "annotation", "marker", "underline", "callout", "narrative", "emphasis"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "HighlightText",
  sourcePath: "text-narrative/HighlightText",
  aspect: 16 / 7,
  controls: [
    {
      key: "text",
      label: "Text",
      type: "textarea",
      group: "Data",
      rows: 4,
      help: "Wrap any span you want to highlight in {{double braces}}.",
      default: DEFAULT_TEXT,
    },
    {
      key: "segments",
      label: "Segments (override)",
      type: "json",
      group: "Data",
      help: "[{ text, highlight?, color? }] — overrides Text when non-empty for per-span colors.",
      default: [],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "style",
      label: "Style",
      type: "select",
      group: "Style",
      default: "marker",
      options: [
        { value: "marker", label: "Marker" },
        { value: "underline", label: "Underline" },
        { value: "box", label: "Box" },
      ],
    },
    { key: "color", label: "Highlight color", type: "color", group: "Style", default: "" },
    {
      key: "fontSize",
      label: "Font size",
      type: "number",
      group: "Layout",
      default: 22,
      min: 14,
      max: 40,
      step: 1,
      unit: "px",
    },
    { key: "serif", label: "Serif body", type: "boolean", group: "Layout", default: true },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1600,
      min: 0,
      max: 4000,
      step: 100,
    },
  ],
  presets: [
    {
      id: "two-terms",
      name: "Two key terms",
      props: {
        text:
          "Our agent reached {{state-of-the-art}} on the benchmark, driven almost entirely by the new {{tree-search planner}}.",
        style: "marker",
      },
    },
    {
      id: "result-callout",
      name: "Result callout",
      props: {
        title: "Headline result",
        text:
          "Scaling the model to 405B parameters lifted held-out accuracy to {{91.4%}}, but the decisive gain came from {{reinforcement learning on verifier feedback}} — which alone closed two thirds of the remaining error.",
        caption: "Highlighted spans mark the contributions called out in the abstract.",
        style: "marker",
      },
    },
    {
      id: "definition",
      name: "Underlined definition",
      props: {
        text:
          "A {{value function}} estimates expected return from a state, while a {{policy}} maps states to actions — the two are trained jointly under the actor-critic objective.",
        style: "underline",
        serif: true,
        fontSize: 20,
      },
    },
  ],
};
