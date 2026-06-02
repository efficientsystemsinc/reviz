"use client";

import { arc as d3arc, pie as d3pie, type PieArcDatum } from "d3-shape";
import { sum as d3sum } from "d3-array";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
  clamp,
  polarToCartesian,
  uid,
  useInView,
  usePalette,
  useProgress,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface Slice {
  label: string;
  value: number;
}

export interface DonutChartProps {
  data: Slice[];
  title?: string;
  caption?: string;
  source?: string;
  centerLabel?: string;
  highlightIndex?: number;
  innerRadius?: number;
  showPercentages?: boolean;
  showLegend?: boolean;
  padAngle?: number;
  cornerRadius?: number;
  colors?: string[];
  duration?: number;
}

const TAU = Math.PI * 2;

const DEFAULT_DATA: Slice[] = [
  { label: "Pick", value: 412 },
  { label: "Place", value: 318 },
  { label: "Other", value: 147 },
];

export default function DonutChart({
  data = DEFAULT_DATA,
  title,
  caption,
  source,
  centerLabel = "",
  highlightIndex = -1,
  innerRadius = 0.62,
  showPercentages = true,
  showLegend = true,
  padAngle = 0.012,
  cornerRadius = 3,
  colors = [],
  duration = 1100,
}: DonutChartProps) {
  const p = usePalette();
  const ring = colors.length > 0 ? colors : p.series;
  const [ref, inView] = useInView<HTMLDivElement>();
  const [token, setToken] = useState(0);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const sweep = useProgress({ duration, enabled: inView, trigger: token });

  const total = useMemo(() => d3sum(data, (d) => Math.max(0, d.value)) || 1, [data]);

  const arcs = useMemo(() => {
    const layout = d3pie<Slice>()
      .value((d) => Math.max(0, d.value))
      .padAngle(padAngle)
      .sort(null);
    return layout(data);
  }, [data, padAngle]);

  const colorFor = (i: number) => ring[i % ring.length];

  // Active slice for the center readout: hovered, else highlighted, else null.
  const active = hover ? hover.i : highlightIndex >= 0 && highlightIndex < data.length ? highlightIndex : -1;

  const legendItems: LegendItem[] = data.map((d, i) => ({
    label: d.label,
    color: colorFor(i),
    shape: "circle",
  }));

  const shadowId = useMemo(() => uid("donut-shadow"), []);

  const fmtPct = (v: number) => {
    const pct = (v / total) * 100;
    return pct >= 9.95 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
  };

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 10} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
          {({ inner, margin }) => {
            const cx = inner.width / 2;
            const cy = inner.height / 2;
            // Reserve room for external labels.
            const labelPad = showPercentages ? 46 : 18;
            const outer = clamp(Math.min(inner.width, inner.height) / 2 - labelPad, 24, 1000);
            const inR = outer * clamp(innerRadius, 0, 0.85);
            const lift = Math.max(6, outer * 0.05);

            const sweptEnd = (d: PieArcDatum<Slice>) => d.startAngle + (d.endAngle - d.startAngle) * sweep;

            const arcGen = d3arc<{ inner: number; outer: number; start: number; end: number }>()
              .innerRadius((a) => a.inner)
              .outerRadius((a) => a.outer)
              .cornerRadius(cornerRadius)
              .padAngle(padAngle)
              .startAngle((a) => a.start)
              .endAngle((a) => a.end);

            const centerDatum = active >= 0 ? data[active] : null;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={3} blur={7} opacity={0.22} />
                </defs>

                <g transform={`translate(${cx}, ${cy})`}>
                  {/* Track ring under the slices for a finished look. */}
                  <circle r={(outer + inR) / 2} fill="none" stroke={p.surfaceAlt} strokeWidth={outer - inR} opacity={0.5} />

                  {arcs.map((d, i) => {
                    const end = sweptEnd(d);
                    if (end <= d.startAngle + 1e-4) return null;
                    const isActive = active === i;
                    const dim = active >= 0 && !isActive;
                    const fill = colorFor(i);

                    // Lift the slice outward along its bisector when active.
                    const mid = (d.startAngle + d.endAngle) / 2;
                    const off = isActive ? polarToCartesian(0, 0, lift, (mid * 180) / Math.PI) : { x: 0, y: 0 };

                    const path =
                      arcGen({ inner: inR, outer, start: d.startAngle, end }) ?? undefined;

                    return (
                      <g
                        key={d.data.label}
                        transform={`translate(${off.x}, ${off.y})`}
                        style={{ transition: "transform 220ms cubic-bezier(0.22,1,0.36,1)" }}
                      >
                        <path
                          d={path}
                          fill={fill}
                          opacity={dim ? 0.32 : 1}
                          stroke={p.canvas}
                          strokeWidth={1.25}
                          filter={isActive ? `url(#${shadowId})` : undefined}
                          style={{ transition: "opacity 220ms ease" }}
                          onMouseMove={(e) => {
                            const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                            const r = svg.getBoundingClientRect();
                            setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                      </g>
                    );
                  })}

                  {/* External percentage labels with leader lines. */}
                  {showPercentages &&
                    arcs.map((d, i) => {
                      const end = sweptEnd(d);
                      const reveal = (end - d.startAngle) / Math.max(1e-4, d.endAngle - d.startAngle);
                      if (reveal < 0.6) return null;
                      const frac = (d.endAngle - d.startAngle) / TAU;
                      if (frac < 0.025) return null; // too thin to label cleanly
                      const mid = (d.startAngle + d.endAngle) / 2;
                      const deg = (mid * 180) / Math.PI;
                      const a0 = polarToCartesian(0, 0, outer + 2, deg);
                      const a1 = polarToCartesian(0, 0, outer + 12, deg);
                      const onRight = a1.x >= 0;
                      const tx = a1.x + (onRight ? 6 : -6);
                      const dim = active >= 0 && active !== i;
                      return (
                        <g key={`lbl-${d.data.label}`} opacity={dim ? 0.4 : 1} style={{ transition: "opacity 220ms ease" }}>
                          <polyline
                            points={`${a0.x},${a0.y} ${a1.x},${a1.y} ${tx},${a1.y}`}
                            fill="none"
                            stroke={p.border}
                            strokeWidth={1}
                          />
                          <text
                            x={tx + (onRight ? 2 : -2)}
                            y={a1.y}
                            dy="0.32em"
                            textAnchor={onRight ? "start" : "end"}
                            className="font-mono tabular-nums"
                            fontSize={10.5}
                            fill={active === i ? p.ink : p.inkMuted}
                          >
                            {fmtPct(d.data.value)}
                          </text>
                          <text
                            x={tx + (onRight ? 2 : -2)}
                            y={a1.y + 12}
                            textAnchor={onRight ? "start" : "end"}
                            className="font-mono uppercase"
                            fontSize={8.5}
                            letterSpacing={0.4}
                            fill={p.inkFaint}
                          >
                            {d.data.label}
                          </text>
                        </g>
                      );
                    })}

                  {/* Center readout — total, or the active slice. */}
                  {inR > outer * 0.28 && (
                    <g style={{ pointerEvents: "none" }}>
                      <text
                        textAnchor="middle"
                        y={-7}
                        className="font-mono uppercase"
                        fontSize={9}
                        letterSpacing={0.6}
                        fill={p.inkFaint}
                      >
                        {centerDatum ? centerDatum.label : centerLabel || "Total"}
                      </text>
                      <text
                        textAnchor="middle"
                        y={14}
                        className="font-sans tabular-nums"
                        fontSize={clamp(inR * 0.42, 16, 30)}
                        fontWeight={600}
                        fill={centerDatum ? colorFor(active) : p.ink}
                      >
                        {centerDatum ? fmtPct(centerDatum.value) : formatTotal(total)}
                      </text>
                      {centerDatum && (
                        <text
                          textAnchor="middle"
                          y={30}
                          className="font-mono tabular-nums"
                          fontSize={9.5}
                          fill={p.inkMuted}
                        >
                          {formatTotal(centerDatum.value)} / {formatTotal(total)}
                        </text>
                      )}
                    </g>
                  )}
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(hover.i) }} />
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-80">
                  {data[hover.i].label}
                </span>
              </div>
              <TooltipRow label="share" value={fmtPct(data[hover.i].value)} />
              <TooltipRow label="value" value={formatTotal(data[hover.i].value)} />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={() => setToken((t) => t + 1)} />
        </div>
      </div>

      {showLegend && <Legend items={legendItems} align="center" className="mt-2" />}
    </Figure>
  );
}

