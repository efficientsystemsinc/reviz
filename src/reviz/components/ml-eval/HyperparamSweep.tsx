"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line as d3line } from "d3-shape";
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
  TooltipRow,
  formatCompact,
  mix,
  readableOn,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

type SweepMode = "heatmap" | "lines";

interface SweepCurve {
  /** Series label (e.g. a value of the second hyperparameter). */
  name: string;
  /** x positions (param values) aligned with `metric`. */
  x: number[];
  /** metric value at each x. */
  metric: number[];
  color?: string;
}

export interface HyperparamSweepProps {
  mode?: SweepMode;
  /** Name of the swept hyperparameter on the x-axis. */
  xParam?: string;
  /**
   * In heatmap mode: name of the second hyperparameter (y-axis).
   * In lines mode: the label for the series family.
   */
  yParamOrSeries?: string;
  /** Tick labels for the x hyperparameter (heatmap columns). */
  xTicks?: (string | number)[];
  /** Tick labels for the y hyperparameter (heatmap rows). */
  yTicks?: (string | number)[];
  /** Heatmap metric grid: values[row][col], row indexes y, col indexes x. */
  values?: number[][];
  /** Line-mode curves: metric vs. xParam, one entry per series. */
  curves?: SweepCurve[];
  /** Name of the metric being optimized (legend / colorbar). */
  metricLabel?: string;
  /** Whether higher metric is better (controls which cell/point is "best"). */
  higherIsBetter?: boolean;
  showBest?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

const DEFAULT_VALUES: number[][] = [
  [0.71, 0.78, 0.83, 0.86, 0.84, 0.79],
  [0.74, 0.82, 0.88, 0.91, 0.89, 0.83],
  [0.76, 0.85, 0.92, 0.95, 0.93, 0.87],
  [0.73, 0.81, 0.87, 0.9, 0.88, 0.82],
  [0.69, 0.76, 0.81, 0.84, 0.82, 0.77],
];

const DEFAULT_X_TICKS = [1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2];
const DEFAULT_Y_TICKS = [32, 64, 128, 256, 512];

const DEFAULT_CURVES: SweepCurve[] = [
  {
    name: "seed 0",
    x: [0.5, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0],
    metric: [0.42, 0.58, 0.69, 0.78, 0.84, 0.8, 0.71],
  },
  {
    name: "seed 1",
    x: [0.5, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0],
    metric: [0.39, 0.55, 0.66, 0.76, 0.82, 0.79, 0.69],
  },
  {
    name: "seed 2",
    x: [0.5, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0],
    metric: [0.44, 0.6, 0.71, 0.79, 0.86, 0.82, 0.73],
  },
];

const fmtTick = (v: string | number) => {
  if (typeof v === "string") return v;
  if (v !== 0 && (Math.abs(v) < 1e-2 || Math.abs(v) >= 1e4)) return v.toExponential(0).replace("e", "e");
  return formatCompact(v, 2);
};

export default function HyperparamSweep({
  mode = "heatmap",
  xParam = "learning rate",
  yParamOrSeries = "batch size",
  xTicks = DEFAULT_X_TICKS,
  yTicks = DEFAULT_Y_TICKS,
  values = DEFAULT_VALUES,
  curves = DEFAULT_CURVES,
  metricLabel = "val accuracy",
  higherIsBetter = true,
  showBest = true,
  title = "",
  caption = "",
  source = "",
  color = "",
  duration = 1000,
}: HyperparamSweepProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  // ---- HEATMAP STATE / DERIVED ----
  const [cellHover, setCellHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  // ---- LINE STATE ----
  const [lineHover, setLineHover] = useState<{ idx: number; px: number } | null>(null);

  const draw = reduced ? 1 : inView ? 1 : 0;

  // Flatten heatmap to find metric range + best cell.
  const flat = useMemo(() => values.flatMap((row) => row.filter((v) => Number.isFinite(v))), [values]);
  const [vMin, vMax] = useMemo(() => {
    if (flat.length === 0) return [0, 1] as [number, number];
    const lo = Math.min(...flat);
    const hi = Math.max(...flat);
    return [lo, hi === lo ? lo + 1 : hi] as [number, number];
  }, [flat]);

  // Color intensity: map metric so the *best* end of the range is most saturated.
  const intensity = (v: number) => {
    if (!Number.isFinite(v)) return 0;
    const t = (v - vMin) / (vMax - vMin);
    return higherIsBetter ? t : 1 - t;
  };

  const bestCell = useMemo(() => {
    let best: { r: number; c: number; v: number } | null = null;
    values.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!Number.isFinite(v)) return;
        if (best == null || (higherIsBetter ? v > best.v : v < best.v)) best = { r, c, v };
      }),
    );
    return best as { r: number; c: number; v: number } | null;
  }, [values, higherIsBetter]);

  // Average each curve into a mean sweep, and find the best x across all curves.
  const lineSpan = useMemo(() => Math.max(2, ...curves.map((c) => c.x.length)), [curves]);
  const xValues = useMemo(() => curves[0]?.x ?? [], [curves]);

  const meanCurve = useMemo(() => {
    return xValues.map((_, j) => {
      const vals = curves.map((c) => c.metric[j]).filter((v) => Number.isFinite(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
    });
  }, [curves, xValues]);

  const bestPoint = useMemo(() => {
    let bi = -1;
    let bv = higherIsBetter ? -Infinity : Infinity;
    meanCurve.forEach((v, j) => {
      if (!Number.isFinite(v)) return;
      if (higherIsBetter ? v > bv : v < bv) {
        bv = v;
        bi = j;
      }
    });
    return bi >= 0 ? { idx: bi, x: xValues[bi], v: bv } : null;
  }, [meanCurve, xValues, higherIsBetter]);

  const lineYDomain = useMemo(() => {
    const all = curves.flatMap((c) => c.metric).filter((v) => Number.isFinite(v));
    if (all.length === 0) return [0, 1] as [number, number];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || 0.1;
    return [lo - pad, hi + pad] as [number, number];
  }, [curves]);

  const xExtent = useMemo(() => {
    const all = curves.flatMap((c) => c.x).filter((v) => Number.isFinite(v));
    const e = extent(all);
    return (e[0] == null ? [0, 1] : e) as [number, number];
  }, [curves]);

  const colorOf = (i: number) => curves[i]?.color || p.series[i % p.series.length];
  const legendItems: LegendItem[] = curves.map((c, i) => ({ label: c.name, color: colorOf(i), shape: "line" }));

  // ---------- HEATMAP RENDER ----------
  const renderHeatmap = () => {
    const nRows = values.length;
    const nCols = Math.max(0, ...values.map((r) => r.length));
    const xLabels: (string | number)[] =
      xTicks.length >= nCols ? xTicks.slice(0, nCols) : [...xTicks, ...Array.from({ length: nCols - xTicks.length }, (_, i) => i + xTicks.length)];
    const yLabels: (string | number)[] =
      yTicks.length >= nRows ? yTicks.slice(0, nRows) : [...yTicks, ...Array.from({ length: nRows - yTicks.length }, (_, i) => i + yTicks.length)];

    const longestY = Math.max(...yLabels.map((l) => String(fmtTick(l)).length), 3);

    return (
      <ResponsiveSvg
        aspect={1.5}
        margin={{ top: 26, right: 20, bottom: 46, left: Math.min(96, 32 + longestY * 6.2) }}
      >
        {({ inner, margin }) => {
          const cellW = nCols > 0 ? inner.width / nCols : 0;
          const cellH = nRows > 0 ? inner.height / nRows : 0;
          const gap = Math.min(3, Math.min(cellW, cellH) * 0.06);
          const fontSize = Math.max(8, Math.min(13, Math.min(cellW, cellH) * 0.26));

          const orderDelay = (r: number, c: number) => {
            if (reduced) return 0;
            const t = intensity(values[r]?.[c] ?? vMin);
            // brightest (best) cells settle last for a "search converging" feel
            return ((1 - t) * 0.6 + (r + c) * 0.04) * (duration / 1000);
          };

          return (
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* axis titles */}
              <text
                x={inner.width / 2}
                y={-margin.top + 10}
                textAnchor="middle"
                fill={p.inkMuted}
                className="font-mono uppercase"
                style={{ fontSize: 9.5, letterSpacing: "0.12em" }}
              >
                {xParam}
              </text>
              <text
                transform={`translate(${-margin.left + 11}, ${inner.height / 2}) rotate(-90)`}
                textAnchor="middle"
                fill={p.inkMuted}
                className="font-mono uppercase"
                style={{ fontSize: 9.5, letterSpacing: "0.12em" }}
              >
                {yParamOrSeries}
              </text>

              {/* x tick labels (bottom) */}
              {xLabels.map((label, c) => (
                <text
                  key={`xt-${c}`}
                  x={c * cellW + cellW / 2}
                  y={inner.height + 16}
                  textAnchor="middle"
                  fill={cellHover?.c === c ? p.ink : p.inkFaint}
                  className="font-mono"
                  style={{ fontSize: Math.max(8, Math.min(11, cellW * 0.26)), fontWeight: cellHover?.c === c ? 600 : 400 }}
                >
                  {fmtTick(label)}
                </text>
              ))}

              {/* y tick labels (left) */}
              {yLabels.map((label, r) => (
                <text
                  key={`yt-${r}`}
                  x={-9}
                  y={r * cellH + cellH / 2}
                  dy="0.32em"
                  textAnchor="end"
                  fill={cellHover?.r === r ? p.ink : p.inkFaint}
                  className="font-mono"
                  style={{ fontSize: Math.max(8, Math.min(11, cellH * 0.34)), fontWeight: cellHover?.r === r ? 600 : 400 }}
                >
                  {fmtTick(label)}
                </text>
              ))}

              {/* cells */}
              {values.map((row, r) =>
                row.map((v, c) => {
                  const x = c * cellW;
                  const y = r * cellH;
                  const t = intensity(v);
                  const eased = Math.pow(t, 0.72);
                  const fill = mix(p.surface, accent, eased);
                  const isBest = showBest && bestCell != null && bestCell.r === r && bestCell.c === c;
                  const exact = cellHover != null && cellHover.r === r && cellHover.c === c;
                  const inCross = cellHover != null && (cellHover.r === r || cellHover.c === c);
                  const dimmed = cellHover != null && !inCross;

                  return (
                    <g key={`cell-${token}-${r}-${c}`}>
                      <motion.rect
                        x={x + gap / 2}
                        y={y + gap / 2}
                        width={Math.max(0, cellW - gap)}
                        height={Math.max(0, cellH - gap)}
                        rx={Math.min(4, Math.min(cellW, cellH) * 0.1)}
                        fill={fill}
                        stroke={exact ? accent : isBest ? withAlpha(accent, 0.9) : p.border}
                        strokeWidth={exact ? 1.6 : isBest ? 1.4 : 0.6}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{
                          opacity: draw ? (dimmed ? 0.3 : 1) : 0,
                          scale: draw ? (exact ? 1.05 : 1) : 0.7,
                        }}
                        transition={{
                          opacity: { duration: reduced ? 0 : 0.42, delay: cellHover ? 0 : orderDelay(r, c) },
                          scale: {
                            duration: reduced ? 0 : exact ? 0.18 : 0.5,
                            delay: cellHover ? 0 : orderDelay(r, c),
                            ease: [0.22, 1, 0.36, 1],
                          },
                        }}
                        style={{ transformOrigin: `${x + cellW / 2}px ${y + cellH / 2}px`, cursor: "pointer" }}
                        onMouseMove={(e) => {
                          const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setCellHover({ r, c, x: e.clientX - box.left, y: e.clientY - box.top });
                        }}
                        onMouseLeave={() => setCellHover(null)}
                      />
                      {Math.min(cellW, cellH) > 22 && Number.isFinite(v) && (
                        <motion.text
                          x={x + cellW / 2}
                          y={y + cellH / 2}
                          dy="0.34em"
                          textAnchor="middle"
                          fill={eased > 0.55 ? readableOn(fill) : p.inkMuted}
                          className="font-mono tabular-nums pointer-events-none"
                          style={{ fontSize, fontWeight: isBest ? 700 : 400 }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: draw ? (dimmed ? 0.35 : 1) : 0 }}
                          transition={{ duration: reduced ? 0 : 0.4, delay: cellHover ? 0 : orderDelay(r, c) + 0.16 }}
                        >
                          {round(v, 2)}
                        </motion.text>
                      )}
                      {isBest && Math.min(cellW, cellH) > 14 && (
                        <motion.circle
                          cx={x + cellW - Math.max(6, gap + 4)}
                          cy={y + Math.max(6, gap + 4)}
                          r={2.4}
                          fill={accent}
                          className="pointer-events-none"
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: draw ? 1 : 0, scale: draw ? [0, 1.6, 1] : 0 }}
                          transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : (duration / 1000) * 0.7 }}
                        />
                      )}
                    </g>
                  );
                }),
              )}

              <rect
                x={0}
                y={0}
                width={inner.width}
                height={inner.height}
                fill="none"
                stroke={p.borderStrong}
                strokeWidth={1}
                rx={Math.min(5, Math.min(cellW, cellH) * 0.1)}
                className="pointer-events-none"
              />
            </g>
          );
        }}
      </ResponsiveSvg>
    );
  };

  // ---------- LINES RENDER ----------
  const renderLines = () => {
    const gid = `hps-${token}`;
    return (
      <ResponsiveSvg aspect={16 / 9} margin={{ top: 14, right: 18, bottom: 34, left: 54 }}>
        {({ inner, margin }) => {
          const x = scaleLinear().domain(xExtent).range([0, inner.width]).nice();
          const y = scaleLinear().domain(lineYDomain).range([inner.height, 0]).nice();

          const lineGen = d3line<{ x: number; m: number }>()
            .x((d) => x(d.x))
            .y((d) => y(d.m))
            .defined((d) => Number.isFinite(d.m))
            .curve(curveMonotoneX);

          const meanGen = d3line<number>()
            .x((_, j) => x(xValues[j]))
            .y((v) => y(v))
            .defined((v) => Number.isFinite(v))
            .curve(curveMonotoneX);

          const drawDur = (duration / 1000) * 0.78;
          const hi = lineHover?.idx ?? null;

          return (
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              <GridLines scale={y as never} width={inner.width} count={5} />

              {/* individual seed/series curves (thin) */}
              {curves.map((c, i) => {
                const d = lineGen(c.x.map((xv, j) => ({ x: xv, m: c.metric[j] })));
                if (!d) return null;
                return (
                  <motion.path
                    key={`${gid}-curve-${i}`}
                    d={d}
                    fill="none"
                    stroke={colorOf(i)}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.55 }}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: draw, opacity: draw ? 0.55 : 0 }}
                    transition={{
                      pathLength: { duration: reduced ? 0 : drawDur, delay: reduced ? 0 : i * 0.1, ease: [0.4, 0, 0.2, 1] },
                      opacity: { duration: reduced ? 0 : 0.2, delay: reduced ? 0 : i * 0.1 },
                    }}
                  />
                );
              })}

              {/* mean sweep (bold accent) */}
              {curves.length > 1 &&
                (() => {
                  const d = meanGen(meanCurve);
                  if (!d) return null;
                  return (
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={accent}
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: draw, opacity: draw ? 1 : 0 }}
                      transition={{
                        pathLength: { duration: reduced ? 0 : drawDur, delay: reduced ? 0 : 0.18, ease: [0.4, 0, 0.2, 1] },
                        opacity: { duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.18 },
                      }}
                    />
                  );
                })()}

              {/* best config marker */}
              {showBest && bestPoint != null && (
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: draw ? 1 : 0 }}
                  transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : drawDur + 0.1 }}
                >
                  <line
                    x1={x(bestPoint.x)}
                    x2={x(bestPoint.x)}
                    y1={0}
                    y2={inner.height}
                    stroke={withAlpha(accent, 0.45)}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <motion.circle
                    cx={x(bestPoint.x)}
                    cy={y(bestPoint.v)}
                    r={9}
                    fill={withAlpha(accent, 0.16)}
                    initial={{ scale: 0 }}
                    animate={{ scale: draw ? 1 : 0 }}
                    transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : drawDur + 0.1, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <circle cx={x(bestPoint.x)} cy={y(bestPoint.v)} r={4} fill={accent} stroke={p.surface} strokeWidth={1.6} />
                  <text
                    x={x(bestPoint.x)}
                    y={y(bestPoint.v) - 14}
                    textAnchor="middle"
                    fill={accent}
                    className="font-mono uppercase"
                    style={{ fontSize: 9, letterSpacing: "0.1em", fontWeight: 600 }}
                  >
                    best · {xParam} {round(bestPoint.x, 2)}
                  </text>
                </motion.g>
              )}

              <Baseline y={inner.height} width={inner.width} />
              <AxisLeft scale={y as never} height={inner.height} label={metricLabel} format={(v) => formatCompact(v, 2)} />
              <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => formatCompact(v, 2)} linearCount={Math.min(8, lineSpan)} />

              {/* hover crosshair on the mean sweep */}
              <AnimatePresence>
                {hi != null && Number.isFinite(meanCurve[hi]) && (
                  <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                    <line
                      x1={x(xValues[hi])}
                      x2={x(xValues[hi])}
                      y1={0}
                      y2={inner.height}
                      stroke={p.borderStrong}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    {curves.map((c, i) =>
                      Number.isFinite(c.metric[hi]) ? (
                        <circle key={`${gid}-hov-${i}`} cx={x(c.x[hi])} cy={y(c.metric[hi])} r={3} fill={colorOf(i)} stroke={p.surface} strokeWidth={1.4} />
                      ) : null,
                    )}
                  </motion.g>
                )}
              </AnimatePresence>

              {/* capture overlay */}
              <rect
                x={0}
                y={0}
                width={inner.width}
                height={inner.height}
                fill="transparent"
                onMouseMove={(e) => {
                  const svg = e.currentTarget.ownerSVGElement;
                  if (!svg || xValues.length === 0) return;
                  const box = svg.getBoundingClientRect();
                  const px = e.clientX - box.left - margin.left;
                  const xv = x.invert(px);
                  // nearest x index
                  let idx = 0;
                  let best = Infinity;
                  xValues.forEach((v, j) => {
                    const dd = Math.abs(v - xv);
                    if (dd < best) {
                      best = dd;
                      idx = j;
                    }
                  });
                  setLineHover({ idx, px });
                }}
                onMouseLeave={() => setLineHover(null)}
              />
            </g>
          );
        }}
      </ResponsiveSvg>
    );
  };

  const xLabelsForTooltip: (string | number)[] = useMemo(() => {
    const nCols = Math.max(0, ...values.map((r) => r.length));
    return xTicks.length >= nCols ? xTicks.slice(0, nCols) : xTicks;
  }, [xTicks, values]);
  const yLabelsForTooltip: (string | number)[] = useMemo(() => {
    return yTicks.length >= values.length ? yTicks.slice(0, values.length) : yTicks;
  }, [yTicks, values]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        {mode === "lines" && curves.length > 1 && <Legend items={legendItems} align="center" className="mb-3" />}

        {mode === "heatmap" ? renderHeatmap() : renderLines()}

        {/* readout strip */}
        <div className="mt-2 flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-label text-ink-faint">
          {mode === "heatmap" ? (
            <>
              <span>
                {metricLabel}{" "}
                <span className="tabular-nums text-ink-muted">
                  {round(vMin, 2)}–{round(vMax, 2)}
                </span>
              </span>
              {showBest && bestCell != null && (
                <>
                  <span className="text-border-strong">/</span>
                  <span>
                    best{" "}
                    <span className="tabular-nums text-ink-muted">
                      {round(bestCell.v, 3)}
                    </span>
                  </span>
                </>
              )}
              <span className="text-border-strong">/</span>
              <span>{higherIsBetter ? "maximize" : "minimize"}</span>
            </>
          ) : (
            <>
              <span>
                {curves.length} run{curves.length === 1 ? "" : "s"}
              </span>
              {showBest && bestPoint != null && (
                <>
                  <span className="text-border-strong">/</span>
                  <span>
                    best {xParam}{" "}
                    <span className="tabular-nums text-ink-muted">{round(bestPoint.x, 2)}</span>
                  </span>
                  <span className="text-border-strong">/</span>
                  <span>
                    {metricLabel} <span className="tabular-nums text-ink-muted">{round(bestPoint.v, 3)}</span>
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* HEATMAP tooltip */}
        {mode === "heatmap" && (
          <FloatingTooltip x={cellHover?.x ?? 0} y={cellHover?.y ?? 0} visible={cellHover != null}>
            {cellHover != null && (
              <>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {xParam} {fmtTick(xLabelsForTooltip[cellHover.c] ?? cellHover.c)} · {yParamOrSeries}{" "}
                  {fmtTick(yLabelsForTooltip[cellHover.r] ?? cellHover.r)}
                </div>
                <TooltipRow label={metricLabel} value={round(values[cellHover.r]?.[cellHover.c] ?? 0, 3)} />
                {bestCell != null && (
                  <TooltipRow
                    label="vs best"
                    value={`${round(((values[cellHover.r]?.[cellHover.c] ?? 0) - bestCell.v) * (higherIsBetter ? 1 : -1), 3)}`}
                  />
                )}
              </>
            )}
          </FloatingTooltip>
        )}

        {/* LINES tooltip */}
        {mode === "lines" && (
          <FloatingTooltip x={(lineHover?.px ?? 0) + 54} y={26} visible={lineHover != null}>
            {lineHover != null && (
              <>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {xParam} {round(xValues[lineHover.idx] ?? 0, 2)}
                </div>
                {curves.map((c, i) =>
                  Number.isFinite(c.metric[lineHover.idx]) ? (
                    <div key={c.name} className="flex items-baseline justify-between gap-4">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                        <span className="inline-block h-[2px] w-3 rounded-full align-middle" style={{ background: colorOf(i) }} />
                        {c.name}
                      </span>
                      <span className="font-medium tabular-nums">{formatCompact(c.metric[lineHover.idx], 3)}</span>
                    </div>
                  ) : null,
                )}
                {curves.length > 1 && Number.isFinite(meanCurve[lineHover.idx]) && (
                  <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border/60 pt-1">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-70">
                      <span className="inline-block h-[2px] w-3 rounded-full align-middle" style={{ background: accent }} />
                      mean
                    </span>
                    <span className="font-medium tabular-nums">{formatCompact(meanCurve[lineHover.idx], 3)}</span>
                  </div>
                )}
              </>
            )}
          </FloatingTooltip>
        )}

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "hyperparameter-sweep",
  name: "Hyperparameter Sweep",
  category: "ml-eval",
  description:
    "Explore a hyperparameter sweep as a metric heatmap over two parameters or as metric-vs-parameter curves with a mean sweep, animated reveal, and an automatically marked best configuration.",
  tags: ["hyperparameter", "sweep", "grid-search", "tuning", "heatmap", "ablation"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "HyperparamSweep",
  sourcePath: "ml-eval/HyperparamSweep",
  aspect: 1.5,
  controls: [
    {
      key: "mode",
      label: "Mode",
      type: "select",
      group: "Layout",
      default: "heatmap",
      options: [
        { label: "Heatmap (2 params)", value: "heatmap" },
        { label: "Curves (param vs metric)", value: "lines" },
      ],
    },
    { key: "xParam", label: "X parameter", type: "text", group: "Data", default: "learning rate" },
    { key: "yParamOrSeries", label: "Y parameter / series", type: "text", group: "Data", default: "batch size" },
    { key: "xTicks", label: "X tick values", type: "json", group: "Data", default: DEFAULT_X_TICKS },
    { key: "yTicks", label: "Y tick values", type: "json", group: "Data", default: DEFAULT_Y_TICKS },
    { key: "values", label: "Metric grid (heatmap)", type: "matrix", group: "Data", default: DEFAULT_VALUES },
    { key: "curves", label: "Curves (lines mode)", type: "json", group: "Data", default: DEFAULT_CURVES },
    { key: "metricLabel", label: "Metric label", type: "text", group: "Labels", default: "val accuracy" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "higherIsBetter", label: "Higher is better", type: "boolean", group: "Style", default: true },
    { key: "showBest", label: "Mark best config", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1000, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "lr-batch-grid",
      name: "LR × batch grid",
      props: {
        mode: "heatmap",
        title: "Learning rate × batch size sweep",
        caption: "Validation accuracy across a 6×5 grid search; peak at lr 3e-3, batch 128.",
        xParam: "learning rate",
        yParamOrSeries: "batch size",
        metricLabel: "val accuracy",
        higherIsBetter: true,
        xTicks: DEFAULT_X_TICKS,
        yTicks: DEFAULT_Y_TICKS,
        values: DEFAULT_VALUES,
      },
    },
    {
      id: "ucb-c-sweep",
      name: "UCB c sweep",
      props: {
        mode: "lines",
        title: "UCB exploration constant sweep",
        caption: "Mean episodic return vs. UCB c across three seeds; c = 2.2 is best.",
        xParam: "UCB c",
        yParamOrSeries: "seed",
        metricLabel: "episodic return",
        higherIsBetter: true,
        curves: DEFAULT_CURVES,
      },
    },
    {
      id: "wd-loss",
      name: "Weight decay (minimize)",
      props: {
        mode: "lines",
        title: "Weight decay sweep",
        caption: "Validation loss vs. weight decay; lower is better, optimum near 3e-3.",
        xParam: "weight decay",
        yParamOrSeries: "run",
        metricLabel: "val loss",
        higherIsBetter: false,
        curves: [
          { name: "run a", x: [1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2], metric: [0.94, 0.88, 0.81, 0.78, 0.85, 0.97] },
          { name: "run b", x: [1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2], metric: [0.96, 0.9, 0.83, 0.79, 0.87, 1.01] },
        ],
      },
    },
  ],
};
