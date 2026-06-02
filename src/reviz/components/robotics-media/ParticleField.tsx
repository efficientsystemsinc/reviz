"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  Glow,
  ReplayButton,
  ResponsiveSvg,
  clamp,
  lerp,
  seededRandom,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useProgress,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type FieldShape = "column" | "cloud" | "wave";

/** A pinned annotation along the central axis. `at` is a 0→1 vertical position. */
interface FieldLabel {
  at: number;
  text: string;
}

export interface ParticleFieldProps {
  count?: number;
  shape?: FieldShape;
  labels?: FieldLabel[];
  accent?: string;
  title?: string;
  caption?: string;
  source?: string;
  duration?: number;
  speed?: number;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_LABELS: FieldLabel[] = [
  { at: 0.26, text: "Latent samples" },
  { at: 0.72, text: "Denoised manifold" },
];

/* ------------------------------------------------------------------ */
/* Particle layout                                                    */
/* ------------------------------------------------------------------ */

interface Particle {
  /** Normalized base position in [0,1] across the field box. */
  bx: number;
  by: number;
  /** Radius in px. */
  r: number;
  /** Per-particle drift phase + amplitude, for continuous float. */
  phase: number;
  ampX: number;
  ampY: number;
  /** Base opacity + entrance ordering 0→1 (depth-sorted, center-out). */
  baseOpacity: number;
  order: number;
  /** Slight palette blend so the cloud has tonal depth. */
  tone: number;
}

/**
 * Deterministically lay out `count` particles into a soft shape. The horizontal
 * spread is widest where the silhouette is fattest, so the column/cloud/wave
 * reads as a coherent volume rather than uniform noise.
 */
function buildField(count: number, shape: FieldShape): Particle[] {
  const rand = seededRandom(0x5eed * 7 + count + shape.length * 131);
  const out: Particle[] = [];
  const n = Math.max(1, Math.round(count));

  for (let i = 0; i < n; i++) {
    // Vertical position with mild bias toward center so ends taper.
    const u = i / Math.max(1, n - 1);
    const jitterY = (rand() - 0.5) * 0.04;
    const by = clamp(u + jitterY, 0, 1);

    // Silhouette half-width as a function of height, per shape.
    let halfWidth: number;
    let centerX: number;
    if (shape === "column") {
      // Gentle spindle: fattest mid-column, tapering at both ends.
      const taper = Math.sin(by * Math.PI); // 0 at ends, 1 mid
      halfWidth = lerp(0.06, 0.22, 0.35 + 0.65 * taper);
      centerX = 0.5 + Math.sin(by * Math.PI * 1.4) * 0.015;
    } else if (shape === "wave") {
      // A sinuous ribbon meandering left↔right down the field.
      halfWidth = 0.16;
      centerX = 0.5 + Math.sin(by * Math.PI * 2.1 + 0.6) * 0.26;
    } else {
      // Cloud: soft elliptical blob, densest at the core.
      const dy = (by - 0.5) * 2; // -1..1
      const env = Math.sqrt(Math.max(0, 1 - dy * dy)); // ellipse profile
      halfWidth = lerp(0.05, 0.42, env);
      centerX = 0.5;
    }

    // Radial-ish horizontal sample, concentrated toward the center line.
    const s = rand();
    const signed = (s < 0.5 ? -1 : 1) * Math.pow(Math.abs(s - 0.5) * 2, 0.7);
    const bx = clamp(centerX + signed * halfWidth, 0.02, 0.98);

    // Distance from the central axis → drives size, opacity, depth.
    const dist = Math.min(1, Math.abs(bx - centerX) / Math.max(0.001, halfWidth));
    const depth = 1 - dist; // 1 at core, 0 at rim

    const r = lerp(2.2, 6.4, Math.pow(depth, 0.6)) * lerp(0.7, 1.15, rand());
    const baseOpacity = lerp(0.45, 0.98, Math.pow(depth, 0.5));

    out.push({
      bx,
      by,
      r,
      phase: rand() * Math.PI * 2,
      ampX: lerp(0.004, 0.02, rand()),
      ampY: lerp(0.006, 0.026, rand()),
      baseOpacity,
      order: depth,
      tone: rand(),
    });
  }

  // Entrance order: bright core pearls first, faint rim particles last.
  out.sort((a, b) => b.order - a.order);
  out.forEach((pt, i) => {
    pt.order = i / Math.max(1, out.length - 1);
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function ParticleField({
  count = 220,
  shape = "column",
  labels = DEFAULT_LABELS,
  accent = "",
  title = "Latent particle field",
  caption = "",
  source = "",
  duration = 1600,
  speed = 1,
}: ParticleFieldProps) {
  const p = usePalette();
  const tint = accent || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<number | null>(null);

  const ids = useMemo(
    () => ({ glow: uid("pf-glow"), core: uid("pf-core"), halo: uid("pf-halo") }),
    [],
  );

  const particles = useMemo(() => buildField(count, shape), [count, shape]);

  // Continuous, looping drift. ~14s base period, scaled by `speed`.
  const period = Math.max(2000, 14000 / Math.max(0.05, speed));
  const t = useProgress({ duration: period, loop: true, enabled: !reduced, trigger: token });
  const cycle = t * Math.PI * 2;

  // Entrance fade-in for the whole field (per-particle stagger inside the map).
  const reveal = useProgress({
    duration: reduced ? 0 : duration,
    enabled: inView,
    trigger: token,
  });

  const cleanLabels = useMemo(
    () =>
      (labels ?? [])
        .filter((l) => l && typeof l.at === "number" && l.text)
        .map((l) => ({ at: clamp(l.at, 0, 1), text: l.text }))
        .sort((a, b) => a.at - b.at),
    [labels],
  );

  // Blend accent → ink so the cloud carries soft tonal variation.
  const toneColor = (v: number) => (v < 0.8 ? tint : p.ink);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={4 / 5} margin={{ top: 14, right: 18, bottom: 14, left: 18 }}>
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;
            const axisX = W / 2;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <Glow id={ids.glow} blur={4} />
                  <radialGradient id={ids.halo} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={withAlpha(tint, 0.3)} />
                    <stop offset="55%" stopColor={withAlpha(tint, 0.1)} />
                    <stop offset="100%" stopColor={withAlpha(tint, 0)} />
                  </radialGradient>
                  <radialGradient id={ids.core} cx="38%" cy="34%" r="72%">
                    <stop offset="0%" stopColor={withAlpha(p.surface, 0.95)} />
                    <stop offset="40%" stopColor={withAlpha(tint, 0.9)} />
                    <stop offset="100%" stopColor={withAlpha(tint, 0.55)} />
                  </radialGradient>
                </defs>

                {/* Ambient halo behind the field */}
                <ellipse
                  cx={axisX}
                  cy={H / 2}
                  rx={W * 0.3}
                  ry={H * 0.46}
                  fill={`url(#${ids.halo})`}
                  opacity={reveal}
                />

                {/* Faint central axis the callouts pin to */}
                {cleanLabels.length > 0 && (
                  <motion.line
                    x1={axisX}
                    y1={0}
                    x2={axisX}
                    y2={H}
                    stroke={withAlpha(p.inkFaint, 0.5)}
                    strokeWidth={1}
                    strokeDasharray="2 5"
                    initial={false}
                    animate={{ opacity: reveal * 0.6 }}
                    transition={{ duration: 0 }}
                  />
                )}

                {/* Particles */}
                {particles.map((pt, i) => {
                  // Continuous float: small Lissajous-style drift per particle.
                  const driftX = Math.sin(cycle + pt.phase) * pt.ampX * W;
                  const driftY = Math.cos(cycle * 0.8 + pt.phase * 1.3) * pt.ampY * H;
                  const cx = pt.bx * W + driftX;
                  const cy = pt.by * H + driftY;

                  // Per-particle entrance: scale + fade ordered core→rim.
                  const start = pt.order * 0.75;
                  const local = clamp((reveal - start) / 0.25, 0, 1);
                  const eased = 1 - Math.pow(1 - local, 3);

                  // Gentle opacity shimmer riding the drift loop.
                  const shimmer = 0.86 + 0.14 * Math.sin(cycle * 1.3 + pt.phase);
                  const isCore = pt.r > 3.6;
                  const active = hover === i;
                  const op = pt.baseOpacity * shimmer * eased * (active ? 1.15 : 1);

                  return (
                    <circle
                      key={`${token}-${i}`}
                      cx={cx}
                      cy={cy}
                      r={pt.r * (0.4 + 0.6 * eased) * (active ? 1.35 : 1)}
                      fill={isCore ? `url(#${ids.core})` : toneColor(pt.tone)}
                      opacity={clamp(op, 0, 1)}
                      filter={isCore || active ? `url(#${ids.glow})` : undefined}
                    />
                  );
                })}

                {/* Pinned callouts along the central axis */}
                {cleanLabels.map((l, i) => {
                  const cy = l.at * H;
                  const onLeft = i % 2 === 0;
                  const dotR = 3.5;
                  const lineLen = W * 0.16;
                  const dir = onLeft ? -1 : 1;
                  const textX = axisX + dir * (lineLen + 8);
                  const labelReveal = clamp((reveal - 0.55) / 0.4, 0, 1);
                  const active = hover === -1 - i;

                  // Background plate so the callout reads against the busy field.
                  const plateW = l.text.length * 7.4 + 12;
                  const plateH = 18;
                  const plateX = onLeft ? textX - plateW + 6 : textX - 6;

                  return (
                    <motion.g
                      key={`${token}-label-${i}`}
                      initial={false}
                      animate={{ opacity: labelReveal }}
                      transition={{ duration: 0 }}
                      style={{ cursor: "default" }}
                      onMouseEnter={() => setHover(-1 - i)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <line
                        x1={axisX}
                        y1={cy}
                        x2={axisX + dir * lineLen}
                        y2={cy}
                        stroke={withAlpha(tint, active ? 0.95 : 0.75)}
                        strokeWidth={1.25}
                      />
                      <circle
                        cx={axisX}
                        cy={cy}
                        r={dotR + (active ? 1.5 : 0)}
                        fill={p.canvas}
                        stroke={tint}
                        strokeWidth={1.5}
                        filter={`url(#${ids.glow})`}
                      />
                      <circle cx={axisX} cy={cy} r={1.4} fill={tint} />
                      <rect
                        x={plateX}
                        y={cy - plateH / 2}
                        width={plateW}
                        height={plateH}
                        rx={3}
                        fill={withAlpha(p.canvas, 0.82)}
                      />
                      <text
                        x={textX}
                        y={cy}
                        dy="0.32em"
                        textAnchor={onLeft ? "end" : "start"}
                        fill={active ? p.accent : p.ink}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        {l.text}
                      </text>
                    </motion.g>
                  );
                })}
              </g>
            );
          }}
        </ResponsiveSvg>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "particle-field",
  name: "Particle Field",
  category: "robotics-media",
  description:
    "A deterministic field of softly drifting pearls that condense into a column, cloud, or wave silhouette, with callouts pinned along a luminous central axis.",
  tags: ["particles", "decorative", "animated", "diffusion", "latent", "field"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "ParticleField",
  sourcePath: "robotics-media/ParticleField",
  aspect: 4 / 5,
  controls: [
    {
      key: "count",
      label: "Particle count",
      type: "number",
      group: "Data",
      help: "Number of pearls scattered into the silhouette.",
      default: 220,
      min: 30,
      max: 600,
      step: 10,
    },
    {
      key: "shape",
      label: "Silhouette",
      type: "select",
      group: "Layout",
      default: "column",
      options: [
        { value: "column", label: "Column" },
        { value: "cloud", label: "Cloud" },
        { value: "wave", label: "Wave" },
      ],
    },
    {
      key: "labels",
      label: "Callouts",
      type: "json",
      group: "Labels",
      help: "Array of { at: 0–1 (vertical position), text }. Pinned to the center axis, alternating sides.",
      default: DEFAULT_LABELS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Latent particle field" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Particle color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Entrance", type: "number", group: "Animation", default: 1600, min: 0, max: 4000, step: 100, unit: "ms" },
    { key: "speed", label: "Drift speed", type: "number", group: "Animation", default: 1, min: 0, max: 4, step: 0.1, unit: "x" },
  ],
  presets: [
    {
      id: "pearl-column",
      name: "Flowing pearl column",
      props: {
        title: "Flowing pearl column",
        shape: "column",
        count: 240,
        speed: 1,
        labels: [
          { at: 0.24, text: "Noise prior" },
          { at: 0.76, text: "Sampled manifold" },
        ],
      },
    },
    {
      id: "soft-cloud",
      name: "Soft latent cloud",
      props: {
        title: "Soft latent cloud",
        shape: "cloud",
        count: 320,
        speed: 0.7,
        labels: [{ at: 0.5, text: "Embedding centroid" }],
      },
    },
    {
      id: "drift-wave",
      name: "Drift wave",
      props: {
        title: "Drift wave",
        shape: "wave",
        count: 200,
        speed: 1.6,
        labels: [
          { at: 0.2, text: "t = 0" },
          { at: 0.5, text: "t = T/2" },
          { at: 0.82, text: "t = T" },
        ],
      },
    },
  ],
};
