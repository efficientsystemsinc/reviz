"use client";

import { scaleLinear, scaleLog } from "d3-scale";
import { area as d3Area, curveBasis } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Legend,
  ResponsiveSvg,
  TooltipRow,
  VerticalFade,
  clamp,
  formatCompact,
  mix,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */

interface LatencyGroup {
  name: string;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

const PCTS = [
  { key: "p50", label: "p50" },
  { key: "p90", label: "p90" },
  { key: "p95", label: "p95" },
  { key: "p99", label: "p99" },
] as const;

type PctKey = (typeof PCTS)[number]["key"];

export interface LatencyPercentilesProps {
  groups?: LatencyGroup[];
  title?: string;
  caption?: string;
  source?: string;
  unit?: string;
  logScale?: boolean;
  color?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */

/**
 * Synthesize a smooth, heavy-tailed density that honors the given percentiles.
 * We sample many "requests" by interpolating between the percentile anchors with
 * a fixed seed, so the violin shape is deterministic per group yet looks organic.
 */
function densityFor(g: LatencyGroup, domainMax: number, log: boolean): { x: number; w: number }[] {
  // Anchor points: (cumulative probability, latency). Tail stretches past p99.
  const anchors: [number, number][] = [
    [0.0, Math.max(g.p50 * 0.18, domainMax * 0.002)],
    [0.5, g.p50],
    [0.9, g.p90],
    [0.95, g.p95],
    [0.99, g.p99],
    [1.0, g.p99 * 1.32],
  ];
  const tx = (v: number) => (log ? Math.log10(Math.max(v, 1e-6)) : v);
  const bins = 64;
  const lo = tx(anchors[0][1]);
  const hi = tx(anchors[anchors.length - 1][1]);
  const span = Math.max(hi - lo, 1e-6);
  const counts = new Array(bins).fill(0);
  // Walk the CDF and deposit probability mass into bins; smoother than sampling.
  const steps = 2000;
  for (let s = 0; s <= steps; s++) {
    const q = s / steps;
    // find bracketing anchors by cumulative probability
    let a = anchors[0];
    let b = anchors[anchors.length - 1];
    for (let i = 0; i < anchors.length - 1; i++) {
      if (q >= anchors[i][0] && q <= anchors[i + 1][0]) {
        a = anchors[i];
        b = anchors[i + 1];
        break;
      }
    }
    const t = b[0] === a[0] ? 0 : (q - a[0]) / (b[0] - a[0]);
    const lat = a[1] + (b[1] - a[1]) * t;
    const pos = (tx(lat) - lo) / span;
    const bin = clamp(Math.floor(pos * (bins - 1)), 0, bins - 1);
    counts[bin] += 1;
  }
  // light smoothing
  const smooth = counts.map((_, i) => {
    const a = counts[i - 1] ?? counts[i];
    const c = counts[i + 1] ?? counts[i];
    return (a + counts[i] * 2 + c) / 4;
  });
  const maxC = Math.max(1, ...smooth);
  return smooth.map((c, i) => ({
    x: anchors[0][1] + (anchors[anchors.length - 1][1] - anchors[0][1]) * (i / (bins - 1)),
    w: c / maxC,
  }));
}

export default function LatencyPercentiles({
  groups = [
    { name: "Cold start", p50: 5000, p90: 9200, p95: 11800, p99: 18400 },
    { name: "Warm", p50: 1000, p90: 1300, p95: 1500, p99: 3200 },
  ],
  title = "",
  caption = "",
  source = "",
  unit = "ms",
  logScale = false,
  color = "",
  duration = 1000,
}: LatencyPercentilesProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ gi: number; pk: PctKey; x: number; y: number } | null>(null);

  const accent = color || p.accent;
  const safeGroups = groups.length ? groups : [];

  const fmt = (v: number) => `${formatCompact(v)}${unit ? ` ${unit}` : ""}`;
  const fmtTick = (v: number) => formatCompact(v);

