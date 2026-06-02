"use client";

import { max as d3max, min as d3min } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area as d3area, curveMonotoneX, line as d3line } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  VerticalFade,
  formatCompact,
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
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Probe {
  /** Concept name, e.g. "part of speech". */
  name: string;
  /** Probe accuracy at each layer (index 0 = layer 0 / embeddings). */
  accuracy: number[];
  /** Optional per-probe color override. */
  color?: string;
}

export interface ProbeResultsProps {
  layers?: number;
  probes?: Probe[];
  chance?: number;
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  xLabel?: string;
  showArea?: boolean;
  showPeak?: boolean;
  duration?: number;
  color?: string;
}

/* ------------------------------------------------------------------ */
/* Defaults — two concepts probed across 24 transformer layers         */
/* ------------------------------------------------------------------ */

const DEFAULT_PROBES: Probe[] = [
  {
    name: "part of speech",
    accuracy: [
      0.41, 0.52, 0.63, 0.72, 0.79, 0.85, 0.89, 0.92, 0.93, 0.94, 0.94, 0.93,
      0.92, 0.91, 0.89, 0.87, 0.85, 0.83, 0.81, 0.79, 0.77, 0.75, 0.73, 0.71,
    ],
  },
  {
    name: "coreference",
    accuracy: [
      0.34, 0.37, 0.41, 0.45, 0.5, 0.55, 0.6, 0.64, 0.68, 0.72, 0.75, 0.78,
      0.81, 0.83, 0.85, 0.86, 0.87, 0.87, 0.86, 0.85, 0.83, 0.81, 0.79, 0.77,
    ],
  },
];