function formatTotal(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export const meta: RevizMeta = {
  id: "donut-chart",
  name: "Donut Chart",
  category: "charts",
  description:
    "A themeable donut/pie chart whose slices sweep in by angle, lift on hover, and surface live share percentages with a focused center readout.",
  tags: ["donut", "pie", "distribution", "proportion", "share", "composition"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "DonutChart",
  sourcePath: "charts/DonutChart",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Segments",
      type: "categorical",
      group: "Data",
      default: [
        { label: "Pick", value: 412 },
        { label: "Place", value: 318 },
        { label: "Other", value: 147 },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Action distribution by segment" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "centerLabel", label: "Center label", type: "text", group: "Labels", default: "" },
    {
      key: "highlightIndex",
      label: "Focus slice",
      type: "number",
      group: "Layout",
      default: -1,
      min: -1,
      max: 11,
      step: 1,
    },
    {
      key: "innerRadius",
      label: "Inner radius",
      type: "number",
      group: "Layout",
      default: 0.62,
      min: 0,
      max: 0.8,
      step: 0.02,
    },
    { key: "showPercentages", label: "Show percentages", type: "boolean", group: "Style", default: true },
    { key: "showLegend", label: "Show legend", type: "boolean", group: "Style", default: true },
    { key: "padAngle", label: "Slice gap", type: "number", group: "Style", default: 0.012, min: 0, max: 0.05, step: 0.002 },
    { key: "cornerRadius", label: "Corner radius", type: "number", group: "Style", default: 3, min: 0, max: 12, step: 1 },
    { key: "colors", label: "Slice colors", type: "colorArray", group: "Style", default: [] },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "pick-place-other",
      name: "Pick / Place / Other",
      props: {
        title: "Action distribution by segment",
        centerLabel: "Actions",
        innerRadius: 0.62,
        data: [
          { label: "Pick", value: 412 },
          { label: "Place", value: 318 },
          { label: "Other", value: 147 },
        ],
      },
    },
    {
      id: "model-usage",
      name: "Model usage breakdown",
      props: {
        title: "Token usage by model",
        centerLabel: "Tokens",
        innerRadius: 0.58,
        highlightIndex: 0,
        data: [
          { label: "Aria-L", value: 1840 },
          { label: "Aria-M", value: 2960 },
          { label: "Aria-S", value: 1320 },
          { label: "Embeddings", value: 540 },
        ],
      },
    },
    {
      id: "pie",
      name: "Full pie",
      props: {
        title: "Recall@k contribution",
        innerRadius: 0,
        showPercentages: true,
        data: [
          { label: "Top-1", value: 58 },
          { label: "Top-5", value: 24 },
          { label: "Top-20", value: 12 },
          { label: "Miss", value: 6 },
        ],
      },
    },
  ],
};