  const gradId = useMemo(() => uid("latfade"), []);
  const legendItems: LegendItem[] = PCTS.map((pc, i) => ({
    label: pc.label,
    color: i === 0 ? accent : mixTone(accent, p, i),
    shape: i === 3 ? "dashed" : "line",
  }));

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg
          aspect={16 / 9}
          margin={{ top: 18, right: 30, bottom: 40, left: 108 }}
        >
          {({ inner, margin }) => {
            const rowH = inner.height / Math.max(1, safeGroups.length);
            const violinH = Math.min(rowH * 0.46, 72);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <VerticalFade id={gradId} color={accent} from={0.26} to={0.04} />
                </defs>

                {safeGroups.map((g, gi) => {
                  const cy = rowH * gi + rowH / 2;
                  // Each row gets its own x-scale so groups at very different
                  // latency magnitudes (e.g. cold vs warm) are each legible.
                  const rowMax = g.p99 * 1.34;
                  const rowMin = logScale ? Math.max(1, g.p50 * 0.16) : 0;
                  const x = logScale
                    ? scaleLog().domain([Math.max(1, rowMin), rowMax]).range([0, inner.width]).clamp(true)
                    : scaleLinear().domain([0, rowMax]).range([0, inner.width]).nice();

                  const xTicks = logScale
                    ? (x as ReturnType<typeof scaleLog>).ticks(5)
                    : (x as ReturnType<typeof scaleLinear>).ticks(6);

                  const density = densityFor(g, rowMax, logScale);
                  const visible = density.filter((d) => d.x >= rowMin);

                  const violin = d3Area<{ x: number; w: number }>()
                    .x((d) => x(Math.max(d.x, rowMin)))
                    .y0((d) => cy - (d.w * violinH) / 2)
                    .y1((d) => cy + (d.w * violinH) / 2)
                    .curve(curveBasis);

                  const violinPath = violin(visible) ?? "";
                  const drawDelay = gi * 0.12;

                  // Bottom edge of this row's band, where its own tick labels sit.
                  const axisY = cy + violinH / 2 + 22;

                  // Layout pass for the p50/p90/p95/p99 callouts. Each label is
                  // tied to its tick by a short leader; we alternate above/below
                  // and push crowded labels into stacked lanes so adjacent boxes
                  // never touch and the label-to-line association stays clear.
                  const half = violinH / 2 + 9;
                  const lane = 14; // vertical spacing between stacked lanes
                  const labelLayout = PCTS.map((pc, pi) => {
                    const v = g[pc.key];
                    const hidden = logScale && v < rowMin;
                    const px = x(Math.max(v, rowMin));
                    const above = pi % 2 === 0;
                    const halfW = pc.label.length * 3 + 3;
                    return { pi, pc, v, hidden, px, above, halfW, tier: 0 };
                  });
                  // Within each side, bump a label up a tier whenever its box
                  // would overlap an already-placed label on the same side.
                  for (const side of [true, false]) {
                    const placed: { px: number; halfW: number; tier: number }[] = [];
                    for (const L of labelLayout) {
                      if (L.hidden || L.above !== side) continue;
                      let tier = 0;
                      // bump until this box clears every same-tier neighbour
                      while (
                        placed.some(
                          (q) => q.tier === tier && Math.abs(q.px - L.px) < q.halfW + L.halfW + 4,
                        )
                      ) {
                        tier += 1;
                      }
                      L.tier = tier;
                      placed.push({ px: L.px, halfW: L.halfW, tier });
                    }
                  }

                  return (
                    <g key={`${g.name}-${gi}`}>
                      {/* per-row vertical gridlines (this row's own scale) */}
                      {xTicks.map((t, i) => (
                        <line
                          key={`grid-${gi}-${i}`}
                          x1={x(t)}
                          x2={x(t)}
                          y1={cy - violinH / 2 - 14}
                          y2={cy + violinH / 2 + 14}
                          stroke={p.grid}
                          strokeWidth={1}
                          strokeDasharray="2 5"
                          shapeRendering="crispEdges"
                        />
                      ))}

                      {/* group label */}
                      <text
                        x={-margin.left + 4}
                        y={cy - 6}
                        fill={p.ink}
                        className="font-mono uppercase"
                        style={{ fontSize: 11, letterSpacing: "0.06em" }}
                      >
                        {g.name}
                      </text>
                      <text
                        x={-margin.left + 4}
                        y={cy + 11}
                        fill={p.inkFaint}
                        className="font-mono"
                        style={{ fontSize: 9.5, letterSpacing: "0.02em" }}
                      >
                        p50 {fmtTick(g.p50)}{unit ? ` ${unit}` : ""}
                      </text>

                      {/* baseline of the row */}
                      <line
                        x1={0}
                        x2={inner.width}
                        y1={cy}
                        y2={cy}
                        stroke={p.border}
                        strokeWidth={1}
                        shapeRendering="crispEdges"
                      />

                      {/* per-row x ticks (this group's own latency scale) */}
                      {xTicks.map((t, i) => (
                        <text
                          key={`xt-${gi}-${i}`}
                          x={x(t)}
                          y={axisY}
                          textAnchor="middle"
                          fill={p.inkFaint}
                          className="font-mono"
                          style={{ fontSize: 10, letterSpacing: "0.04em" }}
                        >
                          {fmtTick(t)}
                        </text>
                      ))}
                      {gi === safeGroups.length - 1 && (
                        <text
                          x={inner.width}
                          y={axisY + 20}
                          textAnchor="end"
                          fill={p.inkMuted}
                          className="font-mono uppercase"
                          style={{ fontSize: 9, letterSpacing: "0.14em" }}
                        >
                          latency{unit ? ` (${unit})` : ""}
                        </text>
                      )}

                      {/* density / violin */}
                      <motion.path
                        d={violinPath}
                        fill={`url(#${gradId})`}
                        stroke={withAlpha(accent, 0.45)}
                        strokeWidth={1}
                        initial={reduced ? false : { opacity: 0, scaleY: 0.2 }}
                        animate={
                          inView
                            ? { opacity: 1, scaleY: 1 }
                            : reduced
                              ? { opacity: 1, scaleY: 1 }
                              : { opacity: 0, scaleY: 0.2 }
                        }
                        transition={{
                          duration: duration / 1000,
                          delay: drawDelay,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ transformBox: "fill-box", transformOrigin: "center" }}
                        key={`violin-${token}-${gi}`}
                      />

                      {/* percentile markers */}
                      {labelLayout.map(({ pi, pc, px, above, halfW, tier }) => {
                        if (logScale && g[pc.key] < rowMin) return null;
                        const isP50 = pc.key === "p50";
                        const isTail = pc.key === "p99";
                        const tone = isP50 ? accent : mixTone(accent, p, pi);
                        const active = hover?.gi === gi && hover?.pk === pc.key;
                        const markDelay = drawDelay + duration / 1000 + pi * 0.06;
                        // Tick endpoint nearest the label, and the label baseline,
                        // pushed out by its lane so stacked boxes never touch.
                        const tickEnd = above ? cy - half : cy + half;
                        const labelY = above
                          ? cy - half - 6 - tier * lane
                          : cy + half + 10 + tier * lane;
                        const plateY = labelY - 8;

                        return (
                          <motion.g
                            key={pc.key}
                            initial={reduced ? false : { opacity: 0 }}
                            animate={inView || reduced ? { opacity: 1 } : { opacity: 0 }}
                            transition={{ duration: 0.3, delay: markDelay }}
                            style={{ cursor: "pointer" }}
                            onMouseMove={(e) => {
                              const r = (
                                e.currentTarget.ownerSVGElement as SVGSVGElement
                              ).getBoundingClientRect();
                              setHover({
                                gi,
                                pk: pc.key,
                                x: e.clientX - r.left,
                                y: e.clientY - r.top,
                              });
                            }}
                            onMouseLeave={() => setHover(null)}
                          >
                            {/* wide invisible hit target */}
                            <rect
                              x={px - 9}
                              y={cy - half}
                              width={18}
                              height={half * 2}
                              fill="transparent"
                            />
                            <line
                              x1={px}
                              x2={px}
                              y1={cy - half}
                              y2={cy + half}
                              stroke={tone}
                              strokeWidth={active ? 2.4 : isP50 ? 2 : 1.4}
                              strokeDasharray={isTail ? "3 3" : undefined}
                            />
                            <circle
                              cx={px}
                              cy={cy}
                              r={isP50 ? 3.4 : 2.6}
                              fill={tone}
                              stroke={p.surface}
                              strokeWidth={1}
                            />
                            {/* leader from the tick to its stacked label, so the
                                label-to-line association is never ambiguous */}
                            {tier > 0 && (
                              <line
                                x1={px}
                                x2={px}
                                y1={tickEnd}
                                y2={above ? labelY + 3 : labelY - 9}
                                stroke={withAlpha(tone, 0.55)}
                                strokeWidth={1}
                              />
                            )}
                            {/* opaque background plate so the label stays legible
                                over gridlines and the row's x-axis tick labels */}
                            <rect
                              x={px - halfW - 2}
                              y={plateY}
                              width={halfW * 2 + 4}
                              height={13}
                              fill={p.canvas}
                              rx={2}
                            />
                            <text
                              x={px}
                              y={labelY}
                              textAnchor="middle"
                              fill={active ? p.ink : tone}
                              className="font-mono"
                              style={{ fontSize: 9.5, letterSpacing: "0.04em" }}
                            >
                              {pc.label}
                            </text>
                          </motion.g>
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && safeGroups[hover.gi] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {safeGroups[hover.gi].name} · {hover.pk}
              </div>
              <TooltipRow label="latency" value={fmt(safeGroups[hover.gi][hover.pk])} />
              <TooltipRow
                label="vs p50"
                value={`${(safeGroups[hover.gi][hover.pk] / Math.max(1, safeGroups[hover.gi].p50)).toFixed(2)}×`}
              />
            </>
          )}
        </FloatingTooltip>

        <div className="mt-3 flex items-center justify-between gap-4">
          <Legend items={legendItems} align="left" />
          <button
            type="button"
            onClick={replay}
            className="font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
          >
            replay
          </button>
        </div>
      </div>
    </Figure>
  );
}

/** Blend accent toward the warn/bad tones as the percentile climbs into the tail. */
function mixTone(accent: string, p: ReturnType<typeof usePalette>, pi: number): string {
  if (pi <= 0) return accent;
  if (pi === 1) return p.warn;
  if (pi === 2) return mix(p.warn, p.bad, 0.5);
  return p.bad;
}

/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "latency-percentiles",
  name: "Latency Percentiles",
  category: "ml-eval",
  description:
    "Latency distributions drawn as faint violins with p50/p90/p95/p99 marked as labeled ticks on a shared scale — see the long tail at a glance.",
  tags: ["latency", "percentiles", "distribution", "tail", "p99", "violin", "performance"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "LatencyPercentiles",
  sourcePath: "ml-eval/LatencyPercentiles",
  aspect: 16 / 9,
  controls: [
    {
      key: "groups",
      label: "Groups",
      type: "json",
      group: "Data",
      help: "Each group needs name, p50, p90, p95, p99.",
      default: [
        { name: "Cold start", p50: 5000, p90: 9200, p95: 11800, p99: 18400 },
        { name: "Warm", p50: 1000, p90: 1300, p95: 1500, p99: 3200 },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "unit", label: "Unit", type: "text", group: "Labels", default: "ms" },
    { key: "logScale", label: "Log scale", type: "boolean", group: "Layout", default: false },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1000,
      min: 0,
      max: 2500,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "cold-vs-warm",
      name: "Cold vs warm",
      props: {
        title: "Inference latency — cold start vs warm",
        caption: "Cold starts pay a model-load tax; warm requests are p99-stable.",
        groups: [
          { name: "Cold start", p50: 5000, p90: 9200, p95: 11800, p99: 18400 },
          { name: "Warm", p50: 1000, p90: 1300, p95: 1500, p99: 3200 },
        ],
      },
    },
    {
      id: "log-tail",
      name: "Log scale tail",
      props: {
        title: "Serving latency by tier (log scale)",
        logScale: true,
        unit: "ms",
        groups: [
          { name: "Edge cache", p50: 12, p90: 28, p95: 44, p99: 180 },
          { name: "Region", p50: 80, p90: 160, p95: 240, p99: 920 },
          { name: "Cold GPU", p50: 5000, p90: 9200, p95: 11800, p99: 18400 },
        ],
      },
    },
    {
      id: "endpoints",
      name: "API endpoints",
      props: {
        title: "Endpoint latency percentiles",
        unit: "ms",
        groups: [
          { name: "/embed", p50: 42, p90: 88, p95: 120, p99: 310 },
          { name: "/chat", p50: 680, p90: 1400, p95: 1900, p99: 4200 },
          { name: "/rerank", p50: 120, p90: 240, p95: 330, p99: 880 },
        ],
      },
    },
  ],
};
