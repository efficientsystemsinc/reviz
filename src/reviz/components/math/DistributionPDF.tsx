"use client";

import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { max as d3max } from "d3-array";
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
  ResponsiveSvg,
  TooltipRow,
  VerticalFade,
  formatCompact,
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

type DistType = "normal" | "uniform" | "exponential" | "beta" | "lognormal";

interface DistSpec {
  type: DistType;
  /** Location parameter (mean for normal/lognormal, lo for uniform, rate^-1 anchor for exp). */
  mean?: number;
  /** Scale / spread parameter (sd for normal, hi for uniform, rate for exp, concentration for beta). */
  sd?: number;
  /** Optional explicit label. */
  label?: string;
  /** Optional explicit color override. */
  color?: string;
}

export interface DistributionPDFProps {
  dists: DistSpec[];
  shadeInterval: number[] | null;
  domain: number[] | null;
  title?: string;
  caption?: string;
  source?: string;
  xLabel?: string;
  yLabel?: string;
  showGrid?: boolean;
  fillOpacity?: number;
  samples?: number;
  duration?: number;
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Analytic probability density at x for a named distribution. */
function pdf(spec: DistSpec, x: number): number {
  const { type } = spec;
  if (type === "normal") {
    const mu = spec.mean ?? 0;
    const sigma = Math.max(1e-6, spec.sd ?? 1);
    const z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * SQRT_2PI);
  }
  if (type === "lognormal") {
    if (x <= 0) return 0;
    const mu = spec.mean ?? 0;
    const sigma = Math.max(1e-6, spec.sd ?? 0.5);
    const z = (Math.log(x) - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (x * sigma * SQRT_2PI);
  }
  if (type === "exponential") {
    const rate = Math.max(1e-6, spec.sd ?? 1);
    return x < 0 ? 0 : rate * Math.exp(-rate * x);
  }
  if (type === "uniform") {
    const lo = spec.mean ?? 0;
    const hi = Math.max(lo + 1e-6, spec.sd ?? lo + 1);
    return x >= lo && x <= hi ? 1 / (hi - lo) : 0;
  }
  // beta-ish: a symmetric/peaked density on [0,1] driven by mean in (0,1) and
  // a concentration ("sd" reused as kappa). Higher kappa => sharper peak.
  if (type === "beta") {
    if (x <= 0 || x >= 1) return 0;
    const m = Math.min(0.999, Math.max(0.001, spec.mean ?? 0.5));
    const kappa = Math.max(2.001, spec.sd ?? 6);
    const a = m * kappa;
    const b = (1 - m) * kappa;
    // unnormalized; we normalize numerically per-series below.
    return Math.pow(x, a - 1) * Math.pow(1 - x, b - 1);
  }
  return 0;
}

/** A clean default domain inferred from the distributions if none is given. */
function inferDomain(dists: DistSpec[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of dists) {
    if (d.type === "normal") {
      const mu = d.mean ?? 0;
      const s = Math.max(1e-6, d.sd ?? 1);
      lo = Math.min(lo, mu - 4 * s);
      hi = Math.max(hi, mu + 4 * s);
    } else if (d.type === "lognormal") {
      const mu = d.mean ?? 0;
      const s = Math.max(1e-6, d.sd ?? 0.5);
      lo = Math.min(lo, 0);
      hi = Math.max(hi, Math.exp(mu + 3 * s));
    } else if (d.type === "exponential") {
      const rate = Math.max(1e-6, d.sd ?? 1);
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 6 / rate);
    } else if (d.type === "uniform") {
      const a = d.mean ?? 0;
      const b = Math.max(a + 1e-6, d.sd ?? a + 1);
      lo = Math.min(lo, a - (b - a) * 0.15);
      hi = Math.max(hi, b + (b - a) * 0.15);
    } else if (d.type === "beta") {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 1);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [-4, 4];
  return [lo, hi];
}

const TYPE_LABEL: Record<DistType, string> = {
  normal: "Normal",
  uniform: "Uniform",
  exponential: "Exp",
  beta: "Beta",
  lognormal: "LogNormal",
};

function specLabel(d: DistSpec): string {
  if (d.label) return d.label;
  if (d.type === "normal") return `N(${round(d.mean ?? 0, 2)}, ${round(d.sd ?? 1, 2)})`;
  if (d.type === "lognormal") return `LogN(${round(d.mean ?? 0, 2)}, ${round(d.sd ?? 0.5, 2)})`;
  if (d.type === "exponential") return `Exp(λ=${round(d.sd ?? 1, 2)})`;
  if (d.type === "uniform") return `U(${round(d.mean ?? 0, 2)}, ${round(d.sd ?? 1, 2)})`;
  if (d.type === "beta") return `Beta(μ=${round(d.mean ?? 0.5, 2)})`;
  return TYPE_LABEL[d.type];
}

export default function DistributionPDF({
  dists = [{ type: "normal", mean: 0, sd: 1 }],
  shadeInterval = [-1, 1],
  domain = null,
  title = "Standard normal density",
  caption = "",
  source = "",
  xLabel = "x",
  yLabel = "Density",
  showGrid = true,
  fillOpacity = 0.22,
  samples = 220,
  duration = 1100,
}: DistributionPDFProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ x: number; px: number; py: number } | null>(null);

