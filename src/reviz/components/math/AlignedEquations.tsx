"use client";

import katex from "katex";
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
  type RevizMeta,
} from "@/reviz";

export interface AlignedLine {
  /** The LaTeX for this line. Use `&` to mark the alignment point (e.g. before `=`). */
  latex: string;
  /** Optional annotation rendered in the right margin (e.g. "by Bayes' rule"). */
  note?: string;
}

export interface AlignedEquationsProps {
  lines?: AlignedLine[];
  title?: string;
  caption?: string;
  source?: string;
  reveal?: boolean;
  fontSize?: number;
  color?: string;
  duration?: number;
}

function renderTex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: "html",
      strict: false,
    });
  } catch {
    return latex;
  }
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function AlignedEquations({
  lines = [
    { latex: "\\log p(x) &= \\log \\int p(x, z)\\, dz", note: "marginalize over latents" },
    {
      latex: "&= \\log \\mathbb{E}_{q(z)}\\!\\left[\\frac{p(x, z)}{q(z)}\\right]",
      note: "importance weighting by q",
    },
    {
      latex: "&\\geq \\mathbb{E}_{q(z)}\\!\\left[\\log \\frac{p(x, z)}{q(z)}\\right]",
      note: "Jensen's inequality",
    },
    {
      latex: "&= \\underbrace{\\mathbb{E}_{q}[\\log p(x \\mid z)]}_{\\text{reconstruction}} - \\underbrace{D_{\\mathrm{KL}}\\!\\big(q(z) \\,\\|\\, p(z)\\big)}_{\\text{regularizer}}",
      note: "the ELBO",
    },
  ],
  title = "",
  caption = "Deriving the evidence lower bound (ELBO) for a latent-variable model.",
  source = "",
  reveal = true,
  fontSize = 22,
  color = "",
  duration = 900,
}: AlignedEquationsProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const accent = color || p.accent;
  const rows = Array.isArray(lines) ? lines.filter((l) => l && typeof l.latex === "string") : [];

  // Typeset each line inside an `aligned` environment of its own so every line
  // shares the same `&` alignment column, yet can be revealed independently.
  const typeset = useMemo(
    () =>
      rows.map((l) => ({
        math: renderTex(`\\begin{aligned}${l.latex}\\end{aligned}`, true),
        note: l.note?.trim() || "",
      })),
    [rows],
  );

  const dur = duration / 1000;
  // `active` is the single gate for entrance state. Reduced-motion still ends
  // up fully visible — it just snaps there. Crucially, every animated element's
  // `animate` target below is the *final, visible* state whenever `active` is
  // true, so the static (post-animation) render is always complete.
  const active = inView || reduced;
  const stagger = reveal && !reduced ? Math.min(0.16, (dur * 0.6) / Math.max(1, rows.length)) : 0;
  const noteSize = Math.max(11, fontSize * 0.52);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <motion.div
          key={token}
          className="relative overflow-hidden rounded-reviz border border-border bg-surface-alt/40 px-7 py-7"
          initial={false}
        >
          {/* accent rail that grows down as the derivation reveals */}
          <motion.span
            aria-hidden
            className="absolute left-0 top-5 bottom-5 w-[3px] rounded-full"
            style={{ background: accent, transformOrigin: "top" }}
            initial={{ scaleY: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
            animate={{
              scaleY: active ? 1 : 0,
              opacity: active ? 1 : 0,
            }}
            transition={{ duration: Math.max(dur, stagger * rows.length + dur * 0.5), ease: EASE }}
          />

          <div className="flex flex-col gap-3.5">
            {typeset.map((row, i) => {
              const delay = stagger * i;
              return (
                <motion.div
                  key={i}
                  className="flex items-baseline gap-5"
                  initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : -10 }}
                  animate={{
                    opacity: active ? 1 : 0,
                    x: active ? 0 : -10,
                  }}
                  transition={{ duration: dur, ease: EASE, delay }}
                >
                  {/* the typeset, left-aligned line */}
                  <div
                    className="reviz-aligned min-w-0 flex-1 overflow-x-auto"
                    style={{ color: p.ink, fontSize }}
                    dangerouslySetInnerHTML={{ __html: row.math }}
                  />

                  {/* right-margin annotation, paper-style */}
                  {row.note && (
                    <motion.span
                      className="hidden shrink-0 select-none whitespace-nowrap text-right font-mono uppercase tracking-label sm:inline-flex sm:items-center sm:gap-2"
                      style={{ color: p.inkFaint, fontSize: noteSize }}
                      initial={{ opacity: reduced ? 1 : 0 }}
                      animate={{ opacity: active ? 1 : 0 }}
                      transition={{ duration: dur, ease: EASE, delay: delay + dur * 0.4 }}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-px w-5"
                        style={{ background: withAlpha(p.border, 1) }}
                      />
                      {row.note}
                    </motion.span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* replay affordance */}
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} label="Replay" />
        </div>
      </div>

      {/* KaTeX inherits the themed ink color; left-align each `aligned` block */}
      <style>{`
        .reviz-aligned .katex { color: inherit; }
        .reviz-aligned .katex-display { margin: 0; text-align: left; }
        .reviz-aligned .katex-display > .katex { text-align: left; }
      `}</style>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "aligned-equations",
  name: "Aligned Equations",
  category: "math",
  description:
    "A multi-line aligned derivation typeset with KaTeX — each step shares a common alignment column, carries an optional right-margin annotation, and reveals sequentially.",
  tags: ["equation", "latex", "katex", "math", "derivation", "align", "proof"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "AlignedEquations",
  sourcePath: "math/AlignedEquations",
  aspect: 16 / 9,
  controls: [
    {
      key: "lines",
      label: "Lines",
      type: "json",
      group: "Data",
      default: [
        { latex: "\\log p(x) &= \\log \\int p(x, z)\\, dz", note: "marginalize over latents" },
        {
          latex: "&= \\log \\mathbb{E}_{q(z)}\\!\\left[\\frac{p(x, z)}{q(z)}\\right]",
          note: "importance weighting by q",
        },
        {
          latex: "&\\geq \\mathbb{E}_{q(z)}\\!\\left[\\log \\frac{p(x, z)}{q(z)}\\right]",
          note: "Jensen's inequality",
        },
        {
          latex:
            "&= \\underbrace{\\mathbb{E}_{q}[\\log p(x \\mid z)]}_{\\text{reconstruction}} - \\underbrace{D_{\\mathrm{KL}}\\!\\big(q(z) \\,\\|\\, p(z)\\big)}_{\\text{regularizer}}",
          note: "the ELBO",
        },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    {
      key: "caption",
      label: "Caption",
      type: "text",
      group: "Labels",
      default: "Deriving the evidence lower bound (ELBO) for a latent-variable model.",
    },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "reveal",
      label: "Sequential reveal",
      type: "boolean",
      group: "Animation",
      default: true,
    },
    {
      key: "fontSize",
      label: "Font size",
      type: "number",
      group: "Style",
      default: 22,
      min: 14,
      max: 40,
      step: 1,
      unit: "px",
    },
    { key: "color", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
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
      id: "elbo",
      name: "ELBO derivation",
      props: {
        caption: "Deriving the evidence lower bound (ELBO) for a latent-variable model.",
        reveal: true,
        fontSize: 22,
        lines: [
          { latex: "\\log p(x) &= \\log \\int p(x, z)\\, dz", note: "marginalize over latents" },
          {
            latex: "&= \\log \\mathbb{E}_{q(z)}\\!\\left[\\frac{p(x, z)}{q(z)}\\right]",
            note: "importance weighting by q",
          },
          {
            latex: "&\\geq \\mathbb{E}_{q(z)}\\!\\left[\\log \\frac{p(x, z)}{q(z)}\\right]",
            note: "Jensen's inequality",
          },
          {
            latex:
              "&= \\underbrace{\\mathbb{E}_{q}[\\log p(x \\mid z)]}_{\\text{reconstruction}} - \\underbrace{D_{\\mathrm{KL}}\\!\\big(q(z) \\,\\|\\, p(z)\\big)}_{\\text{regularizer}}",
            note: "the ELBO",
          },
        ],
      },
    },
    {
      id: "bayes",
      name: "Posterior via Bayes' rule",
      props: {
        caption: "The posterior over parameters given data, up to a normalizing constant.",
        reveal: true,
        fontSize: 24,
        lines: [
          {
            latex: "p(\\theta \\mid \\mathcal{D}) &= \\frac{p(\\mathcal{D} \\mid \\theta)\\, p(\\theta)}{p(\\mathcal{D})}",
            note: "by Bayes' rule",
          },
          {
            latex: "&= \\frac{p(\\mathcal{D} \\mid \\theta)\\, p(\\theta)}{\\int p(\\mathcal{D} \\mid \\theta')\\, p(\\theta')\\, d\\theta'}",
            note: "expand the evidence",
          },
          {
            latex: "&\\propto p(\\mathcal{D} \\mid \\theta)\\, p(\\theta)",
            note: "drop the constant in θ",
          },
        ],
      },
    },
    {
      id: "softmax-grad",
      name: "Softmax cross-entropy gradient",
      props: {
        caption: "The gradient of softmax cross-entropy collapses to a clean residual.",
        reveal: true,
        fontSize: 22,
        color: "",
        lines: [
          {
            latex: "\\frac{\\partial \\mathcal{L}}{\\partial z_k} &= -\\sum_{i} y_i \\frac{\\partial \\log \\hat{y}_i}{\\partial z_k}",
            note: "chain rule",
          },
          {
            latex: "&= -\\sum_{i} y_i \\big(\\mathbb{1}[i = k] - \\hat{y}_k\\big)",
            note: "softmax Jacobian",
          },
          {
            latex: "&= \\hat{y}_k \\sum_{i} y_i - y_k",
            note: "distribute",
          },
          {
            latex: "&= \\hat{y}_k - y_k",
            note: "labels sum to one",
          },
        ],
      },
    },
  ],
};
