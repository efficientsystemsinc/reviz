"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Glow,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
  clamp,
  mix,
  readableOn,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  type RevizMeta,
} from "@/reviz";

type BlockShape = "rect" | "trapezoidL" | "trapezoidR" | "vector";

interface ArchBlock {
  /** Label shown inside the block. */
  label: string;
  /** Block geometry. */
  shape?: BlockShape;
  /** Optional dimension annotation (e.g. "512", "d=768"). */
  dim?: string;
  /** Optional explicit color (overrides the auto series ramp). */
  color?: string;
  /** Relative size weight (1 = baseline). */
  weight?: number;
}

export interface ArchitectureDiagramProps {
  blocks?: ArchBlock[];
  title?: string;
  caption?: string;
  source?: string;
  direction?: "horizontal" | "vertical";
  color?: string;
  showDims?: boolean;
  showArrows?: boolean;
  duration?: number;
}

const DEFAULT_BLOCKS: ArchBlock[] = [
  { label: "Input", shape: "rect", dim: "tokens × d", color: "" },
  { label: "Encoder", shape: "trapezoidR", dim: "6 layers" },
  { label: "Latent", shape: "vector", dim: "d = 512" },
  { label: "Decoder", shape: "trapezoidL", dim: "6 layers" },
  { label: "Output", shape: "rect", dim: "logits" },
];

