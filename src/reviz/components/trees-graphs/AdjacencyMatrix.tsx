"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  mix,
  readableOn,
  round,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

export interface AdjacencyMatrixProps {
  nodes?: string[];
  weights?: number[][];
  symmetric?: boolean;
  showValues?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

const FALLBACK_NODES = (n: number) => Array.from({ length: n }, (_, i) => `n${i}`);

export default function AdjacencyMatrix({
  nodes = ["Input", "Encoder", "Memory", "Decoder", "Output"],
  weights = [
    [0, 0.9, 0.2, 0, 0],
    [0, 0, 0.7, 0.5, 0],
    [0, 0.4, 0, 0.8, 0.1],
    [0, 0, 0.3, 0, 0.95],
    [0.15, 0, 0, 0, 0],
  ],
  symmetric = false,
  showValues = true,
  title = "",
  caption = "",
  source = "",
  color = "",
  duration = 1000,
}: AdjacencyMatrixProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  const n = weights.length;

  const labels = useMemo(() => {
    if (nodes.length >= n) return nodes.slice(0, n);
    return [...nodes, ...FALLBACK_NODES(n).slice(nodes.length)];
  }, [nodes, n]);

  // When symmetric, fold the matrix into a symmetric edge weight by taking the
  // max of the two directed entries so an undirected graph reads cleanly.
  const adj = useMemo(() => {
    if (!symmetric) return weights;
    return weights.map((row, r) =>
      row.map((v, c) => {
        const a = weights[r]?.[c] ?? 0;
        const b = weights[c]?.[r] ?? 0;
        return Math.max(Math.abs(a), Math.abs(b));
      }),
    );
  }, [weights, symmetric]);

  const maxW = useMemo(() => {
    let m = 0;
    for (const row of adj) for (const v of row) m = Math.max(m, Math.abs(v));
    return m || 1;
  }, [adj]);

  // Graph-level stats for the readout.
  const stats = useMemo(() => {
    let edges = 0;
    let total = 0;
    let selfLoops = 0;
    for (let r = 0; r < adj.length; r++) {
      for (let c = 0; c < (adj[r]?.length ?? 0); c++) {
        const v = adj[r][c];
        if (Math.abs(v) > 1e-9) {
          // when symmetric only count the upper triangle (incl diagonal) once
          if (!symmetric || c >= r) {
            edges += 1;
            total += Math.abs(v);
          }
          if (r === c) selfLoops += 1;
        }
      }
    }
    const possible = symmetric ? (n * (n + 1)) / 2 : n * n;
    return { edges, density: possible > 0 ? edges / possible : 0, selfLoops, total };
  }, [adj, n, symmetric]);

  const intensity = (r: number, c: number) => Math.min(1, Math.abs(adj[r]?.[c] ?? 0) / maxW);

  const cellFill = (r: number, c: number) => {
    const t = intensity(r, c);
    if (t <= 1e-9) return p.surfaceAlt;
    // gentle non-linear ramp so faint edges stay visible
    const eased = Math.pow(t, 0.74);
    return mix(p.surface, accent, eased);
  };

  const cellText = (r: number, c: number) => {
    const t = intensity(r, c);
    if (t <= 1e-9) return p.inkFaint;
    const eased = Math.pow(t, 0.74);
    return eased > 0.52 ? readableOn(mix(p.surface, accent, eased)) : p.inkMuted;
  };

  const display = (r: number, c: number) => {
    const v = adj[r]?.[c] ?? 0;
    if (Math.abs(v) <= 1e-9) return "";
    return Number.isInteger(v) ? String(v) : round(v, 2).toString();
  };

  const aspect = 1.12;
  const labelChars = Math.max(...labels.map((l) => l.length), 4);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={aspect}
          margin={{
            top: 34,
            right: 18,
            bottom: 30,
            left: Math.min(112, 34 + labelChars * 6.4),
          }}
        >
          {({ inner, margin }) => {
            const size = Math.min(inner.width, inner.height);
            const ox = (inner.width - size) / 2;
            const oy = (inner.height - size) / 2;
            const cell = n > 0 ? size / n : 0;
            const gap = Math.min(3, cell * 0.06);
            const fontSize = Math.max(8, Math.min(14, cell * 0.26));
            const tickFont = Math.max(8, Math.min(12, cell * 0.3));

            const orderDelay = (r: number, c: number) => {
              // diagonal-wavefront stagger from the top-left corner
              const wave = (r + c) * 0.5 + Math.abs(r - c) * 0.16;
              return reduced ? 0 : (wave / (n * 1.7)) * (duration / 1000);
            };

            return (
              <g transform={`translate(${margin.left + ox}, ${margin.top + oy})`}>
                {/* Axis titles */}
                <text
                  x={size / 2}
                  y={-margin.top + 11}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  className="font-mono uppercase"
                  style={{ fontSize: 10, letterSpacing: "0.12em" }}
                >
                  {symmetric ? "Node" : "To"}
                </text>
                <text
                  transform={`translate(${-margin.left + 12}, ${size / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fill={p.inkMuted}
                  className="font-mono uppercase"
                  style={{ fontSize: 10, letterSpacing: "0.12em" }}
                >
                  {symmetric ? "Node" : "From"}
                </text>

                {/* Column (to) tick labels along the top */}
                {labels.map((label, c) => {
                  const active = hover?.c === c;
                  return (
                    <text
                      key={`xt-${c}`}
                      x={c * cell + cell / 2}
                      y={-6}
                      textAnchor="middle"
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Row (from) tick labels along the left */}
                {labels.map((label, r) => {
                  const active = hover?.r === r;
                  return (
                    <text
                      key={`yt-${r}`}
                      x={-8}
                      y={r * cell + cell / 2}
                      dy="0.32em"
                      textAnchor="end"
                      fill={active ? p.ink : p.inkFaint}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Cells */}
                {adj.map((row, r) =>
                  row.map((_, c) => {
                    const x = c * cell;
                    const y = r * cell;
                    const isDiag = r === c;
                    const hasEdge = intensity(r, c) > 1e-9;
                    const rowCol = hover != null && (hover.r === r || hover.c === c);
                    const exact = hover != null && hover.r === r && hover.c === c;
                    const dimmed = hover != null && !rowCol;
                    const fill = cellFill(r, c);

                    return (
                      <g key={`cell-${token}-${r}-${c}`}>
                        <motion.rect
                          x={x + gap / 2}
                          y={y + gap / 2}
                          width={Math.max(0, cell - gap)}
                          height={Math.max(0, cell - gap)}
                          rx={Math.min(4, cell * 0.12)}
                          fill={fill}
                          stroke={
                            exact
                              ? accent
                              : isDiag
                                ? withAlpha(p.borderStrong, 0.9)
                                : hasEdge
                                  ? withAlpha(accent, 0.45)
                                  : p.border
                          }
                          strokeWidth={exact ? 1.6 : isDiag ? 1 : hasEdge ? 0.9 : 0.6}
                          strokeDasharray={isDiag && !hasEdge ? "2 2" : undefined}
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{
                            opacity: inView ? (dimmed ? 0.3 : 1) : 0,
                            scale: inView ? (exact ? 1.05 : 1) : 0.6,
                          }}
                          transition={{
                            opacity: { duration: reduced ? 0 : 0.45, delay: hover ? 0 : orderDelay(r, c) },
                            scale: {
                              duration: reduced ? 0 : exact ? 0.18 : 0.5,
                              delay: hover ? 0 : orderDelay(r, c),
                              ease: [0.22, 1, 0.36, 1],
                            },
                          }}
                          style={{ transformOrigin: `${x + cell / 2}px ${y + cell / 2}px`, cursor: "pointer" }}
                          onMouseMove={(e) => {
                            const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                            setHover({ r, c, x: e.clientX - box.left, y: e.clientY - box.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                        {showValues && hasEdge && cell > 18 && (
                          <motion.text
                            x={x + cell / 2}
                            y={y + cell / 2}
                            dy="0.34em"
                            textAnchor="middle"
                            fill={cellText(r, c)}
                            className="font-mono tabular-nums pointer-events-none"
                            style={{ fontSize, fontWeight: intensity(r, c) > 0.6 ? 600 : 400 }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: inView ? (dimmed ? 0.4 : 1) : 0 }}
                            transition={{
                              duration: reduced ? 0 : 0.4,
                              delay: hover ? 0 : orderDelay(r, c) + 0.18,
                            }}
                          >
                            {display(r, c)}
                          </motion.text>
                        )}
                      </g>
                    );
                  }),
                )}

                {/* Outer frame */}
                <rect
                  x={0}
                  y={0}
                  width={size}
                  height={size}
                  fill="none"
                  stroke={p.borderStrong}
                  strokeWidth={1}
                  rx={Math.min(5, cell * 0.12)}
                  className="pointer-events-none"
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* Graph readout */}
        <div className="mt-2 flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-label text-ink-faint">
          <span>
            nodes <span className="tabular-nums text-ink-muted">{n}</span>
          </span>
          <span className="text-border-strong">/</span>
          <span>
            edges <span className="tabular-nums text-ink-muted">{stats.edges}</span>
          </span>
          <span className="text-border-strong">/</span>
          <span>
            density <span className="tabular-nums text-ink-muted">{round(stats.density * 100, 0)}%</span>
          </span>
          <span className="text-border-strong">/</span>
          <span>{symmetric ? "undirected" : "directed"}</span>
        </div>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {labels[hover.r]} {symmetric ? "—" : "→"} {labels[hover.c]}
              </div>
              <TooltipRow
                label="weight"
                value={display(hover.r, hover.c) || "0"}
              />
              <TooltipRow
                label={intensity(hover.r, hover.c) > 1e-9 ? "edge" : "no edge"}
                value={intensity(hover.r, hover.c) > 1e-9 ? "yes" : "—"}
              />
              {hover.r === hover.c && <TooltipRow label="self-loop" value="yes" />}
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={replay} label="replay" />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "adjacency-matrix",
  name: "Adjacency Matrix",
  category: "trees-graphs",
  description:
    "A graph rendered as an N×N adjacency heatmap where edge weight drives cell intensity, with node labels on both axes, a directed/undirected toggle, a diagonal-wavefront reveal, and a hover row/column crosshair.",
  tags: ["graph", "adjacency", "matrix", "network", "heatmap", "edges"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "AdjacencyMatrix",
  sourcePath: "trees-graphs/AdjacencyMatrix",
  aspect: 1.12,
  controls: [
    {
      key: "nodes",
      label: "Node labels",
      type: "json",
      group: "Data",
      default: ["Input", "Encoder", "Memory", "Decoder", "Output"],
    },
    {
      key: "weights",
      label: "Edge weights",
      type: "matrix",
      group: "Data",
      default: [
        [0, 0.9, 0.2, 0, 0],
        [0, 0, 0.7, 0.5, 0],
        [0, 0.4, 0, 0.8, 0.1],
        [0, 0, 0.3, 0, 0.95],
        [0.15, 0, 0, 0, 0],
      ],
    },
    { key: "symmetric", label: "Symmetric (undirected)", type: "boolean", group: "Layout", default: false },
    { key: "showValues", label: "Show weights", type: "boolean", group: "Labels", default: true },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Edge color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1000, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "pipeline",
      name: "Model dataflow",
      props: {
        title: "Module connectivity",
        caption: "Directed edge weights between blocks of a sequence model.",
        symmetric: false,
        nodes: ["Input", "Encoder", "Memory", "Decoder", "Output"],
        weights: [
          [0, 0.9, 0.2, 0, 0],
          [0, 0, 0.7, 0.5, 0],
          [0, 0.4, 0, 0.8, 0.1],
          [0, 0, 0.3, 0, 0.95],
          [0.15, 0, 0, 0, 0],
        ],
      },
    },
    {
      id: "social",
      name: "Interaction graph",
      props: {
        title: "Agent interaction strength",
        caption: "Undirected, symmetric co-activation weights across six agents.",
        source: "rollout log",
        symmetric: true,
        nodes: ["A1", "A2", "A3", "A4", "A5", "A6"],
        weights: [
          [0, 0.8, 0.3, 0, 0.1, 0],
          [0.8, 0, 0.6, 0.2, 0, 0.4],
          [0.3, 0.6, 0, 0.9, 0.5, 0],
          [0, 0.2, 0.9, 0, 0.7, 0.3],
          [0.1, 0, 0.5, 0.7, 0, 0.6],
          [0, 0.4, 0, 0.3, 0.6, 0],
        ],
      },
    },
    {
      id: "transition",
      name: "Transition counts",
      props: {
        title: "State transition matrix",
        caption: "Observed transition counts between policy states.",
        symmetric: false,
        showValues: true,
        nodes: ["Idle", "Seek", "Grasp", "Carry"],
        weights: [
          [12, 34, 2, 0],
          [4, 8, 41, 1],
          [0, 6, 5, 38],
          [9, 1, 3, 14],
        ],
      },
    },
  ],
};
