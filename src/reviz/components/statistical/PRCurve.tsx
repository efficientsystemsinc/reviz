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

interface PRPoint {
  recall: number;
  precision: number;
}

interface PRCurveData {
  name: string;
  points: PRPoint[];
  color?: string;
}

export interface PRCurveProps {
  curves?: PRCurveData[];
  title?: string;
  caption?: string;
  source?: string;
  showAP?: boolean;
  showIsoF1?: boolean;
  fillArea?: boolean;
  showGrid?: boolean;
  isoF1Levels?: number[];
  color?: string;
  duration?: number;
}

/** Default comparison: two object detectors evaluated on the same validation split. */
const DEFAULT_CURVES: PRCurveData[] = [
  {
    name: "DETR-R101",
    points: [
      { recall: 0.0, precision: 1.0 },
      { recall: 0.15, precision: 0.99 },
      { recall: 0.34, precision: 0.97 },
      { recall: 0.52, precision: 0.95 },
      { recall: 0.68, precision: 0.92 },
      { recall: 0.8, precision: 0.86 },
      { recall: 0.89, precision: 0.77 },
      { recall: 0.95, precision: 0.63 },
      { recall: 0.99, precision: 0.41 },
      { recall: 1.0, precision: 0.22 },
    ],
  },
  {
    name: "Faster-RCNN",
    points: [
      { recall: 0.0, precision: 0.98 },
      { recall: 0.14, precision: 0.95 },
      { recall: 0.31, precision: 0.91 },
      { recall: 0.47, precision: 0.86 },
      { recall: 0.62, precision: 0.79 },
      { recall: 0.74, precision: 0.7 },
      { recall: 0.84, precision: 0.58 },
      { recall: 0.91, precision: 0.44 },
      { recall: 0.97, precision: 0.28 },
      { recall: 1.0, precision: 0.15 },
    ],
  },
];

const DEFAULT_ISO_F1 = [0.2, 0.4, 0.6, 0.8];

/** Clamp to the unit square and sort by recall ascending so the path is well-formed. */
function clean(points: PRPoint[]): PRPoint[] {
  return [...points]
    .map((d) => ({ recall: clamp(d.recall, 0, 1), precision: clamp(d.precision, 0, 1) }))
    .sort((a, b) => a.recall - b.recall || b.precision - a.precision);
}

/**
 * Average precision: area under the PR curve via the standard step-wise rule,
 * AP = Σ (R_i − R_{i-1}) · P_i. Robust to non-monotone precision.
 */
function averagePrecision(points: PRPoint[]): number {
  const pts = clean(points);
  if (pts.length < 2) return 0;
  let ap = 0;
  for (let i = 1; i < pts.length; i++) {
    ap += (pts[i].recall - pts[i - 1].recall) * pts[i].precision;
  }
  return clamp(ap, 0, 1);
}

/**
 * Sample an iso-F1 contour: the locus of (recall, precision) with a fixed F1 = f.
 * From F1 = 2PR/(P+R): precision = f·recall / (2·recall − f), valid where 2R > f.
 */
function isoF1Path(
  f: number,
  x: (v: number) => number,
  y: (v: number) => number,
  samples = 60,
): string {
  const start = f / 2 + 1e-4; // recall must exceed f/2 for precision ≤ 1
  if (start >= 1) return "";
  let d = "";
  let started = false;
  for (let i = 0; i <= samples; i++) {
    const r = start + ((1 - start) * i) / samples;
    const prec = (f * r) / (2 * r - f);
    if (prec > 1.0001 || prec <= 0) continue;
    const px = x(r);
    const py = y(clamp(prec, 0, 1));
    d += `${started ? "L" : "M"} ${px.toFixed(2)} ${py.toFixed(2)} `;
    started = true;
  }
  return d;
}

