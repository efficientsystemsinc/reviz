"use client";

import { motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  TooltipRow,
  clamp,
  cn,
  mapRange,
  mix,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useProgress,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/** The reviz monospace tick/label style (font-mono uppercase, tracked, muted ink). */
const MONO_LABEL = "font-mono uppercase tracking-label text-[11px] leading-none text-ink-muted";

type ScaleType = "continuous" | "discrete";
type Ramp = "sequential" | "diverging" | "series";
type Orientation = "horizontal" | "vertical";

export interface ColorScaleLegendProps {
  type?: ScaleType;
  ramp?: Ramp;
  min?: number;
  max?: number;
  title?: string;
  unit?: string;
  orientation?: Orientation;
  steps?: number;
  color?: string;
  showTicks?: boolean;
  caption?: string;
  source?: string;
  duration?: number;
}

/** Sample a ramp at t in [0,1] given the resolved palette + (optional) accent override. */
function makeSampler(ramp: Ramp, p: ReturnType<typeof usePalette>, accent: string) {
  if (ramp === "diverging") {
    const lo = p.bad;
    const midC = mix(p.surface, p.inkFaint, 0.18);
    const hi = p.ok;
    return (t: number) => (t <= 0.5 ? mix(lo, midC, t / 0.5) : mix(midC, hi, (t - 0.5) / 0.5));
  }
  if (ramp === "series") {
    // Cycle a smooth multi-hue path through the categorical series ramp.
    const stops = [p.series[3], p.series[6], p.series[1], p.series[2], p.series[0]];
    return (t: number) => {
      const x = clamp(t, 0, 1) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(x));
      return mix(stops[i], stops[i + 1], x - i);
    };
  }
  // sequential: pale surface tint -> full accent.
  const lo = mix(p.surface, accent, 0.06);
  return (t: number) => mix(lo, accent, Math.pow(clamp(t, 0, 1), 0.85));
}

