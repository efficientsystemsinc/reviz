"use client";

import { Check, Minus, Sparkles, X } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  ReplayButton,
  cn,
  usePalette,
  useInView,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Option {
  name: string;
  /** Mark this column as the "recommended" / highlighted choice. */
  highlight?: boolean;
  /** Optional short tagline shown under the column name. */
  note?: string;
}

/** A cell is either a boolean (check/cross), the string "partial", or a short text value. */
type Cell = boolean | string;

export interface ComparisonTableProps {
  features?: string[];
  options?: Option[];
  /** Matrix [featureIndex][optionIndex] of cell values. */
  cells?: Cell[][];
  title?: string;
  caption?: string;
  source?: string;
  /** Label shown on the highlighted column's ribbon. */
  highlightLabel?: string;
  color?: string;
  duration?: number;
}

const isPartial = (v: Cell): v is string =>
  typeof v === "string" && v.trim().toLowerCase() === "partial";

export default function ComparisonTable({
  features = [
    "Themeable palettes",
    "Entrance animation",
    "Reduced-motion safe",
    "SVG + PNG export",
    "Research-grade defaults",
    "Components",
    "Setup time",
  ],
  options = [
    { name: "reviz", highlight: true, note: "this library" },
    { name: "Build it yourself", note: "hand-rolled" },
    { name: "Generic chart lib", note: "off the shelf" },
  ],
  cells = [
    [true, "partial", false],
    [true, "partial", true],
    [true, false, false],
    [true, false, "partial"],
    [true, false, false],
    ["100+", "1 at a time", "~12 types"],
    ["minutes", "days", "hours"],
  ],
  title = "",
  caption = "",
  source = "",
  highlightLabel = "Recommended",
  color = "",
  duration = 800,
}: ComparisonTableProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const { token, replay } = useReplay();
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  const feats = features ?? [];
  const opts = options ?? [];
  const matrix = cells ?? [];

  const highlightIdx = useMemo(() => opts.findIndex((o) => o?.highlight), [opts]);

  const dur = reduced ? 0 : Math.max(0.2, duration / 1000);
  const headDelay = reduced ? 0 : 0.05;
  const rowBase = reduced ? 0 : 0.22;
  const rowStep = reduced ? 0 : Math.min(0.07, dur / Math.max(1, feats.length));

  // Grid: first column is the feature label, remaining columns are options.
  const gridCols = `minmax(7rem, 1.4fr) repeat(${Math.max(1, opts.length)}, minmax(5.5rem, 1fr))`;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/cmp relative w-full">
        <div className="relative overflow-hidden rounded-reviz border border-border bg-surface">
          {/* Highlighted column wash spanning the full table height. */}
          {highlightIdx >= 0 && (
            <HighlightWash
              count={opts.length}
              index={highlightIdx}
              accent={accent}
              inView={inView}
              reduced={reduced}
              token={token}
            />
          )}

          <div className="relative" style={{ display: "grid", gridTemplateColumns: gridCols }}>
            {/* ---- Header row ---- */}
            <div className="border-b border-border-strong px-4 py-3.5">
              <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
                Feature
              </span>
            </div>
            {opts.map((o, oi) => {
              const hi = oi === highlightIdx;
              return (
                <motion.div
                  key={`${token}-head-${oi}`}
                  initial={{ opacity: 0, y: reduced ? 0 : -12 }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : -12 }}
                  transition={{ duration: dur, delay: headDelay + oi * (reduced ? 0 : 0.06), ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "relative border-b border-border-strong px-3 py-3.5 text-center",
                    oi > 0 && "border-l border-border/60",
                  )}
                >
                  {hi && (
                    <span
                      className="mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-label"
                      style={{ backgroundColor: withAlpha(accent, 0.16), color: accent }}
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      {highlightLabel}
                    </span>
                  )}
                  <div
                    className={cn(
                      "font-sans text-[13.5px] font-semibold leading-tight",
                      hi ? "text-ink" : "text-ink",
                    )}
                    style={hi ? { color: accent } : undefined}
                  >
                    {o?.name}
                  </div>
                  {o?.note && (
                    <div className="mt-0.5 font-mono text-[9px] uppercase tracking-label text-ink-faint">
                      {o.note}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* ---- Feature rows ---- */}
            {feats.map((feat, fi) => {
              const isHover = hoverRow === fi;
              const rowDelay = rowBase + fi * rowStep;
              return (
                // NOTE: plain <div> with display:contents — a framer-motion
                // element here would receive an inline `transform`, which
                // forces a box and cancels `display:contents`, collapsing the
                // grid rows. The child cells animate themselves.
                <div
                  key={`${token}-rowwrap-${fi}`}
                  className="contents"
                  onMouseEnter={() => setHoverRow(fi)}
                  onMouseLeave={() => setHoverRow(null)}
                >
                  {/* Feature label cell */}
                  <motion.div
                    initial={{ opacity: 0, x: reduced ? 0 : -10 }}
                    animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: reduced ? 0 : -10 }}
                    transition={{ duration: dur, delay: rowDelay, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      "flex items-center px-4 py-3 text-left font-sans text-[13px] leading-snug text-ink transition-colors",
                      fi < feats.length - 1 && "border-b border-border/60",
                    )}
                    style={isHover ? { backgroundColor: withAlpha(p.ink, 0.035) } : undefined}
                  >
                    {feat}
                  </motion.div>

                  {/* Option cells */}
                  {opts.map((_, oi) => {
                    const raw = matrix[fi]?.[oi];
                    const value: Cell = raw === undefined ? false : raw;
                    const hi = oi === highlightIdx;
                    return (
                      <motion.div
                        key={`${token}-cell-${fi}-${oi}`}
                        initial={{ opacity: 0, scale: reduced ? 1 : 0.85 }}
                        animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reduced ? 1 : 0.85 }}
                        transition={{
                          duration: reduced ? 0 : Math.max(0.2, dur * 0.7),
                          delay: rowDelay + (oi + 1) * (reduced ? 0 : 0.04),
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className={cn(
                          "flex items-center justify-center px-3 py-3 transition-colors",
                          oi > 0 && "border-l border-border/60",
                          fi < feats.length - 1 && "border-b border-border/60",
                        )}
                        style={isHover && !hi ? { backgroundColor: withAlpha(p.ink, 0.035) } : undefined}
                      >
                        <CellGlyph value={value} accent={accent} highlighted={hi} palette={p} />
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            {feats.length} features · {opts.length} options
          </span>
          <ReplayButton
            onClick={replay}
            label="Replay"
            className="opacity-0 transition-opacity group-hover/cmp:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

function HighlightWash({
  count,
  index,
  accent,
  inView,
  reduced,
  token,
}: {
  count: number;
  index: number;
  accent: string;
  inView: boolean;
  reduced: boolean;
  token: number;
}) {
  // The grid is: 1 label column (1.4fr) + `count` option columns (1fr each).
  // Compute the left offset + width of the highlighted column as fractions.
  const labelFr = 1.4;
  const totalFr = labelFr + count;
  const left = (labelFr + index) / totalFr;
  const width = 1 / totalFr;
  return (
    <motion.div
      key={token}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 z-0"
      style={{
        left: `${left * 100}%`,
        width: `${width * 100}%`,
        background: `linear-gradient(180deg, ${withAlpha(accent, 0.12)}, ${withAlpha(accent, 0.05)})`,
        borderLeft: `1px solid ${withAlpha(accent, 0.4)}`,
        borderRight: `1px solid ${withAlpha(accent, 0.4)}`,
      }}
      initial={{ opacity: 0, scaleY: reduced ? 1 : 0.6 }}
      animate={inView ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: reduced ? 1 : 0.6 }}
      transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.1, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

function CellGlyph({
  value,
  accent,
  highlighted,
  palette,
}: {
  value: Cell;
  accent: string;
  highlighted: boolean;
  palette: ReturnType<typeof usePalette>;
}) {
  // Boolean true → check; boolean false → cross; "partial" → minus; any other string → text value.
  if (value === true) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full"
        style={{
          backgroundColor: withAlpha(highlighted ? accent : palette.ok, highlighted ? 0.18 : 0.14),
          color: highlighted ? accent : palette.ok,
        }}
        aria-label="yes"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: withAlpha(palette.inkFaint, 0.12), color: palette.inkFaint }}
        aria-label="no"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (isPartial(value)) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: withAlpha(palette.warn, 0.16), color: palette.warn }}
        aria-label="partial"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.75} />
      </span>
    );
  }
  // Short text value.
  return (
    <span
      className={cn("font-mono text-[11.5px] tabular-nums leading-tight", highlighted ? "" : "text-ink-muted")}
      style={highlighted ? { color: accent } : undefined}
    >
      {String(value)}
    </span>
  );
}

export const meta: RevizMeta = {
  id: "comparison-table",
  name: "Comparison Table",
  category: "data-display",
  description:
    "A feature-comparison matrix with check / cross / partial glyphs and short values, one recommended column highlighted with a ribbon and accent wash, and a header reveal + row-stagger entrance.",
  tags: ["comparison", "table", "feature matrix", "pricing", "checklist"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ComparisonTable",
  sourcePath: "data-display/ComparisonTable",
  aspect: 16 / 11,
  controls: [
    {
      key: "features",
      label: "Features",
      type: "json",
      group: "Data",
      help: "Array of feature row labels (string[]).",
      default: [
        "Themeable palettes",
        "Entrance animation",
        "Reduced-motion safe",
        "SVG + PNG export",
        "Research-grade defaults",
        "Components",
        "Setup time",
      ],
    },
    {
      key: "options",
      label: "Options",
      type: "json",
      group: "Data",
      help: "Array of { name, highlight?: boolean, note?: string } column definitions.",
      default: [
        { name: "reviz", highlight: true, note: "this library" },
        { name: "Build it yourself", note: "hand-rolled" },
        { name: "Generic chart lib", note: "off the shelf" },
      ],
    },
    {
      key: "cells",
      label: "Cells",
      type: "json",
      group: "Data",
      help: 'Matrix [feature][option] of true, false, "partial", or a short text value.',
      default: [
        [true, "partial", false],
        [true, "partial", true],
        [true, false, false],
        [true, false, "partial"],
        [true, false, false],
        ["100+", "1 at a time", "~12 types"],
        ["minutes", "days", "hours"],
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "highlightLabel",
      label: "Highlight ribbon",
      type: "text",
      group: "Labels",
      help: "Label shown on the highlighted column's ribbon.",
      default: "Recommended",
    },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 800, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "reviz-vs",
      name: "reviz vs the rest",
      props: {
        title: "Why reviz",
        caption: "Feature coverage versus hand-rolling figures or reaching for a generic chart library.",
        source: "reviz docs",
        highlightLabel: "Recommended",
      },
    },
    {
      id: "model-tiers",
      name: "Model tier matrix",
      props: {
        title: "Choosing a model tier",
        caption: "Capability and cost trade-offs across the serving fleet.",
        highlightLabel: "Best value",
        features: ["Long-context (1M)", "Tool use", "Vision", "Streaming", "Throughput", "$ / 1M tokens", "Latency p50"],
        options: [
          { name: "Aria-L", note: "frontier" },
          { name: "Aria-M", highlight: true, note: "balanced" },
          { name: "Aria-S", note: "fast" },
        ],
        cells: [
          [true, true, "partial"],
          [true, true, true],
          [true, true, false],
          [true, true, true],
          ["86 rps", "214 rps", "612 rps"],
          ["$15.00", "$3.00", "$0.80"],
          ["412 ms", "168 ms", "61 ms"],
        ],
      },
    },
    {
      id: "framework-fit",
      name: "Training framework fit",
      props: {
        title: "RL training framework comparison",
        caption: "Support matrix for distributed post-training stacks.",
        highlightLabel: "Our pick",
        features: ["PPO", "GRPO", "Multi-node FSDP", "vLLM rollouts", "Checkpoint resume", "Setup", "Stars"],
        options: [
          { name: "reviz-rl", highlight: true, note: "internal" },
          { name: "RL-Framework A", note: "oss" },
          { name: "RL-Framework B", note: "oss" },
        ],
        cells: [
          [true, true, true],
          [true, true, "partial"],
          [true, true, "partial"],
          [true, "partial", false],
          [true, true, true],
          ["minutes", "hours", "hours"],
          ["internal", "6.2k", "11k"],
        ],
      },
    },
  ],
};
