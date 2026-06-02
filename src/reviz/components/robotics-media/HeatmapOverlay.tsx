"use client";

import { motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Glow,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  clamp,
  mix,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

export interface HeatmapOverlayProps {
  grid?: number[][];
  bgSrc?: string;
  legendLabel?: string;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  opacity?: number;
  duration?: number;
}

/** Default saliency map: a focused hot lobe (top-left object) plus a faint
 *  secondary region, the kind of pattern a vision policy attends to. */
const DEFAULT_GRID: number[][] = [
  [0.04, 0.08, 0.12, 0.1, 0.06, 0.04, 0.03, 0.02],
  [0.08, 0.22, 0.46, 0.4, 0.16, 0.07, 0.04, 0.03],
  [0.12, 0.48, 0.92, 0.84, 0.34, 0.12, 0.06, 0.05],
  [0.1, 0.42, 0.86, 0.78, 0.3, 0.14, 0.1, 0.08],
  [0.06, 0.18, 0.34, 0.28, 0.18, 0.16, 0.2, 0.16],
  [0.04, 0.08, 0.14, 0.16, 0.2, 0.34, 0.42, 0.3],
  [0.03, 0.05, 0.08, 0.12, 0.22, 0.4, 0.5, 0.36],
  [0.02, 0.03, 0.05, 0.08, 0.14, 0.24, 0.3, 0.22],
];

export default function HeatmapOverlay({
  grid = DEFAULT_GRID,
  bgSrc = "",
  legendLabel = "Saliency",
  title = "",
  caption = "",
  source = "",
  color = "",
  opacity = 0.78,
  duration = 1100,
}: HeatmapOverlayProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  const rows = grid.length;
  const cols = useMemo(() => Math.max(0, ...grid.map((row) => row.length)), [grid]);

  // Normalize against the observed extent so any input range maps to [0,1].
  const { lo, hi } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const row of grid)
      for (const v of row) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    if (!isFinite(mn)) return { lo: 0, hi: 1 };
    return { lo: mn, hi: mx === mn ? mn + 1 : mx };
  }, [grid]);

  const tOf = (v: number) => clamp((v - lo) / (hi - lo), 0, 1);

  // Heat color ramp: dim accent tint -> saturated accent -> deepened hot core,
  // eased so the hottest regions read instantly while faint attention stays
  // legible. The hot end is darkened so it survives the multiply blend and
  // clearly separates from the cream canvas.
  const heatColor = (t: number) => {
    const e = Math.pow(t, 0.55);
    const base = mix(mix(p.surfaceAlt, accent, 0.82), accent, e);
    return mix(base, mix(accent, p.ink, 0.35), Math.pow(t, 1.4));
  };

  const aspect = 1.32;
  const stepDelay = (r: number, c: number) => {
    if (reduced) return 0;
    // radial wavefront from the hottest centroid feels like heat "blooming" in
    const d = Math.hypot(r - rows * 0.35, c - cols * 0.35);
    const span = Math.hypot(rows, cols);
    return (d / (span || 1)) * (duration / 1000) * 0.8;
  };

  // Colorbar gradient stops.
  const barStops = useMemo(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        return { offset: `${round(t * 100, 1)}%`, color: heatColor(t) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accent, p.surfaceAlt],
  );

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/heat relative">
        <ResponsiveSvg aspect={aspect} margin={{ top: 12, right: 14, bottom: 38, left: 14 }}>
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;
            const cw = cols > 0 ? W / cols : 0;
            const ch = rows > 0 ? H / rows : 0;
            // overscan each cell so neighboring blurs blend into a smooth field
            const over = Math.min(cw, ch) * 0.55;
            const blur = Math.min(cw, ch) * 0.42;
            const rx = Math.min(10, Math.min(W, H) * 0.03);
            // colorbar geometry: label on the left, gradient bar bracketed by lo/hi
            const barW = W * 0.56;
            const barX = W - barW;

            const clipId = `heat-clip-${gid}`;
            const blurId = `heat-blur-${gid}`;
            const sceneId = `heat-scene-${gid}`;
            const glowId = `heat-glow-${gid}`;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <clipPath id={clipId}>
                    <rect x={0} y={0} width={W} height={H} rx={rx} />
                  </clipPath>
                  <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation={blur} />
                  </filter>
                  <Glow id={glowId} blur={blur * 0.4} />
                  <linearGradient id={sceneId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={mix(p.surfaceAlt, p.ink, 0.12)} />
                    <stop offset="55%" stopColor={mix(p.surfaceAlt, p.ink, 0.22)} />
                    <stop offset="100%" stopColor={mix(p.surfaceAlt, p.ink, 0.42)} />
                  </linearGradient>
                </defs>

                <g clipPath={`url(#${clipId})`}>
                  {/* Backdrop: real image if provided, else a schematic scene */}
                  {bgSrc ? (
                    <image
                      href={bgSrc}
                      x={0}
                      y={0}
                      width={W}
                      height={H}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  ) : (
                    <g>
                      <rect x={0} y={0} width={W} height={H} fill={`url(#${sceneId})`} />
                      {/* schematic objects the policy might attend to */}
                      <rect
                        x={W * 0.16}
                        y={H * 0.2}
                        width={W * 0.26}
                        height={H * 0.3}
                        rx={W * 0.02}
                        fill={withAlpha(p.ink, 0.22)}
                        stroke={withAlpha(p.ink, 0.42)}
                        strokeWidth={1.25}
                      />
                      <circle
                        cx={W * 0.74}
                        cy={H * 0.72}
                        r={Math.min(W, H) * 0.13}
                        fill={withAlpha(p.ink, 0.2)}
                        stroke={withAlpha(p.ink, 0.38)}
                        strokeWidth={1.25}
                      />
                      <line
                        x1={0}
                        y1={H * 0.62}
                        x2={W}
                        y2={H * 0.62}
                        stroke={withAlpha(p.ink, 0.3)}
                        strokeWidth={1.25}
                      />
                    </g>
                  )}

                  {/* dim scrim so heat reads on any backdrop */}
                  <rect x={0} y={0} width={W} height={H} fill={withAlpha(p.canvas, 0.1)} />

                  {/* The smooth heat field: blurred, opacity-ramped cells */}
                  <g filter={`url(#${blurId})`} style={{ mixBlendMode: "multiply" }}>
                    {grid.map((row, r) =>
                      row.map((v, c) => {
                        const t = tOf(v);
                        if (t <= 0.001) return null;
                        const cellOpacity = opacity * Math.pow(t, 0.42);
                        return (
                          <motion.rect
                            key={`heat-${token}-${r}-${c}`}
                            x={c * cw - over / 2}
                            y={r * ch - over / 2}
                            width={cw + over}
                            height={ch + over}
                            rx={Math.min(cw, ch) * 0.5}
                            fill={heatColor(t)}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: inView ? cellOpacity : 0 }}
                            transition={{
                              duration: reduced ? 0 : 0.7,
                              delay: reduced ? 0 : stepDelay(r, c),
                              ease: [0.22, 1, 0.36, 1],
                            }}
                          />
                        );
                      }),
                    )}
                  </g>

                  {/* hover highlight ring */}
                  {hover && (
                    <rect
                      x={hover.c * cw}
                      y={hover.r * ch}
                      width={cw}
                      height={ch}
                      fill="none"
                      stroke={p.canvas}
                      strokeWidth={1.5}
                      filter={`url(#${glowId})`}
                      className="pointer-events-none"
                    />
                  )}
                </g>

                {/* crisp frame */}
                <rect
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  rx={rx}
                  fill="none"
                  stroke={p.borderStrong}
                  strokeWidth={1}
                  className="pointer-events-none"
                />

                {/* invisible hit grid for hover (kept sharp, above blur) */}
                {grid.map((row, r) =>
                  row.map((v, c) => (
                    <rect
                      key={`hit-${r}-${c}`}
                      x={c * cw}
                      y={r * ch}
                      width={cw}
                      height={ch}
                      fill="transparent"
                      style={{ cursor: "crosshair" }}
                      onMouseMove={(e) => {
                        const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                        const box = svg.getBoundingClientRect();
                        setHover({ r, c, x: e.clientX - box.left, y: e.clientY - box.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                    />
                  )),
                )}

                {/* Colorbar legend along the bottom */}
                <g transform={`translate(0, ${H + 14})`}>
                  <defs>
                    <linearGradient id={`heat-bar-${gid}`} x1="0" y1="0" x2="1" y2="0">
                      {barStops.map((s, i) => (
                        <stop key={i} offset={s.offset} stopColor={s.color} />
                      ))}
                    </linearGradient>
                  </defs>
                  <text
                    x={barX - 10}
                    y={-2}
                    textAnchor="end"
                    fill={p.ink}
                    className="font-mono uppercase"
                    style={{ fontSize: 13, letterSpacing: "0.1em" }}
                  >
                    {legendLabel}
                  </text>
                  <motion.rect
                    x={barX}
                    y={-9}
                    height={9}
                    rx={3}
                    fill={`url(#heat-bar-${gid})`}
                    stroke={p.borderStrong}
                    strokeWidth={0.75}
                    initial={{ width: 0 }}
                    animate={{ width: inView ? barW : 0 }}
                    transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <text
                    x={barX}
                    y={12}
                    fill={p.inkMuted}
                    className="font-mono tabular-nums"
                    style={{ fontSize: 11.5 }}
                  >
                    {round(lo, 2)}
                  </text>
                  <text
                    x={barX + barW}
                    y={12}
                    textAnchor="end"
                    fill={p.inkMuted}
                    className="font-mono tabular-nums"
                    style={{ fontSize: 11.5 }}
                  >
                    {round(hi, 2)}
                  </text>
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-[3px]"
                  style={{ background: heatColor(tOf(grid[hover.r]?.[hover.c] ?? 0)) }}
                />
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                  cell [{hover.r}, {hover.c}]
                </span>
              </div>
              <TooltipRow label={legendLabel.toLowerCase()} value={round(grid[hover.r]?.[hover.c] ?? 0, 3)} />
              <TooltipRow label="normalized" value={`${round(tOf(grid[hover.r]?.[hover.c] ?? 0) * 100, 0)}%`} />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/heat:opacity-100">
          <ReplayButton onClick={replay} label="replay" />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "heatmap-overlay",
  name: "Heatmap Overlay",
  category: "robotics-media",
  description:
    "A smoothly blended 2D heat field (attention, saliency, or occupancy) painted over an image or schematic scene backdrop, with a colorbar legend and a value-on-hover readout — the figure used to show where a vision policy is looking.",
  tags: ["heatmap", "saliency", "attention", "overlay", "occupancy", "vision", "robotics"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "HeatmapOverlay",
  sourcePath: "robotics-media/HeatmapOverlay",
  aspect: 1.32,
  controls: [
    {
      key: "grid",
      label: "Heat grid",
      type: "matrix",
      group: "Data",
      default: DEFAULT_GRID,
    },
    {
      key: "bgSrc",
      label: "Background image URL",
      type: "text",
      group: "Data",
      default: "",
    },
    { key: "legendLabel", label: "Legend label", type: "text", group: "Labels", default: "Saliency" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Heat color", type: "color", group: "Style", default: "" },
    { key: "opacity", label: "Overlay opacity", type: "number", group: "Style", default: 0.78, min: 0, max: 1, step: 0.02 },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "saliency",
      name: "Policy saliency",
      props: {
        title: "Where the grasp policy looks",
        caption: "Input-gradient saliency over the wrist-camera frame; the policy locks onto the target object.",
        source: "vision policy v3",
        legendLabel: "Saliency",
        opacity: 0.78,
        grid: DEFAULT_GRID,
      },
    },
    {
      id: "occupancy",
      name: "Occupancy grid",
      props: {
        title: "Local occupancy estimate",
        caption: "Per-cell obstacle probability from the costmap, overlaid on the floor schematic.",
        legendLabel: "P(occupied)",
        opacity: 0.7,
        grid: [
          [0.02, 0.04, 0.06, 0.1, 0.6, 0.82, 0.7, 0.2],
          [0.03, 0.05, 0.08, 0.14, 0.66, 0.9, 0.78, 0.24],
          [0.04, 0.06, 0.1, 0.12, 0.4, 0.5, 0.4, 0.14],
          [0.06, 0.1, 0.16, 0.2, 0.14, 0.1, 0.08, 0.06],
          [0.5, 0.62, 0.46, 0.2, 0.08, 0.05, 0.04, 0.03],
          [0.74, 0.88, 0.6, 0.22, 0.06, 0.04, 0.03, 0.02],
          [0.58, 0.7, 0.46, 0.16, 0.05, 0.03, 0.02, 0.02],
          [0.2, 0.26, 0.18, 0.08, 0.04, 0.02, 0.02, 0.01],
        ],
      },
    },
    {
      id: "attention",
      name: "Attention rollout",
      props: {
        title: "ViT attention rollout",
        caption: "Class-token attention aggregated across heads, normalized per frame.",
        legendLabel: "Attention",
        opacity: 0.82,
        color: "",
        grid: [
          [0.05, 0.07, 0.09, 0.08, 0.06, 0.05],
          [0.08, 0.3, 0.55, 0.5, 0.18, 0.07],
          [0.12, 0.6, 1.0, 0.92, 0.34, 0.1],
          [0.1, 0.5, 0.88, 0.8, 0.3, 0.09],
          [0.07, 0.2, 0.36, 0.32, 0.16, 0.07],
          [0.05, 0.08, 0.12, 0.11, 0.08, 0.05],
        ],
      },
    },
  ],
};
