"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  TooltipRow,
  clamp,
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

export interface EvalGridProps {
  tasks?: string[];
  models?: string[];
  scores?: number[][];
  mode?: "score" | "passfail";
  passThreshold?: number;
  showSummaries?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

const FALLBACK_TASKS = (n: number) => Array.from({ length: n }, (_, i) => `Task ${i + 1}`);
const FALLBACK_MODELS = (n: number) => Array.from({ length: n }, (_, i) => `Model ${i + 1}`);

export default function EvalGrid({
  tasks = ["Math reasoning", "Code generation", "Tool use", "Long-context QA", "Multimodal", "Safety refusals"],
  models = ["Aria-L", "Atlas-3", "Nova-2", "Vega-4"],
  scores = [
    [0.91, 0.88, 0.83, 0.71],
    [0.86, 0.9, 0.79, 0.68],
    [0.82, 0.77, 0.74, 0.55],
    [0.79, 0.74, 0.81, 0.62],
    [0.74, 0.81, 0.86, 0.49],
    [0.96, 0.93, 0.9, 0.84],
  ],
  mode = "score",
  passThreshold = 0.75,
  showSummaries = true,
  title = "",
  caption = "",
  source = "",
  color = "",
  duration = 1000,
}: EvalGridProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);

  const nRows = scores.length;
  const nCols = useMemo(() => Math.max(0, ...scores.map((row) => row.length)), [scores]);

  // Resolve labels to match the score matrix dimensions.
  const rowLabels = useMemo(() => {
    const base = tasks.length >= nRows ? tasks.slice(0, nRows) : [...tasks, ...FALLBACK_TASKS(nRows).slice(tasks.length)];
    return base;
  }, [tasks, nRows]);

  const colLabels = useMemo(() => {
    const base =
      models.length >= nCols ? models.slice(0, nCols) : [...models, ...FALLBACK_MODELS(nCols).slice(models.length)];
    return base;
  }, [models, nCols]);

  const score = (r: number, c: number) => clamp(scores[r]?.[c] ?? 0, 0, 1);
  const passed = (r: number, c: number) => score(r, c) >= passThreshold;