  const gid = useMemo(() => uid("pdf"), []);
  const clipId = useMemo(() => uid("pdfclip"), []);

  const colorFor = (d: DistSpec, i: number) => d.color || p.series[i % p.series.length];

  const [xLo, xHi] = useMemo<[number, number]>(() => {
    if (domain && domain.length === 2 && Number.isFinite(domain[0]) && Number.isFinite(domain[1]) && domain[0] < domain[1]) {
      return [domain[0], domain[1]];
    }
    return inferDomain(dists);
  }, [domain, dists]);

  const n = Math.max(20, Math.min(800, Math.round(samples)));

  // Sample each density on a shared grid, normalizing beta numerically so its
  // area integrates to ~1 over the visible domain.
  const curves = useMemo(() => {
    const xs = Array.from({ length: n }, (_, i) => xLo + ((xHi - xLo) * i) / (n - 1));
    const dx = (xHi - xLo) / (n - 1);
    return dists.map((d) => {
      let ys = xs.map((x) => pdf(d, x));
      if (d.type === "beta") {
        const total = ys.reduce((acc, v) => acc + v * dx, 0) || 1;
        ys = ys.map((v) => v / total);
      }
      return { spec: d, xs, ys };
    });
  }, [dists, xLo, xHi, n]);

  const maxY = useMemo(() => {
    const m = d3max(curves, (c) => d3max(c.ys) ?? 0) ?? 1;
    return Math.max(1e-6, m);
  }, [curves]);

  const interval = useMemo<[number, number] | null>(() => {
    if (!shadeInterval || shadeInterval.length !== 2) return null;
    const [a, b] = shadeInterval;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a <= b ? [a, b] : [b, a];
  }, [shadeInterval]);

  const legendItems: LegendItem[] = curves.map((c, i) => ({
    label: specLabel(c.spec),
    color: colorFor(c.spec, i),
    shape: "line",
  }));

  const easeOut = [0.22, 1, 0.36, 1] as const;
  const drawDur = reduced ? 0 : duration / 1000;

  // Density readout at the hovered x for each curve.
  const hoverReadout = useMemo(() => {
    if (hover == null) return null;
    return curves.map((c) => {
      const t = (hover.x - xLo) / (xHi - xLo);
      const idx = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
      return { label: specLabel(c.spec), color: colorFor(c.spec, curves.indexOf(c)), y: c.ys[idx] };
    });
  }, [hover, curves, xLo, xHi, n]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/figure relative">
        {curves.length > 1 && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <Legend items={legendItems} align="left" />
            <button
              type="button"
              onClick={replay}
              className="shrink-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
            >
              replay
            </button>
          </div>
        )}

