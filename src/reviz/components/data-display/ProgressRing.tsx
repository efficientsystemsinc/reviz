"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  TooltipRow,
  clamp,
  mix,
  round,
  uid,
  useAnimatedNumber,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Ring {
  label: string;
  value: number;
  color?: string;
}

export interface ProgressRingProps {
  value?: number;
  rings?: Ring[];
  label?: string;
  sublabel?: string;
  size?: number;
  thickness?: number;
  threshold?: number;
  color?: string;
  showLegend?: boolean;
  duration?: number;
  title?: string;
  caption?: string;
  source?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function ProgressRing({
  value = 87,
  rings = [],
  label = "",
  sublabel = "Success rate",
  size = 240,
  thickness = 16,
  threshold = -1,
  color = "",
  showLegend = true,
  duration = 1200,
  title = "",
  caption = "",
  source = "",
}: ProgressRingProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [hostRef, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{
    i: number;
    x: number;
    y: number;
    tip: boolean;
  } | null>(null);

  const accent = color || p.accent;

  // Normalize the rings: either the explicit multi-metric list, or a single
  // ring derived from `value`. Each ring gets a resolved color from the series ramp.
  const data = useMemo<Ring[]>(() => {
    const src =
      rings && rings.length > 0
        ? rings
        : [{ label: sublabel || label || "Progress", value, color: accent }];
    return src.map((r, i) => ({
      label: r.label,
      value: clamp(r.value, 0, 100),
      color: r.color || (i === 0 ? accent : p.series[i % p.series.length]),
    }));
  }, [rings, value, sublabel, label, accent, p.series]);

  const multi = data.length > 1;

  // Geometry. Concentric rings nest inward with a small gap between tracks.
  const dim = size;
  const cx = dim / 2;
  const cy = dim / 2;
  const gap = Math.max(4, thickness * 0.42);
  const outerR = dim / 2 - thickness / 2 - 2;

  const ringGeo = data.map((_, i) => {
    const r = outerR - i * (thickness + gap);
    return { r, circ: 2 * Math.PI * r };
  });

  // The headline number: in single mode it's the value; in multi mode it's the
  // mean of the metrics (a tidy "overall" figure).
  const headlineTarget = multi
    ? data.reduce((s, d) => s + d.value, 0) / data.length
    : data[0].value;

  const animated = useAnimatedNumber(headlineTarget, {
    duration,
    easing: "easeOut",
    enabled: inView,
    trigger: token,
    delay: 120,
  });

  const gradId = useMemo(() => uid("ring-grad"), []);
  const headlineLabel = label || (multi ? "Overall" : "");

  // Center type scales with the ring size so it stays balanced.
  const numSize = Math.round(clamp(dim * 0.2, 26, 64));
  const capSize = Math.round(clamp(dim * 0.052, 9, 14));

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div
        ref={hostRef}
        className="relative flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center sm:gap-8"
      >
        <div className="relative shrink-0" style={{ width: dim, height: dim }}>
          <svg
            width={dim}
            height={dim}
            viewBox={`0 0 ${dim} ${dim}`}
            role="img"
            style={{ display: "block", overflow: "visible" }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={accent} />
                <stop offset="100%" stopColor={mix(accent, p.series[2] ?? accent, 0.45)} />
              </linearGradient>
            </defs>

            {/* Rotate so progress sweeps clockwise from the top (12 o'clock). */}
            <g transform={`rotate(-90 ${cx} ${cy})`}>
              {data.map((d, i) => {
                const { r, circ } = ringGeo[i];
                const frac = d.value / 100;
                const active = hover?.i === i;
                const stroke = !multi ? `url(#${gradId})` : d.color || accent;
                return (
                  <g key={`${d.label}-${i}`}>
                    {/* Track */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={p.surfaceAlt}
                      strokeWidth={thickness}
                    />
                    {/* Subtle inner track edge for depth */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={withAlpha(p.borderStrong, 0.35)}
                      strokeWidth={1}
                      style={{ transform: `translateZ(0)` }}
                    />
                    {/* Progress arc */}
                    <motion.circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={thickness}
                      strokeLinecap="round"
                      strokeDasharray={circ}
                      initial={{ strokeDashoffset: circ }}
                      animate={{
                        strokeDashoffset:
                          inView || reduced ? circ * (1 - frac) : circ,
                      }}
                      transition={{
                        duration: reduced ? 0 : duration / 1000,
                        ease: EASE,
                        delay: reduced ? 0 : 0.12 + i * 0.12,
                      }}
                      style={{ opacity: hover && !active ? 0.4 : 1 }}
                    />
                  </g>
                );
              })}

              {/* Threshold tick on the outermost ring */}
              {threshold >= 0 && threshold <= 100 && (
                <ThresholdTick
                  cx={cx}
                  cy={cy}
                  r={ringGeo[0].r}
                  thickness={thickness}
                  frac={threshold / 100}
                  color={p.ink}
                />
              )}
            </g>

            {/* Invisible wide hit-areas for hover (drawn after rotate group, in screen space). */}
            <g>
              {data.map((d, i) => {
                const { r } = ringGeo[i];
                return (
                  <circle
                    key={`hit-${i}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={thickness + gap}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onMouseMove={(e) => {
                      const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                      const box = svg.getBoundingClientRect();
                      setHover({ i, x: e.clientX - box.left, y: e.clientY - box.top, tip: true });
                    }}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </g>
          </svg>

          {/* Center readout */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{
                opacity: inView || reduced ? 1 : 0,
                scale: inView || reduced ? 1 : 0.92,
              }}
              transition={{ duration: reduced ? 0 : 0.5, ease: EASE, delay: reduced ? 0 : 0.2 }}
              className="flex items-baseline justify-center font-sans font-semibold tabular-nums text-ink"
              style={{ fontSize: numSize, lineHeight: 1 }}
            >
              {Math.round(animated)}
              <span
                className="font-sans font-medium text-ink-muted"
                style={{ fontSize: numSize * 0.42, marginLeft: 2 }}
              >
                %
              </span>
            </motion.div>
            {headlineLabel && (
              <div
                className="mt-1.5 font-mono uppercase tracking-label text-ink-faint"
                style={{ fontSize: capSize }}
              >
                {headlineLabel}
              </div>
            )}
            {!headlineLabel && sublabel && !multi && (
              <div
                className="mt-1.5 font-mono uppercase tracking-label text-ink-faint"
                style={{ fontSize: capSize }}
              >
                {sublabel}
              </div>
            )}
          </div>

          <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover?.tip === true}>
            {hover != null && (
              <>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {data[hover.i].label}
                </div>
                <TooltipRow label="value" value={`${round(data[hover.i].value, 1)}%`} />
              </>
            )}
          </FloatingTooltip>
        </div>

        {/* Multi-metric legend with mini bars + values */}
        {showLegend && multi && (
          <ul className="flex w-full max-w-[260px] flex-col gap-2.5 sm:w-auto">
            {data.map((d, i) => (
              <motion.li
                key={`${d.label}-${i}`}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: inView || reduced ? 1 : 0, x: inView || reduced ? 0 : 8 }}
                transition={{
                  duration: reduced ? 0 : 0.4,
                  ease: EASE,
                  delay: reduced ? 0 : 0.3 + i * 0.08,
                }}
                onMouseEnter={() => setHover({ i, x: 0, y: 0, tip: false })}
                onMouseLeave={() => setHover(null)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: d.color }}
                />
                <span className="flex-1 truncate font-mono text-[11px] uppercase tracking-wide text-ink-muted">
                  {d.label}
                </span>
                <span className="font-sans text-[13px] font-semibold tabular-nums text-ink">
                  {round(d.value, d.value % 1 === 0 ? 0 : 1)}%
                </span>
              </motion.li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
        >
          replay
        </button>
      </div>
    </Figure>
  );
}

/** A small notch drawn across the ring track marking a target value. */
function ThresholdTick({
  cx,
  cy,
  r,
  thickness,
  frac,
  color,
}: {
  cx: number;
  cy: number;
  r: number;
  thickness: number;
  frac: number;
  color: string;
}) {
  const angle = frac * 2 * Math.PI;
  const inner = r - thickness / 2 - 2;
  const outer = r + thickness / 2 + 2;
  const x1 = cx + inner * Math.cos(angle);
  const y1 = cy + inner * Math.sin(angle);
  const x2 = cx + outer * Math.cos(angle);
  const y2 = cy + outer * Math.sin(angle);
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      opacity={0.85}
    />
  );
}

export const meta: RevizMeta = {
  id: "progress-ring",
  name: "Progress Ring",
  category: "data-display",
  description:
    "A circular progress ring that sweeps its arc on scroll-in and counts the percentage up in the center, with optional concentric rings for several metrics at once.",
  tags: ["progress", "gauge", "radial", "ring", "kpi", "donut"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ProgressRing",
  sourcePath: "data-display/ProgressRing",
  aspect: 16 / 10,
  controls: [
    {
      key: "value",
      label: "Value",
      type: "number",
      group: "Data",
      default: 87,
      min: 0,
      max: 100,
      step: 0.5,
      unit: "%",
    },
    {
      key: "rings",
      label: "Multi-metric rings",
      type: "json",
      group: "Data",
      default: [],
    },
    {
      key: "threshold",
      label: "Threshold tick",
      type: "number",
      group: "Data",
      default: -1,
      min: -1,
      max: 100,
      step: 1,
      unit: "%",
    },
    { key: "label", label: "Center label", type: "text", group: "Labels", default: "" },
    { key: "sublabel", label: "Sublabel", type: "text", group: "Labels", default: "Success rate" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "size",
      label: "Size",
      type: "number",
      group: "Layout",
      default: 240,
      min: 120,
      max: 420,
      step: 4,
      unit: "px",
    },
    {
      key: "thickness",
      label: "Ring thickness",
      type: "number",
      group: "Layout",
      default: 16,
      min: 4,
      max: 40,
      step: 1,
      unit: "px",
    },
    { key: "showLegend", label: "Show legend", type: "boolean", group: "Layout", default: true },
    { key: "color", label: "Ring color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1200,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "single",
      name: "Single 87%",
      props: {
        value: 87,
        sublabel: "Success rate",
        title: "Pick-and-place success",
        threshold: 90,
        size: 240,
        thickness: 18,
      },
    },
    {
      id: "multi",
      name: "Multi-metric",
      props: {
        title: "Agent eval scorecard",
        label: "",
        size: 240,
        thickness: 13,
        rings: [
          { label: "Recall@10", value: 91.4 },
          { label: "Precision", value: 78.2 },
          { label: "Faithfulness", value: 64.7 },
        ],
      },
    },
  ],
};
