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
  SoftShadow,
  TooltipRow,
  formatCompact,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface WaterfallDatum {
  label: string;
  delta: number;
  /** When true, this bar is an absolute total anchored to the baseline. */
  isTotal?: boolean;
}

/** A bar resolved to a pixel-ready segment with running cumulative context. */
interface Segment {
  label: string;
  delta: number;
  isTotal: boolean;
  /** Running cumulative value at the start of this bar. */
  start: number;
  /** Running cumulative value at the end of this bar. */
  end: number;
  /** Sign that drives the color: total / up / down. */
  kind: "total" | "up" | "down";
}

export interface WaterfallChartProps {
  data?: WaterfallDatum[];
  title?: string;
  caption?: string;
  source?: string;
  yLabel?: string;
  upColor?: string;
  downColor?: string;
  totalColor?: string;
  showConnectors?: boolean;
  showValues?: boolean;
  showGrid?: boolean;
  cornerRadius?: number;
  barGap?: number;
  duration?: number;
}

const DEFAULT_DATA: WaterfallDatum[] = [
  { label: "Base model", delta: 41.0, isTotal: true },
  { label: "+ SFT", delta: 12.4 },
  { label: "+ RLHF", delta: 9.1 },
  { label: "+ Tool use", delta: 7.6 },
  { label: "− Safety tax", delta: -4.2 },
  { label: "+ Test-time", delta: 5.3 },
  { label: "Final score", delta: 0, isTotal: true },
];

