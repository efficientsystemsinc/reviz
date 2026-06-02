"use client";

import { scaleLinear } from "d3-scale";
import { line as d3line, curveMonotoneX } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  Legend,
  ResponsiveSvg,
  TooltipRow,
  uid,
  usePalette,
  useInView,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface Bin {
  /** Mean predicted probability in the bin (x), 0..1. */
  predicted: number;
  /** Observed empirical frequency of the positive class (y), 0..1. */
  observed: number;
  /** Number of samples that fell into the bin. */
  count: number;
}

export interface CalibrationPlotProps {
  bins?: Bin[];
  title?: string;
  caption?: string;
  source?: string;
  showHistogram?: boolean;
  showGap?: boolean;
  showEce?: boolean;
  color?: string;
  duration?: number;
}

const PERFECT: Bin[] = [
  { predicted: 0.05, observed: 0.04, count: 820 },
  { predicted: 0.15, observed: 0.13, count: 540 },
  { predicted: 0.25, observed: 0.2, count: 410 },
  { predicted: 0.35, observed: 0.29, count: 360 },
  { predicted: 0.45, observed: 0.37, count: 300 },
  { predicted: 0.55, observed: 0.46, count: 280 },
  { predicted: 0.65, observed: 0.55, count: 320 },
  { predicted: 0.75, observed: 0.66, count: 390 },
  { predicted: 0.85, observed: 0.78, count: 520 },
  { predicted: 0.95, observed: 0.91, count: 910 },
];

