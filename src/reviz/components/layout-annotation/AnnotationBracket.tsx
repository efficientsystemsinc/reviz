"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  clamp,
  useInView,
  useMeasure,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

type Orientation = "horizontal" | "vertical";
type BracketStyle = "curly" | "square" | "line";

export interface AnnotationBracketProps {
  orientation?: Orientation;
  from?: number;
  to?: number;
  label?: string;
  style?: BracketStyle;
  items?: string[];
  accent?: string;
  duration?: number;
  title?: string;
  caption?: string;
  source?: string;
}

/**
 * Build a bracket path along one axis. The bracket runs from `a` to `b` (the
 * span coordinate) at a fixed cross-axis baseline `base`, with the spine bowing
 * out by `depth` toward `dir` (+1 / -1). A `tip` of `depth * 1.7` marks the
 * label anchor at the span midpoint.
 *
 * For `horizontal` the span axis is x and the bracket sits below the strip; for
 * `vertical` the span axis is y and the bracket sits to the right.
 */
function bracketPath(
  orientation: Orientation,
  style: BracketStyle,
  a: number,
  b: number,
  base: number,
  depth: number,
): { spine: string; tip: { x: number; y: number } } {
  const mid = (a + b) / 2;
  const horiz = orientation === "horizontal";

  // Convert (span, cross) -> (x, y) for the chosen orientation.
  const pt = (span: number, cross: number) => (horiz ? { x: span, y: cross } : { x: cross, y: span });

  const tipCross = base + depth * 1.7;
  const tip = pt(mid, tipCross);

  if (style === "line") {
    // A flat underline with short end ticks — a minimal bracket.
    const e = base + depth * 0.9;
    const p0 = pt(a, e);
    const p0b = pt(a, base);
    const p1 = pt(b, e);
    const p1b = pt(b, base);
    const spine =
      `M ${p0b.x} ${p0b.y} L ${p0.x} ${p0.y} ` +
      `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y} ` +
      `M ${p1.x} ${p1.y} L ${p1b.x} ${p1b.y}`;
    return { spine, tip: pt(mid, e) };
  }

  if (style === "square") {
    // Square bracket: end uprights, flat run, central downward notch to the tip.
    const run = base + depth * 0.85;
    const A = pt(a, base);
    const Arun = pt(a, run);
    const Mrun = pt(mid, run);
    const Mtip = pt(mid, tipCross);
    const Brun = pt(b, run);
    const B = pt(b, base);
    const spine =
      `M ${A.x} ${A.y} L ${Arun.x} ${Arun.y} ` +
      `L ${Mrun.x} ${Mrun.y} L ${Mtip.x} ${Mtip.y} L ${Mrun.x} ${Mrun.y} ` +
      `L ${Brun.x} ${Brun.y} L ${B.x} ${B.y}`;
    return { spine, tip };
  }

  // curly — a smooth brace with two arms meeting a central point.
  const d = depth;
  const A = pt(a, base);
  const Mrun = pt(mid, base + d * 0.85);
  const Mtip = pt(mid, tipCross);
  const B = pt(b, base);

  // Control points sit a quarter of the span in, pulled to the run depth.
  const qa = a + (mid - a) * 0.5;
  const qb = b + (mid - b) * 0.5;
  const cA1 = pt(a, base + d * 0.85);
  const cA2 = pt(qa, base + d * 0.85);
  const cM = pt(mid, base + d * 0.85);
  const cB1 = pt(qb, base + d * 0.85);
  const cB2 = pt(b, base + d * 0.85);

  const spine =
    `M ${A.x} ${A.y} ` +
    `C ${cA1.x} ${cA1.y} ${cA2.x} ${cA2.y} ${Mrun.x} ${Mrun.y} ` +
    `L ${Mtip.x} ${Mtip.y} L ${Mrun.x} ${Mrun.y} ` +
    `C ${cM.x} ${cM.y} ${cB1.x} ${cB1.y} ${B.x} ${B.y} ` +
    `L ${cB2.x} ${cB2.y}`;
  return { spine, tip };
}