        <ResponsiveSvg
          aspect={16 / 10}
          margin={{ top: 16, right: 18, bottom: xLabel ? 46 : 38, left: yLabel ? 54 : 44 }}
        >
          {({ inner, margin }) => {
            const x = scaleLinear().domain([xLo, xHi]).range([0, inner.width]);
            const y = scaleLinear().domain([0, maxY]).range([inner.height, 0]).nice();

            const xToPx = (v: number) => Math.max(0, Math.min(inner.width, x(v)));

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  {curves.map((c, i) => (
                    <VerticalFade
                      key={i}
                      id={`${gid}-${i}`}
                      color={colorFor(c.spec, i)}
                      from={fillOpacity}
                      to={Math.max(0, fillOpacity * 0.04)}
                    />
                  ))}
                  <clipPath id={clipId}>
                    <motion.rect
                      x={-2}
                      y={-10}
                      height={inner.height + 20}
                      initial={{ width: reduced ? inner.width + 4 : 0 }}
                      animate={{ width: inView ? inner.width + 4 : 0 }}
                      transition={{ duration: drawDur, ease: easeOut }}
                      key={`${token}-clip`}
                    />
                  </clipPath>
                </defs>

                {showGrid && <GridLines scale={y as never} width={inner.width} count={5} />}

                {/* Shaded interval band (e.g. mean ± sd, or a CI). */}
                {interval && (
                  <g>
                    <motion.rect
                      x={xToPx(interval[0])}
                      y={0}
                      width={Math.max(0, xToPx(interval[1]) - xToPx(interval[0]))}
                      height={inner.height}
                      fill={withAlpha(p.accent, 0.07)}
                      initial={{ opacity: reduced ? 1 : 0 }}
                      animate={{ opacity: inView ? 1 : 0 }}
                      transition={{ duration: reduced ? 0 : 0.5, delay: drawDur * 0.4 }}
                      key={`${token}-band`}
                    />
                    {[interval[0], interval[1]].map((v, i) => (
                      <motion.line
                        key={i}
                        x1={xToPx(v)}
                        x2={xToPx(v)}
                        y1={0}
                        y2={inner.height}
                        stroke={withAlpha(p.accent, 0.5)}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        initial={{ opacity: reduced ? 1 : 0 }}
                        animate={{ opacity: inView ? 1 : 0 }}
                        transition={{ duration: reduced ? 0 : 0.4, delay: drawDur * 0.45 }}
                      />
                    ))}
                  </g>
                )}

                {/* Density areas + curves, revealed left-to-right via clip. */}
                <g clipPath={`url(#${clipId})`}>
                  {curves.map((c, i) => {
                    const color = colorFor(c.spec, i);
                    const areaGen = area<number>()
                      .x((_d, j) => x(c.xs[j]))
                      .y0(inner.height)
                      .y1((d) => y(d))
                      .curve(curveMonotoneX);
                    const lineGen = line<number>()
                      .x((_d, j) => x(c.xs[j]))
                      .y((d) => y(d))
                      .curve(curveMonotoneX);
                    return (
                      <g key={`curve-${i}`}>
                        <path d={areaGen(c.ys) ?? ""} fill={`url(#${gid}-${i})`} />
                        <path
                          d={lineGen(c.ys) ?? ""}
                          fill="none"
                          stroke={color}
                          strokeWidth={2}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  })}
                </g>

                {/* Hover guide + per-curve markers. */}
                {hover != null && (
                  <g pointerEvents="none">
                    <line
                      x1={xToPx(hover.x)}
                      x2={xToPx(hover.x)}
                      y1={0}
                      y2={inner.height}
                      stroke={p.borderStrong}
                      strokeWidth={1}
                      strokeDasharray="2 3"
                    />
                    {curves.map((c, i) => {
                      const t = (hover.x - xLo) / (xHi - xLo);
                      const idx = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
                      return (
                        <circle
                          key={i}
                          cx={xToPx(hover.x)}
                          cy={y(c.ys[idx])}
                          r={3.2}
                          fill={p.surface}
                          stroke={colorFor(c.spec, i)}
                          strokeWidth={1.75}
                        />
                      );
                    })}
                  </g>
                )}

                <Baseline y={inner.height} width={inner.width} />
                <AxisLeft
                  scale={y as never}
                  height={inner.height}
                  label={yLabel}
                  count={5}
                  format={(v) => formatCompact(v, 2)}
                />
                <AxisBottom scale={x as never} y={inner.height} linearFormat={(v) => formatCompact(v, 2)} linearCount={7} />
                {xLabel && (
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
                    {xLabel}
                  </text>
                )}

                {/* Pointer capture surface. */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                    const r = svg.getBoundingClientRect();
                    const px = e.clientX - r.left - margin.left;
                    const xv = x.invert(Math.max(0, Math.min(inner.width, px)));
                    setHover({ x: xv, px: xToPx(xv) + margin.left, py: e.clientY - r.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.px ?? 0} y={hover?.py ?? 0} visible={hover != null}>
          {hover != null && hoverReadout != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                x = {round(hover.x, 3)}
              </div>
              {hoverReadout.map((r, i) => (
                <TooltipRow
                  key={i}
                  label={r.label}
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: r.color }} />
                      {formatCompact(r.y, 3)}
                    </span>
                  }
                />
              ))}
            </>
          )}
        </FloatingTooltip>

        {curves.length <= 1 && (
          <button
            type="button"
            onClick={replay}
            className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/figure:opacity-100"
          >
            replay
          </button>
        )}
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "distribution-pdf",
  name: "Distribution PDF",
  category: "math",
  description:
    "Analytically-computed probability density curves — normal, uniform, exponential, beta, and lognormal — with gradient fills, overlay comparison, and a shaded interval like mean ± σ.",
  tags: ["distribution", "pdf", "probability", "density", "gaussian", "statistics"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "DistributionPDF",
  sourcePath: "math/DistributionPDF",
  aspect: 16 / 10,
  controls: [
    {
      key: "dists",
      label: "Distributions",
      type: "json",
      group: "Data",
      default: [{ type: "normal", mean: 0, sd: 1 }],
    },
    {
      key: "shadeInterval",
      label: "Shaded interval [lo, hi]",
      type: "json",
      group: "Data",
      default: [-1, 1],
    },
    {
      key: "domain",
      label: "X domain [lo, hi]",
      type: "json",
      group: "Data",
      default: null,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Standard normal density" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "xLabel", label: "X-axis label", type: "text", group: "Labels", default: "x" },
    { key: "yLabel", label: "Y-axis label", type: "text", group: "Labels", default: "Density" },
    { key: "showGrid", label: "Show gridlines", type: "boolean", group: "Style", default: true },
    { key: "fillOpacity", label: "Fill opacity", type: "number", group: "Style", default: 0.22, min: 0, max: 0.6, step: 0.01 },
    { key: "samples", label: "Sample resolution", type: "number", group: "Style", default: 220, min: 40, max: 600, step: 10 },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "normal-sigma",
      name: "Normal ± 1σ",
      props: {
        title: "Standard normal density",
        xLabel: "z",
        dists: [{ type: "normal", mean: 0, sd: 1 }],
        shadeInterval: [-1, 1],
        domain: [-4, 4],
      },
    },
    {
      id: "two-normals",
      name: "Two normals compared",
      props: {
        title: "Reward model scores: base vs. fine-tuned",
        xLabel: "reward",
        yLabel: "Density",
        dists: [
          { type: "normal", mean: 0.2, sd: 0.9, label: "Base" },
          { type: "normal", mean: 1.6, sd: 0.7, label: "Fine-tuned" },
        ],
        shadeInterval: null,
        domain: [-3, 4.5],
      },
    },
    {
      id: "skewed-latency",
      name: "Latency: lognormal vs. exponential",
      props: {
        title: "Inference latency distribution",
        xLabel: "latency (s)",
        yLabel: "Density",
        dists: [
          { type: "lognormal", mean: 0.4, sd: 0.5, label: "Server A" },
          { type: "exponential", sd: 0.8, label: "Server B" },
        ],
        shadeInterval: null,
        domain: [0, 8],
        fillOpacity: 0.18,
      },
    },
  ],
};