export default function ColorScaleLegend({
  type = "continuous",
  ramp = "sequential",
  min = 0,
  max = 1,
  title = "Attention weight",
  unit = "",
  orientation = "horizontal",
  steps = 7,
  color = "",
  showTicks = true,
  caption = "",
  source = "",
  duration = 1100,
}: ColorScaleLegendProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const gid = useId().replace(/:/g, "");

  const vertical = orientation === "vertical";
  const sampler = useMemo(() => makeSampler(ramp, p, accent), [ramp, p, accent]);

  const progress = useProgress({
    duration,
    enabled: inView,
    trigger: `${token}-${ramp}-${type}-${orientation}-${steps}`,
  });

  const [hover, setHover] = useState<{ t: number; x: number; y: number } | null>(null);

  const stops = useMemo(() => {
    const N = 24;
    return Array.from({ length: N + 1 }, (_, i) => {
      const t = i / N;
      return { offset: `${round(t * 100, 2)}%`, color: sampler(t) };
    });
  }, [sampler]);

  const nSteps = clamp(Math.round(steps), 2, 12);
  const swatches = useMemo(
    () =>
      Array.from({ length: nSteps }, (_, i) => {
        const t = nSteps === 1 ? 0.5 : i / (nSteps - 1);
        return { t, color: sampler(t), value: mapRange(t, 0, 1, min, max) };
      }),
    [nSteps, sampler, min, max],
  );

  const fmt = (v: number) => {
    const r = round(v, Math.abs(max - min) >= 100 ? 0 : 2);
    return unit ? `${r}${unit}` : `${r}`;
  };

  // Three tick labels: min, mid, max.
  const ticks = [
    { t: 0, value: min },
    { t: 0.5, value: (min + max) / 2 },
    { t: 1, value: max },
  ];

  // The reveal mask: a moving wipe + soft shimmer, snaps to full when reduced.
  const reveal = reduced ? 1 : progress;

  const BAR = vertical ? 16 : 14; // bar thickness
  const LEN = vertical ? 196 : 100; // length basis (% for horizontal, px for vertical)

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/scale relative">
        <button
          type="button"
          onClick={replay}
          aria-label="Replay animation"
          className="absolute right-0 top-0 z-10 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/scale:opacity-100"
        >
          replay
        </button>

        {type === "continuous" ? (
          <div
            className={cn(
              "relative flex",
              vertical ? "h-[220px] flex-row items-stretch gap-3" : "w-full flex-col gap-2",
            )}
          >
            {/* The gradient bar */}
            <div
              className={cn("relative", vertical ? "h-full" : "w-full")}
              style={vertical ? { width: BAR + 4 } : undefined}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const raw = vertical
                  ? 1 - (e.clientY - r.top) / r.height
                  : (e.clientX - r.left) / r.width;
                const t = clamp(raw, 0, 1);
                setHover({
                  t,
                  x: vertical ? r.width : e.clientX - r.left,
                  y: vertical ? e.clientY - r.top : 0,
                });
              }}
            >
              <svg
                viewBox={vertical ? `0 0 ${BAR} ${LEN}` : `0 0 ${LEN} ${BAR}`}
                preserveAspectRatio="none"
                width="100%"
                height={vertical ? "100%" : BAR}
                role="img"
                className="block overflow-visible rounded-[5px]"
                style={vertical ? { width: BAR } : undefined}
              >
                <defs>
                  <linearGradient
                    id={`csl-grad-${gid}`}
                    x1="0"
                    y1={vertical ? "1" : "0"}
                    x2={vertical ? "0" : "1"}
                    y2={vertical ? "0" : "0"}
                  >
                    {stops.map((s, i) => (
                      <stop key={i} offset={s.offset} stopColor={s.color} />
                    ))}
                  </linearGradient>
                  <linearGradient
                    id={`csl-shimmer-${gid}`}
                    x1="0"
                    y1={vertical ? "1" : "0"}
                    x2={vertical ? "0" : "1"}
                    y2={vertical ? "0" : "0"}
                  >
                    <stop offset="0%" stopColor={withAlpha(p.surface, 0)} />
                    <stop offset="48%" stopColor={withAlpha(p.surface, 0)} />
                    <stop offset="50%" stopColor={withAlpha(p.canvas, 0.55)} />
                    <stop offset="52%" stopColor={withAlpha(p.surface, 0)} />
                    <stop offset="100%" stopColor={withAlpha(p.surface, 0)} />
                  </linearGradient>
                  <clipPath id={`csl-clip-${gid}`}>
                    <rect
                      x={0}
                      y={vertical ? LEN * (1 - reveal) : 0}
                      width={vertical ? BAR : LEN * reveal}
                      height={vertical ? LEN * reveal : BAR}
                    />
                  </clipPath>
                </defs>

                {/* track underlay */}
                <rect x={0} y={0} width={vertical ? BAR : LEN} height={vertical ? LEN : BAR} rx={4} fill={p.surfaceAlt} />

                <g clipPath={`url(#csl-clip-${gid})`}>
                  <rect
                    x={0}
                    y={0}
                    width={vertical ? BAR : LEN}
                    height={vertical ? LEN : BAR}
                    rx={4}
                    fill={`url(#csl-grad-${gid})`}
                  />
                  {!reduced && reveal < 1 && (
                    <motion.rect
                      x={vertical ? 0 : (LEN * reveal) - 10}
                      y={vertical ? LEN * (1 - reveal) : 0}
                      width={vertical ? BAR : 12}
                      height={vertical ? 12 : BAR}
                      fill={`url(#csl-shimmer-${gid})`}
                    />
                  )}
                </g>

                <rect
                  x={0.5}
                  y={0.5}
                  width={(vertical ? BAR : LEN) - 1}
                  height={(vertical ? LEN : BAR) - 1}
                  rx={4}
                  fill="none"
                  stroke={p.border}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* hover readout cursor */}
              {hover && (
                <div
                  className="pointer-events-none absolute"
                  style={
                    vertical
                      ? { top: `${(1 - hover.t) * 100}%`, left: 0, right: 0, height: 0 }
                      : { left: `${hover.t * 100}%`, top: 0, bottom: 0, width: 0 }
                  }
                >
                  <div
                    className={cn("absolute", vertical ? "left-0 right-0 h-[2px]" : "top-0 bottom-0 w-[2px]")}
                    style={{ background: p.ink, opacity: 0.9 }}
                  />
                </div>
              )}
            </div>

            {/* Ticks */}
            {showTicks && (
              <div
                className={cn(
                  "relative shrink-0",
                  vertical
                    ? "flex flex-col-reverse justify-between"
                    : "flex w-full justify-between",
                )}
                style={vertical ? { height: "100%" } : undefined}
              >
                {ticks.map((tk, i) => (
                  <motion.div
                    key={i}
                    initial={false}
                    animate={{ opacity: reduced || reveal >= tk.t - 0.001 ? 1 : 0, y: 0 }}
                    transition={{ duration: 0.3, delay: reduced ? 0 : tk.t * (duration / 1000) * 0.6 }}
                    className={cn(
                      "tabular-nums",
                      MONO_LABEL,
                      vertical
                        ? "leading-none"
                        : i === 0
                          ? "text-left"
                          : i === ticks.length - 1
                            ? "text-right"
                            : "text-center",
                    )}
                  >
                    {fmt(tk.value)}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* DISCRETE swatch legend */
          <div
            className={cn("flex", vertical ? "flex-col gap-1.5" : "w-full flex-row gap-1")}
            onMouseLeave={() => setHover(null)}
          >
            {swatches.map((sw, i) => {
              const delay = reduced ? 0 : (i / nSteps) * (duration / 1000);
              return (
                <motion.div
                  key={i}
                  initial={reduced ? false : { opacity: 0, scale: 0.82, y: vertical ? 0 : 6 }}
                  animate={
                    inView || reduced
                      ? { opacity: 1, scale: 1, y: 0 }
                      : { opacity: 0, scale: 0.82, y: vertical ? 0 : 6 }
                  }
                  transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("flex items-center", vertical ? "gap-2.5" : "flex-1 flex-col gap-1.5")}
                  onMouseMove={(e) => {
                    const host = e.currentTarget.parentElement?.getBoundingClientRect();
                    if (!host) return;
                    setHover({
                      t: sw.t,
                      x: e.clientX - host.left,
                      y: vertical ? e.clientY - host.top : 0,
                    });
                  }}
                >
                  <div
                    className={cn("rounded-[4px]", vertical ? "h-5 w-9 shrink-0" : "h-5 w-full")}
                    style={{
                      background: sw.color,
                      boxShadow: `inset 0 0 0 1px ${withAlpha(p.ink, 0.06)}`,
                    }}
                  />
                  {showTicks && (
                    <span className={cn("tabular-nums", MONO_LABEL)}>{fmt(sw.value)}</span>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        <FloatingTooltip
          x={hover?.x ?? 0}
          y={hover?.y ?? 0}
          visible={hover != null && type === "continuous"}
          align={vertical ? "right" : "center"}
        >
          {hover != null && (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-[3px]"
                  style={{ background: sampler(hover.t) }}
                />
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {ramp}
                </span>
              </div>
              <TooltipRow label="value" value={fmt(mapRange(hover.t, 0, 1, min, max))} />
              <TooltipRow label="t" value={round(hover.t, 2)} />
            </>
          )}
        </FloatingTooltip>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "color-scale-legend",
  name: "Color Scale Legend",
  category: "layout-annotation",
  description:
    "A gradient or stepped color-scale legend with min/mid/max ticks and a live hover readout — the key that decodes every heatmap, attention map, and saliency overlay.",
  tags: ["legend", "colorbar", "color-scale", "gradient", "annotation", "heatmap", "colormap"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ColorScaleLegend",
  sourcePath: "layout-annotation/ColorScaleLegend",
  aspect: 16 / 5,
  controls: [
    {
      key: "type",
      label: "Type",
      type: "select",
      group: "Data",
      default: "continuous",
      options: [
        { value: "continuous", label: "Continuous (gradient)" },
        { value: "discrete", label: "Discrete (swatches)" },
      ],
    },
    {
      key: "ramp",
      label: "Ramp",
      type: "select",
      group: "Style",
      default: "sequential",
      options: [
        { value: "sequential", label: "Sequential (surface to accent)" },
        { value: "diverging", label: "Diverging (bad to ok)" },
        { value: "series", label: "Series (multi-hue)" },
      ],
    },
    { key: "min", label: "Min", type: "number", group: "Data", default: 0, min: -100, max: 100, step: 0.1 },
    { key: "max", label: "Max", type: "number", group: "Data", default: 1, min: -100, max: 100, step: 0.1 },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Attention weight" },
    { key: "unit", label: "Unit", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      group: "Layout",
      default: "horizontal",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
      ],
    },
    { key: "steps", label: "Discrete steps", type: "number", group: "Layout", default: 7, min: 2, max: 12, step: 1 },
    { key: "color", label: "Accent override", type: "color", group: "Style", default: "" },
    { key: "showTicks", label: "Show tick labels", type: "boolean", group: "Labels", default: true },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "sequential",
      name: "Sequential 0..1",
      props: {
        type: "continuous",
        ramp: "sequential",
        min: 0,
        max: 1,
        title: "Attention weight",
        orientation: "horizontal",
      },
    },
    {
      id: "diverging",
      name: "Diverging -1..1",
      props: {
        type: "continuous",
        ramp: "diverging",
        min: -1,
        max: 1,
        title: "Logit attribution",
        orientation: "horizontal",
      },
    },
    {
      id: "discrete",
      name: "Discrete bins",
      props: {
        type: "discrete",
        ramp: "series",
        min: 0,
        max: 100,
        steps: 6,
        unit: "%",
        title: "Recall@k bucket",
        orientation: "horizontal",
      },
    },
  ],
};