export default function AnnotationBracket({
  orientation = "horizontal",
  from = 28,
  to = 64,
  label = "Encoder stack",
  style = "curly",
  items = [
    "Tokenize",
    "Embed",
    "Attn × 12",
    "MLP × 12",
    "LayerNorm",
    "Project",
    "Sample",
    "Detokenize",
  ],
  accent = "",
  duration = 1100,
  title = "",
  caption = "",
  source = "",
}: AnnotationBracketProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const reduced = usePrefersReducedMotion();
  const [inViewRef, inView] = useInView<HTMLDivElement>();
  const [measureRef, rect] = useMeasure<HTMLDivElement>();
  const { token, replay } = useReplay();

  const horiz = orientation === "horizontal";
  const W = rect.width;
  // The strip occupies the cross-axis lane; the bracket lives in the gutter.
  const H = W > 0 ? (horiz ? Math.max(W / (16 / 7), 150) : Math.max(W / (16 / 11), 230)) : 0;

  // Normalize the span to fractions of the strip's primary axis.
  const lo = clamp(Math.min(from, to), 0, 100) / 100;
  const hi = clamp(Math.max(from, to), 0, 100) / 100;

  // Geometry: reserve a band for the items and a gutter for the bracket.
  const padMain = horiz ? 18 : 16; // padding along the span axis
  const stripCross = horiz ? 64 : Math.max(W * 0.42, 150); // thickness of the item lane
  const stripTop = 16; // where the item lane starts on the cross axis

  const mainLen = (horiz ? W : H) - padMain * 2;
  const a = padMain + lo * mainLen;
  const b = padMain + hi * mainLen;

  // Bracket baseline sits just past the strip in the gutter.
  const base = stripTop + stripCross + 12;
  const depth = 12;

  const bracket = useMemo(
    () => (W > 0 ? bracketPath(orientation, style, a, b, base, depth) : null),
    [orientation, style, a, b, base, W],
  );

  // Build the demo strip: evenly spaced item cells along the span axis,
  // those inside [lo, hi] are highlighted as the bracketed subset.
  const cells = useMemo(() => {
    const list = items.length ? items : ["Item"];
    return list.map((name, i) => {
      const t0 = i / list.length;
      const t1 = (i + 1) / list.length;
      const center = (t0 + t1) / 2;
      const inSpan = center >= lo && center <= hi;
      return { name, t0, t1, inSpan };
    });
  }, [items, lo, hi]);

  const animate = inView && !reduced;
  const dur = duration / 1000;
  // Resolved end-state visibility. When the component is already in view at
  // mount (e.g. headless visual QA / eager mode, or content above the fold),
  // every motion element must START in its final visible state so the static
  // frame is correct without depending on a delayed entrance tween ever firing.
  const shown = animate || reduced;

  // Label position: anchored at the bracket tip, offset into the gutter.
  const labelPos = useMemo(() => {
    if (!bracket) return null;
    if (horiz) return { left: bracket.tip.x, top: bracket.tip.y + 8, anchor: "center" as const };
    return { left: bracket.tip.x + 10, top: bracket.tip.y, anchor: "left" as const };
  }, [bracket, horiz]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={inViewRef} className="group/ab relative" style={{ width: "100%" }}>
        <div
          ref={measureRef}
          className="relative overflow-hidden rounded-reviz border border-border bg-surface-alt/40"
          style={{ height: H || undefined, minHeight: horiz ? 150 : 230 }}
        >
          {W > 0 && bracket && (
            <>
              {/* item strip (HTML cells, themed) */}
              {cells.map((c, i) => {
                const start = padMain + c.t0 * mainLen;
                const len = (c.t1 - c.t0) * mainLen;
                const gap = 5;
                const cellStyle: React.CSSProperties = horiz
                  ? {
                      left: start + gap / 2,
                      top: stripTop,
                      width: Math.max(len - gap, 0),
                      height: stripCross,
                    }
                  : {
                      left: stripTop,
                      top: start + gap / 2,
                      width: stripCross,
                      height: Math.max(len - gap, 0),
                    };
                return (
                  <motion.div
                    key={`${c.name}-${i}`}
                    className="absolute flex items-center justify-center rounded-md border px-2 text-center"
                    style={{
                      ...cellStyle,
                      borderColor: c.inSpan ? withAlpha(fill, 0.4) : p.border,
                      background: c.inSpan ? withAlpha(fill, 0.1) : p.surface,
                    }}
                    initial={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.94 }}
                    animate={{
                      opacity: shown ? 1 : 0,
                      scale: shown ? 1 : 0.94,
                    }}
                    transition={{
                      duration: reduced ? 0 : 0.4,
                      delay: reduced ? 0 : (i / Math.max(cells.length, 1)) * dur * 0.4,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <span
                      className="font-mono text-[10px] uppercase leading-tight tracking-label"
                      style={{ color: c.inSpan ? fill : p.inkMuted }}
                    >
                      {c.name}
                    </span>
                  </motion.div>
                );
              })}

              {/* bracket + label overlay */}
              <svg
                key={token}
                viewBox={`0 0 ${W} ${H}`}
                width={W}
                height={H}
                role="img"
                className="absolute inset-0"
                style={{ display: "block", overflow: "visible" }}
              >
                {/* faint guide ticks at the span ends */}
                {[a, b].map((s, i) => {
                  const x1 = horiz ? s : stripTop;
                  const y1 = horiz ? stripTop : s;
                  const x2 = horiz ? s : base;
                  const y2 = horiz ? base : s;
                  return (
                    <motion.line
                      key={`g${i}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={withAlpha(fill, 0.28)}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      initial={{ opacity: shown ? 1 : 0 }}
                      animate={{ opacity: shown ? 1 : 0 }}
                      transition={{ duration: 0.3, delay: reduced ? 0 : dur * 0.42 }}
                    />
                  );
                })}

                {/* the bracket spine — draws in */}
                <motion.path
                  d={bracket.spine}
                  fill="none"
                  stroke={fill}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: shown ? 1 : 0, opacity: shown ? 1 : 0 }}
                  animate={{
                    pathLength: shown ? 1 : 0,
                    opacity: shown ? 1 : 0,
                  }}
                  transition={{
                    pathLength: {
                      duration: reduced ? 0 : dur * 0.55,
                      delay: reduced ? 0 : dur * 0.3,
                      ease: [0.22, 1, 0.36, 1],
                    },
                    opacity: { duration: 0.15, delay: reduced ? 0 : dur * 0.3 },
                  }}
                />
              </svg>

              {/* label fades in after the bracket draws */}
              {labelPos && (
                <motion.div
                  className="absolute font-mono text-[11px] uppercase tracking-label"
                  style={{
                    left: labelPos.left,
                    top: labelPos.top,
                    transform: labelPos.anchor === "center" ? "translateX(-50%)" : "translateY(-50%)",
                    color: fill,
                    maxWidth: horiz ? mainLen : undefined,
                  }}
                  initial={{ opacity: shown ? 1 : 0, y: shown ? 0 : 4 }}
                  animate={{ opacity: shown ? 1 : 0, y: 0 }}
                  transition={{
                    duration: reduced ? 0 : 0.45,
                    delay: reduced ? 0 : dur * 0.85,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <span className="whitespace-nowrap rounded-full bg-surface/80 px-1.5 py-0.5">
                    {label}
                  </span>
                </motion.div>
              )}
            </>
          )}
        </div>

        <div className="pointer-events-none absolute right-2 top-2 opacity-0 transition-opacity group-hover/ab:opacity-100">
          <div className="pointer-events-auto">
            <ReplayButton onClick={replay} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "annotation-bracket",
  name: "Annotation Bracket",
  category: "layout-annotation",
  description:
    "A curly, square, or minimal bracket that draws in across a span of a figure and then fades in a label — group the layers, stages, or columns a reader should read as one unit.",
  tags: ["annotation", "bracket", "brace", "grouping", "span", "overlay"],
  badges: ["animated", "themed", "responsive"],
  exportName: "AnnotationBracket",
  sourcePath: "layout-annotation/AnnotationBracket",
  aspect: 16 / 7,
  controls: [
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      group: "Layout",
      default: "horizontal",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
      ],
    },
    {
      key: "from",
      label: "From",
      type: "number",
      group: "Layout",
      default: 28,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "to",
      label: "To",
      type: "number",
      group: "Layout",
      default: 64,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "style",
      label: "Bracket style",
      type: "select",
      group: "Style",
      default: "curly",
      options: [
        { value: "curly", label: "Curly brace" },
        { value: "square", label: "Square" },
        { value: "line", label: "Line" },
      ],
    },
    { key: "label", label: "Label", type: "text", group: "Labels", default: "Encoder stack" },
    {
      key: "items",
      label: "Strip items",
      type: "json",
      group: "Data",
      default: [
        "Tokenize",
        "Embed",
        "Attn × 12",
        "MLP × 12",
        "LayerNorm",
        "Project",
        "Sample",
        "Detokenize",
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1100,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "encoder",
      name: "Bracket the encoder",
      props: {
        orientation: "horizontal",
        from: 12,
        to: 62,
        style: "curly",
        label: "Encoder stack",
        title: "Transformer forward pass",
        items: [
          "Tokenize",
          "Embed",
          "Attn × 12",
          "MLP × 12",
          "LayerNorm",
          "Decode",
          "Sample",
          "Emit",
        ],
      },
    },
    {
      id: "phase",
      name: "Square: a training phase",
      props: {
        orientation: "horizontal",
        from: 50,
        to: 88,
        style: "square",
        label: "RLHF fine-tune",
        title: "Training pipeline phases",
        items: ["Curate", "Pretrain", "SFT", "Reward model", "PPO", "Eval", "Ship"],
      },
    },
    {
      id: "metrics",
      name: "Vertical: grouped metrics",
      props: {
        orientation: "vertical",
        from: 0,
        to: 50,
        style: "curly",
        label: "Capability",
        title: "Eval suite",
        items: ["MMLU", "GSM8K", "HumanEval", "Toxicity", "Refusal", "Latency"],
      },
    },
  ],
};
