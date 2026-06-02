"use client";

import { scaleLinear } from "d3-scale";
import { max as d3max } from "d3-array";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Activity, Hash, Zap } from "lucide-react";
import {
  Baseline,
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  VerticalFade,
  cn,
  formatCompact,
  mix,
  readableOn,
  round,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useProgress,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/** A summary statistic shown in the header strip. */
interface FeatureStat {
  /** Short label, e.g. "Sparsity" or "Max act". */
  label: string;
  /** Display value, e.g. "0.13%" or "12.4". */
  value: string;
}

interface FeatureSpec {
  /** Numeric feature index inside the SAE dictionary. */
  id: number;
  /** Human-readable interpretation label. */
  label: string;
  /** Headline summary stats. */
  stats: FeatureStat[];
}

/** A single top-activating text snippet. */
interface FeatureExample {
  /** Full snippet text. */
  text: string;
  /** The substring that maximally fires this feature (highlighted). */
  fireToken: string;
  /** Optional peak activation value for this example. */
  act?: number;
}

export interface FeatureDashboardProps {
  feature?: FeatureSpec;
  activationHist?: number[];
  topExamples?: FeatureExample[];
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

const DEFAULT_FEATURE: FeatureSpec = {
  id: 34219,
  label: "Golden Gate Bridge",
  stats: [
    { label: "Sparsity", value: "0.18%" },
    { label: "Max act", value: "12.7" },
    { label: "Density", value: "1.8e-3" },
  ],
};

// Long-tailed activation histogram: most tokens near zero, a thin firing tail.
const DEFAULT_HIST: number[] = [
  0.0, 0.3, 0.9, 1.8, 3.1, 4.6, 6.2, 7.9, 9.4, 10.8, 11.6, 10.9, 9.1, 7.0, 5.1, 3.6, 2.5, 1.7, 1.1,
  0.7, 0.5, 0.34, 0.22, 0.15, 0.1, 0.07, 0.05,
];

const DEFAULT_EXAMPLES: FeatureExample[] = [
  {
    text: "Driving north across the Golden Gate Bridge, the fog rolled in over the bay.",
    fireToken: "Golden Gate Bridge",
    act: 12.7,
  },
  {
    text: "The orange towers of the bridge connecting San Francisco to Marin County.",
    fireToken: "bridge",
    act: 9.4,
  },
  {
    text: "We watched the sunset behind the Golden Gate from Baker Beach.",
    fireToken: "Golden Gate",
    act: 11.2,
  },
  {
    text: "An iconic suspension bridge painted in international orange.",
    fireToken: "suspension bridge",
    act: 7.8,
  },
];

/** Split a snippet around the firing substring (first match), preserving spacing. */
function splitOnFire(text: string, fire: string): { before: string; hit: string; after: string } {
  if (!fire) return { before: text, hit: "", after: "" };
  const idx = text.toLowerCase().indexOf(fire.toLowerCase());
  if (idx < 0) return { before: text, hit: "", after: "" };
  return {
    before: text.slice(0, idx),
    hit: text.slice(idx, idx + fire.length),
    after: text.slice(idx + fire.length),
  };
}

export default function FeatureDashboard({
  feature = DEFAULT_FEATURE,
  activationHist = DEFAULT_HIST,
  topExamples = DEFAULT_EXAMPLES,
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1100,
}: FeatureDashboardProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const ids = useMemo(() => ({ fade: uid("feat-fade") }), []);

  const animate = inView && !reduced;
  const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

  const hist = useMemo(
    () =>
      Array.isArray(activationHist)
        ? activationHist.filter((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)
        : [],
    [activationHist],
  );
  const examples = useMemo(
    () => (Array.isArray(topExamples) ? topExamples.filter((e) => e && typeof e.text === "string") : []),
    [topExamples],
  );
  const stats = useMemo(
    () => (Array.isArray(feature?.stats) ? feature.stats : []),
    [feature],
  );

  const histMax = Math.max(1e-6, d3max(hist) ?? 1);
  const progress = useProgress({ duration, enabled: inView, trigger: `${token}-${inView}` });

  // The bar index where activations cross into the "firing" tail (visual accent).
  const fireFrom = Math.round(hist.length * 0.62);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div
        ref={ref}
        className="group/feat relative w-full overflow-hidden rounded-reviz border border-border bg-surface"
      >
        {/* Header */}
        <motion.div
          key={`hdr-${token}`}
          initial={animate ? { opacity: 0, y: -8 } : false}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.45, ease }}
          className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-4"
          style={{ background: `linear-gradient(90deg, ${withAlpha(fill, 0.1)}, transparent 70%)` }}
        >
          <span
            aria-hidden
            className="absolute left-0 top-0 h-full w-[3px]"
            style={{ background: fill }}
          />
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
            style={{ background: withAlpha(fill, 0.16), color: fill }}
          >
            <Activity className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint">
              <Hash className="h-3 w-3" strokeWidth={2.5} />
              <span className="tabular-nums">
                SAE feature {formatCompact(feature?.id ?? 0)}
              </span>
            </div>
            <h4 className="mt-1 truncate font-sans text-[17px] font-semibold leading-tight text-ink">
              {feature?.label ?? "Unlabeled feature"}
            </h4>
          </div>

          {/* Stats strip */}
          <div className="flex shrink-0 items-stretch gap-2">
            {stats.map((s, i) => (
              <motion.div
                key={`${s.label}-${i}`}
                initial={animate ? { opacity: 0, y: 6 } : false}
                animate={inView ? { opacity: 1, y: 0 } : undefined}
                transition={{ delay: animate ? 0.18 + i * 0.07 : 0, duration: 0.4, ease }}
                className="min-w-[68px] rounded-lg border border-border bg-surface-alt px-3 py-2 text-center"
              >
                <div className="font-mono text-[9px] uppercase tracking-label text-ink-faint">
                  {s.label}
                </div>
                <div className="mt-1 font-sans text-[16px] font-semibold leading-none text-ink tabular-nums">
                  {s.value}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Body: histogram + examples */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 px-5 py-5 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {/* Activation-frequency histogram */}
          <motion.div
            initial={animate ? { opacity: 0 } : false}
            animate={inView ? { opacity: 1 } : undefined}
            transition={{ delay: animate ? 0.28 : 0, duration: 0.5, ease }}
            className="flex flex-col"
          >
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-ink-muted">
              <Zap className="h-3 w-3" strokeWidth={2.5} style={{ color: fill }} />
              Activation frequency
            </div>
            <div className="relative">
              <ResponsiveSvg aspect={16 / 11} margin={{ top: 12, right: 8, bottom: 26, left: 10 }}>
                {({ inner, margin }) => {
                  const x = scaleLinear().domain([0, Math.max(1, hist.length)]).range([0, inner.width]);
                  const y = scaleLinear().domain([0, histMax]).range([inner.height, 0]);
                  const bw = hist.length ? inner.width / hist.length : inner.width;
                  return (
                    <g transform={`translate(${margin.left}, ${margin.top})`}>
                      <defs>
                        <VerticalFade id={ids.fade} color={fill} from={0.28} to={0.04} />
                      </defs>

                      {hist.map((v, i) => {
                        const full = inner.height - y(v);
                        const stagger = hist.length > 1 ? i / hist.length : 0;
                        const local = clamp01((progress - stagger * 0.4) / (1 - stagger * 0.4 || 1));
                        const h = full * local;
                        const firing = i >= fireFrom;
                        const active = hover?.i === i;
                        const barColor = firing ? fill : mix(fill, p.inkFaint, 0.6);
                        const gap = bw > 5 ? 1.3 : 0.5;
                        return (
                          <rect
                            key={i}
                            x={x(i) + gap}
                            width={Math.max(0.5, bw - gap * 2)}
                            y={inner.height - h}
                            height={Math.max(0, h)}
                            rx={bw > 6 ? 2 : 1}
                            fill={active ? fill : withAlpha(barColor, firing ? 0.95 : 0.5)}
                            stroke={active ? p.surface : "transparent"}
                            strokeWidth={active ? 1.25 : 0}
                            onMouseMove={(e) => {
                              const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                              setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                            }}
                            onMouseLeave={() => setHover(null)}
                          />
                        );
                      })}

                      {/* Firing-threshold marker */}
                      {hist.length > 1 && (
                        <g style={{ opacity: clamp01((progress - 0.45) / 0.4) }}>
                          <line
                            x1={x(fireFrom)}
                            x2={x(fireFrom)}
                            y1={-6}
                            y2={inner.height}
                            stroke={fill}
                            strokeWidth={1}
                            strokeDasharray="2 3"
                          />
                          <text
                            x={x(fireFrom)}
                            y={-1}
                            textAnchor="middle"
                            fill={fill}
                            className="font-mono"
                            style={{ fontSize: 8.5, letterSpacing: "0.08em" }}
                          >
                            FIRES
                          </text>
                        </g>
                      )}

                      <Baseline y={inner.height} width={inner.width} />
                      <text
                        x={0}
                        y={inner.height + 18}
                        textAnchor="start"
                        fill={p.inkFaint}
                        className="font-mono"
                        style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        0
                      </text>
                      <text
                        x={inner.width}
                        y={inner.height + 18}
                        textAnchor="end"
                        fill={p.inkFaint}
                        className="font-mono"
                        style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        activation →
                      </text>
                    </g>
                  );
                }}
              </ResponsiveSvg>

              <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
                {hover != null && hist[hover.i] != null && (
                  <>
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                      bin {hover.i + 1}
                    </div>
                    <TooltipRow label="freq" value={`${round(hist[hover.i], 2)}%`} />
                    <TooltipRow label="state" value={hover.i >= fireFrom ? "firing" : "near-zero"} />
                  </>
                )}
              </FloatingTooltip>
            </div>
          </motion.div>

          {/* Top-activating snippets */}
          <div className="flex flex-col">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-ink-muted">
              Top-activating examples
            </div>
            <ul className="flex flex-col gap-2">
              {examples.map((ex, i) => {
                const { before, hit, after } = splitOnFire(ex.text, ex.fireToken);
                const actFrac = ex.act != null ? clamp01(ex.act / Math.max(1e-6, peakAct(examples))) : 1;
                return (
                  <motion.li
                    key={`${i}-${ex.fireToken}`}
                    initial={animate ? { opacity: 0, x: 10 } : false}
                    animate={inView ? { opacity: 1, x: 0 } : undefined}
                    transition={{ delay: animate ? 0.36 + i * 0.08 : 0, duration: 0.45, ease }}
                    className="relative overflow-hidden rounded-lg border border-border bg-surface-alt px-3 py-2.5"
                  >
                    {/* activation-strength rail */}
                    <motion.span
                      aria-hidden
                      className="absolute left-0 top-0 h-full w-[3px] origin-top"
                      style={{ background: fill }}
                      initial={animate ? { scaleY: 0 } : false}
                      animate={inView ? { scaleY: actFrac } : undefined}
                      transition={{ delay: animate ? 0.44 + i * 0.08 : 0, duration: 0.5, ease }}
                    />
                    <p className="pl-1.5 font-mono text-[12px] leading-relaxed text-ink-muted">
                      {before}
                      {hit && (
                        <span
                          className="rounded-[3px] px-1 py-px font-semibold"
                          style={{ background: withAlpha(fill, 0.9), color: readableOn(fill) }}
                        >
                          {hit}
                        </span>
                      )}
                      {after}
                    </p>
                    {ex.act != null && (
                      <div className="mt-1.5 flex items-center gap-1.5 pl-1.5">
                        <span className="font-mono text-[9px] uppercase tracking-label text-ink-faint">
                          act
                        </span>
                        <span
                          className="font-mono text-[11px] font-semibold tabular-nums"
                          style={{ color: fill }}
                        >
                          {round(ex.act, 1)}
                        </span>
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>

        <div
          className={cn(
            "pointer-events-none absolute bottom-2.5 right-3 opacity-0 transition-opacity",
            "group-hover/feat:pointer-events-auto group-hover/feat:opacity-100",
          )}
        >
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function peakAct(examples: FeatureExample[]): number {
  return Math.max(1e-6, ...examples.map((e) => (typeof e.act === "number" ? e.act : 0)));
}

// A polysemantic "code & math" feature with a different firing profile.
const CODE_HIST: number[] = [
  0.0, 0.5, 1.4, 2.9, 4.8, 6.9, 8.8, 10.1, 10.6, 9.8, 8.2, 6.3, 4.6, 3.2, 2.2, 1.5, 1.0, 0.7, 0.46,
  0.3, 0.2, 0.13, 0.09,
];

export const meta: RevizMeta = {
  id: "feature-dashboard",
  name: "SAE Feature Dashboard",
  category: "interpretability",
  description:
    "A sparse-autoencoder feature card: an interpretation header with summary stats, an activation-frequency histogram, and the top-activating text snippets with the maximally-firing token highlighted.",
  tags: ["sae", "feature", "interpretability", "activations", "dictionary-learning", "monosemanticity"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "FeatureDashboard",
  sourcePath: "interpretability/FeatureDashboard",
  aspect: 16 / 9,
  controls: [
    {
      key: "feature",
      label: "Feature",
      type: "json",
      group: "Data",
      help: "{ id, label, stats: [{ label, value }] }",
      default: DEFAULT_FEATURE,
    },
    {
      key: "activationHist",
      label: "Activation histogram",
      type: "json",
      group: "Data",
      help: "Frequency per activation bin (number[]); the upper tail is treated as 'firing'.",
      default: DEFAULT_HIST,
    },
    {
      key: "topExamples",
      label: "Top examples",
      type: "json",
      group: "Data",
      help: "[{ text, fireToken, act? }] — fireToken is highlighted in the snippet.",
      default: DEFAULT_EXAMPLES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1100,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "golden-gate",
      name: "Golden Gate feature",
      props: {
        title: "Feature #34219 — Golden Gate Bridge",
        caption: "A near-monosemantic feature that fires on mentions of the Golden Gate Bridge.",
        source: "Claude 3 Sonnet · 34M-latent SAE",
        feature: DEFAULT_FEATURE,
        activationHist: DEFAULT_HIST,
        topExamples: DEFAULT_EXAMPLES,
      },
    },
    {
      id: "recursion",
      name: "Recursion feature",
      props: {
        title: "Feature #8801 — Recursive function calls",
        caption: "Fires on self-referential calls in code — a more polysemantic latent.",
        source: "residual-stream SAE",
        accent: "",
        feature: {
          id: 8801,
          label: "Recursive function calls",
          stats: [
            { label: "Sparsity", value: "0.41%" },
            { label: "Max act", value: "8.9" },
            { label: "Density", value: "4.1e-3" },
          ],
        },
        activationHist: CODE_HIST,
        topExamples: [
          { text: "def factorial(n): return n * factorial(n - 1)", fireToken: "factorial(n - 1)", act: 8.9 },
          { text: "The Fibonacci sequence is defined recursively in terms of itself.", fireToken: "recursively", act: 7.1 },
          { text: "function walk(node) { node.children.forEach(walk); }", fireToken: "walk", act: 6.4 },
          { text: "A tree traversal that calls itself on each subtree.", fireToken: "calls itself", act: 5.8 },
        ],
      },
    },
  ],
};