export default function ArchitectureDiagram({
  blocks = DEFAULT_BLOCKS,
  title = "Encoder–decoder transformer",
  caption = "",
  source = "",
  direction = "horizontal",
  color = "",
  showDims = true,
  showArrows = true,
  duration = 1100,
}: ArchitectureDiagramProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const ids = useMemo(
    () => ({ shadow: uid("arch-shadow"), glow: uid("arch-glow") }),
    [],
  );

  const vertical = direction === "vertical";
  const n = Math.max(1, blocks.length);
  // Per-block fill: explicit color, else a series color, with the accent leading.
  const colorFor = (b: ArchBlock, i: number) =>
    b.color || (i === 0 || i === n - 1 ? accent : p.series[i % p.series.length] || accent);

  const stagger = (duration / 1000) * 0.55;
  const playOn = inView || reduced;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/arch relative">
        <ResponsiveSvg
          aspect={vertical ? 3 / 4 : 16 / 7}
          margin={{ top: 18, right: 18, bottom: 18, left: 18 }}
        >
          {({ inner, margin }) => {
            // Lay blocks out along the flow axis, sized by weight, with gaps.
            const gap = clamp((vertical ? inner.height : inner.width) * 0.045, 16, 46);
            const along = (vertical ? inner.height : inner.width) - gap * (n - 1);
            const cross = vertical ? inner.width : inner.height;
            const weights = blocks.map((b) => Math.max(0.3, b.weight ?? 1));
            const wSum = weights.reduce((a, b) => a + b, 0);

            // Compute each block's box.
            let cursor = 0;
            const boxes = blocks.map((b, i) => {
              const span = (weights[i] / wSum) * along;
              const isVector = (b.shape ?? "rect") === "vector";
              // Vectors are deliberately thin along the flow axis.
              const flowLen = isVector ? clamp(span, 22, 46) : span;
              const start = cursor;
              cursor += (isVector ? flowLen : span) + gap;

              // Cross-axis sizing: trapezoids fan, rects/vectors use a base height.
              const baseCross = cross * 0.62;
              const wideCross = cross * 0.92;
              const narrowCross = cross * 0.4;
              const shape = b.shape ?? "rect";

              const box = vertical
                ? { x: (inner.width - baseCross) / 2, y: start, w: baseCross, h: flowLen }
                : { x: start, y: (inner.height - baseCross) / 2, w: flowLen, h: baseCross };

              return {
                ...b,
                shape,
                i,
                box,
                flowLen,
                wideCross,
                narrowCross,
                baseCross,
                fill: colorFor(b, i),
              };
            });

            const cellCount = 6;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={ids.shadow} dy={5} blur={10} opacity={0.16} />
                  <Glow id={ids.glow} blur={4} />
                </defs>

                {/* Flow arrows between consecutive blocks (drawn first, behind blocks). */}
                {showArrows &&
                  boxes.slice(0, -1).map((b, i) => {
                    const next = boxes[i + 1];
                    const a = vertical
                      ? { x: b.box.x + b.box.w / 2, y: b.box.y + b.box.h }
                      : { x: b.box.x + b.box.w, y: b.box.y + b.box.h / 2 };
                    const z = vertical
                      ? { x: next.box.x + next.box.w / 2, y: next.box.y }
                      : { x: next.box.x, y: next.box.y + next.box.h / 2 };
                    const delay = (i + 0.5) * stagger;
                    const head = 5;
                    return (
                      <g key={`flow-${i}`}>
                        <motion.line
                          x1={a.x}
                          y1={a.y}
                          x2={z.x}
                          y2={z.y}
                          stroke={p.borderStrong}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={playOn ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                          transition={{ duration: stagger, delay, ease: [0.22, 1, 0.36, 1] }}
                          key={`flow-line-${token}-${i}`}
                        />
                        <motion.path
                          d={
                            vertical
                              ? `M ${z.x - head} ${z.y - head} L ${z.x} ${z.y} L ${z.x + head} ${z.y - head}`
                              : `M ${z.x - head} ${z.y - head} L ${z.x} ${z.y} L ${z.x - head} ${z.y + head}`
                          }
                          fill="none"
                          stroke={p.borderStrong}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: playOn ? 1 : 0 }}
                          transition={{ duration: 0.2, delay: delay + stagger * 0.7 }}
                          key={`flow-head-${token}-${i}`}
                        />
                      </g>
                    );
                  })}

                {/* Blocks */}
                {boxes.map((b) => {
                  const active = hover?.i === b.i;
                  const fill = b.fill;
                  const ink = readableOn(fill);
                  const delay = b.i * stagger;
                  const { x, y, w, h } = b.box;

                  // Build the path / cells for the shape.
                  const onEnter = (e: React.MouseEvent) => {
                    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
                    if (!svg) return;
                    const r = svg.getBoundingClientRect();
                    setHover({ i: b.i, x: e.clientX - r.left, y: e.clientY - r.top });
                  };
                  const onMove = onEnter;
                  const onLeave = () => setHover(null);

                  // Shared label position.
                  const cx = x + w / 2;
                  const cy = y + h / 2;

                  return (
                    <motion.g
                      key={`block-${b.i}-${token}`}
                      initial={{ opacity: 0, scale: 0.82 }}
                      animate={playOn ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.82 }}
                      transition={{ duration: stagger, delay, ease: [0.34, 1.2, 0.5, 1] }}
                      style={{ transformOrigin: `${cx}px ${cy}px`, cursor: "pointer" }}
                      onMouseEnter={onEnter}
                      onMouseMove={onMove}
                      onMouseLeave={onLeave}
                      filter={active ? `url(#${ids.glow})` : `url(#${ids.shadow})`}
                    >
                      {b.shape === "vector" ? (
                        <VectorBlock
                          x={x}
                          y={y}
                          w={w}
                          h={h}
                          vertical={vertical}
                          cells={cellCount}
                          fill={fill}
                          tint={p.surface}
                          stroke={mix(fill, p.ink, 0.18)}
                          active={active}
                        />
                      ) : b.shape === "trapezoidL" || b.shape === "trapezoidR" ? (
                        <path
                          d={trapezoidPath(b, vertical)}
                          fill={fill}
                          fillOpacity={active ? 1 : 0.92}
                          stroke={mix(fill, p.ink, 0.22)}
                          strokeWidth={1.25}
                        />
                      ) : (
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          rx={10}
                          fill={fill}
                          fillOpacity={active ? 1 : 0.92}
                          stroke={mix(fill, p.ink, 0.22)}
                          strokeWidth={1.25}
                        />
                      )}

                      {/* Label */}
                      <text
                        x={cx}
                        y={b.shape === "vector" ? y + h + 16 : cy}
                        textAnchor="middle"
                        dy={b.shape === "vector" ? 0 : "0.34em"}
                        className="font-mono uppercase tracking-label"
                        style={{ fontSize: 11.5, fontWeight: 600 }}
                        fill={b.shape === "vector" ? p.inkMuted : ink}
                      >
                        {b.label}
                      </text>
                    </motion.g>
                  );
                })}

                {/* Dimension annotations */}
                {showDims &&
                  boxes.map((b) => {
                    if (!b.dim) return null;
                    const { x, y, w, h } = b.box;
                    const dimY = b.shape === "vector" ? y - 12 : vertical ? y + h / 2 : y - 9;
                    const dimX = vertical ? x + w + 12 : x + w / 2;
                    const anchor = vertical ? "start" : "middle";
                    const baseline = vertical ? "0.34em" : "0";
                    return (
                      <motion.text
                        key={`dim-${b.i}-${token}`}
                        x={dimX}
                        y={dimY}
                        textAnchor={anchor as "start" | "middle"}
                        dy={baseline}
                        className="font-mono tabular-nums"
                        style={{ fontSize: 9.5 }}
                        fill={p.inkFaint}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: playOn ? 1 : 0 }}
                        transition={{ duration: 0.3, delay: b.i * stagger + stagger * 0.8 }}
                      >
                        {b.dim}
                      </motion.text>
                    );
                  })}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && blocks[hover.i] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {blocks[hover.i].label}
              </div>
              <TooltipRow label="shape" value={shapeName(blocks[hover.i].shape ?? "rect")} />
              {blocks[hover.i].dim && <TooltipRow label="dim" value={blocks[hover.i].dim} />}
              <TooltipRow label="stage" value={`${hover.i + 1} / ${n}`} />
            </>
          )}
        </FloatingTooltip>

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/arch:opacity-100"
        >
          replay
        </button>
      </div>
    </Figure>
  );
}

