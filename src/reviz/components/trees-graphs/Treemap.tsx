"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
  clamp,
  formatCompact,
  mix,
  readableOn,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/** One weighted leaf. `group` buckets it into a color family. */
interface TreemapItem {
  label: string;
  value: number;
  group?: string;
}

export interface TreemapProps {
  data: TreemapItem[];
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  padding?: number;
  cornerRadius?: number;
  showValues?: boolean;
  showLegend?: boolean;
  duration?: number;
}

interface Cell {
  item: TreemapItem;
  index: number;
  groupIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ------------------------------------------------------------------ */
/* Squarified treemap layout (Bruls, Huizing & van Wijk, 2000)         */
/* ------------------------------------------------------------------ */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Sized {
  index: number;
  area: number; // area in px², proportional to value
}

const worst = (row: number[], side: number): number => {
  if (row.length === 0) return Infinity;
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  for (const a of row) {
    sum += a;
    if (a > max) max = a;
    if (a < min) min = a;
  }
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
};

/** Lay one accumulated row along the short side of `space`, return the leftover rect. */
function layoutRow(
  row: Sized[],
  space: Rect,
  out: Record<number, Rect>,
): Rect {
  const rowArea = row.reduce((s, r) => s + r.area, 0);
  if (rowArea <= 0) return space;
  const horizontal = space.w >= space.h;
  if (horizontal) {
    const rowW = rowArea / space.h;
    let y = space.y;
    for (const r of row) {
      const h = (r.area / rowArea) * space.h;
      out[r.index] = { x: space.x, y, w: rowW, h };
      y += h;
    }
    return { x: space.x + rowW, y: space.y, w: space.w - rowW, h: space.h };
  }
  const rowH = rowArea / space.w;
  let x = space.x;
  for (const r of row) {
    const w = (r.area / rowArea) * space.w;
    out[r.index] = { x, y: space.y, w, h: rowH };
    x += w;
  }
  return { x: space.x, y: space.y + rowH, w: space.w, h: space.h - rowH };
}

function squarify(sized: Sized[], width: number, height: number): Record<number, Rect> {
  const out: Record<number, Rect> = {};
  let space: Rect = { x: 0, y: 0, w: width, h: height };
  let row: Sized[] = [];
  const items = [...sized].sort((a, b) => b.area - a.area);

  for (const item of items) {
    const side = Math.min(space.w, space.h);
    const current = row.map((r) => r.area);
    const withItem = [...current, item.area];
    if (row.length === 0 || worst(withItem, side) <= worst(current, side)) {
      row.push(item);
    } else {
      space = layoutRow(row, space, out);
      row = [item];
    }
  }
  if (row.length > 0) layoutRow(row, space, out);
  return out;
}

/* ------------------------------------------------------------------ */

export default function Treemap({
  data,
  title,
  caption,
  source,
  color,
  padding = 3,
  cornerRadius = 5,
  showValues = true,
  showLegend = true,
  duration = 1000,
}: TreemapProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const shadowId = useMemo(() => uid("treemap-shadow"), []);

  // Normalize: drop non-positive values, keep a stable index.
  const items = useMemo(
    () => data.filter((d) => Number.isFinite(d.value) && d.value > 0),
    [data],
  );

  // Distinct groups in order of first appearance → palette assignment.
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const it of items) {
      const g = it.group ?? it.label;
      if (!seen.includes(g)) seen.push(g);
    }
    return seen;
  }, [items]);

  const hasGroups = useMemo(() => items.some((d) => d.group != null), [items]);

  const total = useMemo(() => items.reduce((s, d) => s + d.value, 0) || 1, [items]);

  // Fill for a cell: grouped → palette series; ungrouped → accent shade by rank.
  const fillFor = (groupIndex: number, rank: number): string => {
    if (hasGroups) {
      const base = color && groups.length === 1 ? accent : p.series[groupIndex % p.series.length];
      return base;
    }
    // Single accent family: deeper for larger cells, fading toward surface for small.
    const t = clamp(rank / Math.max(1, items.length - 1), 0, 1);
    return mix(accent, p.surfaceAlt, t * 0.55);
  };

  const legendItems: LegendItem[] = hasGroups
    ? groups.map((g, i) => ({
        label: g,
        color: color && groups.length === 1 ? accent : p.series[i % p.series.length],
        shape: "square",
      }))
    : [];

  const activeItem =
    hover && hover.i >= 0 && hover.i < items.length ? items[hover.i] : null;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 10} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;
            if (W <= 0 || H <= 0) return <g />;

            // Build pixel-area cells from the squarified layout.
            const areaScale = (W * H) / total;
            const sized: Sized[] = items.map((d, i) => ({
              index: i,
              area: Math.max(d.value * areaScale, 0),
            }));
            const rects = squarify(sized, W, H);

            const cells: Cell[] = items.map((d, i) => {
              const r = rects[i] ?? { x: 0, y: 0, w: 0, h: 0 };
              return {
                item: d,
                index: i,
                groupIndex: groups.indexOf(d.group ?? d.label),
                x: r.x,
                y: r.y,
                w: r.w,
                h: r.h,
              };
            });

            const pad = clamp(padding, 0, 14);
            // Larger cells appear first, sweeping outward from the dominant corner.
            const order = [...cells].sort((a, b) => b.w * b.h - a.w * a.h);
            const rank = new Map<number, number>();
            order.forEach((c, i) => rank.set(c.index, i));

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={4} blur={10} opacity={0.26} />
                </defs>

                {cells.map((c) => {
                  const w = Math.max(0, c.w - pad);
                  const h = Math.max(0, c.h - pad);
                  if (w <= 0 || h <= 0) return null;
                  const cx = c.x + pad / 2;
                  const cy = c.y + pad / 2;
                  const r = rank.get(c.index) ?? c.index;
                  const fill = fillFor(c.groupIndex, r);
                  const active = hover?.i === c.index;
                  const dim = hover != null && !active;

                  const lift = Math.min(5, Math.min(w, h) * 0.12);
                  const ink = readableOn(fill);

                  // Room for label / value text inside the cell.
                  const showText = w > 46 && h > 26;
                  const showVal = showValues && showText && h > 42;
                  const rad = clamp(cornerRadius, 0, Math.min(w, h) / 2);

                  const dur = reduced ? 0 : Math.max(0.001, duration / 1000);
                  const delay = reduced
                    ? 0
                    : (r / Math.max(1, cells.length)) * (duration / 1000) * 0.7;

                  return (
                    <motion.g
                      key={`${c.item.label}-${c.index}`}
                      initial={false}
                      animate={{
                        x: active ? -lift : 0,
                        y: active ? -lift : 0,
                        opacity: dim ? 0.55 : 1,
                      }}
                      transition={{ type: "spring", stiffness: 320, damping: 26 }}
                      onMouseMove={(e) => {
                        const svg = (e.currentTarget as SVGGElement)
                          .ownerSVGElement as SVGSVGElement;
                        const box = svg.getBoundingClientRect();
                        setHover({ i: c.index, x: e.clientX - box.left, y: e.clientY - box.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <motion.rect
                        x={cx}
                        y={cy}
                        rx={rad}
                        fill={fill}
                        stroke={p.canvas}
                        strokeWidth={1}
                        filter={active ? `url(#${shadowId})` : undefined}
                        initial={{ width: 0, height: 0 }}
                        animate={
                          inView
                            ? { width: w, height: h }
                            : { width: 0, height: 0 }
                        }
                        transition={{
                          duration: dur,
                          delay,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ transformBox: "fill-box", transformOrigin: "center" }}
                        key={`${token}-rect-${c.index}`}
                      />

                      {showText && (
                        <motion.g
                          initial={{ opacity: 0 }}
                          animate={{ opacity: inView ? 1 : 0 }}
                          transition={{ delay: reduced ? 0 : delay + duration / 1400, duration: reduced ? 0 : 0.3 }}
                          key={`${token}-txt-${c.index}`}
                          style={{ pointerEvents: "none" }}
                        >
                          <text
                            x={cx + 9}
                            y={cy + 16}
                            fill={ink}
                            className="font-mono uppercase"
                            fontSize={10}
                            letterSpacing={0.5}
                            opacity={0.92}
                          >
                            {clipLabel(c.item.label, w)}
                          </text>
                          {showVal && (
                            <text
                              x={cx + 9}
                              y={cy + 33}
                              fill={ink}
                              className="font-sans tabular-nums"
                              fontSize={clamp(Math.min(w, h) * 0.16, 12, 20)}
                              fontWeight={600}
                              opacity={0.96}
                            >
                              {formatCompact(c.item.value)}
                            </text>
                          )}
                        </motion.g>
                      )}
                    </motion.g>
                  );
                })}

                {/* Faint enclosing frame for a finished, framed-figure look. */}
                <rect
                  x={0.5}
                  y={0.5}
                  width={Math.max(0, W - 1)}
                  height={Math.max(0, H - 1)}
                  rx={clamp(cornerRadius, 0, 8)}
                  fill="none"
                  stroke={withAlpha(p.borderStrong, 0.6)}
                  strokeWidth={1}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={activeItem != null}>
          {activeItem != null && (
            <>
              <div className="mb-1 flex items-center gap-1.5">
                {hasGroups && (
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{
                      background:
                        color && groups.length === 1
                          ? accent
                          : p.series[groups.indexOf(activeItem.group ?? activeItem.label) % p.series.length],
                    }}
                  />
                )}
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-80">
                  {activeItem.label}
                </span>
              </div>
              {activeItem.group != null && (
                <TooltipRow label="group" value={activeItem.group} />
              )}
              <TooltipRow label="value" value={formatCompact(activeItem.value, 2)} />
              <TooltipRow label="share" value={`${((activeItem.value / total) * 100).toFixed(1)}%`} />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>

      {showLegend && hasGroups && legendItems.length > 0 && (
        <Legend items={legendItems} align="center" className="mt-3" />
      )}
    </Figure>
  );
}

/** Truncate a label to roughly fit the cell width (mono ~6px/char at 10px). */
function clipLabel(label: string, w: number): string {
  const max = Math.max(2, Math.floor((w - 16) / 6));
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(1, max - 1))}…`;
}

export const meta: RevizMeta = {
  id: "treemap",
  name: "Treemap",
  category: "trees-graphs",
  description:
    "A squarified treemap that packs weighted items into space-filling tiles, colored by group, that scale in on scroll and lift under the cursor.",
  tags: ["treemap", "hierarchy", "proportion", "composition", "weighted", "tiles", "squarified"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "Treemap",
  sourcePath: "trees-graphs/Treemap",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Items",
      type: "json",
      group: "Data",
      help: "Array of { label, value, group? } weighted leaves.",
      default: [
        { label: "transformer", value: 18400, group: "core" },
        { label: "tokenizer", value: 6200, group: "core" },
        { label: "scheduler", value: 4100, group: "core" },
        { label: "trainer", value: 12800, group: "training" },
        { label: "optim", value: 5300, group: "training" },
        { label: "data_loader", value: 7600, group: "training" },
        { label: "eval_harness", value: 9100, group: "eval" },
        { label: "benchmarks", value: 4800, group: "eval" },
        { label: "metrics", value: 2600, group: "eval" },
        { label: "serve", value: 8700, group: "infra" },
        { label: "kv_cache", value: 3400, group: "infra" },
        { label: "telemetry", value: 2900, group: "infra" },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Codebase size by module" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "padding", label: "Cell padding", type: "number", group: "Layout", default: 3, min: 0, max: 14, step: 1, unit: "px" },
    { key: "cornerRadius", label: "Corner radius", type: "number", group: "Style", default: 5, min: 0, max: 16, step: 1, unit: "px" },
    { key: "showValues", label: "Show values", type: "boolean", group: "Style", default: true },
    { key: "showLegend", label: "Show legend", type: "boolean", group: "Style", default: true },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1000, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "codebase",
      name: "Codebase by module",
      props: {
        title: "Codebase size by module",
        caption: "Lines of code per package, grouped by subsystem.",
        source: "git ls-files",
        data: [
          { label: "transformer", value: 18400, group: "core" },
          { label: "tokenizer", value: 6200, group: "core" },
          { label: "scheduler", value: 4100, group: "core" },
          { label: "trainer", value: 12800, group: "training" },
          { label: "optim", value: 5300, group: "training" },
          { label: "data_loader", value: 7600, group: "training" },
          { label: "eval_harness", value: 9100, group: "eval" },
          { label: "benchmarks", value: 4800, group: "eval" },
          { label: "metrics", value: 2600, group: "eval" },
          { label: "serve", value: 8700, group: "infra" },
          { label: "kv_cache", value: 3400, group: "infra" },
          { label: "telemetry", value: 2900, group: "infra" },
        ],
      },
    },
    {
      id: "token-budget",
      name: "Token budget by category",
      props: {
        title: "Context budget by category",
        caption: "Token allocation across a 200k context window.",
        source: "1M-token run",
        padding: 4,
        data: [
          { label: "system prompt", value: 4200, group: "instructions" },
          { label: "tool schemas", value: 9800, group: "instructions" },
          { label: "retrieved docs", value: 86000, group: "context" },
          { label: "code files", value: 52000, group: "context" },
          { label: "conversation", value: 31000, group: "context" },
          { label: "scratchpad", value: 11000, group: "reasoning" },
          { label: "plan", value: 4600, group: "reasoning" },
          { label: "completion", value: 8200, group: "output" },
        ],
      },
    },
    {
      id: "single",
      name: "Single accent (ungrouped)",
      props: {
        title: "Inference latency by stage",
        caption: "Milliseconds per request stage.",
        showLegend: false,
        cornerRadius: 8,
        data: [
          { label: "prefill", value: 320 },
          { label: "decode", value: 540 },
          { label: "tokenize", value: 48 },
          { label: "retrieval", value: 180 },
          { label: "rerank", value: 92 },
          { label: "guardrails", value: 66 },
          { label: "format", value: 24 },
        ],
      },
    },
  ],
};
