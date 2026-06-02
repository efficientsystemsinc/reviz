"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  LinearGradient,
  ReplayButton,
  SoftShadow,
  ResponsiveSvg,
  TooltipRow,
  formatCompact,
  mix,
  readableOn,
  uid,
  useInView,
  usePalette,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface Stage {
  label: string;
  value: number;
}

export interface FunnelChartProps {
  stages: Stage[];
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  showPercent?: boolean;
  showValues?: boolean;
  gap?: number;
  neck?: number;
  duration?: number;
}

export default function FunnelChart({
  stages = [
    { label: "Queries issued", value: 100000 },
    { label: "Docs retrieved", value: 64200 },
    { label: "Passed reranker", value: 38500 },
    { label: "Grounded answer", value: 21900 },
    { label: "Human-verified", value: 12400 },
  ],
  title = "",
  caption = "",
  source = "",
  color = "",
  showPercent = true,
  showValues = true,
  gap = 8,
  neck = 0.28,
  duration = 1100,
}: FunnelChartProps) {
  const p = usePalette();
  const base = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const ids = useMemo(
    () => ({ grad: uid("funnel-grad"), shadow: uid("funnel-shadow") }),
    [],
  );

  const data = useMemo(() => {
    const top = Math.max(1, stages[0]?.value ?? 1);
    return stages.map((s, i) => {
      const prev = i === 0 ? s.value : stages[i - 1].value;
      return {
        ...s,
        ofTop: s.value / top,
        ofPrev: prev === 0 ? 1 : s.value / prev,
        drop: i === 0 ? 0 : 1 - (prev === 0 ? 1 : s.value / prev),
      };
    });
  }, [stages]);

  // Stage fills: a vertical ramp from the base accent toward a deeper tone so the
  // funnel reads as a single cohesive flow that intensifies as it narrows.
  const stageFill = (i: number) => {
    const t = data.length <= 1 ? 0 : i / (data.length - 1);
    return mix(base, p.ink, 0.04 + t * 0.22);
  };

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 11} margin={{ top: 16, right: 150, bottom: 16, left: 150 }}>
          {({ inner, margin }) => {
            const n = data.length;
            const gapPx = Math.min(gap, inner.height / Math.max(n, 1) / 2);
            const bandH = n > 0 ? (inner.height - gapPx * (n - 1)) / n : 0;
            const cx = inner.width / 2;

            // Half-width of the flow at a given fraction-of-top, interpolating from
            // the full plot width at the mouth down to `neck` * width at the base.
            const halfAt = (frac: number) => {
              const minHalf = (inner.width * neck) / 2;
              const maxHalf = inner.width / 2;
              return minHalf + (maxHalf - minHalf) * frac;
            };

            const fracAt = (i: number, edge: 0 | 1) => {
              // edge 0 = top of band i, edge 1 = bottom of band i.
              if (edge === 0) return i === 0 ? 1 : data[i].ofTop;
              const next = data[i + 1];
              return next ? next.ofTop : data[i].ofTop;
            };

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <LinearGradient id={ids.grad} from={withAlpha(base, 0.0)} to={withAlpha(base, 0.18)} angle={90} />
                  <SoftShadow id={ids.shadow} dy={3} blur={9} opacity={0.16} />
                </defs>

                {data.map((d, i) => {
                  const topHalf = halfAt(fracAt(i, 0));
                  const botHalf = halfAt(fracAt(i, 1));
                  const y0 = i * (bandH + gapPx);
                  const y1 = y0 + bandH;
                  const fill = stageFill(i);
                  const active = hover?.i === i;
                  const labelColor = readableOn(fill);

                  const path = [
                    `M ${cx - topHalf} ${y0}`,
                    `L ${cx + topHalf} ${y0}`,
                    `L ${cx + botHalf} ${y1}`,
                    `L ${cx - botHalf} ${y1}`,
                    "Z",
                  ].join(" ");

                  const midY = y0 + bandH / 2;

                  return (
                    <g key={`${token}-${d.label}-${i}`}>
                      <motion.path
                        d={path}
                        fill={fill}
                        stroke={withAlpha(p.canvas, 0.55)}
                        strokeWidth={1}
                        filter={`url(#${ids.shadow})`}
                        initial={{ opacity: 0, scaleY: 0 }}
                        animate={{
                          opacity: inView ? 1 : 0,
                          scaleY: inView ? 1 : 0,
                        }}
                        style={{ transformOrigin: `${cx}px ${y0}px` }}
                        transition={{
                          duration: duration / 1000,
                          delay: i * (duration / 1000 / Math.max(n, 1)) * 0.7,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        onMouseMove={(e) => {
                          const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                      />

                      {/* Subtle top-down sheen so the flow reads as a single body of liquid. */}
                      <motion.path
                        d={path}
                        fill={`url(#${ids.grad})`}
                        stroke="none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: inView ? (active ? 0.9 : 1) : 0 }}
                        transition={{
                          duration: duration / 1000,
                          delay: i * (duration / 1000 / Math.max(n, 1)) * 0.7,
                        }}
                        style={{ pointerEvents: "none" }}
                      />

                      {/* Inline value + percent-of-top, centered inside the band. */}
                      <motion.g
                        initial={{ opacity: 0 }}
                        animate={{ opacity: inView ? 1 : 0 }}
                        transition={{
                          delay: i * (duration / 1000 / Math.max(n, 1)) * 0.7 + duration / 1000 * 0.5,
                          duration: 0.4,
                        }}
                        style={{ pointerEvents: "none" }}
                      >
                        {showValues && bandH > 22 && (
                          <text
                            x={cx}
                            y={midY}
                            textAnchor="middle"
                            dy={showPercent ? "-0.15em" : "0.32em"}
                            fill={labelColor}
                            className="font-mono tabular-nums"
                            style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.01em" }}
                          >
                            {formatCompact(d.value)}
                          </text>
                        )}
                        {showPercent && bandH > 22 && (
                          <text
                            x={cx}
                            y={midY}
                            textAnchor="middle"
                            dy={showValues ? "1.15em" : "0.32em"}
                            fill={withAlpha(labelColor, 0.78)}
                            className="font-mono uppercase tabular-nums"
                            style={{ fontSize: 9.5, letterSpacing: "0.08em" }}
                          >
                            {(d.ofTop * 100).toFixed(d.ofTop < 0.1 ? 1 : 0)}% of top
                          </text>
                        )}
                      </motion.g>

                      {/* Left rail: stage label. */}
                      <motion.text
                        x={-margin.left + 8}
                        y={midY}
                        dy="0.32em"
                        textAnchor="start"
                        fill={active ? p.ink : p.inkMuted}
                        className="font-mono"
                        style={{ fontSize: 11, letterSpacing: "0.01em" }}
                        initial={{ opacity: 0, x: -margin.left }}
                        animate={{
                          opacity: inView ? 1 : 0,
                          x: inView ? -margin.left + 8 : -margin.left,
                        }}
                        transition={{
                          delay: i * (duration / 1000 / Math.max(n, 1)) * 0.7 + duration / 1000 * 0.4,
                          duration: 0.4,
                        }}
                      >
                        {d.label}
                      </motion.text>

                      {/* Right rail: percent-of-previous + absolute drop-off. */}
                      {showPercent && (
                        <motion.g
                          initial={{ opacity: 0 }}
                          animate={{ opacity: inView ? 1 : 0 }}
                          transition={{
                            delay: i * (duration / 1000 / Math.max(n, 1)) * 0.7 + duration / 1000 * 0.55,
                            duration: 0.4,
                          }}
                          style={{ pointerEvents: "none" }}
                        >
                          <text
                            x={inner.width + margin.right - 8}
                            y={midY}
                            dy={i === 0 ? "0.32em" : "-0.15em"}
                            textAnchor="end"
                            fill={i === 0 ? p.inkFaint : d.ofPrev >= 0.7 ? p.ok : d.ofPrev >= 0.45 ? p.warn : p.bad}
                            className="font-mono tabular-nums"
                            style={{ fontSize: 12, fontWeight: 600 }}
                          >
                            {i === 0 ? "entry" : `${(d.ofPrev * 100).toFixed(0)}%`}
                          </text>
                          {i > 0 && (
                            <text
                              x={inner.width + margin.right - 8}
                              y={midY}
                              dy="1.2em"
                              textAnchor="end"
                              fill={p.inkFaint}
                              className="font-mono uppercase tabular-nums"
                              style={{ fontSize: 8.5, letterSpacing: "0.08em" }}
                            >
                              {`-${formatCompact(stages[i - 1].value - d.value)}`}
                            </text>
                          )}
                        </motion.g>
                      )}
                    </g>
                  );
                })}
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
              <TooltipRow label="count" value={formatCompact(data[hover.i].value, 2)} />
              <TooltipRow label="of top" value={`${(data[hover.i].ofTop * 100).toFixed(1)}%`} />
              <TooltipRow label="of prev" value={`${(data[hover.i].ofPrev * 100).toFixed(1)}%`} />
            </>
          )}
        </FloatingTooltip>

        <ReplayButton onClick={replay} label="Replay" className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100" />
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "funnel-chart",
  name: "Funnel Chart",
  category: "charts",
  description:
    "A conversion funnel of stacked trapezoid stages that narrow downward, annotated with counts, percent-of-previous, and percent-of-top. Stages reveal top-down to trace where flow is lost.",
  tags: ["funnel", "conversion", "pipeline", "retrieval", "drop-off"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "FunnelChart",
  sourcePath: "charts/FunnelChart",
  aspect: 16 / 11,
  controls: [
    {
      key: "stages",
      label: "Stages",
      type: "json",
      group: "Data",
      default: [
        { label: "Queries issued", value: 100000 },
        { label: "Docs retrieved", value: 64200 },
        { label: "Passed reranker", value: 38500 },
        { label: "Grounded answer", value: 21900 },
        { label: "Human-verified", value: 12400 },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showValues", label: "Show counts", type: "boolean", group: "Labels", default: true },
    { key: "showPercent", label: "Show percentages", type: "boolean", group: "Labels", default: true },
    { key: "color", label: "Flow color", type: "color", group: "Style", default: "" },
    { key: "neck", label: "Neck width", type: "number", group: "Layout", default: 0.28, min: 0.05, max: 1, step: 0.01 },
    { key: "gap", label: "Stage gap", type: "number", group: "Layout", default: 8, min: 0, max: 28, step: 1, unit: "px" },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1100, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "retrieval-eval",
      name: "Retrieval eval funnel",
      props: {
        title: "RAG pipeline yield",
        caption: "Where queries drop out of the retrieval-augmented answering pipeline.",
        source: "Internal eval harness, n=100k queries",
        stages: [
          { label: "Queries issued", value: 100000 },
          { label: "Docs retrieved", value: 64200 },
          { label: "Passed reranker", value: 38500 },
          { label: "Grounded answer", value: 21900 },
          { label: "Human-verified", value: 12400 },
        ],
      },
    },
    {
      id: "agent-rollout",
      name: "Agent task rollout",
      props: {
        title: "Agent task completion funnel",
        color: "",
        neck: 0.2,
        gap: 6,
        stages: [
          { label: "Tasks dispatched", value: 4800 },
          { label: "Plan generated", value: 4310 },
          { label: "Tools executed", value: 3120 },
          { label: "Goal reached", value: 1890 },
          { label: "Verified correct", value: 1240 },
          { label: "Shipped", value: 760 },
        ],
      },
    },
    {
      id: "signup",
      name: "Activation funnel",
      props: {
        title: "Developer activation",
        showValues: true,
        showPercent: true,
        neck: 0.35,
        stages: [
          { label: "Visited docs", value: 52000 },
          { label: "Created API key", value: 18400 },
          { label: "First call", value: 9600 },
          { label: "Reached 1k calls", value: 3100 },
        ],
      },
    },
  ],
};