/* ---------------------------------------------------------------- */
/* Shape helpers                                                     */
/* ---------------------------------------------------------------- */

function shapeName(s: BlockShape): string {
  return s === "trapezoidL"
    ? "trapezoid ◤"
    : s === "trapezoidR"
      ? "trapezoid ◥"
      : s === "vector"
        ? "vector"
        : "block";
}

/**
 * A trapezoid that fans wide→narrow (trapezoidR, encoder) or narrow→wide
 * (trapezoidL, decoder) along the flow axis. Cross-axis centered, corners eased
 * with a small radius via straight segments (kept crisp for schematic feel).
 */
function trapezoidPath(
  b: { box: { x: number; y: number; w: number; h: number }; wideCross: number; narrowCross: number; shape: BlockShape },
  vertical: boolean,
): string {
  const { x, y, w, h } = b.box;
  const wide = b.wideCross;
  const narrow = b.narrowCross;
  // trapezoidR: wide at the inlet, narrow at the outlet (compresses → encoder).
  // trapezoidL: narrow at the inlet, wide at the outlet (expands → decoder).
  const inWide = b.shape === "trapezoidR";

  if (vertical) {
    const cx = x + w / 2;
    const top = inWide ? wide : narrow;
    const bot = inWide ? narrow : wide;
    return [
      `M ${cx - top / 2} ${y}`,
      `L ${cx + top / 2} ${y}`,
      `L ${cx + bot / 2} ${y + h}`,
      `L ${cx - bot / 2} ${y + h}`,
      "Z",
    ].join(" ");
  }
  const cy = y + h / 2;
  const left = inWide ? wide : narrow;
  const right = inWide ? narrow : wide;
  return [
    `M ${x} ${cy - left / 2}`,
    `L ${x} ${cy + left / 2}`,
    `L ${x + w} ${cy + right / 2}`,
    `L ${x + w} ${cy - right / 2}`,
    "Z",
  ].join(" ");
}

