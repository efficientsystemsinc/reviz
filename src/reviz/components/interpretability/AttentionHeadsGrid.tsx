"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  TooltipRow,
  clamp,
  mix,
  round,
  seededRandom,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/**
 * A "fingerprint" tells the generator what kind of attention pattern to bake
 * into a given (layer, head) cell. The set below covers the canonical motifs
 * mechanistic-interpretability work keeps rediscovering across transformers.
 */
type Motif =
  | "diagonal" // self / local — attends to the current token
  | "previous" // attends to the immediately preceding token
  | "induction" // attends to the token after a previous copy of the current one
  | "bos" // attention sink — collapses onto the first token
  | "broad" // diffuse / averaging head
  | "syntactic" // attends a few tokens back (head-of-phrase style)
  | "delimiter"; // attends to punctuation / separators

export interface HeadPattern {
  layer: number;
  head: number;
  motif: Motif;
  /** Human label shown when this head is enlarged. */
  role?: string;
}

const MOTIFS: Motif[] = [
  "diagonal",
  "previous",
  "induction",
  "bos",
  "broad",
  "syntactic",
  "delimiter",
];

const MOTIF_ROLE: Record<Motif, string> = {
  diagonal: "self / local",
  previous: "previous-token",
  induction: "induction",
  bos: "attention sink",
  broad: "diffuse average",
  syntactic: "syntactic span",
  delimiter: "delimiter",
};

const DEFAULT_TITLE = "Attention heads · layers × heads";
const SEQ = 9; // tokens per thumbnail — enough structure, still legible at thumbnail scale.

/** Build a single row-stochastic attention map for a motif at a query position. */
function motifRow(motif: Motif, q: number, n: number, rng: () => number): number[] {
  const row = new Array<number>(n).fill(0);
  const noise = () => 0.012 + rng() * 0.05;
  for (let k = 0; k < n; k++) row[k] = noise();

  const bump = (k: number, w: number) => {
    if (k >= 0 && k < n) row[k] += w;
  };

  switch (motif) {
    case "diagonal":
      bump(q, 0.85 + rng() * 0.1);
      bump(q - 1, 0.12);
      break;
    case "previous":
      bump(q - 1, 0.82 + rng() * 0.1);
      bump(q, 0.1);
      break;
    case "induction": {
      // attend to the token *after* the previous occurrence — emulate a period-3 repeat.
      const tgt = q >= 3 ? q - 2 : q;
      bump(tgt, 0.78 + rng() * 0.12);
      bump(q, 0.08);
      break;
    }
    case "bos":
      bump(0, 0.86 + rng() * 0.1);
      bump(q, 0.06);
      break;
    case "broad": {
      for (let k = 0; k <= q; k++) bump(k, 0.5 / (q + 1) + rng() * 0.04);
      break;
    }
    case "syntactic": {
      const back = Math.max(0, q - (2 + Math.floor(rng() * 2)));
      bump(back, 0.7 + rng() * 0.12);
      bump(q, 0.12);
      break;
    }
    case "delimiter": {
      // attend to the most recent "separator" slot (here positions 0 and 4).
      const sep = q >= 4 ? 4 : 0;
      bump(sep, 0.8 + rng() * 0.1);
      bump(q, 0.08);
      break;
    }
  }

  const sum = row.reduce((a, b) => a + b, 0) || 1;
  return row.map((v) => v / sum);
}

/** A full n×n row-stochastic attention matrix for a motif. */
function motifMatrix(motif: Motif, n: number, seed: number): number[][] {
  const rng = seededRandom(seed);
  return Array.from({ length: n }, (_, q) => motifRow(motif, q, n, rng));
}

/** Deterministically assign a motif to a (layer, head) cell with smooth structure. */
function autoMotif(layer: number, head: number, layers: number): Motif {
  const depth = layers > 1 ? layer / (layers - 1) : 0;
  const r = seededRandom(layer * 131 + head * 17 + 7)();
  // Early layers: positional (previous/diagonal/bos). Mid: syntactic/delimiter.
  // Late: induction + diffuse. Blended so the grid reads as a real model.
  if (depth < 0.28) {
    if (r < 0.4) return "previous";
    if (r < 0.7) return "diagonal";
    if (r < 0.86) return "bos";
    return "syntactic";
  }
  if (depth < 0.62) {
    if (r < 0.32) return "syntactic";
    if (r < 0.56) return "delimiter";
    if (r < 0.74) return "diagonal";
    if (r < 0.9) return "bos";
    return "induction";
  }
  if (r < 0.42) return "induction";
  if (r < 0.62) return "broad";
  if (r < 0.8) return "syntactic";
  if (r < 0.92) return "bos";
  return "diagonal";
}

