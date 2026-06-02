"use client";

import { scaleLinear } from "d3-scale";
import { line as d3line, curveMonotoneX } from "d3-shape";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AxisBottom,
  AxisLeft,
  Baseline,
  Figure,
  FloatingTooltip,
  GridLines,
  Legend,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  VerticalFade,
  clamp,
  round,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type LegendItem,
  type RevizMeta,
} from "@/reviz";

interface RocPoint {
  fpr: number;
  tpr: number;
}

interface RocCurve {
  name: string;
  points: RocPoint[];
  color?: string;
}

export interface ROCCurveProps {
  curves?: RocCurve[];
  title?: string;
  caption?: string;
  source?: string;
  showAUC?: boolean;
  fillArea?: boolean;
  showGrid?: boolean;
  color?: string;
  duration?: number;
}

/** Default comparison: a fine-tuned classifier vs a zero-shot baseline. */
const DEFAULT_CURVES: RocCurve[] = [
  {
    name: "Fine-tuned",
    points: [
      { fpr: 0, tpr: 0 },
      { fpr: 0.02, tpr: 0.42 },
      { fpr: 0.05, tpr: 0.68 },
      { fpr: 0.1, tpr: 0.83 },
      { fpr: 0.18, tpr: 0.91 },
      { fpr: 0.32, tpr: 0.96 },
      { fpr: 0.55, tpr: 0.985 },
      { fpr: 1, tpr: 1 },
    ],
  },
  {
    name: "Zero-shot",
    points: [
      { fpr: 0, tpr: 0 },
      { fpr: 0.08, tpr: 0.26 },
      { fpr: 0.2, tpr: 0.48 },
      { fpr: 0.35, tpr: 0.66 },
      { fpr: 0.52, tpr: 0.79 },
      { fpr: 0.7, tpr: 0.89 },
      { fpr: 0.86, tpr: 0.96 },
      { fpr: 1, tpr: 1 },
    ],
  },
];

/** Sort by FPR ascending and clamp to the unit square so the path is monotone & well-formed. */
function clean(points: RocPoint[]): RocPoint[] {
  return [...points]
    .map((d) => ({ fpr: clamp(d.fpr, 0, 1), tpr: clamp(d.tpr, 0, 1) }))
    .sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);
}

/** Trapezoidal area under the (FPR, TPR) curve. */
function auc(points: RocPoint[]): number {
  const pts = clean(points);
  let area = 0;
  for (let i = 1; i < pts.length; i++) {
    area += ((pts[i].fpr - pts[i - 1].fpr) * (pts[i].tpr + pts[i - 1].tpr)) / 2;
  }
  return clamp(area, 0, 1);
}

