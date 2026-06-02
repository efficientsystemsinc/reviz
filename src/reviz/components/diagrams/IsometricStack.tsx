"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  ResponsiveSvg,
  SoftShadow,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  mix,
  readableOn,
  type ChartArea,
  type RevizMeta,
} from "@/reviz";

interface Layer {
  label: string;
  sublabel?: string;
  items?: string[];
}

export interface IsometricStackProps {
  layers?: Layer[];
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  depth?: number;
  gap?: number;
  showGrid?: boolean;
  showConnectors?: boolean;
  duration?: number;
}

/* Isometric projection: a top-down square mapped onto a 2:1 diamond.
 * (u, v) are plane coordinates in [0,1]; returns screen-space offset. */
function iso(u: number, v: number, w: number, h: number) {
  return {
    x: (u - v) * (w / 2),
    y: (u + v) * (h / 2),
  };
}

export default function IsometricStack({
  layers = [
    {
      label: "Interface",
      sublabel: "client surface",
      items: ["Chat UI", "Voice", "Editor plugin"],
    },
    {
      label: "Agent runtime",
      sublabel: "orchestration",
      items: ["Planner", "Tool router", "Memory"],
    },
    {
      label: "Model backend",
      sublabel: "inference",
      items: ["LLM", "Embeddings", "Reranker"],
    },
  ],
  title = "",
  caption = "",
  source = "",
  accent = "",
  depth = 78,
  gap = 0,
  showGrid = true,
  showConnectors = true,
  duration = 1100,
}: IsometricStackProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<number | null>(null);

  const ids = useMemo(
    () => ({ shadow: uid("iso-shadow"), grid: uid("iso-grid") }),
    [],
  );

  const n = layers.length;
  const safeDur = Math.max(0, duration) / 1000;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/iso relative">
        <ResponsiveSvg aspect={4 / 3} margin={{ top: 24, right: 28, bottom: 24, left: 40 }}>
          {({ inner }: ChartArea) => {
            // Plane footprint sized to fit the diamond + the full stack height.
            const totalDepth = depth * (n - 1) + gap * (n - 1);
            const planeW = Math.min(inner.width * 0.82, (inner.height - totalDepth) * 2.1);
            const planeH = planeW / 2; // 2:1 isometric diamond

            const cx = inner.width / 2;
            // Center the whole stack (top plane to bottom plane) vertically.
            const stackH = planeH + totalDepth;
            const topY = (inner.height - stackH) / 2;

            // Diamond corners in plane space: top, right, bottom, left.
            const corner = (u: number, v: number) => iso(u, v, planeW, planeH);
            const cTop = corner(0, 0);
            const cRight = corner(1, 0);
            const cBottom = corner(1, 1);
            const cLeft = corner(0, 1);

            const facePath = (dy: number) =>
              `M ${cx + cTop.x} ${topY + cTop.y + dy} ` +
              `L ${cx + cRight.x} ${topY + cRight.y + dy} ` +
              `L ${cx + cBottom.x} ${topY + cBottom.y + dy} ` +
              `L ${cx + cLeft.x} ${topY + cLeft.y + dy} Z`;

            // Grid lines across the top face of a plane.
            const gridLines = (dy: number) => {
              const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
              const steps = 4;
              for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const a = corner(t, 0);
                const b = corner(t, 1);
                lines.push({ x1: cx + a.x, y1: topY + a.y + dy, x2: cx + b.x, y2: topY + b.y + dy });
                const c = corner(0, t);
                const d = corner(1, t);
                lines.push({ x1: cx + c.x, y1: topY + c.y + dy, x2: cx + d.x, y2: topY + d.y + dy });
              }
              return lines;
            };

            // Right + left vertical side faces giving each plane thickness.
            const thickness = 10;
            const sidePath = (dy: number, side: "right" | "left") => {
              if (side === "right") {
                return (
                  `M ${cx + cRight.x} ${topY + cRight.y + dy} ` +
                  `L ${cx + cBottom.x} ${topY + cBottom.y + dy} ` +
                  `L ${cx + cBottom.x} ${topY + cBottom.y + dy + thickness} ` +
                  `L ${cx + cRight.x} ${topY + cRight.y + dy + thickness} Z`
                );
              }
              return (
                `M ${cx + cLeft.x} ${topY + cLeft.y + dy} ` +
                `L ${cx + cBottom.x} ${topY + cBottom.y + dy} ` +
                `L ${cx + cBottom.x} ${topY + cBottom.y + dy + thickness} ` +
                `L ${cx + cLeft.x} ${topY + cLeft.y + dy + thickness} Z`
              );
            };

            // Label anchor: the left vertex of each plane, in clear space beside the stack.
            const labelAnchor = (dy: number) => ({ x: cx + cLeft.x, y: topY + cLeft.y + dy });
            // Items run down the right edge of the diamond.
            const itemAnchor = (dy: number) => ({ x: cx + cRight.x, y: topY + cRight.y + dy });

            return (
              <g key={token}>
                <defs>
                  <SoftShadow id={ids.shadow} dy={10} blur={14} opacity={0.16} />
                </defs>

                {layers.map((layer, idx) => {
                  // Render back-to-front (idx 0 = top plane drawn last so it sits on top).
                  const order = n - 1 - idx;
                  const dy = order * (depth + gap);
                  const active = hover === idx;
                  const dim = hover != null && !active;

                  // Color each layer along a subtle ramp toward the accent.
                  const t = n > 1 ? idx / (n - 1) : 0;
                  const base = mix(fill, p.surface, 0.42 + t * 0.28);
                  const topFace = active ? mix(fill, p.surface, 0.18) : base;
                  const rightFace = mix(topFace, p.shadow, 0.22);
                  const leftFace = mix(topFace, p.shadow, 0.38);

                  const la = labelAnchor(dy);
                  const ia = itemAnchor(dy);
                  const grid = gridLines(dy);

                  // Float entrance: planes drop into the stack from above, staggered.
                  const lift = reduced ? 0 : 26 + order * 8;
                  const stagger = (n - 1 - order) * 0.12;

                  return (
                    <motion.g
                      key={`${layer.label}-${idx}`}
                      initial={reduced ? false : { opacity: 0, y: -lift }}
                      animate={{
                        opacity: inView ? (dim ? 0.55 : 1) : 0,
                        y: inView ? (active && !reduced ? -7 : 0) : -lift,
                      }}
                      transition={{
                        duration: safeDur,
                        delay: inView ? stagger : 0,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      onMouseEnter={() => setHover(idx)}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: "default" }}
                    >
                      {/* side faces (thickness) */}
                      <path d={sidePath(dy, "left")} fill={leftFace} />
                      <path d={sidePath(dy, "right")} fill={rightFace} />

                      {/* top face */}
                      <path
                        d={facePath(dy)}
                        fill={topFace}
                        stroke={active ? fill : withAlpha(p.borderStrong, 0.6)}
                        strokeWidth={active ? 1.5 : 1}
                        filter={`url(#${ids.shadow})`}
                      />

                      {/* faint grid on the plane */}
                      {showGrid &&
                        grid.map((g, gi) => (
                          <line
                            key={gi}
                            x1={g.x1}
                            y1={g.y1}
                            x2={g.x2}
                            y2={g.y2}
                            stroke={withAlpha(p.ink, active ? 0.12 : 0.07)}
                            strokeWidth={1}
                          />
                        ))}

                      {/* accent edge highlight along the back-left rim */}
                      <line
                        x1={cx + cTop.x}
                        y1={topY + cTop.y + dy}
                        x2={cx + cLeft.x}
                        y2={topY + cLeft.y + dy}
                        stroke={withAlpha(fill, active ? 0.95 : 0.5)}
                        strokeWidth={active ? 2 : 1.25}
                        strokeLinecap="round"
                      />

                      {/* layer index badge + name, anchored at a fixed left gutter
                          (vertically aligned to this plane) so labels never clip */}
                      <g transform={`translate(6, ${la.y - 8})`}>
                        <rect
                          x={0}
                          y={0}
                          width={22}
                          height={16}
                          rx={4}
                          fill={active ? fill : withAlpha(fill, 0.16)}
                          stroke={withAlpha(fill, 0.4)}
                          strokeWidth={0.75}
                        />
                        <text
                          x={11}
                          y={8.5}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="font-mono"
                          fill={active ? readableOn(fill) : fill}
                          style={{ fontSize: 9, letterSpacing: "0.04em" }}
                        >
                          L{idx + 1}
                        </text>
                      </g>

                      {/* layer name + sublabel, left-aligned in the fixed gutter beside the badge */}
                      <text
                        x={34}
                        y={la.y - 4}
                        textAnchor="start"
                        className="font-mono"
                        fill={dim ? p.inkFaint : p.ink}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                          textTransform: "uppercase",
                        }}
                      >
                        {layer.label}
                      </text>
                      {layer.sublabel && (
                        <text
                          x={34}
                          y={la.y + 9}
                          textAnchor="start"
                          fill={p.inkFaint}
                          className="font-mono"
                          style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}
                        >
                          {layer.sublabel}
                        </text>
                      )}

                      {/* item chips along the right edge */}
                      {layer.items?.map((item, ii) => {
                        const oy = ii * 17;
                        return (
                          <g key={item} transform={`translate(${ia.x + 14}, ${ia.y - 26 + oy})`}>
                            <circle cx={0} cy={6} r={2.5} fill={withAlpha(fill, dim ? 0.4 : 0.85)} />
                            <text
                              x={8}
                              y={6}
                              dominantBaseline="middle"
                              fill={dim ? p.inkFaint : p.inkMuted}
                              className="font-mono"
                              style={{ fontSize: 9.5, letterSpacing: "0.02em" }}
                            >
                              {item}
                            </text>
                          </g>
                        );
                      })}
                    </motion.g>
                  );
                })}

                {/* vertical connectors threading through the stack center */}
                {showConnectors && n > 1 && (
                  <motion.line
                    x1={cx + cBottom.x}
                    x2={cx + cBottom.x}
                    y1={topY + cBottom.y}
                    y2={topY + cBottom.y + (depth + gap) * (n - 1)}
                    stroke={withAlpha(fill, 0.45)}
                    strokeWidth={1.5}
                    strokeDasharray="2 5"
                    initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
                    transition={{ duration: safeDur, delay: inView ? n * 0.12 : 0, ease: "easeInOut" }}
                  />
                )}
              </g>
            );
          }}
        </ResponsiveSvg>

        <button
          type="button"
          onClick={replay}
          className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-label text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover/iso:opacity-100"
        >
          replay
        </button>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "isometric-stack",
  name: "Isometric Stack",
  category: "diagrams",
  description:
    "Layered planes floating in isometric 3D — a gorgeous 'how it works' diagram of a system stack with per-layer labels, item chips, and hover parallax.",
  tags: ["isometric", "stack", "architecture", "diagram", "3d", "system"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "IsometricStack",
  sourcePath: "diagrams/IsometricStack",
  aspect: 4 / 3,
  controls: [
    {
      key: "layers",
      label: "Layers",
      type: "json",
      group: "Data",
      help: "Top-to-bottom planes. Each: { label, sublabel?, items?: string[] }.",
      default: [
        {
          label: "Interface",
          sublabel: "client surface",
          items: ["Chat UI", "Voice", "Editor plugin"],
        },
        {
          label: "Agent runtime",
          sublabel: "orchestration",
          items: ["Planner", "Tool router", "Memory"],
        },
        {
          label: "Model backend",
          sublabel: "inference",
          items: ["LLM", "Embeddings", "Reranker"],
        },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    { key: "depth", label: "Layer depth", type: "number", group: "Layout", default: 78, min: 40, max: 140, step: 2, unit: "px" },
    { key: "gap", label: "Layer gap", type: "number", group: "Layout", default: 0, min: 0, max: 60, step: 2, unit: "px" },
    { key: "showGrid", label: "Plane grids", type: "boolean", group: "Style", default: true },
    { key: "showConnectors", label: "Connectors", type: "boolean", group: "Style", default: true },
    { key: "duration", label: "Animation", type: "number", group: "Animation", default: 1100, min: 0, max: 2500, step: 50, unit: "ms" },
  ],
  presets: [
    {
      id: "system-stack",
      name: "3-layer system stack",
      props: {
        title: "Agent system architecture",
        caption: "Requests fall from the interface through the runtime to the model backend.",
        source: "reviz",
      },
    },
    {
      id: "rag",
      name: "RAG pipeline",
      props: {
        title: "Retrieval-augmented generation",
        accent: "",
        depth: 70,
        gap: 14,
        layers: [
          { label: "Query", sublabel: "user input", items: ["Rewrite", "Embed"] },
          { label: "Retrieval", sublabel: "vector store", items: ["ANN search", "Rerank", "Filter"] },
          { label: "Context", sublabel: "assembly", items: ["Chunk merge", "Prompt build"] },
          { label: "Generation", sublabel: "LLM", items: ["Decode", "Cite", "Stream"] },
        ],
      },
    },
    {
      id: "data-plane",
      name: "Data plane",
      props: {
        title: "Training data pipeline",
        depth: 90,
        showConnectors: false,
        layers: [
          { label: "Ingest", sublabel: "raw sources", items: ["Crawl", "Logs", "Sensors"] },
          { label: "Curate", sublabel: "quality", items: ["Dedup", "Filter", "Label"] },
          { label: "Tokenize", sublabel: "shards", items: ["Pack", "Shuffle"] },
        ],
      },
    },
  ],
};