interface Cell {
  layer: number;
  head: number;
  motif: Motif;
  role: string;
  matrix: number[][];
  peak: number;
}

export default function AttentionHeadsGrid({
  layers = 6,
  heads = 6,
  patterns = [] as HeadPattern[],
  showLabels = true,
  title = DEFAULT_TITLE,
  caption = "",
  source = "",
  color = "",
  duration = 1400,
}: {
  /** Number of transformer layers (grid rows). */
  layers?: number;
  /** Number of attention heads per layer (grid columns). */
  heads?: number;
  /** Optional explicit per-head motifs. Cells left unspecified are auto-generated. */
  patterns?: HeadPattern[];
  /** Show the layer (row) and head (column) axis labels. */
  showLabels?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}) {
  const p = usePalette();
  const fill = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ layer: number; head: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const nLayers = clamp(Math.round(layers), 1, 16);
  const nHeads = clamp(Math.round(heads), 1, 16);

  // Explicit overrides keyed by "layer-head".
  const overrides = useMemo(() => {
    const m = new Map<string, HeadPattern>();
    for (const pat of patterns ?? []) {
      if (pat && typeof pat.layer === "number" && typeof pat.head === "number") {
        m.set(`${pat.layer}-${pat.head}`, pat);
      }
    }
    return m;
  }, [patterns]);

  // Build the full grid of cells with their deterministic attention maps.
  const cells = useMemo(() => {
    const out: Cell[] = [];
    for (let l = 0; l < nLayers; l++) {
      for (let h = 0; h < nHeads; h++) {
        const ov = overrides.get(`${l}-${h}`);
        const motif: Motif = ov?.motif && MOTIFS.includes(ov.motif) ? ov.motif : autoMotif(l, h, nLayers);
        const matrix = motifMatrix(motif, SEQ, l * 1009 + h * 31 + 3);
        const peak = matrix.reduce((mx, r) => Math.max(mx, ...r), 0) || 1;
        out.push({
          layer: l,
          head: h,
          motif,
          role: ov?.role || MOTIF_ROLE[motif],
          matrix,
          peak,
        });
      }
    }
    return out;
  }, [nLayers, nHeads, overrides]);

  const cellOf = (l: number, h: number) => cells[l * nHeads + h];
  const active = hover ? cellOf(hover.layer, hover.head) : null;

  // Color ramp for a single attention weight, given the cell's local peak.
  const heat = (v: number, peak: number) => {
    const t = clamp(v / peak, 0, 1);
    return mix(p.surface, fill, 0.05 + 0.95 * Math.pow(t, 0.7));
  };

  // Wave reveal: diagonal sweep across the grid (top-left → bottom-right).
  const maxRank = nLayers + nHeads;
  const sweep = (duration / 1000) * 0.65;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <div className="flex items-stretch gap-3">
          {/* Layer axis (rows). */}
          {showLabels && (
            <div className="flex flex-col justify-around pr-0.5 pt-[18px]">
              {Array.from({ length: nLayers }, (_, l) => (
                <span
                  key={`ly-${l}`}
                  className="flex flex-1 items-center justify-end font-mono text-[9.5px] uppercase tracking-label transition-colors"
                  style={{ color: hover?.layer === l ? p.ink : p.inkFaint }}
                >
                  L{l}
                </span>
              ))}
            </div>
          )}

          <div className="min-w-0 flex-1">
            {/* Head axis (columns). */}
            {showLabels && (
              <div
                className="grid gap-[5px] pb-1.5"
                style={{ gridTemplateColumns: `repeat(${nHeads}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: nHeads }, (_, h) => (
                  <span
                    key={`hd-${h}`}
                    className="text-center font-mono text-[9.5px] uppercase tracking-label transition-colors"
                    style={{ color: hover?.head === h ? p.ink : p.inkFaint }}
                  >
                    H{h}
                  </span>
                ))}
              </div>
            )}

            {/* Thumbnail grid. */}
            <div
              className="grid items-start gap-[5px]"
              style={{
                gridTemplateColumns: `repeat(${nHeads}, minmax(0, 1fr))`,
                gridAutoRows: "auto",
              }}
            >
              {cells.map((cell) => {
                const rank = cell.layer + cell.head;
                const delay = reduced ? 0 : (rank / maxRank) * sweep;
                const isActive = hover?.layer === cell.layer && hover?.head === cell.head;
                const dim =
                  hover != null && !isActive && hover.layer !== cell.layer && hover.head !== cell.head;
                return (
                  <motion.button
                    key={`cell-${cell.layer}-${cell.head}-${token}`}
                    type="button"
                    aria-label={`Layer ${cell.layer}, head ${cell.head}: ${cell.role}`}
                    className="relative block aspect-square w-full overflow-hidden rounded-[3px]"
                    style={{
                      background: p.surface,
                      boxShadow: isActive
                        ? `0 0 0 1.5px ${fill}`
                        : `inset 0 0 0 0.5px ${withAlpha(p.borderStrong, 0.45)}`,
                    }}
                    initial={{ opacity: 0, scale: reduced ? 1 : 0.7 }}
                    animate={{
                      opacity: inView ? (dim ? 0.32 : 1) : 0,
                      scale: inView ? (isActive ? 1.06 : 1) : reduced ? 1 : 0.7,
                    }}
                    transition={{
                      opacity: { duration: reduced ? 0 : 0.45, delay, ease: [0.22, 1, 0.36, 1] },
                      scale: isActive
                        ? { type: "spring", stiffness: 320, damping: 22 }
                        : { duration: reduced ? 0 : 0.45, delay, ease: [0.22, 1, 0.36, 1] },
                    }}
                    onMouseEnter={() => setHover({ layer: cell.layer, head: cell.head })}
                    onMouseMove={(e) => {
                      const host = e.currentTarget.offsetParent as HTMLElement | null;
                      const box = (host ?? e.currentTarget).getBoundingClientRect();
                      setTip({ x: e.clientX - box.left, y: e.clientY - box.top });
                    }}
                    onMouseLeave={() => {
                      setHover(null);
                      setTip(null);
                    }}
                    onFocus={() => setHover({ layer: cell.layer, head: cell.head })}
                    onBlur={() => setHover(null)}
                  >
                    <Thumbnail cell={cell} heat={heat} />
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Enlarged detail map of the hovered head. */}
          <DetailPanel cell={active} fill={fill} heat={heat} palette={p} />
        </div>

        <FloatingTooltip x={tip?.x ?? 0} y={tip?.y ?? 0} visible={hover != null && tip != null}>
          {active != null && (
            <>
              <div className="mb-1.5 flex items-baseline gap-1.5 font-mono text-[11px]">
                <span className="font-semibold text-canvas">
                  L{active.layer}·H{active.head}
                </span>
                <span className="opacity-55">{active.role}</span>
              </div>
              <TooltipRow label="motif" value={active.motif} />
              <TooltipRow label="peak weight" value={round(active.peak, 3)} />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>

        {/* Heat ramp legend. */}
        <div className="mt-3.5 flex items-center justify-center gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">low</span>
          <div
            className="h-2 w-28 rounded-full"
            style={{
              background: `linear-gradient(to right, ${mix(p.surface, fill, 0.05)}, ${fill})`,
              border: `0.5px solid ${withAlpha(p.borderStrong, 0.6)}`,
            }}
          />
          <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
            attention weight
          </span>
        </div>
      </div>
    </Figure>
  );
}

/** A tiny n×n heatmap rendered as an SVG, sized to fill its square button. */
function Thumbnail({
  cell,
  heat,
}: {
  cell: Cell;
  heat: (v: number, peak: number) => string;
}) {
  const n = cell.matrix.length;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} preserveAspectRatio="none" className="block h-full w-full">
      {cell.matrix.map((row, q) =>
        row.map((v, k) => (
          <rect key={`${q}-${k}`} x={k} y={q} width={1.02} height={1.02} fill={heat(v, cell.peak)} />
        )),
      )}
    </svg>
  );
}

/** The labeled, enlarged attention map for the focused head. */
function DetailPanel({
  cell,
  fill,
  heat,
  palette,
}: {
  cell: Cell | null;
  fill: string;
  heat: (v: number, peak: number) => string;
  palette: ReturnType<typeof usePalette>;
}) {
  const p = palette;
  const n = cell?.matrix.length ?? SEQ;
  const pad = 16;
  const grid = 132;
  const total = grid + pad;
  return (
    <motion.div
      className="hidden shrink-0 sm:block"
      style={{ width: total }}
      initial={false}
      animate={{ opacity: cell ? 1 : 0.45 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="rounded-reviz border p-3"
        style={{ borderColor: withAlpha(p.border, 0.9), background: p.surfaceAlt }}
      >
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink">
            {cell ? `L${cell.layer} · H${cell.head}` : "hover a head"}
          </span>
          {cell && (
            <span className="font-mono text-[9px] uppercase tracking-label text-accent">
              {cell.role}
            </span>
          )}
        </div>

        <div className="relative" style={{ width: grid, height: grid }}>
          <svg
            viewBox={`0 0 ${n} ${n}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full rounded-[3px]"
            style={{ background: p.surface, boxShadow: `inset 0 0 0 0.06px ${p.border}` }}
          >
            {cell
              ? cell.matrix.map((row, q) =>
                  row.map((v, k) => (
                    <rect
                      key={`d-${q}-${k}`}
                      x={k}
                      y={q}
                      width={1.02}
                      height={1.02}
                      fill={heat(v, cell.peak)}
                      stroke={withAlpha(p.borderStrong, 0.25)}
                      strokeWidth={0.02}
                    />
                  )),
                )
              : null}
          </svg>
          {!cell && (
            <div className="absolute inset-0 grid place-items-center px-3 text-center">
              <span className="font-serif text-[11px] italic leading-snug text-ink-faint">
                hover a thumbnail to enlarge its attention map
              </span>
            </div>
          )}
        </div>

        {/* Query / key axis hints. */}
        <div className="mt-1.5 flex items-center justify-between font-mono text-[8.5px] uppercase tracking-label text-ink-faint">
          <span>key →</span>
          <span style={{ color: cell ? withAlpha(fill, 0.9) : undefined }}>↓ query</span>
        </div>
      </div>
    </motion.div>
  );
}

const PRESET_PATTERNS_6x6: HeadPattern[] = [
  { layer: 0, head: 0, motif: "diagonal" },
  { layer: 0, head: 1, motif: "previous" },
  { layer: 0, head: 2, motif: "bos", role: "attention sink" },
  { layer: 0, head: 4, motif: "previous" },
  { layer: 1, head: 1, motif: "syntactic" },
  { layer: 2, head: 3, motif: "delimiter" },
  { layer: 3, head: 2, motif: "induction", role: "induction head" },
  { layer: 4, head: 0, motif: "induction", role: "induction head" },
  { layer: 4, head: 5, motif: "broad" },
  { layer: 5, head: 3, motif: "broad", role: "diffuse average" },
];

export const meta: RevizMeta = {
  id: "attention-heads",
  name: "Attention Heads Grid",
  category: "interpretability",
  description:
    "A grid of attention-pattern thumbnails — one tiny heatmap per layer × head — that fades in as a diagonal wave; hovering a head enlarges it into a labeled detail map revealing its role (induction, previous-token, attention sink, …).",
  tags: ["attention", "transformer", "heads", "interpretability", "heatmap", "mechanistic"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "AttentionHeadsGrid",
  sourcePath: "interpretability/AttentionHeadsGrid",
  aspect: 16 / 10,
  controls: [
    { key: "layers", label: "Layers (rows)", type: "number", group: "Data", default: 6, min: 1, max: 12, step: 1 },
    { key: "heads", label: "Heads (cols)", type: "number", group: "Data", default: 6, min: 1, max: 12, step: 1 },
    {
      key: "patterns",
      label: "Head motifs",
      type: "json",
      group: "Data",
      default: [],
      help: "Optional overrides: [{layer, head, motif, role?}]. Motif ∈ diagonal | previous | induction | bos | broad | syntactic | delimiter. Unspecified cells are generated deterministically.",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: DEFAULT_TITLE },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showLabels", label: "Axis labels", type: "boolean", group: "Labels", default: true },
    { key: "color", label: "Heat color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1400, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "model-zoo",
      name: "6×6 head zoo",
      props: {
        title: "Attention head zoo · 6 layers × 6 heads",
        caption:
          "Positional heads dominate early layers; induction and diffuse-averaging heads emerge late.",
        layers: 6,
        heads: 6,
        patterns: PRESET_PATTERNS_6x6,
      },
    },
    {
      id: "induction-circuit",
      name: "Induction circuit",
      props: {
        title: "Induction circuit · previous-token → induction",
        caption: "A previous-token head in layer 1 feeds the induction heads in layers 3–4.",
        layers: 5,
        heads: 4,
        patterns: [
          { layer: 1, head: 0, motif: "previous", role: "previous-token" },
          { layer: 1, head: 2, motif: "previous", role: "previous-token" },
          { layer: 3, head: 1, motif: "induction", role: "induction head" },
          { layer: 4, head: 2, motif: "induction", role: "induction head" },
        ],
      },
    },
    {
      id: "deep-grid",
      name: "Deep model",
      props: {
        title: "Deep transformer · 10 layers × 8 heads",
        caption: "The full head fingerprint of a deeper model, swept in diagonally.",
        layers: 10,
        heads: 8,
        patterns: [],
        duration: 1900,
      },
    },
  ],
};