const DEFAULT_LAYERS = 24;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function ProbeResults({
  layers = DEFAULT_LAYERS,
  probes = DEFAULT_PROBES,
  chance = 0.25,
  title = "Linear-probe accuracy by layer",
  caption = "",
  source = "",
  yLabel = "Probe accuracy",
  xLabel = "Layer",
  showArea = true,
  showPeak = true,
  duration = 1200,
  color = "",
}: ProbeResultsProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const gid = useMemo(() => uid("probe"), []);
  const [hover, setHover] = useState<{ px: number; layer: number } | null>(null);

  // Resolve per-probe color and clamp each series to `layers` points.
  const series = useMemo(() => {
    const nLayers = Math.max(2, Math.floor(layers));
    const safe = (probes ?? []).filter(
      (pr) => pr && Array.isArray(pr.accuracy) && pr.accuracy.length > 0,
    );
    return safe.map((pr, i) => {
      const acc = pr.accuracy.slice(0, nLayers).map((v) => (Number.isFinite(v) ? v : 0));
      // Peak layer = index of max accuracy.
      let peakIdx = 0;
      for (let k = 1; k < acc.length; k++) if (acc[k] > acc[peakIdx]) peakIdx = k;
      const c = pr.color || (i === 0 && color ? color : p.series[i % p.series.length]);
      return {
        name: pr.name ?? `probe ${i + 1}`,
        color: c,
        acc,
        peakIdx,
        peakVal: acc[peakIdx] ?? 0,
      };
    });
  }, [probes, layers, color, p.series]);

  const span = useMemo(
    () => Math.max(2, Math.floor(layers), ...series.map((s) => s.acc.length)),
    [layers, series],
  );

  // Y domain: padded around the data and the chance line, clamped to [0, 1].
  const yDomain = useMemo(() => {
    const all = series.flatMap((s) => s.acc);
    all.push(chance);
    const lo = Math.max(0, (d3min(all) ?? 0) - 0.06);
    const hi = Math.min(1, (d3max(all) ?? 1) + 0.06);
    return [lo, hi === lo ? lo + 0.1 : hi] as [number, number];
  }, [series, chance]);

  const legendItems: LegendItem[] = series.map((s) => ({
    label: s.name,
    color: s.color,
    shape: "line",
  }));

  const draw = reduced ? 1 : inView ? 1 : 0;
  const drawDur = reduced ? 0 : (duration / 1000) * 0.78;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        {legendItems.length > 0 && <Legend items={legendItems} align="center" className="mb-3" />}

        <ResponsiveSvg
          aspect={16 / 9}
          margin={{ top: 16, right: 20, bottom: 42, left: yLabel ? 58 : 46 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain([0, span - 1]).range([0, inner.width]);
            const y = scaleLinear().domain(yDomain).range([inner.height, 0]).nice();

            const lineGen = d3line<number>()
              .x((_, i) => x(i))
              .y((d) => y(d))
              .defined((d) => Number.isFinite(d))
              .curve(curveMonotoneX);

            const areaGen = d3area<number>()
              .x((_, i) => x(i))
              .y0(inner.height)
              .y1((d) => y(d))
              .defined((d) => Number.isFinite(d))
              .curve(curveMonotoneX);

            const hoverLayer = hover == null ? null : hover.layer;
            const chanceY = y(chance);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {series.map((s, i) => (
                    <VerticalFade
                      key={i}
                      id={`${gid}-fade-${i}`}
                      color={s.color}
                      from={0.2}
                      to={0.02}
                    />
                  ))}
                </defs>

                <GridLines scale={y as never} width={inner.width} count={5} />

                {/* Chance baseline — dashed reference line + label. */}
                <line
                  x1={0}
                  x2={inner.width}
                  y1={chanceY}
                  y2={chanceY}
                  stroke={p.inkFaint}
                  strokeWidth={1.25}
                  strokeDasharray="5 4"
                />
                <text
                  x={inner.width - 2}
                  y={chanceY - 5}
                  textAnchor="end"
                  fill={p.inkMuted}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  chance {formatCompact(chance, 2)}
                </text>

                {/* Area fills behind the lines, staggered fade-in. */}
                {showArea &&
                  series.map((s, i) => {
                    const d = areaGen(s.acc);
                    if (!d) return null;
                    return (
                      <motion.path
                        key={`${gid}-area-${i}-${token}`}
                        d={d}
                        fill={`url(#${gid}-fade-${i})`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? 1 : 0 }}
                        transition={{
                          duration: reduced ? 0 : drawDur * 0.7,
                          delay: reduced ? 0 : drawDur * 0.55 + i * 0.1,
                          ease: "easeOut",
                        }}
                      />
                    );
                  })}

                {/* Probe accuracy lines, drawn left-to-right via pathLength. */}
                {series.map((s, i) => {
                  const d = lineGen(s.acc);
                  if (!d) return null;
                  return (
                    <motion.path
                      key={`${gid}-line-${i}-${token}`}
                      d={d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: draw, opacity: draw ? 1 : 0 }}
                      transition={{
                        pathLength: {
                          duration: reduced ? 0 : drawDur,
                          delay: reduced ? 0 : i * 0.14,
                          ease: [0.4, 0, 0.2, 1],
                        },
                        opacity: { duration: reduced ? 0 : 0.2, delay: reduced ? 0 : i * 0.14 },
                      }}
                    />
                  );
                })}

                {/* Peak-layer markers: vertical stem + ring at the best layer. */}
                {showPeak &&
                  series.map((s, i) => {
                    const cx = x(s.peakIdx);
                    const cy = y(s.peakVal);
                    const appear = drawDur + 0.1 + i * 0.14;
                    return (
                      <motion.g
                        key={`${gid}-peak-${i}-${token}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: draw ? 1 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : appear }}
                      >
                        <line
                          x1={cx}
                          x2={cx}
                          y1={cy}
                          y2={inner.height}
                          stroke={withAlpha(s.color, 0.35)}
                          strokeWidth={1}
                          strokeDasharray="2 3"
                        />
                        <circle cx={cx} cy={cy} r={6.5} fill={withAlpha(s.color, 0.18)} />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={3.5}
                          fill={p.surface}
                          stroke={s.color}
                          strokeWidth={2}
                        />
                        <text
                          x={cx}
                          y={cy - 11}
                          textAnchor="middle"
                          fill={s.color}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9.5,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                          }}
                        >
                          L{s.peakIdx} · {formatCompact(s.peakVal, 2)}
                        </text>
                      </motion.g>
                    );
                  })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label={yLabel}
                  count={5}
                  format={(v) => formatCompact(v, 2)}
                />
                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={(v) => formatCompact(v)}
                  linearCount={Math.min(8, span)}
                />
                <text
                  x={inner.width / 2}
                  y={inner.height + 36}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  {xLabel}
                </text>

                {/* Hover crosshair + per-probe readout dots. */}
                <AnimatePresence>
                  {hoverLayer != null && (
                    <motion.g
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <line
                        x1={x(hoverLayer)}
                        x2={x(hoverLayer)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.borderStrong}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        shapeRendering="crispEdges"
                      />
                      {series.map((s, i) => {
                        const v = s.acc[hoverLayer];
                        if (!Number.isFinite(v)) return null;
                        return (
                          <g key={`${gid}-hov-${i}`}>
                            <circle
                              cx={x(hoverLayer)}
                              cy={y(v)}
                              r={6}
                              fill={withAlpha(s.color, 0.18)}
                            />
                            <circle
                              cx={x(hoverLayer)}
                              cy={y(v)}
                              r={3.5}
                              fill={s.color}
                              stroke={p.surface}
                              strokeWidth={1.5}
                            />
                          </g>
                        );
                      })}
                    </motion.g>
                  )}
                </AnimatePresence>

                {/* Transparent capture overlay for hover tracking. */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    const r = svg.getBoundingClientRect();
                    const px = e.clientX - r.left - margin.left;
                    const layer = Math.max(0, Math.min(span - 1, Math.round(x.invert(px))));
                    setHover({ px, layer });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        {(() => {
          const hl = hover == null ? null : hover.layer;
          return (
            <FloatingTooltip
              x={(hover?.px ?? 0) + (yLabel ? 58 : 46)}
              y={30}
              visible={hl != null}
            >
              {hl != null && (
                <>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                    {xLabel} {hl}
                  </div>
                  {series.map((s) => {
                    const v = s.acc[hl];
                    if (!Number.isFinite(v)) return null;
                    return (
                      <div key={s.name} className="flex items-baseline justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                          <span
                            className="inline-block h-[2px] w-3 rounded-full align-middle"
                            style={{ background: s.color }}
                          />
                          {s.name}
                        </span>
                        <span className="font-medium tabular-nums">{formatCompact(v, 2)}</span>
                      </div>
                    );
                  })}
                  <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-1">
                    <span className="font-mono text-[10px] uppercase tracking-wide opacity-50">
                      chance
                    </span>
                    <span className="tabular-nums opacity-60">{formatCompact(chance, 2)}</span>
                  </div>
                </>
              )}
            </FloatingTooltip>
          );
        })()}

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "probe-results",
  name: "Probe Results",
  category: "interpretability",
  description:
    "Linear-probe accuracy across model layers for one or more probed concepts, with a chance baseline and a peak-layer marker showing where each concept is most linearly decodable.",
  tags: ["probing", "interpretability", "layers", "linear-probe", "representations", "accuracy"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ProbeResults",
  sourcePath: "interpretability/ProbeResults",
  aspect: 16 / 9,
  controls: [
    {
      key: "layers",
      label: "Layers",
      type: "number",
      group: "Data",
      help: "Number of model layers to plot (series are clamped to this length).",
      default: DEFAULT_LAYERS,
      min: 2,
      max: 48,
      step: 1,
    },
    {
      key: "probes",
      label: "Probes",
      type: "json",
      group: "Data",
      help: "Array of { name, accuracy: number[] (per layer), color? }.",
      default: DEFAULT_PROBES,
    },
    {
      key: "chance",
      label: "Chance accuracy",
      type: "number",
      group: "Data",
      default: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Linear-probe accuracy by layer" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Probe accuracy" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "Layer" },
    { key: "showArea", label: "Area fill", type: "boolean", group: "Style", default: true },
    { key: "showPeak", label: "Peak-layer marker", type: "boolean", group: "Style", default: true },
    { key: "color", label: "First probe color", type: "color", group: "Style", default: "" },
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
      id: "syntax-vs-coref",
      name: "Syntax vs coreference",
      props: {
        title: "Where does a masked language model encode syntax vs coreference?",
        caption: "Part-of-speech peaks in the middle layers; coreference keeps building into the deep layers.",
        yLabel: "Probe accuracy",
        chance: 0.25,
        showArea: true,
        showPeak: true,
      },
    },
    {
      id: "single-concept",
      name: "Sentiment direction",
      props: {
        title: "Linear decodability of sentiment by layer",
        yLabel: "Probe accuracy",
        chance: 0.5,
        showArea: true,
        showPeak: true,
        layers: 24,
        probes: [
          {
            name: "sentiment",
            accuracy: [
              0.54, 0.58, 0.63, 0.69, 0.74, 0.79, 0.83, 0.86, 0.89, 0.91, 0.92,
              0.93, 0.94, 0.94, 0.95, 0.95, 0.95, 0.94, 0.94, 0.93, 0.92, 0.91,
              0.9, 0.89,
            ],
          },
        ],
      },
    },
  ],
};