export default function CalibrationPlot({
  bins = PERFECT,
  title = "",
  caption = "",
  source = "",
  showHistogram = true,
  showGap = true,
  showEce = true,
  color = "",
  duration = 1100,
}: CalibrationPlotProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  // When the component is already in view on its very first render (eager/headless
  // QA, or anything mounted on-screen) or motion is reduced, skip the hidden
  // `initial` state so framer-motion renders directly at the visible target. This
  // guarantees the final static frame is correct even if the rAF-driven entrance
  // animation never advances (e.g. under Chrome's virtual-time budget), while a
  // normal scroll-in (inView starts false) still plays the full animation. Replay
  // (token > 0) always re-animates.
  const mountedInView = useRef(inView);
  const skipEntrance = (mountedInView.current && token === 0) || reduced;
  const enter = (hidden: Record<string, number>): false | Record<string, number> =>
    skipEntrance ? false : hidden;

  const data = useMemo(
    () =>
      [...bins]
        .filter((b) => b && Number.isFinite(b.predicted) && Number.isFinite(b.observed))
        .sort((a, b) => a.predicted - b.predicted),
    [bins],
  );

  // Expected Calibration Error: count-weighted mean |observed - predicted|.
  const { ece, totalCount } = useMemo(() => {
    const total = data.reduce((s, b) => s + Math.max(0, b.count || 0), 0);
    if (total <= 0) {
      const n = data.length || 1;
      return {
        ece: data.reduce((s, b) => s + Math.abs(b.observed - b.predicted), 0) / n,
        totalCount: 0,
      };
    }
    const e = data.reduce(
      (s, b) => s + (Math.max(0, b.count || 0) / total) * Math.abs(b.observed - b.predicted),
      0,
    );
    return { ece: e, totalCount: total };
  }, [data]);

  const maxCount = useMemo(() => Math.max(1, ...data.map((b) => b.count || 0)), [data]);
  const overconfident = useMemo(
    () => data.reduce((s, b) => s + (b.observed - b.predicted), 0) < 0,
    [data],
  );

  const gradId = useMemo(() => uid("cal-gap"), []);
  const histH = showHistogram ? 46 : 0;

  const legendItems: LegendItem[] = [
    { label: "calibration", color: fill, shape: "line" },
    { label: "perfect", color: p.inkFaint, shape: "dashed" },
  ];

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <div className="mb-3 flex items-center justify-center">
          <Legend items={legendItems} align="center" />
        </div>

        <ResponsiveSvg aspect={1.18} margin={{ top: 16, right: 18, bottom: 40 + histH, left: 48 }}>
          {({ inner, margin }) => {
            const x = scaleLinear().domain([0, 1]).range([0, inner.width]);
            const y = scaleLinear().domain([0, 1]).range([inner.height, 0]);

            const pts = data.map((b) => ({
              ...b,
              px: x(Math.max(0, Math.min(1, b.predicted))),
              py: y(Math.max(0, Math.min(1, b.observed))),
            }));

            const curve = d3line<{ px: number; py: number }>()
              .x((d) => d.px)
              .y((d) => d.py)
              .curve(curveMonotoneX);

            // Closed band between the calibration curve and the diagonal.
            const gapPath =
              pts.length > 1
                ? `${curve(pts)} L ${x(pts[pts.length - 1].predicted)} ${y(pts[pts.length - 1].predicted)} ` +
                  pts
                    .slice()
                    .reverse()
                    .map((d) => `L ${x(d.predicted)} ${y(d.predicted)}`)
                    .join(" ") +
                  " Z"
                : "";

            const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
            const histScale = scaleLinear().domain([0, maxCount]).range([0, histH - 14]);
            const histTop = inner.height + 30;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={fill} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={fill} stopOpacity={0.04} />
                  </linearGradient>
                </defs>

                <GridLines scale={y as never} width={inner.width} count={5} />

                {/* Perfect-calibration diagonal y = x */}
                <motion.line
                  x1={x(0)}
                  y1={y(0)}
                  x2={inView ? x(1) : x(0)}
                  y2={inView ? y(1) : y(0)}
                  stroke={p.inkFaint}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  initial={enter({ pathLength: 0, opacity: 0 })}
                  animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                  transition={{ duration: reduced ? 0 : duration / 1600, ease: "easeOut" }}
                  key={`diag-${token}`}
                />

                {/* Calibration-gap band */}
                {showGap && gapPath && (
                  <motion.path
                    d={gapPath}
                    fill={`url(#${gradId})`}
                    stroke="none"
                    initial={enter({ opacity: 0 })}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{
                      duration: reduced ? 0 : 0.5,
                      delay: reduced ? 0 : duration / 1400,
                    }}
                    key={`gap-${token}`}
                  />
                )}

                {/* Bottom-of-bin count histogram */}
                {showHistogram &&
                  pts.map((d, i) => {
                    const bw = Math.max(4, (inner.width / Math.max(1, pts.length)) * 0.62);
                    const bh = histScale(d.count || 0);
                    return (
                      <motion.rect
                        key={`h-${token}-${i}`}
                        x={d.px - bw / 2}
                        width={bw}
                        y={histTop}
                        rx={1.5}
                        fill={withAlpha(fill, hover?.i === i ? 0.55 : 0.3)}
                        initial={enter({ height: 0 })}
                        animate={{ height: inView ? bh : 0 }}
                        transition={{
                          duration: reduced ? 0 : 0.5,
                          delay: reduced ? 0 : 0.1 + i * 0.04,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    );
                  })}

                {/* Calibration curve */}
                {pts.length > 1 && (
                  <motion.path
                    d={curve(pts) ?? ""}
                    fill="none"
                    stroke={fill}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={enter({ pathLength: 0 })}
                    animate={{ pathLength: inView ? 1 : 0 }}
                    transition={{ duration: reduced ? 0 : duration / 1000, ease: [0.22, 1, 0.36, 1] }}
                    key={`curve-${token}`}
                  />
                )}

                {/* Bin points */}
                {pts.map((d, i) => {
                  const active = hover?.i === i;
                  return (
                    <motion.circle
                      key={`pt-${token}-${i}`}
                      cx={d.px}
                      cy={d.py}
                      r={active ? 5.5 : 4}
                      fill={p.surface}
                      stroke={fill}
                      strokeWidth={2.25}
                      initial={enter({ opacity: 0, scale: 0 })}
                      animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
                      transition={{
                        duration: reduced ? 0 : 0.4,
                        delay: reduced ? 0 : (duration / 1000) * 0.55 + i * 0.05,
                        ease: [0.34, 1.56, 0.64, 1],
                      }}
                      style={{ cursor: "pointer" }}
                      onMouseMove={(e) => {
                        const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                        setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  format={fmtPct}
                  label="Observed frequency"
                />
                <AxisBottom
                  scale={x as never}
                  y={inner.height}
                  linearFormat={fmtPct}
                  linearCount={6}
                />

                {/* X-axis title */}
                <text
                  x={inner.width / 2}
                  y={inner.height + (showHistogram ? histH + 34 : 34)}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Mean predicted probability
                </text>

                {showHistogram && (
                  <text
                    x={0}
                    y={histTop + 6}
                    fill={p.inkFaint}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9.5,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    samples / bin
                  </text>
                )}

                {/* ECE callout */}
                {showEce && (
                  <motion.g
                    initial={enter({ opacity: 0, y: -4 })}
                    animate={{ opacity: inView ? 1 : 0, y: 0 }}
                    transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : duration / 1100 }}
                    key={`ece-${token}`}
                  >
                    <rect
                      x={8}
                      y={8}
                      width={134}
                      height={40}
                      rx={7}
                      fill={withAlpha(p.surface, 0.92)}
                      stroke={p.border}
                      strokeWidth={1}
                    />
                    <text
                      x={20}
                      y={24}
                      fill={p.inkFaint}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      ECE
                    </text>
                    <text
                      x={20}
                      y={40}
                      fill={fill}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 15,
                        fontWeight: 600,
                      }}
                    >
                      {(ece * 100).toFixed(1)}%
                    </text>
                    <text
                      x={70}
                      y={40}
                      fill={overconfident ? p.bad : p.ok}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {overconfident ? "overconfident" : "underconfident"}
                    </text>
                  </motion.g>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                bin {hover.i + 1}
              </div>
              <TooltipRow label="predicted" value={`${(data[hover.i].predicted * 100).toFixed(1)}%`} />
              <TooltipRow label="observed" value={`${(data[hover.i].observed * 100).toFixed(1)}%`} />
              <TooltipRow
                label="gap"
                value={`${((data[hover.i].observed - data[hover.i].predicted) * 100).toFixed(1)}%`}
              />
              <TooltipRow label="samples" value={(data[hover.i].count || 0).toLocaleString()} />
            </>
          )}
        </FloatingTooltip>

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
        >
          replay
        </button>

        {totalCount > 0 && (
          <div className="mt-2 text-center font-mono text-[10px] uppercase tracking-label text-ink-faint">
            {totalCount.toLocaleString()} samples · {data.length} bins
          </div>
        )}
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "calibration-plot",
  name: "Calibration Plot",
  category: "statistical",
  description:
    "A reliability diagram pairing predicted confidence against observed frequency, with the perfect-calibration diagonal, gap shading, per-bin sample counts, and a live ECE readout.",
  tags: ["calibration", "reliability", "ece", "uncertainty", "ml-eval", "confidence"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "CalibrationPlot",
  sourcePath: "statistical/CalibrationPlot",
  aspect: 1.18,
  controls: [
    {
      key: "bins",
      label: "Bins",
      type: "json",
      group: "Data",
      help: "Array of { predicted, observed, count } per confidence bin (probabilities 0–1).",
      default: PERFECT,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showHistogram", label: "Show sample histogram", type: "boolean", group: "Layout", default: true },
    { key: "showGap", label: "Shade calibration gap", type: "boolean", group: "Layout", default: true },
    { key: "showEce", label: "Show ECE callout", type: "boolean", group: "Layout", default: true },
    { key: "color", label: "Curve color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "overconfident",
      name: "Overconfident model",
      props: {
        title: "Value-head calibration · Perseus-7B",
        caption:
          "The model is systematically overconfident: observed accuracy trails predicted probability across the high-confidence bins.",
        source: "Perseus eval · 5.2k held-out states",
        bins: [
          { predicted: 0.05, observed: 0.03, count: 760 },
          { predicted: 0.15, observed: 0.09, count: 480 },
          { predicted: 0.25, observed: 0.16, count: 390 },
          { predicted: 0.35, observed: 0.24, count: 340 },
          { predicted: 0.45, observed: 0.31, count: 300 },
          { predicted: 0.55, observed: 0.4, count: 290 },
          { predicted: 0.65, observed: 0.48, count: 330 },
          { predicted: 0.75, observed: 0.58, count: 410 },
          { predicted: 0.85, observed: 0.69, count: 560 },
          { predicted: 0.95, observed: 0.82, count: 980 },
        ],
      },
    },
    {
      id: "well-calibrated",
      name: "Well-calibrated",
      props: {
        title: "After temperature scaling (T = 1.6)",
        caption: "Post-calibration the reliability curve hugs the diagonal; ECE drops below 2%.",
        bins: [
          { predicted: 0.05, observed: 0.05, count: 800 },
          { predicted: 0.15, observed: 0.14, count: 520 },
          { predicted: 0.25, observed: 0.26, count: 400 },
          { predicted: 0.35, observed: 0.34, count: 350 },
          { predicted: 0.45, observed: 0.46, count: 300 },
          { predicted: 0.55, observed: 0.54, count: 290 },
          { predicted: 0.65, observed: 0.66, count: 330 },
          { predicted: 0.75, observed: 0.74, count: 420 },
          { predicted: 0.85, observed: 0.86, count: 580 },
          { predicted: 0.95, observed: 0.94, count: 900 },
        ],
      },
    },
    {
      id: "underconfident",
      name: "Underconfident",
      props: {
        title: "Detector calibration · ensemble head",
        showHistogram: false,
        bins: [
          { predicted: 0.05, observed: 0.12, count: 420 },
          { predicted: 0.2, observed: 0.31, count: 380 },
          { predicted: 0.4, observed: 0.52, count: 360 },
          { predicted: 0.6, observed: 0.71, count: 410 },
          { predicted: 0.8, observed: 0.88, count: 520 },
          { predicted: 0.95, observed: 0.97, count: 690 },
        ],
      },
    },
  ],
};