export default function PRCurve({
  curves = DEFAULT_CURVES,
  title = "Detector precision–recall — COCO val",
  caption = "",
  source = "",
  showAP = true,
  showIsoF1 = true,
  fillArea = true,
  showGrid = true,
  isoF1Levels = DEFAULT_ISO_F1,
  color = "",
  duration = 1100,
}: PRCurveProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const ids = useMemo(() => ({ fade: uid("pr-fade") }), []);
  const [hover, setHover] = useState<{ ci: number; pi: number; x: number; y: number } | null>(null);

  const accent = color || p.accent;
  const colorFor = (c: PRCurveData, i: number) =>
    c.color || (curves.length === 1 ? accent : p.series[i % p.series.length]);

  const prepared = useMemo(
    () =>
      curves.map((c, i) => {
        const pts = clean(c.points);
        return { name: c.name, points: pts, color: c.color, value: averagePrecision(pts), index: i };
      }),
    [curves],
  );

  const isoLevels = useMemo(
    () => [...new Set(isoF1Levels.map((f) => clamp(f, 0.01, 0.99)))].sort((a, b) => a - b),
    [isoF1Levels],
  );

  // Stagger curves: each line draws over `dur`, starting after the previous one.
  const dur = duration / 1000;
  const drawStart = (i: number) => i * dur * 0.4;

  const legendItems: LegendItem[] = prepared.map((c, i) => ({
    label: showAP ? `${c.name} · AP ${round(c.value, 3).toFixed(3)}` : c.name,
    color: colorFor(c, i),
    shape: "line",
  }));

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 11} minHeight={300} margin={{ top: 18, right: 22, bottom: 46, left: 52 }}>
          {({ inner, margin }) => {
            const x = scaleLinear().domain([0, 1]).range([0, inner.width]);
            const y = scaleLinear().domain([0, 1]).range([inner.height, 0]);

            const pathGen = d3line<PRPoint>()
              .x((d) => x(d.recall))
              .y((d) => y(d.precision))
              .curve(curveMonotoneX);

            const areaPath = (pts: PRPoint[]) => {
              const top = pathGen(pts) ?? "";
              const last = pts[pts.length - 1];
              const first = pts[0];
              if (!top || !last || !first) return "";
              return `${top} L ${x(last.recall)} ${y(0)} L ${x(first.recall)} ${y(0)} Z`;
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

                {/* iso-F1 contour lines */}
                {showIsoF1 &&
                  isoLevels.map((f, i) => {
                    const d = isoF1Path(f, (v) => x(v), (v) => y(v));
                    if (!d) return null;
                    // label sits where the contour passes recall = precision (its apex)
                    const apex = f / (2 - f);
                    const labelText = `f1 ${f.toFixed(1)}`;
                    const lx = x(apex) + 4;
                    const ly = y(apex) - 4;
                    // background plate so the label reads on top of the dashed iso-lines
                    const plateW = labelText.length * 5.4 + 6;
                    const plateH = 12;
                    return (
                      <g key={`iso-${f}`}>
                        <motion.path
                          d={d}
                          fill="none"
                          stroke={p.inkFaint}
                          strokeWidth={1}
                          strokeDasharray="3 4"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: inView ? 0.5 : 0 }}
                          transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.1 + i * 0.06 }}
                          key={`iso-${f}-${token}`}
                        />
                        <motion.g
                          initial={{ opacity: 0 }}
                          animate={{ opacity: inView ? 1 : 0 }}
                          transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.1 + i * 0.06 }}
                          key={`isolab-${f}-${token}`}
                        >
                          <rect
                            x={lx - 3}
                            y={ly - plateH + 2}
                            width={plateW}
                            height={plateH}
                            rx={2}
                            fill={withAlpha(p.surface, 0.85)}
                          />
                          <text
                            x={lx}
                            y={ly}
                            fill={p.inkMuted}
                            style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.04em" }}
                          >
                            {labelText}
                          </text>
                        </motion.g>
                      </g>
                    );
                  })}

                {/* shaded AP areas */}
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
                        transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.2 + i * 0.12 }}
                      />
                    );
                  })}

                {/* the PR curves */}
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
                            cx={x(d.recall)}
                            cy={y(d.precision)}
                            r={active ? 4.5 : 2.6}
                            fill={active ? stroke : p.surface}
                            stroke={stroke}
                            strokeWidth={1.5}
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0.5 }}
                            transition={{ duration: reduced ? 0 : 0.25, delay: pointDelay }}
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
                  label="Precision"
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
                  Recall
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
              <TooltipRow label="Recall" value={round(prepared[hover.ci].points[hover.pi].recall, 3).toFixed(3)} />
              <TooltipRow label="Precision" value={round(prepared[hover.ci].points[hover.pi].precision, 3).toFixed(3)} />
              <TooltipRow
                label="F1"
                value={(() => {
                  const r = prepared[hover.ci].points[hover.pi].recall;
                  const pr = prepared[hover.ci].points[hover.pi].precision;
                  const f1 = r + pr === 0 ? 0 : (2 * r * pr) / (r + pr);
                  return round(f1, 3).toFixed(3);
                })()}
              />
              {showAP && <TooltipRow label="AP" value={round(prepared[hover.ci].value, 3).toFixed(3)} />}
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
  id: "pr-curve",
  name: "Precision-Recall Curve",
  category: "statistical",
  description:
    "Precision vs recall with average-precision (AP) annotation, iso-F1 contour lines, and an animated draw — ideal for imbalanced detection and retrieval tasks.",
  tags: ["precision", "recall", "average-precision", "f1", "detection", "retrieval", "evaluation"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "PRCurve",
  sourcePath: "statistical/PRCurve",
  aspect: 16 / 11,
  controls: [
    {
      key: "curves",
      label: "Curves",
      type: "json",
      group: "Data",
      help: "Each curve: { name, points:[{recall,precision}], color? }. Points are sorted by recall.",
      default: DEFAULT_CURVES,
    },
    {
      key: "isoF1Levels",
      label: "Iso-F1 levels",
      type: "json",
      group: "Data",
      help: "F1 values (0–1) to draw as constant-F1 contour lines.",
      default: DEFAULT_ISO_F1,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Detector precision–recall — COCO val" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showAP", label: "Show AP", type: "boolean", group: "Labels", default: true },
    { key: "showIsoF1", label: "Show iso-F1", type: "boolean", group: "Style", default: true },
    { key: "fillArea", label: "Shade area", type: "boolean", group: "Style", default: true },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "two-detectors",
      name: "Two detectors compared",
      props: {
        title: "Detector precision–recall — COCO val",
        caption: "DETR holds higher precision deep into recall; AP gap ≈ 0.1.",
        curves: DEFAULT_CURVES,
      },
    },
    {
      id: "retrieval",
      name: "Imbalanced retrieval",
      props: {
        title: "Dense retriever — high AP at low recall",
        caption: "Near-perfect precision until recall passes 0.6, then a sharp fall.",
        curves: [
          {
            name: "DPR",
            points: [
              { recall: 0.0, precision: 1.0 },
              { recall: 0.2, precision: 0.99 },
              { recall: 0.4, precision: 0.97 },
              { recall: 0.6, precision: 0.93 },
              { recall: 0.75, precision: 0.82 },
              { recall: 0.86, precision: 0.64 },
              { recall: 0.94, precision: 0.41 },
              { recall: 1.0, precision: 0.18 },
            ],
          },
        ],
      },
    },
    {
      id: "weak",
      name: "Weak classifier",
      props: {
        title: "Weak classifier — low base precision",
        caption: "Precision starts modest and decays quickly with recall.",
        showIsoF1: true,
        curves: [
          {
            name: "Baseline",
            points: [
              { recall: 0.0, precision: 0.55 },
              { recall: 0.2, precision: 0.48 },
              { recall: 0.4, precision: 0.41 },
              { recall: 0.6, precision: 0.33 },
              { recall: 0.8, precision: 0.24 },
              { recall: 1.0, precision: 0.14 },
            ],
          },
        ],
      },
    },
  ],
};