/** A latent vector rendered as thin stacked cells with a gradient ramp. */
function VectorBlock({
  x,
  y,
  w,
  h,
  vertical,
  cells,
  fill,
  tint,
  stroke,
  active,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  vertical: boolean;
  cells: number;
  fill: string;
  tint: string;
  stroke: string;
  active: boolean;
}) {
  // Stack cells across the cross axis (so the vector reads as a tall column
  // when horizontal, or a wide row when vertical).
  const items = Array.from({ length: cells });
  if (vertical) {
    const cw = w / cells;
    return (
      <g>
        {items.map((_, k) => {
          const t = cells > 1 ? k / (cells - 1) : 0;
          return (
            <rect
              key={k}
              x={x + k * cw + 0.6}
              y={y}
              width={cw - 1.2}
              height={h}
              rx={2}
              fill={mix(fill, tint, active ? 0.0 : 0.12 - t * 0.12)}
              fillOpacity={0.55 + t * 0.45}
              stroke={stroke}
              strokeWidth={0.75}
            />
          );
        })}
      </g>
    );
  }
  const ch = h / cells;
  return (
    <g>
      {items.map((_, k) => {
        const t = cells > 1 ? k / (cells - 1) : 0;
        return (
          <rect
            key={k}
            x={x}
            y={y + k * ch + 0.6}
            width={w}
            height={ch - 1.2}
            rx={2}
            fill={mix(fill, tint, active ? 0.0 : 0.12 - t * 0.12)}
            fillOpacity={0.55 + t * 0.45}
            stroke={stroke}
            strokeWidth={0.75}
          />
        );
      })}
    </g>
  );
}

export const meta: RevizMeta = {
  id: "architecture-diagram",
  name: "Architecture Diagram",
  category: "diagrams",
  description:
    "A sequential neural-architecture schematic — input, encoder, latent, decoder, output — with trapezoid, block, and stacked-vector shapes, animated flow arrows, and dimension annotations.",
  tags: ["architecture", "schematic", "encoder", "decoder", "transformer", "pipeline", "neural-network"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ArchitectureDiagram",
  sourcePath: "diagrams/ArchitectureDiagram",
  aspect: 16 / 7,
  controls: [
    {
      key: "blocks",
      label: "Blocks",
      type: "json",
      group: "Data",
      help: "Each block: { label, shape: rect | trapezoidL | trapezoidR | vector, dim?, color?, weight? }",
      default: DEFAULT_BLOCKS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Encoder–decoder transformer" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "direction",
      label: "Flow direction",
      type: "select",
      group: "Layout",
      default: "horizontal",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
      ],
    },
    { key: "showDims", label: "Show dimensions", type: "boolean", group: "Layout", default: true },
    { key: "showArrows", label: "Show flow arrows", type: "boolean", group: "Layout", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "transformer",
      name: "Encoder–decoder transformer",
      props: {
        title: "Encoder–decoder transformer",
        caption: "Source tokens are compressed by the encoder into a latent code, then expanded by the decoder into output logits.",
        blocks: [
          { label: "Tokens", shape: "rect", dim: "n × d" },
          { label: "Encoder", shape: "trapezoidR", dim: "12 layers" },
          { label: "z", shape: "vector", dim: "d = 768" },
          { label: "Decoder", shape: "trapezoidL", dim: "12 layers" },
          { label: "Logits", shape: "rect", dim: "n × V" },
        ],
      },
    },
    {
      id: "vae",
      name: "Variational autoencoder",
      props: {
        title: "Variational autoencoder",
        caption: "An image is encoded to a low-dimensional latent z and reconstructed by the decoder.",
        blocks: [
          { label: "Image", shape: "rect", dim: "3 × 224²", weight: 1.1 },
          { label: "Encoder", shape: "trapezoidR", dim: "conv ×4" },
          { label: "z", shape: "vector", dim: "d = 256" },
          { label: "Decoder", shape: "trapezoidL", dim: "deconv ×4" },
          { label: "Recon", shape: "rect", dim: "3 × 224²", weight: 1.1 },
        ],
      },
    },
    {
      id: "vertical-pipeline",
      name: "Vertical perception stack",
      props: {
        title: "Robot perception stack",
        direction: "vertical",
        showArrows: true,
        blocks: [
          { label: "RGB-D", shape: "rect", dim: "1280 × 720" },
          { label: "Backbone", shape: "trapezoidR", dim: "ViT-L" },
          { label: "Features", shape: "vector", dim: "d = 1024" },
          { label: "Policy head", shape: "trapezoidL", dim: "MLP ×3" },
          { label: "Action", shape: "rect", dim: "7-DoF" },
        ],
      },
    },
  ],
};
