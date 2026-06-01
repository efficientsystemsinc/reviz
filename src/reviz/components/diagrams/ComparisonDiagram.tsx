"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  cn,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

/** The shape of an inline stimulus/response sketch in each panel. */
type MiniKind = "continuous" | "transient";

interface Panel {
  /** Bold heading, e.g. "Continuous context". */
  title: string;
  /** One-line subtitle under the heading. */
  subtitle?: string;
  /** Mono label over the upper (input / stimulus) sketch. */
  inputCaption?: string;
  /** Mono label over the lower (output / response) sketch. */
  outputCaption?: string;
  /** Italic serif footnote under the panel. */
  footnote?: string;
  /** Optional accent override for this panel; falls back to the series ramp. */
  accent?: string;
  /**
   * Which built-in sketch pair to draw. "continuous" = sustained step input →
   * stable held output; "transient" = a single pulse → a decaying response.
   */
  mini?: MiniKind;
}

export interface ComparisonDiagramProps {
  panels?: Panel[];
  /** Small pill label shown above the divider between the two panels. */
  centerLabel?: string;
  title?: string;
  caption?: string;
  source?: string;
  /** Italic serif citation rendered under the whole diagram. */
  citation?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Mini-plot geometry                                                 */
/* ------------------------------------------------------------------ */

const PLOT_W = 200;
const PLOT_H = 64;
const PAD_X = 8;
const PAD_Y = 10;

interface Sketch {
  /** SVG path for the signal stroke. */
  d: string;
  /** Optional path closed to the baseline for a soft area fill. */
  area: string;
  /** Marker dot positions (sampled response readouts). */
  dots: { x: number; y: number }[];
}

/** Build the input (stimulus) sketch for a panel kind. */
function inputSketch(kind: MiniKind): Sketch {
  const x0 = PAD_X;
  const x1 = PLOT_W - PAD_X;
  const yBase = PLOT_H - PAD_Y;
  const yTop = PAD_Y;
  const w = x1 - x0;

  if (kind === "continuous") {
    // A step that rises early and stays high for the rest of the window.
    const xr = x0 + w * 0.22;
    const d = `M ${x0} ${yBase} L ${xr} ${yBase} L ${xr} ${yTop} L ${x1} ${yTop}`;
    const area = `${d} L ${x1} ${yBase} L ${x0} ${yBase} Z`;
    return { d, area, dots: [] };
  }
  // A single brief pulse near the start, then silence.
  const a = x0 + w * 0.18;
  const b = x0 + w * 0.28;
  const d = `M ${x0} ${yBase} L ${a} ${yBase} L ${a} ${yTop} L ${b} ${yTop} L ${b} ${yBase} L ${x1} ${yBase}`;
  const area = `${d} L ${x1} ${yBase} L ${x0} ${yBase} Z`;
  return { d, area, dots: [] };
}

/** Build the output (response) sketch for a panel kind. */
function outputSketch(kind: MiniKind): Sketch {
  const x0 = PAD_X;
  const x1 = PLOT_W - PAD_X;
  const yBase = PLOT_H - PAD_Y;
  const yTop = PAD_Y + 2;
  const w = x1 - x0;
  const h = yBase - yTop;

  if (kind === "continuous") {
    // Response ramps up and is held — sampled at a stable plateau.
    const pts: { x: number; y: number }[] = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + w * t;
      // Smooth saturating rise toward the top, with a tiny settle wiggle.
      const rise = 1 - Math.exp(-t * 5.5);
      const settle = Math.sin(t * 22) * Math.exp(-t * 6) * 0.06;
      const y = yBase - h * Math.min(1, rise + settle);
      pts.push({ x, y });
    }
    const d = toPath(pts);
    const area = `${d} L ${x1} ${yBase} L ${x0} ${yBase} Z`;
    const dots = [pts[Math.round(n * 0.55)], pts[Math.round(n * 0.78)], pts[n]];
    return { d, area, dots };
  }