export default function ROCCurve({
  curves = DEFAULT_CURVES,
  title,
  caption,
  source,
  showAUC = true,
  fillArea = true,
  showGrid = true,
  color = "",
  duration = 1100,
}: ROCCurveProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const ids = useMemo(() => ({ fade: uid("roc-fade") }), []);
  const [hover, setHover] = useState<{ ci: number; pi: number; x: number; y: number } | null>(null);

  const accent = color || p.accent;
  const colorFor = (c: RocCurve, i: number) =>
    c.color || (curves.length === 1 ? accent : p.series[i % p.series.length]);

  const prepared = useMemo(
    () =>
      curves.map((c, i) => {
        const pts = clean(c.points);
        return { name: c.name, points: pts, color: c.color, value: auc(pts), index: i };
      }),
    [curves],
  );

  // Stagger curves: each line draws over `dur`, starting after the previous one.
  const dur = duration / 1000;
  const drawStart = (i: number) => i * dur * 0.4;

  const legendItems: LegendItem[] = prepared.map((c, i) => ({
    label: showAUC ? `${c.name} · AUC ${round(c.value, 3).toFixed(3)}` : c.name,
    color: colorFor(c, i),
    shape: "line",
  }));

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 11} minHeight={300} margin={{ top: 18, right: 20, bottom: 46, left: 52 }}>
          {({ inner, margin }) => {
            const x = scaleLinear().domain([0, 1]).range([0, inner.width]);
            const y = scaleLinear().domain([0, 1]).range([inner.height, 0]);

            const pathGen = d3line<RocPoint>()
              .x((d) => x(d.fpr))
              .y((d) => y(d.tpr))
              .curve(curveMonotoneX);

            const areaPath = (pts: RocPoint[]) => {
              const top = pathGen(pts) ?? "";
              const last = pts[pts.length - 1];
              const first = pts[0];
              if (!top || !last || !first) return "";
              return `${top} L ${x(last.fpr)} ${y(0)} L ${x(first.fpr)} ${y(0)} Z`;
            };

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <VerticalFade id={ids.fade} color={accent} from={0.16} to={0.01} />
                </defs>

                {showGrid && <GridLines scale={y as never} width={inner.width} count={5} />}

                {/* unit-square frame */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  fill="none"
                  stroke={p.border}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />

                {/* chance diagonal */}
                <motion.line
                  x1={x(0)}
                  y1={y(0)}
                  x2={x(1)}
                  y2={y(1)}
                  stroke={p.inkFaint}
                  strokeWidth={1.5}
                  strokeDasharray="4 5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: inView ? 0.9 : 0 }}
                  transition={{ duration: 0.5 }}
                  key={`diag-${token}`}
                />
                <text
                  x={x(0.74)}
                  y={y(0.74) - 8}
                  transform={`rotate(${-(Math.atan2(inner.height, inner.width) * 180) / Math.PI}, ${x(0.74)}, ${y(0.74) - 8})`}
                  textAnchor="middle"
                  fill={p.inkFaint}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.08em" }}
                >
                  chance · auc 0.5
                </text>

                {/* shaded AUC areas (single-curve or explicitly enabled) */}
                {fillArea &&
                  prepared.map((c, i) => {
                    if (c.points.length < 2) return null;
                    const single = curves.length === 1;
                    return (
                      <motion.path
                        key={`area-${i}-${token}`}
                        d={areaPath(c.points)}
                        fill={single ? `url(#${ids.fade})` : withAlpha(colorFor(c, i), 0.1)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: inView ? 1 : 0 }}
                        transition={{ duration: 0.6, delay: 0.2 + i * 0.12 }}
                      />
                    );
                  })}

                {/* the ROC curves */}
                {prepared.map((c, i) => {
                  if (c.points.length < 2) return null;
                  const stroke = colorFor(c, i);
                  const start = drawStart(i);
                  return (
                    <g key={`curve-${i}`}>
                      <motion.path
                        key={`line-${i}-${token}`}
                        d={pathGen(c.points) ?? ""}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={2.25}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: inView ? 1 : 0 }}
                        transition={
                          reduced
                            ? { duration: 0 }
                            : { duration: dur, delay: start, ease: [0.4, 0, 0.2, 1] }
                        }
                      />
                      {/* operating points, fading in as the line reaches them */}
                      {c.points.map((d, pi) => {
                        const active = hover?.ci === i && hover?.pi === pi;
                        const pointDelay = reduced ? 0 : start + dur * ((pi + 0.5) / c.points.length);
                        return (
                          <motion.circle
                            key={`${pi}-${token}`}
                            cx={x(d.fpr)}
                            cy={y(d.tpr)}
                            r={active ? 4.5 : 2.6}
                            fill={active ? stroke : p.surface}
                            stroke={stroke}
                            strokeWidth={1.5}
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0.5 }}
                            transition={{ duration: 0.25, delay: pointDelay }}
                            style={{ transformBox: "fill-box", transformOrigin: "center", transition: "r 0.12s ease" }}
                            onMouseEnter={(e) => {
                              const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                              setHover({ ci: i, pi, x: e.clientX - r.left, y: e.clientY - r.top });
                            }}
                            onMouseLeave={() => setHover(null)}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label="True positive rate"
                  format={(v) => v.toFixed(1)}
                />
                <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => v.toFixed(1)} linearCount={5} />
                <text
                  x={inner.width / 2}
                  y={inner.height + 38}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  False positive rate
                </text>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && prepared[hover.ci] && (
            <>
              <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide opacity-80">
                <span
                  className="inline-block h-[2px] w-3 rounded-full"
                  style={{ background: colorFor(prepared[hover.ci], hover.ci) }}
                />
                {prepared[hover.ci].name}
              </div>
              <TooltipRow label="FPR" value={round(prepared[hover.ci].points[hover.pi].fpr, 3).toFixed(3)} />
              <TooltipRow label="TPR" value={round(prepared[hover.ci].points[hover.pi].tpr, 3).toFixed(3)} />
              {showAUC && <TooltipRow label="AUC" value={round(prepared[hover.ci].value, 3).toFixed(3)} />}
            </>
          )}
        </FloatingTooltip>

        <ReplayButton
          onClick={replay}
          className="absolute right-0 top-0 border-transparent bg-transparent px-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
        />
      </div>

      {legendItems.length > 0 && <Legend items={legendItems} align="center" className="mt-3" />}
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "roc-curve",
  name: "ROC Curve",
  category: "statistical",
  description:
    "True-positive vs false-positive rate with the chance diagonal, shaded AUC, and an animated sweep — compare one classifier or stack several.",
  tags: ["roc", "auc", "classifier", "evaluation", "binary", "threshold"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ROCCurve",
  sourcePath: "statistical/ROCCurve",
  aspect: 16 / 11,
  controls: [
    {
      key: "curves",
      label: "Curves",
      type: "json",
      group: "Data",
      help: "Each curve: { name, points:[{fpr,tpr}], color? }. Points are sorted by FPR.",
      default: DEFAULT_CURVES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Classifier ROC — toxicity detector" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showAUC", label: "Show AUC", type: "boolean", group: "Labels", default: true },
    { key: "fillArea", label: "Shade area", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "strong",
      name: "Strong classifier",
      props: {
        title: "Strong classifier — AUC 0.97",
        caption: "A near-ideal detector hugs the top-left corner.",
        curves: [
          {
            name: "Detector",
            points: [
              { fpr: 0, tpr: 0 },
              { fpr: 0.01, tpr: 0.55 },
              { fpr: 0.03, tpr: 0.78 },
              { fpr: 0.06, tpr: 0.9 },
              { fpr: 0.12, tpr: 0.96 },
              { fpr: 0.25, tpr: 0.99 },
              { fpr: 0.5, tpr: 0.997 },
              { fpr: 1, tpr: 1 },
            ],
          },
        ],
      },
    },
    {
      id: "weak",
      name: "Weak classifier",
      props: {
        title: "Weak classifier — barely above chance",
        caption: "Hovering near the diagonal: little discriminative power.",
        fillArea: true,
        curves: [
          {
            name: "Baseline",
            points: [
              { fpr: 0, tpr: 0 },
              { fpr: 0.12, tpr: 0.17 },
              { fpr: 0.3, tpr: 0.38 },
              { fpr: 0.48, tpr: 0.55 },
              { fpr: 0.66, tpr: 0.72 },
              { fpr: 0.82, tpr: 0.87 },
              { fpr: 1, tpr: 1 },
            ],
          },
        ],
      },
    },
  ],
};
