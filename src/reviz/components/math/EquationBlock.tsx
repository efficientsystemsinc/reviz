"use client";

import katex from "katex";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
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

export interface EquationBlockProps {
  latex?: string;
  numbered?: boolean;
  number?: string;
  caption?: string;
  align?: "center" | "left";
  fontSize?: number;
  highlight?: string;
  title?: string;
  source?: string;
  duration?: number;
}

export default function EquationBlock({
  latex = "\\mathcal{L}(\\theta) = -\\frac{1}{N}\\sum_{i=1}^{N} \\big[\\, y_i \\log \\hat{y}_i + (1 - y_i)\\log(1 - \\hat{y}_i) \\,\\big]",
  numbered = true,
  number = "1",
  caption = "Binary cross-entropy, averaged over the minibatch.",
  align = "center",
  fontSize = 26,
  highlight = "",
  title = "",
  source = "",
  duration = 700,
}: EquationBlockProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [showHi, setShowHi] = useState(true);

  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        output: "html",
        strict: false,
      });
    } catch {
      return latex;
    }
  }, [latex]);

  const hiHtml = useMemo(() => {
    if (!highlight.trim()) return "";
    try {
      return katex.renderToString(highlight, {
        displayMode: false,
        throwOnError: false,
        output: "html",
        strict: false,
      });
    } catch {
      return "";
    }
  }, [highlight]);

  const leftAlign = align === "left";

  // Entrance: fade + gentle scale-up of the typeset block. Snap when reduced.
  const dur = duration / 1000;
  const animate = inView && !reduced;

  return (
    <Figure variant="plain" align={leftAlign ? "left" : "center"} title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <motion.div
          key={token}
          className={`group/eq relative flex items-center gap-5 rounded-reviz border border-border bg-surface-alt/40 px-6 py-7 ${
            leftAlign ? "justify-start" : "justify-center"
          }`}
          initial={false}
        >
          {/* accent rail */}
          <motion.span
            aria-hidden
            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
            style={{ background: p.accent, originY: 0 }}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: animate || reduced ? 1 : 0, opacity: animate || reduced ? 1 : 0 }}
            transition={{ duration: dur * 0.7, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* the typeset equation */}
          <motion.div
            className={`relative min-w-0 overflow-x-auto py-1 ${leftAlign ? "pl-2" : ""}`}
            style={{ color: p.ink, fontSize }}
            initial={{ opacity: 0, scale: reduced ? 1 : 0.94, y: reduced ? 0 : 8 }}
            animate={{
              opacity: animate || reduced ? 1 : 0,
              scale: animate || reduced ? 1 : 0.94,
              y: animate || reduced ? 0 : 8,
            }}
            transition={{ duration: dur, ease: [0.22, 1, 0.36, 1], delay: dur * 0.12 }}
          >
            <div
              className="reviz-katex"
              dangerouslySetInnerHTML={{ __html: html }}
            />

            {/* highlighted term overlay — a soft chip pinned above the equation */}
            <AnimatePresence>
              {hiHtml && showHi && (
                <motion.button
                  type="button"
                  onClick={() => setShowHi(false)}
                  title="Highlighted term — click to dismiss"
                  className="absolute -top-3 right-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1"
                  style={{
                    background: withAlpha(p.accent, 0.12),
                    border: `1px solid ${withAlpha(p.accent, 0.35)}`,
                    color: p.accent,
                    fontSize: Math.max(11, fontSize * 0.44),
                  }}
                  initial={{ opacity: 0, y: -4, scale: 0.9 }}
                  animate={{
                    opacity: animate || reduced ? 1 : 0,
                    y: 0,
                    scale: 1,
                  }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: dur * 0.8, delay: animate ? dur + 0.05 : 0 }}
                >
                  <span
                    className="reviz-katex"
                    dangerouslySetInnerHTML={{ __html: hiHtml }}
                  />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          {/* right-aligned equation number, paper-style */}
          {numbered && (
            <motion.span
              className="shrink-0 select-none font-serif text-ink-faint"
              style={{ fontSize: Math.max(13, fontSize * 0.62) }}
              initial={{ opacity: 0 }}
              animate={{ opacity: animate || reduced ? 1 : 0 }}
              transition={{ duration: dur, delay: dur * 0.5 }}
            >
              ({number})
            </motion.span>
          )}
        </motion.div>

        {/* replay affordance */}
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton
            onClick={() => {
              setShowHi(true);
              replay();
            }}
            label="Replay"
          />
        </div>
      </div>

      {/* KaTeX inherits the themed ink color rather than its default black */}
      <style>{`
        .reviz-katex .katex { color: inherit; }
        .reviz-katex .katex-display { margin: 0; }
      `}</style>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "equation-block",
  name: "Equation Block",
  category: "math",
  description:
    "A publication-grade display equation typeset with KaTeX, with an optional equation number, highlighted term, caption, and a soft fade-and-scale entrance.",
  tags: ["equation", "latex", "katex", "math", "formula", "typeset"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "EquationBlock",
  sourcePath: "math/EquationBlock",
  aspect: 16 / 6,
  controls: [
    {
      key: "latex",
      label: "LaTeX",
      type: "textarea",
      group: "Data",
      rows: 3,
      default:
        "\\mathcal{L}(\\theta) = -\\frac{1}{N}\\sum_{i=1}^{N} \\big[\\, y_i \\log \\hat{y}_i + (1 - y_i)\\log(1 - \\hat{y}_i) \\,\\big]",
    },
    {
      key: "highlight",
      label: "Highlighted term",
      type: "text",
      group: "Data",
      default: "",
      placeholder: "e.g. \\hat{y}_i",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    {
      key: "caption",
      label: "Caption",
      type: "text",
      group: "Labels",
      default: "Binary cross-entropy, averaged over the minibatch.",
    },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "numbered", label: "Show number", type: "boolean", group: "Labels", default: true },
    { key: "number", label: "Equation number", type: "text", group: "Labels", default: "1" },
    {
      key: "align",
      label: "Alignment",
      type: "select",
      group: "Layout",
      default: "center",
      options: [
        { value: "center", label: "Center" },
        { value: "left", label: "Left" },
      ],
    },
    { key: "fontSize", label: "Font size", type: "number", group: "Style", default: 26, min: 14, max: 48, step: 1, unit: "px" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 700, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "cross-entropy",
      name: "Cross-entropy loss",
      props: {
        latex:
          "\\mathcal{L}(\\theta) = -\\frac{1}{N}\\sum_{i=1}^{N} \\big[\\, y_i \\log \\hat{y}_i + (1 - y_i)\\log(1 - \\hat{y}_i) \\,\\big]",
        caption: "Binary cross-entropy, averaged over the minibatch.",
        highlight: "\\hat{y}_i = \\sigma(z_i)",
        number: "3",
      },
    },
    {
      id: "bayes",
      name: "Bayes' rule",
      props: {
        latex: "P(\\theta \\mid \\mathcal{D}) = \\frac{P(\\mathcal{D} \\mid \\theta)\\, P(\\theta)}{P(\\mathcal{D})}",
        caption: "Posterior is proportional to likelihood times prior.",
        highlight: "",
        number: "1",
        fontSize: 30,
      },
    },
    {
      id: "attention",
      name: "Scaled dot-product attention",
      props: {
        latex:
          "\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\!\\left(\\frac{Q K^{\\top}}{\\sqrt{d_k}}\\right) V",
        caption: "Scaled dot-product attention from Vaswani et al. (2017).",
        highlight: "\\sqrt{d_k}",
        number: "2",
        fontSize: 24,
      },
    },
  ],
};