  // Response spikes on the pulse, then decays back to baseline.
  const pts: { x: number; y: number }[] = [];
  const n = 36;
  const peakT = 0.24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + w * t;
    let amp = 0;
    if (t >= 0.16) {
      const dt = t - peakT;
      // Fast attack, exponential decay after the peak.
      amp = dt < 0 ? (t - 0.16) / (peakT - 0.16) : Math.exp(-dt * 7.5);
      amp = Math.max(0, Math.min(1, amp));
    }
    const y = yBase - h * amp;
    pts.push({ x, y });
  }
  const d = toPath(pts);
  const area = `${d} L ${x1} ${yBase} L ${x0} ${yBase} Z`;
  const dots = [pts[Math.round(n * peakT)], pts[Math.round(n * 0.55)], pts[Math.round(n * 0.85)]];
  return { d, area, dots };
}

/** Catmull-Rom-ish smooth path through points (monotone enough for sketches). */
function toPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx.toFixed(2)} ${p0.y.toFixed(2)}, ${cx.toFixed(2)} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Mini-plot component                                                */
/* ------------------------------------------------------------------ */

function MiniPlot({
  caption,
  sketch,
  tint,
  variant,
  inView,
  reduced,
  durationS,
  baseDelay,
  idBase,
}: {
  caption?: string;
  sketch: Sketch;
  tint: string;
  variant: "input" | "output";
  inView: boolean;
  reduced: boolean;
  durationS: number;
  baseDelay: number;
  idBase: string;
}) {
  const p = usePalette();
  const yBase = PLOT_H - PAD_Y;
  const gradId = `${idBase}-${variant}-grad`;
  const isStep = variant === "input";

  return (
    <div className="flex flex-col gap-1.5">
      {caption !== undefined && caption !== "" && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
            {caption}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-border bg-surface-alt/60">
        <svg
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          width="100%"
          height={PLOT_H}
          preserveAspectRatio="none"
          role="img"
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tint} stopOpacity={isStep ? 0.16 : 0.22} />
              <stop offset="100%" stopColor={tint} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* zero / baseline */}
          <line
            x1={PAD_X}
            x2={PLOT_W - PAD_X}
            y1={yBase}
            y2={yBase}
            stroke={p.grid}
            strokeWidth={1}
          />

          {/* area fill */}
          <motion.path
            d={sketch.area}
            fill={`url(#${gradId})`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: inView ? 1 : 0 }}
            transition={{ duration: durationS * 0.6, delay: baseDelay + durationS * 0.35 }}
          />

          {/* signal stroke, drawn in */}
          <motion.path
            d={sketch.d}
            fill="none"
            stroke={tint}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
            transition={{ duration: durationS, delay: baseDelay, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* readout dots on output plots */}
          {sketch.dots.map((dot, i) => (
            <motion.circle
              key={i}
              cx={dot.x}
              cy={dot.y}
              r={2.6}
              fill={p.surface}
              stroke={tint}
              strokeWidth={1.6}
              initial={reduced ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
              transition={{
                duration: reduced ? 0 : 0.32,
                delay: baseDelay + durationS * (0.55 + i * 0.12),
              }}
              style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function ComparisonDiagram({
  panels = DEFAULT_PANELS,
  centerLabel = "WAIT 3 SECONDS",
  title = "",
  caption = "",
  source = "",
  citation = "",
  duration = 1100,
}: ComparisonDiagramProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [inViewRef, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const idBase = useMemo(() => uid("cmp"), []);

  const items = useMemo(
    () =>
      panels.map((panel, i) => {
        const kind: MiniKind = panel.mini ?? (i === 0 ? "continuous" : "transient");
        return {
          panel,
          kind,
          tint: panel.accent || p.series[i % p.series.length] || p.accent,
          input: inputSketch(kind),
          output: outputSketch(kind),
        };
      }),
    [panels, p.series, p.accent],
  );

  const durationS = reduced ? 0 : duration / 1000;
  const stepDelay = reduced ? 0 : Math.min(0.32, durationS * 0.34);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={inViewRef} className="group/cmp relative">
        <div
          key={token}
          className="relative grid gap-px overflow-hidden rounded-reviz border border-border bg-border md:grid-cols-2"
        >
          {items.map((item, i) => {
            const { panel, tint } = item;
            const panelDelay = i * stepDelay;
            return (
              <motion.div
                key={`${i}-${token}`}
                className="relative flex flex-col gap-4 bg-surface px-5 py-5 sm:px-6"
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 14 }}
                transition={{ duration: durationS * 0.6, delay: panelDelay, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* top accent rail */}
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2.5px] origin-left"
                  style={{ backgroundColor: tint }}
                  initial={reduced ? false : { scaleX: 0 }}
                  animate={{ scaleX: inView ? 1 : 0 }}
                  transition={{ duration: durationS * 0.7, delay: panelDelay, ease: [0.22, 1, 0.36, 1] }}
                />

                {/* heading block */}
                <div className="flex items-start gap-3">
                  <span
                    className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tint, boxShadow: `0 0 0 4px ${withAlpha(tint, 0.14)}` }}
                  />
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-semibold leading-tight text-ink">{panel.title}</h4>
                    {panel.subtitle && (
                      <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{panel.subtitle}</p>
                    )}
                  </div>
                  <span className="ml-auto font-mono text-[9.5px] tabular-nums text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>

                {/* mini plots */}
                <div className="flex flex-col gap-3">
                  <MiniPlot
                    caption={panel.inputCaption}
                    sketch={item.input}
                    tint={tint}
                    variant="input"
                    inView={inView}
                    reduced={reduced}
                    durationS={durationS}
                    baseDelay={panelDelay + durationS * 0.1}
                    idBase={`${idBase}-${i}`}
                  />
                  {/* signal-flow connector between input and output */}
                  <div className="flex items-center gap-2 pl-1 text-ink-faint">
                    <motion.span
                      aria-hidden
                      className="h-3 w-px"
                      style={{ backgroundColor: p.border }}
                      initial={reduced ? false : { scaleY: 0 }}
                      animate={{ scaleY: inView ? 1 : 0 }}
                      transition={{ duration: durationS * 0.4, delay: panelDelay + durationS * 0.4 }}
                    />
                    <ArrowRight className="h-3 w-3 rotate-90" strokeWidth={2} />
                  </div>
                  <MiniPlot
                    caption={panel.outputCaption}
                    sketch={item.output}
                    tint={tint}
                    variant="output"
                    inView={inView}
                    reduced={reduced}
                    durationS={durationS}
                    baseDelay={panelDelay + durationS * 0.45}
                    idBase={`${idBase}-${i}`}
                  />
                </div>

                {/* footnote */}
                {panel.footnote && (
                  <motion.p
                    className="mt-auto border-t border-border pt-3 font-serif text-[12.5px] italic leading-snug text-ink-muted"
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: inView ? 1 : 0 }}
                    transition={{ duration: durationS * 0.6, delay: panelDelay + durationS * 0.7 }}
                  >
                    {panel.footnote}
                  </motion.p>
                )}
              </motion.div>
            );
          })}

          {/* center pill label, floating over the divider */}
          {centerLabel !== "" && items.length === 2 && (
            <motion.div
              className="pointer-events-none absolute left-1/2 top-0 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:block"
              initial={reduced ? false : { opacity: 0, scale: 0.8, y: "-50%" }}
              animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0.8, y: "-50%" }}
              transition={{ duration: reduced ? 0 : 0.4, delay: stepDelay + durationS * 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-label shadow-float"
                style={{
                  backgroundColor: p.surface,
                  borderColor: p.borderStrong,
                  color: p.ink,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: p.accent }}
                />
                {centerLabel}
              </span>
            </motion.div>
          )}
        </div>

        {/* center label fallback for stacked (mobile) layout */}
        {centerLabel !== "" && items.length === 2 && (
          <div className="mt-3 flex justify-center md:hidden">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.accent }} />
              {centerLabel}
            </span>
          </div>
        )}

        <div className="mt-4 flex items-end justify-between gap-4">
          {citation !== "" ? (
            <p className="font-serif text-[12.5px] italic leading-snug text-ink-muted">{citation}</p>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
              stimulus → response, two regimes
            </span>
          )}
          <ReplayButton
            onClick={replay}
            className={cn("shrink-0 opacity-0 transition-opacity group-hover/cmp:opacity-100")}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_PANELS: Panel[] = [
  {
    title: "Continuous context",
    subtitle: "Stimulus held in the context window",
    inputCaption: "stimulus",
    outputCaption: "model response",
    footnote:
      "When the cue stays in context, the activation is sustained — the model keeps attending to it and the readout holds steady across the delay.",
    mini: "continuous",
  },
  {
    title: "Transient stimulus",
    subtitle: "Cue presented once, then removed",
    inputCaption: "stimulus",
    outputCaption: "model response",
    footnote:
      "A one-shot cue produces a sharp spike that decays — after a few seconds the trace fades and the behavior reverts to baseline.",
    mini: "transient",
  },
];

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "comparison-diagram",
  name: "Comparison Diagram",
  category: "diagrams",
  description:
    "A dual-panel side-by-side schematic that contrasts two regimes — each with a heading, an inline stimulus plot, an animated response plot, and a serif footnote — joined by a pill label across the divide.",
  tags: ["comparison", "schematic", "diagram", "stimulus", "response", "side-by-side", "explainer"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "ComparisonDiagram",
  sourcePath: "diagrams/ComparisonDiagram",
  aspect: 16 / 9,
  controls: [
    {
      key: "panels",
      label: "Panels",
      type: "json",
      group: "Data",
      help: 'Each: { title, subtitle?, inputCaption?, outputCaption?, footnote?, accent?, mini?: "continuous" | "transient" }',
      default: DEFAULT_PANELS,
    },
    { key: "centerLabel", label: "Center pill label", type: "text", group: "Labels", default: "WAIT 3 SECONDS" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "citation",
      label: "Citation",
      type: "text",
      group: "Labels",
      default: "",
    },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1100,
      min: 0,
      max: 3000,
      step: 50,
    },
  ],
  presets: [
    {
      id: "continuous-vs-transient",
      name: "Continuous vs. transient",
      props: {
        title: "Two regimes of a held cue",
        centerLabel: "WAIT 3 SECONDS",
        citation:
          "Sustained context keeps a representation alive; a transient stimulus leaves only a decaying trace.",
        panels: DEFAULT_PANELS,
      },
    },
    {
      id: "memory-vs-recompute",
      name: "Memory vs. recompute",
      props: {
        title: "Cache hit vs. cold recompute",
        centerLabel: "AFTER 30s IDLE",
        citation:
          "A warm KV-cache returns the answer immediately; a cold path must recompute, paying full latency before the response settles.",
        panels: [
          {
            title: "Warm cache",
            subtitle: "KV-cache still resident",
            inputCaption: "request",
            outputCaption: "latency",
            footnote:
              "The prefix is already cached, so the response holds at low latency — the system answers as fast as it can stream.",
            mini: "continuous",
          },
          {
            title: "Cold recompute",
            subtitle: "Cache evicted after idle",
            inputCaption: "request",
            outputCaption: "latency",
            footnote:
              "With the cache gone, the first request spikes the latency while the prefix is recomputed, then settles back to the warm rate.",
            mini: "transient",
          },
        ],
      },
    },
  ],
};
