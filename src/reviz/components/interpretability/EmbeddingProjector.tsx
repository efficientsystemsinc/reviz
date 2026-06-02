"use client";

import { scaleLinear } from "d3-scale";
import { line, curveCatmullRomClosed } from "d3-shape";
import { extent } from "d3-array";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ResponsiveSvg,
  ReplayButton,
  Glow,
  TooltipRow,
  clamp,
  mix,
  readableOn,
  seededRandom,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface ProjPoint {
  x: number;
  y: number;
  label?: string;
  cluster: string;
}

export interface EmbeddingProjectorProps {
  points: ProjPoint[];
  clusterNames: Record<string, string>;
  title?: string;
  caption?: string;
  source?: string;
  showHulls?: boolean;
  showClusterLabels?: boolean;
  jitter?: number;
  pointRadius?: number;
  duration?: number;
}

/* ----------------------------------------------------------------- */
/* geometry helpers (math only)                                      */
/* ----------------------------------------------------------------- */

type Pt = { x: number; y: number };

/** Andrew's monotone-chain convex hull. Returns CCW hull in screen space. */
function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts.slice();
  const sorted = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const pt of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: Pt[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const pt = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Inflate a hull outward from its centroid so the blob hugs points with padding. */
function inflate(hull: Pt[], pad: number): Pt[] {
  if (hull.length === 0) return hull;
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / d) * pad, y: p.y + (dy / d) * pad };
  });
}

/* ----------------------------------------------------------------- */
/* defaults (shared by the component and the meta controls)          */
/* ----------------------------------------------------------------- */

const DEFAULT_POINTS: ProjPoint[] = [
  // animals
  { x: -2.1, y: 1.8, cluster: "animals", label: "a golden retriever puppy" },
  { x: -2.4, y: 1.4, cluster: "animals", label: "tabby cat on a windowsill" },
  { x: -1.7, y: 2.1, cluster: "animals", label: "herd of elephants" },
  { x: -2.0, y: 1.1, cluster: "animals", label: "school of clownfish" },
  { x: -2.6, y: 1.9, cluster: "animals", label: "barn owl at dusk" },
  { x: -1.9, y: 1.6, cluster: "animals", label: "red fox in snow" },
  { x: -2.3, y: 2.2, cluster: "animals", label: "honeybee on a flower" },
  // vehicles
  { x: 2.2, y: 1.6, cluster: "vehicles", label: "vintage red convertible" },
  { x: 2.5, y: 2.0, cluster: "vehicles", label: "cargo freight train" },
  { x: 1.8, y: 1.3, cluster: "vehicles", label: "fighter jet taking off" },
  { x: 2.7, y: 1.5, cluster: "vehicles", label: "sailboat at sunset" },
  { x: 2.1, y: 2.2, cluster: "vehicles", label: "electric scooter downtown" },
  { x: 2.4, y: 1.1, cluster: "vehicles", label: "double-decker bus" },
  // food
  { x: 0.3, y: -2.2, cluster: "food", label: "wood-fired margherita pizza" },
  { x: -0.2, y: -1.9, cluster: "food", label: "matcha latte with foam art" },
  { x: 0.6, y: -2.5, cluster: "food", label: "ripe summer strawberries" },
  { x: 0.1, y: -2.7, cluster: "food", label: "bowl of ramen with egg" },
  { x: -0.4, y: -2.3, cluster: "food", label: "fresh sourdough loaf" },
  { x: 0.8, y: -2.0, cluster: "food", label: "stack of pancakes, maple syrup" },
  // landscapes
  { x: -1.1, y: -0.4, cluster: "landscapes", label: "misty mountain valley" },
  { x: -0.8, y: 0.1, cluster: "landscapes", label: "desert dunes at noon" },
  { x: -1.4, y: -0.1, cluster: "landscapes", label: "northern lights over a fjord" },
  { x: -0.9, y: -0.7, cluster: "landscapes", label: "tropical beach lagoon" },
  { x: -1.2, y: 0.4, cluster: "landscapes", label: "autumn forest trail" },
];

const DEFAULT_CLUSTER_NAMES: Record<string, string> = {
  animals: "Animals",
  vehicles: "Vehicles",
  food: "Food",
  landscapes: "Landscapes",
};

const DEFAULT_TITLE = "CLIP image-caption embedding space";