export default function WaterfallChart({
  data = DEFAULT_DATA,
  title = "",
  caption = "",
  source = "",
  yLabel = "Score",
  upColor = "",
  downColor = "",
  totalColor = "",
  showConnectors = true,
  showValues = true,
  showGrid = true,
  cornerRadius = 3,
  barGap = 0.34,
  duration = 1000,
}: WaterfallChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const up = upColor || p.ok;
  const down = downColor || p.bad;
  const total = totalColor || p.accent;
  const shadowId = useMemo(() => uid("wf-shadow"), []);

  // Resolve each datum into start/end running cumulative segments. A `isTotal`
  // bar is anchored to zero and its height equals the running cumulative so far
  // (unless an explicit non-zero delta is provided, which sets the total value).
  const { segments, domainMax, domainMin } = useMemo(() => {
    let running = 0;
    const segs: Segment[] = data.map((d) => {
      if (d.isTotal) {
        const value = d.delta !== 0 ? d.delta : running;
        const seg: Segment = {
          label: d.label,
          delta: value,
          isTotal: true,
          start: 0,
          end: value,
          kind: "total",
        };
        running = value;
        return seg;
      }
      const start = running;
      const end = running + d.delta;
      running = end;
      return {
        label: d.label,
        delta: d.delta,
        isTotal: false,
        start,
        end,
        kind: d.delta >= 0 ? "up" : "down",
      } as Segment;
    });

    let max = 0;
    let min = 0;
    for (const s of segs) {
      max = Math.max(max, s.start, s.end);
      min = Math.min(min, s.start, s.end);
    }
    // Headroom for value labels.
    const span = max - min || 1;
    return {
      segments: segs,
      domainMax: max + span * 0.12,
      domainMin: min < 0 ? min - span * 0.06 : 0,
    };
  }, [data]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 18, right: 18, bottom: 48, left: yLabel ? 54 : 42 }}
        >
          {({ inner, margin }) => {
            const y = scaleLinear()
              .domain([domainMin, domainMax])
              .range([inner.height, 0])
              .nice();
            const band = scaleBand<string>()
              .domain(segments.map((s) => s.label))
              .range([0, inner.width])
              .padding(barGap);
            const bw = band.bandwidth();
            const zeroY = y(0);

            const colorFor = (kind: Segment["kind"]) =>
              kind === "total" ? total : kind === "up" ? up : down;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={3} blur={6} opacity={0.16} />
                </defs>

                {showGrid && <GridLines scale={y as never} width={inner.width} />}

                {/* Running connector lines linking the top of each bar to the next. */}
                {showConnectors &&
                  segments.slice(0, -1).map((s, i) => {
                    const next = segments[i + 1];
                    const x1 = (band(s.label) ?? 0) + bw;
                    const x2 = band(next.label) ?? 0;
                    // Connector sits at the running cumulative level handed off.
                    const cy = y(s.end);
                    return (
                      <motion.line
                        key={`conn-${s.label}`}
                        x1={x1}
                        x2={x2}
                        y1={cy}
                        y2={cy}
                        stroke={p.inkFaint}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: inView ? 0.7 : 0 }}
                        transition={{
                          delay: reduced ? 0 : (i + 1) * (duration / 1000) * 0.55,
                          duration: reduced ? 0 : 0.28,
                        }}
                        shapeRendering="crispEdges"
                      />
                    );
                  })}

                {/* Bars rise in sequence. */}
                {segments.map((s, i) => {
                  const x = band(s.label) ?? 0;
                  const yTop = y(Math.max(s.start, s.end));
                  const yBot = y(Math.min(s.start, s.end));
                  const h = Math.max(0, yBot - yTop);
                  const fill = colorFor(s.kind);
                  const active = hover?.i === i;
                  const labelText = s.isTotal
                    ? formatCompact(s.end, 1)
                    : `${s.delta >= 0 ? "+" : "−"}${formatCompact(Math.abs(s.delta), 1)}`;
                  const labelY = yTop - 7;

                  return (
                    <g key={s.label}>
                      <motion.rect
                        x={x}
                        width={bw}
                        rx={cornerRadius}
                        fill={fill}
                        filter={active ? `url(#${shadowId})` : undefined}
                        initial={{ height: 0, y: zeroY, opacity: 0 }}
                        animate={{
                          height: inView ? h : 0,
                          y: inView ? yTop : zeroY,
                          opacity: inView ? 1 : 0,
                        }}
                        transition={{
                          duration: reduced ? 0 : (duration / 1000) * 0.5,
                          delay: reduced ? 0 : i * (duration / 1000) * 0.55,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ opacity: hover && !active ? 0.62 : 1 }}
                        onMouseMove={(e) => {
                          const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      />
                      {/* Thin accent cap to echo the sign on totals/floats. */}
                      {!s.isTotal && (
                        <motion.rect
                          x={x}
                          width={bw}
                          height={2}
                          rx={1}
                          fill={fill}
                          initial={{ opacity: 0 }}
                          animate={{
                            opacity: inView ? 1 : 0,
                            y: inView ? (s.delta >= 0 ? yTop : yBot - 2) : zeroY,
                          }}
                          transition={{
                            duration: reduced ? 0 : 0.3,
                            delay: reduced ? 0 : i * (duration / 1000) * 0.55 + (duration / 1000) * 0.4,
                          }}
                          style={{ filter: "brightness(0.82)" }}
                        />
                      )}
                      {showValues && (
                        <motion.text
                          x={x + bw / 2}
                          y={labelY}
                          textAnchor="middle"
                          fill={s.isTotal ? p.ink : s.kind === "up" ? up : down}
                          className="font-mono text-[10.5px] font-medium tabular-nums"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: inView ? 1 : 0 }}
                          transition={{
                            delay: reduced ? 0 : i * (duration / 1000) * 0.55 + (duration / 1000) * 0.5,
                            duration: reduced ? 0 : 0.3,
                          }}
                        >
                          {labelText}
                        </motion.text>
                      )}
                    </g>
                  );
                })}

                {/* Zero baseline floats only when the domain crosses zero. */}
                {domainMin < 0 && (
                  <line
                    x1={0}
                    x2={inner.width}
                    y1={zeroY}
                    y2={zeroY}
                    stroke={withAlpha(p.inkFaint, 0.6)}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    shapeRendering="crispEdges"
                  />
                )}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft scale={y as never} height={inner.height} label={yLabel} format={(v) => formatCompact(v)} />
                <AxisBottom scale={band as never} y={inner.height} rotate={segments.length > 6 ? -28 : 0} />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {segments[hover.i].label}
              </div>
              {segments[hover.i].isTotal ? (
                <TooltipRow label="total" value={formatCompact(segments[hover.i].end, 2)} />
              ) : (
                <>
                  <TooltipRow
                    label="delta"
                    value={`${segments[hover.i].delta >= 0 ? "+" : "−"}${formatCompact(
                      Math.abs(segments[hover.i].delta),
                      2,
                    )}`}
                  />
                  <TooltipRow label="cumulative" value={formatCompact(segments[hover.i].end, 2)} />
                </>
              )}
            </>
          )}
        </FloatingTooltip>

        <button
          type="button"
          onClick={replay}
          key={token}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
        >
          replay
        </button>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "waterfall-chart",
  name: "Waterfall Chart",
  category: "charts",
  description:
    "A cumulative-delta waterfall: a starting total, floating gain/loss bars colored by sign, running connectors, and an ending total. Built for metric decompositions and ablation breakdowns.",
  tags: ["waterfall", "cumulative", "decomposition", "delta", "ablation", "bridge"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "WaterfallChart",
  sourcePath: "charts/WaterfallChart",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Bars",
      type: "json",
      group: "Data",
      default: DEFAULT_DATA,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Score" },
    { key: "upColor", label: "Increase color", type: "color", group: "Style", default: "" },
    { key: "downColor", label: "Decrease color", type: "color", group: "Style", default: "" },
    { key: "totalColor", label: "Total color", type: "color", group: "Style", default: "" },
    { key: "showConnectors", label: "Show connectors", type: "boolean", group: "Style", default: true },
    { key: "showValues", label: "Show values", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "cornerRadius", label: "Corner radius", type: "number", group: "Style", default: 3, min: 0, max: 16, step: 1 },
    { key: "barGap", label: "Bar gap", type: "number", group: "Layout", default: 0.34, min: 0.05, max: 0.8, step: 0.01 },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1000, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "eval-decomposition",
      name: "Eval decomposition",
      props: {
        title: "Where the eval score comes from",
        yLabel: "Score",
        data: DEFAULT_DATA,
      },
    },
    {
      id: "revenue-bridge",
      name: "Revenue bridge",
      props: {
        title: "ARR bridge — FY24 to FY25",
        yLabel: "ARR ($M)",
        data: [
          { label: "FY24 ARR", delta: 84.0, isTotal: true },
          { label: "New logos", delta: 31.5 },
          { label: "Expansion", delta: 18.2 },
          { label: "Churn", delta: -12.4 },
          { label: "Contraction", delta: -6.1 },
          { label: "FY25 ARR", delta: 0, isTotal: true },
        ],
      },
    },
    {
      id: "latency-budget",
      name: "Latency budget",
      props: {
        title: "Per-request latency budget",
        yLabel: "Latency (ms)",
        barGap: 0.42,
        data: [
          { label: "Network", delta: 22.0, isTotal: true },
          { label: "Tokenize", delta: 8.0 },
          { label: "Prefill", delta: 46.0 },
          { label: "Decode", delta: 71.0 },
          { label: "− KV cache", delta: -18.0 },
          { label: "Detokenize", delta: 6.0 },
          { label: "Total", delta: 0, isTotal: true },
        ],
      },
    },
  ],
};
