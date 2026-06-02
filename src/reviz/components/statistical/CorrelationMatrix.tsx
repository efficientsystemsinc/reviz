"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  clamp,
  mix,
  readableOn,
  round,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

export interface CorrelationMatrixProps {
  matrix?: number[][];
  labels?: string[];
  showValues?: boolean;
  triangle?: "full" | "lower";
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

const FALLBACK_LABELS = (n: number) => Array.from({ length: n }, (_, i) => `x${i + 1}`);

export default function CorrelationMatrix({
  matrix = [
    [1.0, 0.82, 0.41, -0.18, 0.06, -0.55],
    [0.82, 1.0, 0.37, -0.22, 0.11, -0.49],
    [0.41, 0.37, 1.0, 0.28, -0.34, -0.12],
    [-0.18, -0.22, 0.28, 1.0, -0.62, 0.44],
    [0.06, 0.11, -0.34, -0.62, 1.0, -0.27],
    [-0.55, -0.49, -0.12, 0.44, -0.27, 1.0],
  ],
  labels = ["lr", "batch", "depth", "dropout", "wd", "val_loss"],
  showValues = true,
  triangle = "full",
  title = "",
  caption = "",
  source = "",
  color = "",
  duration = 1000,
}: CorrelationMatrixProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  const n = matrix.length;
  const vars = useMemo(() => {
    const base =
      labels.length >= n ? labels.slice(0, n) : [...labels, ...FALLBACK_LABELS(n).slice(labels.length)];
    return base;
  }, [labels, n]);

  // Whether a cell is rendered for the current triangle mode. The diagonal is
  // always shown; for "lower" only the lower triangle (incl. diagonal) appears.
  const visible = (r: number, c: number) => (triangle === "lower" ? c <= r : true);

  // Diverging ramp centered at 0: bad (−1) .. neutral surface (0) .. ok (+1).
  // A gentle gamma keeps weak correlations distinguishable from noise.
  const rampFill = (v: number) => {
    const t = clamp(Math.abs(v), 0, 1);
    const eased = Math.pow(t, 0.78);
    const end = v >= 0 ? p.ok : p.bad;
    return mix(p.surface, end, eased);
  };

  const cellText = (v: number) => {
    const t = Math.pow(clamp(Math.abs(v), 0, 1), 0.78);
    if (t <= 0.5) return p.inkMuted;
    const end = v >= 0 ? p.ok : p.bad;
    return readableOn(mix(p.surface, end, t));
  };

  const display = (v: number) => {
    if (v >= 1) return "1.00";
    if (v <= -1) return "−1.00";
    const s = round(v, 2).toFixed(2);
    return s.startsWith("-") ? `−${s.slice(1)}` : s;
  };

  const aspect = 1.16;
  const labelChars = Math.max(...vars.map((l) => l.length), 4);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={aspect}
          margin={{
            top: Math.min(72, 28 + labelChars * 4.6),
            right: 64,
            bottom: 24,
            left: Math.min(112, 26 + labelChars * 6.6),
          }}
        >
          {({ inner, margin }) => {
            const size = Math.min(inner.width, inner.height);
            const ox = (inner.width - size) / 2;
            const oy = (inner.height - size) / 2;
            const cell = n > 0 ? size / n : 0;
            const gap = Math.min(3, cell * 0.05);
            const fontSize = Math.max(8, Math.min(14, cell * 0.25));
            const tickFont = Math.max(8.5, Math.min(12, cell * 0.32));

            const orderDelay = (r: number, c: number) => {
              // diagonal wavefront from the top-left
              const wave = (r + c) * 0.5;
              return reduced ? 0 : (wave / (n * 1.7)) * (duration / 1000);
            };

            return (
              <g transform={`translate(${margin.left + ox}, ${margin.top + oy})`}>
                {/* Column tick labels along the top */}
                {vars.map((label, c) => {
                  const active = hover != null && (hover.c === c || hover.r === c);
                  return (
                    <text
                      key={`xt-${c}`}
                      x={c * cell + cell / 2}
                      y={-7}
                      textAnchor="start"
                      transform={`rotate(-45, ${c * cell + cell / 2}, -7)`}
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Row tick labels along the left */}
                {vars.map((label, r) => {
                  const active = hover != null && (hover.r === r || hover.c === r);
                  return (
                    <text
                      key={`yt-${r}`}
                      x={-9}
                      y={r * cell + cell / 2}
                      dy="0.32em"
                      textAnchor="end"
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Cells */}
                {matrix.map((row, r) =>
                  row.map((value, c) => {
                    if (!visible(r, c)) return null;
                    const x = c * cell;
                    const y = r * cell;
                    const isDiag = r === c;
                    const v = clamp(value, -1, 1);
                    // hover highlights the symmetric pair (r,c) and (c,r)
                    const pair =
                      hover != null &&
                      ((hover.r === r && hover.c === c) || (hover.r === c && hover.c === r));
                    const exact = hover != null && hover.r === r && hover.c === c;
                    const dimmed = hover != null && !pair;
                    const fill = rampFill(v);

                    return (
                      <g key={`cell-${token}-${r}-${c}`}>
                        <motion.rect
                          x={x + gap / 2}
                          y={y + gap / 2}
                          width={Math.max(0, cell - gap)}
                          height={Math.max(0, cell - gap)}
                          rx={Math.min(4, cell * 0.12)}
                          fill={fill}
                          stroke={pair ? accent : isDiag ? withAlpha(p.ink, 0.35) : p.border}
                          strokeWidth={pair ? 1.6 : isDiag ? 1.1 : 0.75}
                          initial={{ opacity: 0, scale: 0.55 }}
                          animate={{
                            opacity: inView ? (dimmed ? 0.28 : 1) : 0,
                            scale: inView ? (exact ? 1.05 : 1) : 0.55,
                          }}
                          transition={{
                            opacity: { duration: reduced ? 0 : 0.45, delay: hover ? 0 : orderDelay(r, c) },
                            scale: {
                              duration: reduced ? 0 : exact ? 0.18 : 0.5,
                              delay: hover ? 0 : orderDelay(r, c),
                              ease: [0.22, 1, 0.36, 1],
                            },
                          }}
                          style={{ transformOrigin: `${x + cell / 2}px ${y + cell / 2}px`, cursor: "pointer" }}
                          onMouseMove={(e) => {
                            const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                            setHover({ r, c, x: e.clientX - box.left, y: e.clientY - box.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                        {showValues && cell > 16 && (
                          <motion.text
                            x={x + cell / 2}
                            y={y + cell / 2}
                            dy="0.34em"
                            textAnchor="middle"
                            fill={cellText(v)}
                            className="font-mono tabular-nums pointer-events-none"
                            style={{ fontSize, fontWeight: isDiag ? 600 : Math.abs(v) > 0.6 ? 600 : 400 }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: inView ? (dimmed ? 0.45 : 1) : 0 }}
                            transition={{
                              duration: reduced ? 0 : 0.4,
                              delay: hover ? 0 : orderDelay(r, c) + 0.16,
                            }}
                          >
                            {display(v)}
                          </motion.text>
                        )}
                      </g>
                    );
                  }),
                )}

                {/* Diverging color legend */}
                <CorrLegend
                  x={size + 18}
                  height={size}
                  ok={p.ok}
                  bad={p.bad}
                  surface={p.surface}
                  border={p.border}
                  ink={p.inkFaint}
                  inView={inView}
                  reduced={reduced}
                />

                {triangle === "full" && (
                  <rect
                    x={0}
                    y={0}
                    width={size}
                    height={size}
                    fill="none"
                    stroke={p.borderStrong}
                    strokeWidth={1}
                    rx={Math.min(5, cell * 0.12)}
                    className="pointer-events-none"
                  />
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {vars[hover.r]} {"×"} {vars[hover.c]}
              </div>
              <TooltipRow label="r" value={display(clamp(matrix[hover.r]?.[hover.c] ?? 0, -1, 1))} />
              <TooltipRow label="r²" value={round((matrix[hover.r]?.[hover.c] ?? 0) ** 2, 2).toFixed(2)} />
              <TooltipRow
                label="sign"
                value={
                  hover.r === hover.c
                    ? "self"
                    : (matrix[hover.r]?.[hover.c] ?? 0) >= 0
                      ? "positive"
                      : "negative"
                }
              />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} label="replay" />
        </div>
      </div>
    </Figure>
  );
}

/** Vertical diverging colorbar: +1 (ok) at the top, 0 (neutral) at center, −1 (bad) at the bottom. */
function CorrLegend({
  x,
  height,
  ok,
  bad,
  surface,
  border,
  ink,
  inView,
  reduced,
}: {
  x: number;
  height: number;
  ok: string;
  bad: string;
  surface: string;
  border: string;
  ink: string;
  inView: boolean;
  reduced: boolean;
}) {
  const gradId = useMemo(() => uid("corr-legend-grad"), []);
  const barW = 9;
  const barH = Math.max(40, height * 0.58);
  const top = (height - barH) / 2;
  const ticks: { v: number; t: number }[] = [
    { v: 1, t: 0 },
    { v: 0.5, t: 0.25 },
    { v: 0, t: 0.5 },
    { v: -0.5, t: 0.75 },
    { v: -1, t: 1 },
  ];
  const fmt = (v: number) => (v < 0 ? `−${Math.abs(v)}` : v === 0 ? "0" : `+${v}`);

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: inView ? 1 : 0 }}
      transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.25 }}
      className="pointer-events-none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ok} />
          <stop offset="50%" stopColor={surface} />
          <stop offset="100%" stopColor={bad} />
        </linearGradient>
      </defs>
      <rect
        x={x}
        y={top}
        width={barW}
        height={barH}
        rx={3}
        fill={`url(#${gradId})`}
        stroke={border}
        strokeWidth={0.75}
      />
      {ticks.map((tk) => {
        const ty = top + tk.t * barH;
        return (
          <g key={`lg-${tk.v}`}>
            <line x1={x + barW} y1={ty} x2={x + barW + 3} y2={ty} stroke={ink} strokeWidth={0.75} />
            <text
              x={x + barW + 6}
              y={ty}
              dy="0.32em"
              textAnchor="start"
              fill={ink}
              className="font-mono tabular-nums"
              style={{ fontSize: 8.5 }}
            >
              {fmt(tk.v)}
            </text>
          </g>
        );
      })}
    </motion.g>
  );
}

export const meta: RevizMeta = {
  id: "correlation-matrix",
  name: "Correlation Matrix",
  category: "statistical",
  description:
    "A symmetric correlation matrix as a diverging heatmap centered at zero (negative→neutral→positive), with cell-by-cell fade-in, a value-pair hover crosshair, and an optional lower-triangle view.",
  tags: ["correlation", "heatmap", "statistics", "pearson", "diverging", "features"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "CorrelationMatrix",
  sourcePath: "statistical/CorrelationMatrix",
  aspect: 1.16,
  controls: [
    {
      key: "matrix",
      label: "Correlation matrix",
      type: "matrix",
      group: "Data",
      default: [
        [1.0, 0.82, 0.41, -0.18, 0.06, -0.55],
        [0.82, 1.0, 0.37, -0.22, 0.11, -0.49],
        [0.41, 0.37, 1.0, 0.28, -0.34, -0.12],
        [-0.18, -0.22, 0.28, 1.0, -0.62, 0.44],
        [0.06, 0.11, -0.34, -0.62, 1.0, -0.27],
        [-0.55, -0.49, -0.12, 0.44, -0.27, 1.0],
      ],
    },
    {
      key: "labels",
      label: "Variable labels",
      type: "json",
      group: "Data",
      default: ["lr", "batch", "depth", "dropout", "wd", "val_loss"],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showValues", label: "Show cell values", type: "boolean", group: "Style", default: true },
    {
      key: "triangle",
      label: "Triangle",
      type: "select",
      group: "Layout",
      default: "full",
      options: [
        { label: "Full", value: "full" },
        { label: "Lower", value: "lower" },
      ],
    },
    { key: "color", label: "Highlight color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1000,
      min: 0,
      max: 2500,
      step: 50,
    },
  ],
  presets: [
    {
      id: "hparams",
      name: "Hyperparameter sweep",
      props: {
        title: "Hyperparameter ↔ outcome correlations",
        caption: "Pearson r across 240 training runs; val_loss anti-correlates with depth and learning rate.",
        source: "sweep v3",
        triangle: "full",
        matrix: [
          [1.0, 0.82, 0.41, -0.18, 0.06, -0.55],
          [0.82, 1.0, 0.37, -0.22, 0.11, -0.49],
          [0.41, 0.37, 1.0, 0.28, -0.34, -0.12],
          [-0.18, -0.22, 0.28, 1.0, -0.62, 0.44],
          [0.06, 0.11, -0.34, -0.62, 1.0, -0.27],
          [-0.55, -0.49, -0.12, 0.44, -0.27, 1.0],
        ],
        labels: ["lr", "batch", "depth", "dropout", "wd", "val_loss"],
      },
    },
    {
      id: "features-lower",
      name: "Feature collinearity (lower)",
      props: {
        title: "Feature collinearity",
        caption: "Lower-triangle Pearson correlation across engineered sensor features.",
        triangle: "lower",
        showValues: true,
        matrix: [
          [1.0, 0.91, -0.12, 0.44, -0.67],
          [0.91, 1.0, -0.08, 0.39, -0.61],
          [-0.12, -0.08, 1.0, -0.53, 0.21],
          [0.44, 0.39, -0.53, 1.0, -0.34],
          [-0.67, -0.61, 0.21, -0.34, 1.0],
        ],
        labels: ["accel_x", "accel_y", "gyro_z", "torque", "slip"],
      },
    },
  ],
};