export default function EmbeddingProjector({
  points = DEFAULT_POINTS,
  clusterNames = DEFAULT_CLUSTER_NAMES,
  title = DEFAULT_TITLE,
  caption = "",
  source = "",
  showHulls = true,
  showClusterLabels = true,
  jitter = 0.06,
  pointRadius = 4,
  duration = 1100,
}: EmbeddingProjectorProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const glowId = useMemo(() => uid("ep-glow"), []);

  /* Distinct clusters in first-seen order → stable color assignment. */
  const clusters = useMemo(() => {
    const seen: string[] = [];
    for (const pt of points) if (!seen.includes(pt.cluster)) seen.push(pt.cluster);
    return seen;
  }, [points]);

  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    clusters.forEach((c, i) => m.set(c, p.series[i % p.series.length]));
    return (c: string) => m.get(c) ?? p.accent;
  }, [clusters, p.series, p.accent]);

  const nameFor = (c: string) => clusterNames[c] ?? c;

  /* Apply deterministic organic jitter so co-located/center-only points spread. */
  const data = useMemo(() => {
    const rng = seededRandom(1337);
    const j = Math.max(0, jitter);
    return points.map((pt, i) => {
      const a = rng();
      const b = rng();
      // box-muller-ish gaussian for natural cluster clouds
      const g1 = Math.sqrt(-2 * Math.log(a + 1e-9)) * Math.cos(2 * Math.PI * b);
      const g2 = Math.sqrt(-2 * Math.log(a + 1e-9)) * Math.sin(2 * Math.PI * b);
      return {
        ...pt,
        i,
        jx: pt.x + g1 * j,
        jy: pt.y + g2 * j,
      };
    });
  }, [points, jitter]);

  const [xMin, xMax] = useMemo(() => {
    const e = extent(data, (d) => d.jx) as [number, number];
    return e[0] === undefined ? [0, 1] : e;
  }, [data]);
  const [yMin, yMax] = useMemo(() => {
    const e = extent(data, (d) => d.jy) as [number, number];
    return e[0] === undefined ? [0, 1] : e;
  }, [data]);

  const hovered = hover != null ? data[hover.i] : null;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 11} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
          {({ inner, margin }) => {
            const padX = (xMax - xMin || 1) * 0.08;
            const padY = (yMax - yMin || 1) * 0.08;
            const sx = scaleLinear().domain([xMin - padX, xMax + padX]).range([0, inner.width]);
            const sy = scaleLinear().domain([yMin - padY, yMax + padY]).range([inner.height, 0]);

            const r = clamp(pointRadius, 1, 14);

            // Pre-project & group screen positions per cluster (for hulls/labels).
            const screen = data.map((d) => ({ ...d, px: sx(d.jx), py: sy(d.jy) }));
            const byCluster = clusters.map((c) => ({
              cluster: c,
              pts: screen.filter((d) => d.cluster === c),
            }));

            const hullPath = line<Pt>()
              .x((d) => d.x)
              .y((d) => d.y)
              .curve(curveCatmullRomClosed.alpha(0.7));

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <Glow id={glowId} blur={5} />
                </defs>

                {/* faint plotting frame */}
                <rect
                  x={0}
                  y={0}
                  width={inner.width}
                  height={inner.height}
                  rx={10}
                  fill={withAlpha(p.surfaceAlt, 0.45)}
                  stroke={p.border}
                />

                {/* cluster hulls (organic blobs) */}
                {showHulls &&
                  byCluster.map(({ cluster, pts }, ci) => {
                    if (pts.length < 3) return null;
                    // Hull math runs in *screen* space: map px/py into {x,y}
                    // (the points still carry data-space x/y from the spread).
                    const hull = inflate(convexHull(pts.map((q) => ({ x: q.px, y: q.py }))), r + 14);
                    const d = hullPath(hull);
                    if (!d) return null;
                    const c = colorFor(cluster);
                    const dim = activeCluster != null && activeCluster !== cluster;
                    return (
                      <motion.path
                        key={`hull-${cluster}`}
                        d={d}
                        fill={withAlpha(c, dim ? 0.04 : 0.1)}
                        stroke={withAlpha(c, dim ? 0.12 : 0.32)}
                        strokeWidth={1.25}
                        strokeDasharray="2 5"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0.92 }}
                        transition={{
                          duration: reduced ? 0 : 0.6,
                          delay: reduced ? 0 : ci * 0.08,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        style={{ transformOrigin: "center", transformBox: "fill-box" }}
                      />
                    );
                  })}

                {/* points */}
                <g key={token}>
                  {screen.map((d) => {
                    const c = colorFor(d.cluster);
                    const isHover = hover?.i === d.i;
                    const dim = activeCluster != null && activeCluster !== d.cluster;
                    const baseDelay = reduced ? 0 : 0.18 + (d.i / Math.max(1, screen.length)) * (duration / 1000);
                    return (
                      <motion.circle
                        key={`pt-${d.i}`}
                        cx={d.px}
                        cy={d.py}
                        fill={c}
                        stroke={p.surface}
                        strokeWidth={isHover ? 1.5 : 0.75}
                        filter={isHover ? `url(#${glowId})` : undefined}
                        initial={{ opacity: 0, r: 0 }}
                        animate={{
                          opacity: inView ? (dim ? 0.18 : isHover ? 1 : 0.92) : 0,
                          r: inView ? (isHover ? r + 2.5 : r) : 0,
                        }}
                        transition={{
                          duration: reduced ? 0 : 0.45,
                          delay: baseDelay,
                          ease: [0.34, 1.56, 0.64, 1],
                        }}
                        onMouseMove={(e) => {
                          const r2 = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ i: d.i, x: e.clientX - r2.left, y: e.clientY - r2.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        style={{ cursor: "pointer" }}
                      />
                    );
                  })}
                </g>

                {/* cluster centroid labels */}
                {showClusterLabels &&
                  byCluster.map(({ cluster, pts }, ci) => {
                    if (pts.length === 0) return null;
                    const cx = pts.reduce((s, q) => s + q.px, 0) / pts.length;
                    const cy = pts.reduce((s, q) => s + q.py, 0) / pts.length;
                    const c = colorFor(cluster);
                    const dim = activeCluster != null && activeCluster !== cluster;
                    const label = nameFor(cluster);
                    const w = label.length * 6.4 + 16;
                    return (
                      <motion.g
                        key={`lbl-${cluster}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: inView ? (dim ? 0.25 : 1) : 0, y: 0 }}
                        transition={{
                          duration: reduced ? 0 : 0.5,
                          delay: reduced ? 0 : 0.4 + ci * 0.08,
                        }}
                        style={{ pointerEvents: "none" }}
                      >
                        <rect
                          x={cx - w / 2}
                          y={cy - 9}
                          width={w}
                          height={18}
                          rx={9}
                          fill={mix(p.surface, c, 0.16)}
                          stroke={withAlpha(c, 0.5)}
                          strokeWidth={1}
                        />
                        <text
                          x={cx}
                          y={cy}
                          dy="0.32em"
                          textAnchor="middle"
                          className="font-mono text-[9.5px] uppercase tracking-label"
                          fill={mix(readableOn(mix(p.surface, c, 0.16)), c, 0.35)}
                        >
                          {label}
                        </text>
                      </motion.g>
                    );
                  })}
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hovered && (
            <>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: colorFor(hovered.cluster) }}
                />
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">
                  {nameFor(hovered.cluster)}
                </span>
              </div>
              {hovered.label && (
                <div className="mb-1 max-w-[220px] text-[12px] font-medium leading-snug">
                  “{hovered.label}”
                </div>
              )}
              <TooltipRow label="x" value={hovered.x.toFixed(2)} />
              <TooltipRow label="y" value={hovered.y.toFixed(2)} />
            </>
          )}
        </FloatingTooltip>

        {/* interactive legend — hover a cluster to focus it in the scatter */}
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {clusters.map((c) => {
              const active = activeCluster === c;
              const dim = activeCluster != null && !active;
              return (
                <button
                  key={c}
                  type="button"
                  onMouseEnter={() => setActiveCluster(c)}
                  onMouseLeave={() => setActiveCluster(null)}
                  onFocus={() => setActiveCluster(c)}
                  onBlur={() => setActiveCluster(null)}
                  className="flex items-center gap-1.5 rounded-md outline-none transition-opacity"
                  style={{ opacity: dim ? 0.4 : 1 }}
                  aria-label={`Focus cluster ${nameFor(c)}`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full transition-transform"
                    style={{
                      background: colorFor(c),
                      transform: active ? "scale(1.35)" : "scale(1)",
                    }}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                    {nameFor(c)}
                  </span>
                </button>
              );
            })}
          </div>
          <ReplayButton
            onClick={replay}
            className="shrink-0 opacity-0 transition-opacity group-hover/figure:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

/* ----------------------------------------------------------------- */
/* meta                                                              */
/* ----------------------------------------------------------------- */

export const meta: RevizMeta = {
  id: "embedding-projector",
  name: "Embedding Projector",
  category: "interpretability",
  description:
    "A UMAP/t-SNE-style 2D projection of embeddings that scatters items into colored, hull-wrapped semantic clusters you can hover and focus.",
  tags: ["embedding", "umap", "t-sne", "projection", "scatter", "clusters", "latent-space"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "EmbeddingProjector",
  sourcePath: "interpretability/EmbeddingProjector",
  aspect: 16 / 11,
  controls: [
    {
      key: "points",
      label: "Points",
      type: "json",
      group: "Data",
      help: "Array of {x, y, cluster, label?} — projected embedding coordinates.",
      default: DEFAULT_POINTS,
    },
    {
      key: "clusterNames",
      label: "Cluster names",
      type: "json",
      group: "Data",
      help: "Map of cluster key → display label.",
      default: DEFAULT_CLUSTER_NAMES,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: DEFAULT_TITLE },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "showClusterLabels", label: "Cluster labels", type: "boolean", group: "Labels", default: true },
    { key: "showHulls", label: "Cluster hulls", type: "boolean", group: "Style", default: true },
    { key: "pointRadius", label: "Point radius", type: "number", group: "Style", default: 4, min: 1, max: 14, step: 0.5 },
    { key: "jitter", label: "Jitter", type: "number", group: "Style", default: 0.06, min: 0, max: 0.6, step: 0.02 },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 3000, step: 50 },
  ],
  presets: [
    {
      id: "clip",
      name: "CLIP captions",
      props: {
        title: "CLIP image-caption embedding space",
        caption: "Captions cluster by semantic concept after t-SNE projection.",
      },
    },
    {
      id: "intents",
      name: "Assistant intents",
      props: {
        title: "User-query embeddings by intent",
        source: "UMAP · n=24",
        showHulls: true,
        clusterNames: {
          code: "Code help",
          travel: "Travel",
          health: "Health",
          finance: "Finance",
        },
        points: [
          { x: -2.0, y: 1.6, cluster: "code", label: "fix this python traceback" },
          { x: -2.3, y: 2.0, cluster: "code", label: "explain async/await in JS" },
          { x: -1.7, y: 1.3, cluster: "code", label: "write a SQL join query" },
          { x: -2.4, y: 1.4, cluster: "code", label: "refactor this react component" },
          { x: -1.9, y: 2.2, cluster: "code", label: "what is a closure" },
          { x: 2.1, y: 1.8, cluster: "travel", label: "best time to visit kyoto" },
          { x: 2.5, y: 1.4, cluster: "travel", label: "cheap flights to lisbon" },
          { x: 1.9, y: 2.1, cluster: "travel", label: "is the eurail pass worth it" },
          { x: 2.4, y: 2.0, cluster: "travel", label: "packing list for patagonia" },
          { x: 0.2, y: -2.1, cluster: "health", label: "how much sleep do i need" },
          { x: -0.1, y: -2.5, cluster: "health", label: "symptoms of dehydration" },
          { x: 0.5, y: -2.3, cluster: "health", label: "beginner running plan" },
          { x: -0.3, y: -1.9, cluster: "health", label: "healthy high-protein snacks" },
          { x: -1.2, y: -0.3, cluster: "finance", label: "how do index funds work" },
          { x: -0.9, y: 0.1, cluster: "finance", label: "roth ira vs traditional" },
          { x: -1.4, y: -0.6, cluster: "finance", label: "should i pay off debt first" },
          { x: -1.0, y: -0.1, cluster: "finance", label: "explain compound interest" },
        ],
      },
    },
    {
      id: "centers",
      name: "Centers + jitter",
      props: {
        title: "Token embeddings (cluster centers)",
        caption: "Given only cluster centers, organic jitter reveals the cloud shape.",
        jitter: 0.5,
        showHulls: false,
        points: [
          { x: -2, y: 2, cluster: "nouns" },
          { x: -2, y: 2, cluster: "nouns" },
          { x: -2, y: 2, cluster: "nouns" },
          { x: -2, y: 2, cluster: "nouns" },
          { x: -2, y: 2, cluster: "nouns" },
          { x: -2, y: 2, cluster: "nouns" },
          { x: 2, y: 1.8, cluster: "verbs" },
          { x: 2, y: 1.8, cluster: "verbs" },
          { x: 2, y: 1.8, cluster: "verbs" },
          { x: 2, y: 1.8, cluster: "verbs" },
          { x: 2, y: 1.8, cluster: "verbs" },
          { x: 0, y: -2, cluster: "adjectives" },
          { x: 0, y: -2, cluster: "adjectives" },
          { x: 0, y: -2, cluster: "adjectives" },
          { x: 0, y: -2, cluster: "adjectives" },
          { x: 0, y: -2, cluster: "adjectives" },
        ],
        clusterNames: { nouns: "Nouns", verbs: "Verbs", adjectives: "Adjectives" },
      },
    },
  ],
};
