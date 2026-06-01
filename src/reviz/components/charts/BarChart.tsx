"use client";

import { scaleBand, scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
  useInView,
  usePalette,
  useReplay,
  type RevizMeta,
} from "@/reviz";

interface Datum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: Datum[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  orientation?: "vertical" | "horizontal";
  color?: string;
  showValues?: boolean;
  showGrid?: boolean;
  cornerRadius?: number;
  barGap?: number;
  duration?: number;
  highlightIndex?: number;
}

export default function BarChart({
  data,
  title,
  caption,
  source,
  yLabel,
  orientation = "vertical",
  color,
  showValues = true,
  showGrid = true,
  cornerRadius = 4,
  barGap = 0.32,
  duration = 900,
  highlightIndex = -1,
}: BarChartProps) {
  const p = usePalette();
  const fill = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const maxValue = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data]);
  const horizontal = orientation === "horizontal";

  return (
    <Figure
      variant="plain"
      align="center"
      title={title}
      caption={caption}
      source={source}
      actions={undefined}
    >
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={horizontal ? 4 / 3 : 16 / 10}
          margin={{
            top: 18,
            right: 18,
            bottom: horizontal ? 24 : 46,
            left: horizontal ? 96 : yLabel ? 52 : 40,
          }}
        >
          {({ inner, margin }) => {
            const value = scaleLinear().domain([0, maxValue]).range(horizontal ? [0, inner.width] : [inner.height, 0]).nice();
            const band = scaleBand<string>()
              .domain(data.map((d) => d.label))
              .range([0, horizontal ? inner.height : inner.width])
              .padding(barGap);

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {showGrid && !horizontal && <GridLines scale={value as never} width={inner.width} />}
                {showGrid && horizontal && (
                  <g>
                    {(value as never as { ticks: (n: number) => number[] }).ticks(5).map((t, i) => (
                      <line
                        key={i}
                        x1={value(t)}
                        x2={value(t)}
                        y1={0}
                        y2={inner.height}
                        stroke={p.grid}
                        strokeDasharray="2 4"
                      />
                    ))}
                  </g>
                )}

                {data.map((d, i) => {
                  const bw = band.bandwidth();
                  const active = hover?.i === i || highlightIndex === i;
                  const dim = highlightIndex >= 0 && highlightIndex !== i;
                  const barFill = active ? fill : dim ? p.accentSoft : fill;

                  if (horizontal) {
                    const w = value(d.value);
                    const y = band(d.label) ?? 0;
                    return (
                      <g key={d.label}>
                        <motion.rect
                          x={0}
                          y={y}
                          height={bw}
                          rx={cornerRadius}
                          fill={barFill}
                          initial={{ width: 0 }}
                          animate={{ width: inView ? w : 0 }}
                          transition={{ duration: duration / 1000, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                          style={{ opacity: dim ? 0.5 : 1 }}
                          onMouseMove={(e) => {
                            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                            setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                          key={`${token}-${i}`}
                        />
                        {showValues && (
                          <motion.text
                            x={w + 8}
                            y={y + bw / 2}
                            dy="0.32em"
                            fill={p.inkMuted}
                            className="font-mono text-[10.5px] tabular-nums"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: inView ? 1 : 0 }}
                            transition={{ delay: i * 0.06 + duration / 1000 }}
                          >
                            {formatCompact(d.value)}
                          </motion.text>
                        )}
                      </g>
                    );
                  }

                  const h = inner.height - value(d.value);
                  const x = band(d.label) ?? 0;
                  return (
                    <g key={d.label}>
                      <motion.rect
                        x={x}
                        width={bw}
                        rx={cornerRadius}
                        fill={barFill}
                        initial={{ height: 0, y: inner.height }}
                        animate={{ height: inView ? h : 0, y: inView ? value(d.value) : inner.height }}
                        transition={{ duration: duration / 1000, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                        style={{ opacity: dim ? 0.5 : 1 }}
                        onMouseMove={(e) => {
                          const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        key={`${token}-${i}`}
                      />
                      {showValues && (
                        <motion.text
                          x={x + bw / 2}
                          y={value(d.value) - 7}
                          textAnchor="middle"
                          fill={p.inkMuted}
                          className="font-mono text-[10.5px] tabular-nums"
                          initial={{ opacity: 0, y: value(d.value) }}
                          animate={{ opacity: inView ? 1 : 0, y: value(d.value) - 7 }}
                          transition={{ delay: i * 0.06 + duration / 1400 }}
                        >
                          {formatCompact(d.value)}
                        </motion.text>
                      )}
                    </g>
                  );
                })}

                {!horizontal && (
                  <>
                    <Baseline y={inner.height} width={inner.width} />
                    <AxisLeft scale={value as never} height={inner.height} label={yLabel} />
                    <AxisBottom scale={band as never} y={inner.height} rotate={data.length > 6 ? -32 : 0} />
                  </>
                )}
                {horizontal && (
                  <>
                    <AxisBottom scale={value as never} y={inner.height} linearFormat={(v) => formatCompact(v)} />
                    <g>
                      {data.map((d) => (
                        <text
                          key={d.label}
                          x={-10}
                          y={(band(d.label) ?? 0) + band.bandwidth() / 2}
                          dy="0.32em"
                          textAnchor="end"
                          fill={p.inkFaint}
                          className="font-mono text-[10.5px]"
                        >
                          {d.label}
                        </text>
                      ))}
                    </g>
                  </>
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {data[hover.i].label}
              </div>
              <TooltipRow label="value" value={formatCompact(data[hover.i].value, 2)} />
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
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "bar-chart",
  name: "Bar Chart",
  category: "charts",
  description:
    "A clean, animated bar chart with value labels, gridlines, hover tooltips, and vertical/horizontal layouts. The workhorse of comparison.",
  tags: ["bar", "comparison", "categorical", "column"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "BarChart",
  sourcePath: "charts/BarChart",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Data",
      type: "categorical",
      group: "Data",
      default: [
        { label: "Steam Shirt", value: 93 },
        { label: "Grab Chips", value: 80 },
        { label: "Sliding Door", value: 77 },
        { label: "Iron Shirt", value: 67 },
        { label: "Watering Can", value: 60 },
        { label: "Scrub Dish", value: 20 },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Success rate by task" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Success rate (%)" },
    {
      key: "orientation",
      label: "Orientation",
      type: "select",
      group: "Layout",
      default: "vertical",
      options: [
        { value: "vertical", label: "Vertical" },
        { value: "horizontal", label: "Horizontal" },
      ],
    },
    { key: "color", label: "Bar color", type: "color", group: "Style", default: "" },
    { key: "showValues", label: "Show values", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "cornerRadius", label: "Corner radius", type: "number", group: "Style", default: 4, min: 0, max: 16, step: 1 },
    { key: "barGap", label: "Bar gap", type: "number", group: "Style", default: 0.32, min: 0.05, max: 0.8, step: 0.01 },
    { key: "highlightIndex", label: "Highlight bar", type: "number", group: "Style", default: -1, min: -1, max: 11, step: 1 },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 900, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "eval",
      name: "Eval results",
      props: { title: "1XWM success rate by task", yLabel: "Success rate (%)", highlightIndex: 3 },
    },
    {
      id: "horizontal",
      name: "Horizontal ranking",
      props: {
        orientation: "horizontal",
        title: "Tokens processed by model",
        yLabel: "",
        data: [
          { label: "Opus 4.8", value: 182 },
          { label: "Sonnet 4.6", value: 154 },
          { label: "Haiku 4.5", value: 121 },
          { label: "GPT-5.3", value: 168 },
          { label: "Gemini 3", value: 149 },
        ],
      },
    },
  ],
};