  // Per-model (column) and per-task (row) means power the summary strips.
  const colMean = useMemo(() => {
    return colLabels.map((_, c) => {
      const vals = scores.map((row) => clamp(row[c] ?? 0, 0, 1));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
  }, [scores, colLabels]);

  const rowMean = useMemo(() => {
    return scores.map((row) => {
      const vals = row.slice(0, nCols).map((v) => clamp(v ?? 0, 0, 1));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
  }, [scores, nCols]);

  // Pass-rate stats for the footer readout.
  const totalCells = nRows * nCols;
  const passCount = useMemo(() => {
    let n = 0;
    for (let r = 0; r < nRows; r++) for (let c = 0; c < nCols; c++) if (passed(r, c)) n++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, nRows, nCols, passThreshold]);
  const overallMean = useMemo(() => {
    let sum = 0;
    for (let r = 0; r < nRows; r++) for (let c = 0; c < nCols; c++) sum += score(r, c);
    return totalCells ? sum / totalCells : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, nRows, nCols]);

  // Diverging-ish ramp: faint surface → soft accent → full accent, eased.
  const cellFill = (v: number) => {
    const eased = Math.pow(clamp(v, 0, 1), 0.78);
    return mix(mix(p.surface, p.accentSoft, 0.5), accent, eased);
  };
  const passFill = (ok: boolean) => (ok ? withAlpha(p.ok, 0.16) : withAlpha(p.bad, 0.14));
  const textOn = (v: number) => {
    const eased = Math.pow(clamp(v, 0, 1), 0.78);
    return eased > 0.5 ? readableOn(cellFill(v)) : p.inkMuted;
  };

  const aspect = 1.42;
  const rowLabelChars = Math.max(...rowLabels.map((l) => l.length), 4);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg
          aspect={aspect}
          margin={{
            top: 38,
            right: showSummaries ? 58 : 16,
            bottom: showSummaries ? 40 : 18,
            left: Math.min(150, 22 + rowLabelChars * 6.6),
          }}
        >
          {({ inner, margin }) => {
            const gridW = inner.width;
            const gridH = inner.height;
            const cw = nCols > 0 ? gridW / nCols : 0;
            const chh = nRows > 0 ? gridH / nRows : 0;
            const gap = Math.min(5, Math.min(cw, chh) * 0.07);
            const radius = Math.min(7, Math.min(cw, chh) * 0.16);
            const fontSize = clamp(Math.min(cw, chh) * 0.26, 9, 14);
            const tickFont = clamp(Math.min(cw, 70) * 0.2, 8.5, 11.5);
            const summaryGap = 12;
            const sw = 16; // width of the right summary strip cells

            // Wave reveal: top-left fires first, sweeping to bottom-right.
            const orderDelay = (r: number, c: number) => {
              const wave = (r / Math.max(1, nRows) + c / Math.max(1, nCols)) * 0.5;
              return reduced ? 0 : wave * (duration / 1000);
            };

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                {/* Column (model) headers */}
                {colLabels.map((label, c) => {
                  const active = hover?.c === c;
                  return (
                    <text
                      key={`ch-${c}`}
                      x={c * cw + cw / 2}
                      y={-12}
                      textAnchor="middle"
                      fill={active ? p.ink : p.inkMuted}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 500, letterSpacing: "0.02em" }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Row (task) labels */}
                {rowLabels.map((label, r) => {
                  const active = hover?.r === r;
                  return (
                    <text
                      key={`rh-${r}`}
                      x={-10}
                      y={r * chh + chh / 2}
                      dy="0.32em"
                      textAnchor="end"
                      fill={active ? p.ink : p.inkMuted}
                      className="font-mono"
                      style={{ fontSize: tickFont, fontWeight: active ? 600 : 400 }}
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Cells */}
                {Array.from({ length: nRows }).map((_, r) =>
                  Array.from({ length: nCols }).map((__, c) => {
                    const v = score(r, c);
                    const ok = passed(r, c);
                    const x = c * cw;
                    const y = r * chh;
                    const rowCol = hover != null && (hover.r === r || hover.c === c);
                    const exact = hover != null && hover.r === r && hover.c === c;
                    const dimmed = hover != null && !rowCol;
                    const fill = mode === "passfail" ? passFill(ok) : cellFill(v);
                    const cx = x + cw / 2;
                    const cy = y + chh / 2;
                    const glyph = Math.min(cw, chh) * 0.18;

                    return (
                      <g key={`cell-${token}-${r}-${c}`}>
                        <motion.rect
                          x={x + gap / 2}
                          y={y + gap / 2}
                          width={Math.max(0, cw - gap)}
                          height={Math.max(0, chh - gap)}
                          rx={radius}
                          fill={fill}
                          stroke={exact ? accent : mode === "passfail" ? withAlpha(ok ? p.ok : p.bad, 0.4) : p.border}
                          strokeWidth={exact ? 1.6 : 0.75}
                          initial={{ opacity: 0, scale: 0.55 }}
                          animate={{
                            opacity: inView ? (dimmed ? 0.34 : 1) : 0,
                            scale: inView ? (exact ? 1.05 : 1) : 0.55,
                          }}
                          transition={{
                            opacity: { duration: reduced ? 0 : 0.4, delay: hover ? 0 : orderDelay(r, c) },
                            scale: {
                              duration: reduced ? 0 : exact ? 0.18 : 0.46,
                              delay: hover ? 0 : orderDelay(r, c),
                              ease: [0.22, 1, 0.36, 1],
                            },
                          }}
                          style={{ transformOrigin: `${cx}px ${cy}px`, cursor: "pointer" }}
                          onMouseMove={(e) => {
                            const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                            setHover({ r, c, x: e.clientX - box.left, y: e.clientY - box.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />

                        {mode === "score"
                          ? Math.min(cw, chh) > 22 && (
                              <motion.text
                                x={cx}
                                y={cy}
                                dy="0.34em"
                                textAnchor="middle"
                                fill={textOn(v)}
                                className="font-mono tabular-nums pointer-events-none"
                                style={{ fontSize }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: inView ? (dimmed ? 0.45 : 1) : 0 }}
                                transition={{ duration: reduced ? 0 : 0.4, delay: hover ? 0 : orderDelay(r, c) + 0.16 }}
                              >
                                {round(v * 100, 0)}
                              </motion.text>
                            )
                          : Math.min(cw, chh) > 18 && (
                              <motion.g
                                className="pointer-events-none"
                                initial={{ opacity: 0, scale: 0.4 }}
                                animate={{
                                  opacity: inView ? (dimmed ? 0.5 : 1) : 0,
                                  scale: inView ? 1 : 0.4,
                                }}
                                transition={{
                                  duration: reduced ? 0 : 0.42,
                                  delay: hover ? 0 : orderDelay(r, c) + 0.14,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                                style={{ transformOrigin: `${cx}px ${cy}px` }}
                              >
                                {ok ? (
                                  <path
                                    d={`M ${cx - glyph} ${cy + glyph * 0.12} L ${cx - glyph * 0.32} ${cy + glyph * 0.78} L ${cx + glyph} ${cy - glyph * 0.78}`}
                                    fill="none"
                                    stroke={p.ok}
                                    strokeWidth={Math.max(1.6, glyph * 0.34)}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                ) : (
                                  <g
                                    stroke={p.bad}
                                    strokeWidth={Math.max(1.6, glyph * 0.34)}
                                    strokeLinecap="round"
                                  >
                                    <line x1={cx - glyph * 0.72} y1={cy - glyph * 0.72} x2={cx + glyph * 0.72} y2={cy + glyph * 0.72} />
                                    <line x1={cx + glyph * 0.72} y1={cy - glyph * 0.72} x2={cx - glyph * 0.72} y2={cy + glyph * 0.72} />
                                  </g>
                                )}
                              </motion.g>
                            )}
                      </g>
                    );
                  }),
                )}

                {/* Outer frame */}
                <rect
                  x={0}
                  y={0}
                  width={gridW}
                  height={gridH}
                  fill="none"
                  stroke={p.borderStrong}
                  strokeWidth={1}
                  rx={radius}
                  className="pointer-events-none"
                />

                {/* Per-task (row) summary strip on the right */}
                {showSummaries &&
                  rowMean.map((m, r) => {
                    const y = r * chh;
                    const sx = gridW + summaryGap;
                    const active = hover?.r === r;
                    return (
                      <g key={`rs-${token}-${r}`} className="pointer-events-none">
                        <motion.rect
                          x={sx}
                          y={y + gap / 2}
                          width={sw}
                          height={Math.max(0, chh - gap)}
                          rx={Math.min(4, radius)}
                          fill={cellFill(m)}
                          stroke={active ? accent : p.border}
                          strokeWidth={active ? 1.4 : 0.6}
                          initial={{ opacity: 0, x: sx + 8 }}
                          animate={{ opacity: inView ? (active ? 1 : 0.92) : 0, x: sx }}
                          transition={{
                            duration: reduced ? 0 : 0.45,
                            delay: reduced ? 0 : (r / Math.max(1, nRows)) * (duration / 1000) * 0.6 + 0.2,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                      </g>
                    );
                  })}
                {showSummaries && (
                  <text
                    x={gridW + summaryGap + sw / 2}
                    y={-12}
                    textAnchor="middle"
                    fill={p.inkFaint}
                    className="font-mono uppercase"
                    style={{ fontSize: 8.5, letterSpacing: "0.1em" }}
                  >
                    avg
                  </text>
                )}

                {/* Per-model (column) summary strip along the bottom */}
                {showSummaries &&
                  colMean.map((m, c) => {
                    const x = c * cw;
                    const sy = gridH + summaryGap;
                    const active = hover?.c === c;
                    return (
                      <g key={`cs-${token}-${c}`} className="pointer-events-none">
                        <motion.rect
                          x={x + gap / 2}
                          y={sy}
                          width={Math.max(0, cw - gap)}
                          height={sw}
                          rx={Math.min(4, radius)}
                          fill={cellFill(m)}
                          stroke={active ? accent : p.border}
                          strokeWidth={active ? 1.4 : 0.6}
                          initial={{ opacity: 0, y: sy + 8 }}
                          animate={{ opacity: inView ? (active ? 1 : 0.92) : 0, y: sy }}
                          transition={{
                            duration: reduced ? 0 : 0.45,
                            delay: reduced ? 0 : (c / Math.max(1, nCols)) * (duration / 1000) * 0.6 + 0.2,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                        <text
                          x={x + cw / 2}
                          y={sy + sw / 2}
                          dy="0.34em"
                          textAnchor="middle"
                          fill={textOn(m)}
                          className="font-mono tabular-nums pointer-events-none"
                          style={{ fontSize: Math.min(9.5, tickFont) }}
                        >
                          {round(m * 100, 0)}
                        </text>
                      </g>
                    );
                  })}
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* Footer readout */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-label text-ink-faint">
          <span>
            mean <span className="tabular-nums text-ink-muted">{round(overallMean * 100, 1)}</span>
          </span>
          <span className="text-border-strong">/</span>
          <span>
            pass{" "}
            <span className="tabular-nums text-ink-muted">
              {passCount}/{totalCells}
            </span>{" "}
            <span className="tabular-nums text-ink-muted">({round(totalCells ? (passCount / totalCells) * 100 : 0, 0)}%)</span>
          </span>
          <span className="text-border-strong">/</span>
          <span>{mode === "passfail" ? `threshold ${round(passThreshold * 100, 0)}` : "score 0–100"}</span>
        </div>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {rowLabels[hover.r]} {"·"} {colLabels[hover.c]}
              </div>
              <TooltipRow label="score" value={round(score(hover.r, hover.c) * 100, 1)} />
              <TooltipRow
                label="result"
                value={
                  <span style={{ color: passed(hover.r, hover.c) ? p.ok : p.bad }}>
                    {passed(hover.r, hover.c) ? "pass" : "fail"}
                  </span>
                }
              />
              <TooltipRow label="task avg" value={round(rowMean[hover.r] * 100, 1)} />
              <TooltipRow label="model avg" value={round(colMean[hover.c] * 100, 1)} />
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
  id: "eval-grid",
  name: "Eval Grid",
  category: "ml-eval",
  description:
    "A tasks × models capability grid as a heatmap of rounded cells — score ramp or pass/fail glyphs — with per-task and per-model summary strips, a wave reveal, and crosshair hover.",
  tags: ["eval", "benchmark", "grid", "heatmap", "capability", "pass-fail", "models"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "EvalGrid",
  sourcePath: "ml-eval/EvalGrid",
  aspect: 1.42,
  controls: [
    {
      key: "tasks",
      label: "Tasks (rows)",
      type: "json",
      group: "Data",
      help: "Array of task labels (string[]).",
      default: ["Math reasoning", "Code generation", "Tool use", "Long-context QA", "Multimodal", "Safety refusals"],
    },
    {
      key: "models",
      label: "Models (columns)",
      type: "json",
      group: "Data",
      help: "Array of model labels (string[]).",
      default: ["Aria-L", "Atlas-3", "Nova-2", "Vega-4"],
    },
    {
      key: "scores",
      label: "Scores",
      type: "matrix",
      group: "Data",
      help: "tasks × models matrix of scores in [0,1].",
      default: [
        [0.91, 0.88, 0.83, 0.71],
        [0.86, 0.9, 0.79, 0.68],
        [0.82, 0.77, 0.74, 0.55],
        [0.79, 0.74, 0.81, 0.62],
        [0.74, 0.81, 0.86, 0.49],
        [0.96, 0.93, 0.9, 0.84],
      ],
    },
    {
      key: "mode",
      label: "Cell mode",
      type: "select",
      group: "Layout",
      default: "score",
      options: [
        { value: "score", label: "Score (heatmap)" },
        { value: "passfail", label: "Pass / fail" },
      ],
    },
    { key: "showSummaries", label: "Summary strips", type: "boolean", group: "Layout", default: true },
    {
      key: "passThreshold",
      label: "Pass threshold",
      type: "number",
      group: "Style",
      default: 0.75,
      min: 0,
      max: 1,
      step: 0.01,
    },
    { key: "color", label: "Heat color", type: "color", group: "Style", default: "" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1000, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "capability-grid",
      name: "Capability grid",
      props: {
        title: "Capability grid — 6 tasks × 4 models",
        caption: "Normalized score (0–100) on the internal eval suite; cells shaded by performance.",
        source: "eval harness · val split",
        mode: "score",
        tasks: ["Math reasoning", "Code generation", "Tool use", "Long-context QA", "Multimodal", "Safety refusals"],
        models: ["Aria-L", "Atlas-3", "Nova-2", "Vega-4"],
        scores: [
          [0.91, 0.88, 0.83, 0.71],
          [0.86, 0.9, 0.79, 0.68],
          [0.82, 0.77, 0.74, 0.55],
          [0.79, 0.74, 0.81, 0.62],
          [0.74, 0.81, 0.86, 0.49],
          [0.96, 0.93, 0.9, 0.84],
        ],
      },
    },
    {
      id: "passfail",
      name: "Pass / fail matrix",
      props: {
        title: "Regression suite — pass / fail",
        caption: "Each cell passes when the score clears the 0.80 threshold.",
        mode: "passfail",
        passThreshold: 0.8,
        showSummaries: false,
        tasks: ["JSON schema", "Citations", "Refusal policy", "Multi-turn", "Latency SLA"],
        models: ["v1.2", "v1.3", "v1.4-rc", "v1.4"],
        scores: [
          [0.92, 0.95, 0.97, 0.98],
          [0.71, 0.83, 0.88, 0.91],
          [0.85, 0.79, 0.94, 0.96],
          [0.63, 0.74, 0.82, 0.89],
          [0.88, 0.86, 0.72, 0.81],
        ],
      },
    },
    {
      id: "agents",
      name: "Agent task suite",
      props: {
        title: "Agentic task suite",
        caption: "End-to-end success rate across long-horizon agent tasks.",
        mode: "score",
        passThreshold: 0.6,
        tasks: ["Web research", "Spreadsheet ops", "Code repair", "Browser nav", "Email triage", "Data cleaning", "API orchestration"],
        models: ["Scaffold A", "Scaffold B", "Scaffold C"],
        scores: [
          [0.74, 0.68, 0.81],
          [0.62, 0.71, 0.66],
          [0.69, 0.58, 0.77],
          [0.55, 0.64, 0.6],
          [0.83, 0.79, 0.85],
          [0.48, 0.52, 0.63],
          [0.71, 0.66, 0.74],
        ],
      },
    },
  ],
};
