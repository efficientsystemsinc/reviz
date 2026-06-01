"use client";

import { usePalette } from "../ThemeProvider";

type LinearScale = {
  (v: number): number;
  ticks: (count?: number) => number[];
  domain: () => number[];
  range: () => number[];
};

type BandScale = {
  (v: string): number | undefined;
  domain: () => string[];
  bandwidth: () => number;
};

const TICK_FONT = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.04em",
} as const;

/** Horizontal gridlines from a linear y-scale. */
export function GridLines({
  scale,
  width,
  count = 5,
  dashed = true,
}: {
  scale: LinearScale;
  width: number;
  count?: number;
  dashed?: boolean;
}) {
  const p = usePalette();
  const ticks = scale.ticks(count);
  return (
    <g aria-hidden>
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={0}
          x2={width}
          y1={scale(t)}
          y2={scale(t)}
          stroke={p.grid}
          strokeWidth={1}
          strokeDasharray={dashed ? "2 4" : undefined}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  );
}

/** Left (value) axis for a linear scale. */
export function AxisLeft({
  scale,
  count = 5,
  format = (v: number) => String(v),
  label,
  height,
}: {
  scale: LinearScale;
  count?: number;
  format?: (v: number) => string;
  label?: string;
  height?: number;
}) {
  const p = usePalette();
  const ticks = scale.ticks(count);
  return (
    <g aria-hidden>
      {ticks.map((t, i) => (
        <text
          key={i}
          x={-10}
          y={scale(t)}
          dy="0.32em"
          textAnchor="end"
          fill={p.inkFaint}
          style={TICK_FONT}
        >
          {format(t)}
        </text>
      ))}
      {label && height != null && (
        <text
          transform={`translate(${-34}, ${height / 2}) rotate(-90)`}
          textAnchor="middle"
          fill={p.inkMuted}
          style={{ ...TICK_FONT, letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/** Bottom axis for a band scale (categorical) or linear scale. */
export function AxisBottom({
  scale,
  y,
  rotate = 0,
  format = (v: string) => v,
  values,
  linearFormat,
  linearCount = 6,
}: {
  scale: BandScale | LinearScale;
  y: number;
  rotate?: number;
  format?: (v: string) => string;
  values?: string[];
  linearFormat?: (v: number) => string;
  linearCount?: number;
}) {
  const p = usePalette();
  const isBand = "bandwidth" in scale;
  if (isBand) {
    const band = scale as BandScale;
    const ticks = values ?? band.domain();
    return (
      <g aria-hidden transform={`translate(0, ${y})`}>
        {ticks.map((t) => {
          const x = (band(t) ?? 0) + band.bandwidth() / 2;
          return (
            <text
              key={t}
              x={x}
              y={16}
              textAnchor={rotate ? "end" : "middle"}
              transform={rotate ? `rotate(${rotate}, ${x}, 16)` : undefined}
              fill={p.inkFaint}
              style={TICK_FONT}
            >
              {format(t)}
            </text>
          );
        })}
      </g>
    );
  }
  const lin = scale as LinearScale;
  const ticks = lin.ticks(linearCount);
  const fmt = linearFormat ?? ((v: number) => String(v));
  return (
    <g aria-hidden transform={`translate(0, ${y})`}>
      {ticks.map((t, i) => (
        <text key={i} x={lin(t)} y={16} textAnchor="middle" fill={p.inkFaint} style={TICK_FONT}>
          {fmt(t)}
        </text>
      ))}
    </g>
  );
}

/** A single baseline / zero-line. */
export function Baseline({ y, width }: { y: number; width: number }) {
  const p = usePalette();
  return (
    <line x1={0} x2={width} y1={y} y2={y} stroke={p.borderStrong} strokeWidth={1} shapeRendering="crispEdges" />
  );
}
