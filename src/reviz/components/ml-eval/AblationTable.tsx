"use client";

import { ArrowDownRight, ArrowUpRight, Pin } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  cn,
  usePalette,
  useInView,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

interface AblationRow {
  name: string;
  metrics: Record<string, number>;
  /** Marks the full / baseline configuration that deltas are measured against. */
  isBaseline?: boolean;
}

export interface AblationTableProps {
  rows?: AblationRow[];
  metricNames?: string[];
  /** When true, larger metric values are better (best cell + delta sign flip otherwise). */
  higherIsBetter?: boolean;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const fmtMetric = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 100) return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
};

const fmtDelta = (v: number): string => {
  const a = Math.abs(v);
  const digits = a >= 100 ? 1 : a >= 10 ? 2 : 3;
  const s = a.toFixed(digits);
  return `${v >= 0 ? "+" : "−"}${s}`;
};

export default function AblationTable({
  rows = [
    {
      name: "Full model (Perseus)",
      isBaseline: true,
      metrics: { success: 0.871, return: 14.62, solve_rate: 0.804, plan_depth: 9.4 },
    },
    {
      name: "− World-model head",
      metrics: { success: 0.742, return: 11.83, solve_rate: 0.661, plan_depth: 6.1 },
    },
    {
      name: "− MCTS planner",
      metrics: { success: 0.689, return: 10.04, solve_rate: 0.598, plan_depth: 1.0 },
    },
    {
      name: "− Value bootstrap",
      metrics: { success: 0.803, return: 13.11, solve_rate: 0.737, plan_depth: 8.7 },
    },
    {
      name: "− Reward shaping",
      metrics: { success: 0.828, return: 12.46, solve_rate: 0.769, plan_depth: 9.1 },
    },
  ],
  metricNames = ["success", "return", "solve_rate", "plan_depth"],
  higherIsBetter = true,
  title = "",
  caption = "",
  source = "",
  color = "",
  duration = 750,
}: AblationTableProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const { token, replay } = useReplay();

  const metrics = metricNames ?? [];
  const allRows = rows ?? [];

  // Pin the baseline/full row to the top; preserve relative order otherwise.
  const orderedRows = useMemo(() => {
    const baseIdx = allRows.findIndex((r) => r.isBaseline);
    if (baseIdx <= 0) return allRows;
    const copy = [...allRows];
    const [base] = copy.splice(baseIdx, 1);
    return [base, ...copy];
  }, [allRows]);

  const baseline = useMemo(
    () => orderedRows.find((r) => r.isBaseline) ?? orderedRows[0],
    [orderedRows],
  );

  // Best value per metric column (respecting direction of improvement).
  const bestPerMetric = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of metrics) {
      const vals = allRows.map((r) => r.metrics?.[m]).filter(isNum) as number[];
      if (!vals.length) continue;
      out[m] = higherIsBetter ? Math.max(...vals) : Math.min(...vals);
    }
    return out;
  }, [metrics, allRows, higherIsBetter]);

  // Largest absolute delta per metric — scales the chip bar widths.
  const maxAbsDelta = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of metrics) {
      const b = baseline?.metrics?.[m];
      if (!isNum(b)) continue;
      let mx = 0;
      for (const r of orderedRows) {
        const v = r.metrics?.[m];
        if (isNum(v)) mx = Math.max(mx, Math.abs(v - b));
      }
      out[m] = mx || 1;
    }
    return out;
  }, [metrics, orderedRows, baseline]);

  const labelOf = (m: string) =>
    m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const baseDelay = reduced ? 0 : 0.14;
  const stepDelay = reduced
    ? 0
    : Math.min(0.07, duration / 1000 / Math.max(1, orderedRows.length));
  const rowDur = reduced ? 0 : Math.max(0.2, duration / 1000);

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/abl relative">
        <div className="overflow-x-auto rounded-reviz border border-border bg-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border-strong bg-surface-alt/60">
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-label text-ink-muted"
                >
                  Configuration
                </th>
                {metrics.map((m) => (
                  <th
                    key={m}
                    scope="col"
                    className="px-4 py-3 text-right font-mono text-[10.5px] uppercase tracking-label text-ink-muted"
                  >
                    {labelOf(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((row, ri) => {
                const pinned = !!row.isBaseline;
                return (
                  <motion.tr
                    key={`${token}-${ri}-${row.name}`}
                    initial={{ opacity: 0, x: reduced ? 0 : -12 }}
                    animate={
                      inView
                        ? { opacity: 1, x: 0 }
                        : { opacity: 0, x: reduced ? 0 : -12 }
                    }
                    transition={{
                      duration: rowDur,
                      delay: baseDelay + ri * stepDelay,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={cn(
                      "border-b border-border/70 last:border-b-0",
                      pinned && "bg-surface-alt/45",
                    )}
                    style={
                      pinned
                        ? { boxShadow: `inset 3px 0 0 0 ${accent}` }
                        : undefined
                    }
                  >
                    {/* Configuration name */}
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2">
                        {pinned && (
                          <Pin
                            className="h-3 w-3 shrink-0"
                            style={{ color: accent }}
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            "font-mono text-[12.5px]",
                            pinned ? "font-semibold text-ink" : "text-ink",
                          )}
                        >
                          {row.name}
                        </span>
                        {pinned && (
                          <span className="ml-0.5 rounded-full bg-accent/12 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-label text-accent">
                            Full
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Metric cells */}
                    {metrics.map((m) => {
                      const raw = row.metrics?.[m];
                      const base = baseline?.metrics?.[m];
                      const isBest =
                        isNum(raw) && isNum(bestPerMetric[m]) &&
                        Math.abs(raw - bestPerMetric[m]) < 1e-9;
                      const delta =
                        isNum(raw) && isNum(base) ? raw - base : null;
                      const improved =
                        delta === null
                          ? false
                          : higherIsBetter
                            ? delta > 0
                            : delta < 0;
                      const chipColor = improved ? p.ok : p.bad;
                      const barPct =
                        delta === null
                          ? 0
                          : Math.min(
                              100,
                              (Math.abs(delta) / (maxAbsDelta[m] || 1)) * 100,
                            );

                      return (
                        <td
                          key={m}
                          className="px-4 py-3 text-right align-middle"
                          style={
                            isBest
                              ? { backgroundColor: withAlpha(accent, 0.1) }
                              : undefined
                          }
                        >
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={cn(
                                "font-mono text-[12.5px] tabular-nums",
                                isBest ? "font-semibold" : "text-ink",
                              )}
                              style={isBest ? { color: accent } : undefined}
                            >
                              {isNum(raw) ? fmtMetric(raw) : "—"}
                            </span>

                            {pinned ? (
                              <span className="font-mono text-[9px] uppercase tracking-label text-ink-faint">
                                reference
                              </span>
                            ) : delta !== null && Math.abs(delta) > 1e-9 ? (
                              <DeltaChip
                                text={fmtDelta(delta)}
                                improved={improved}
                                chipColor={chipColor}
                                barPct={barPct}
                                inView={inView}
                                reduced={reduced}
                                duration={duration}
                                delay={baseDelay + ri * stepDelay + 0.08}
                                token={token}
                              />
                            ) : (
                              <span className="font-mono text-[9px] uppercase tracking-label text-ink-faint">
                                ±0
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-label text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: withAlpha(accent, 0.55) }}
              />
              best per metric
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.ok }}
              />
              improves
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.bad }}
              />
              regresses
            </span>
            <span className="text-ink-faint/80">
              Δ vs. {baseline?.name ?? "full model"}
            </span>
          </div>
          <ReplayButton
            onClick={replay}
            label="Replay"
            className="opacity-0 transition-opacity group-hover/abl:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

function DeltaChip({
  text,
  improved,
  chipColor,
  barPct,
  inView,
  reduced,
  duration,
  delay,
  token,
}: {
  text: string;
  improved: boolean;
  chipColor: string;
  barPct: number;
  inView: boolean;
  reduced: boolean;
  duration: number;
  delay: number;
  token: number;
}) {
  const Icon = improved ? ArrowUpRight : ArrowDownRight;
  return (
    <motion.span
      key={token}
      initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 3 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: reduced ? 1 : 0, y: reduced ? 0 : 3 }}
      transition={{ duration: reduced ? 0 : 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative inline-flex items-center gap-1 overflow-hidden rounded-md px-1.5 py-0.5"
      style={{ backgroundColor: withAlpha(chipColor, 0.12) }}
    >
      {/* Magnitude bar behind the chip text. */}
      <motion.span
        className="absolute inset-y-0 left-0"
        style={{ backgroundColor: withAlpha(chipColor, 0.16) }}
        initial={{ width: reduced ? `${barPct}%` : 0 }}
        animate={{ width: inView ? `${barPct}%` : 0 }}
        transition={{
          duration: reduced ? 0 : Math.max(0.25, duration / 1000),
          delay: delay + 0.05,
          ease: [0.22, 1, 0.36, 1],
        }}
        aria-hidden
      />
      <Icon className="relative h-2.5 w-2.5" style={{ color: chipColor }} aria-hidden />
      <span
        className="relative font-mono text-[10px] tabular-nums"
        style={{ color: chipColor }}
      >
        {text}
      </span>
    </motion.span>
  );
}

export const meta: RevizMeta = {
  id: "ablation-table",
  name: "Ablation Table",
  category: "ml-eval",
  description:
    "A research-grade ablation results table: configurations as rows, metrics as columns, the best cell per metric accented, the full-model row pinned, and per-row deltas shown as colored magnitude chips.",
  tags: ["ablation", "ml-eval", "table", "results", "delta", "benchmark"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "AblationTable",
  sourcePath: "ml-eval/AblationTable",
  aspect: 16 / 10,
  controls: [
    {
      key: "rows",
      label: "Rows",
      type: "json",
      group: "Data",
      help: "Array of { name, metrics: { metricKey: number }, isBaseline?: boolean }. The baseline row is pinned and deltas are measured against it.",
      default: [
        {
          name: "Full model (Perseus)",
          isBaseline: true,
          metrics: { success: 0.871, return: 14.62, solve_rate: 0.804, plan_depth: 9.4 },
        },
        {
          name: "− World-model head",
          metrics: { success: 0.742, return: 11.83, solve_rate: 0.661, plan_depth: 6.1 },
        },
        {
          name: "− MCTS planner",
          metrics: { success: 0.689, return: 10.04, solve_rate: 0.598, plan_depth: 1.0 },
        },
        {
          name: "− Value bootstrap",
          metrics: { success: 0.803, return: 13.11, solve_rate: 0.737, plan_depth: 8.7 },
        },
        {
          name: "− Reward shaping",
          metrics: { success: 0.828, return: 12.46, solve_rate: 0.769, plan_depth: 9.1 },
        },
      ],
    },
    {
      key: "metricNames",
      label: "Metric columns",
      type: "json",
      group: "Data",
      help: "Ordered array of metric keys to show as columns (must match keys in each row's metrics).",
      default: ["success", "return", "solve_rate", "plan_depth"],
    },
    {
      key: "higherIsBetter",
      label: "Higher is better",
      type: "boolean",
      group: "Data",
      help: "Direction of improvement — flips which cell is 'best' and the sign coloring of delta chips.",
      default: true,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 750,
      min: 0,
      max: 2500,
      step: 50,
    },
  ],
  presets: [
    {
      id: "perseus-ablation",
      name: "Perseus ablation",
      props: {
        title: "Component ablation — Perseus agent",
        caption:
          "Removing each component from the full model. Best per metric is accented; deltas are vs. the full model.",
        source: "internal eval · 512 held-out tasks",
        higherIsBetter: true,
      },
    },
    {
      id: "loss-ablation",
      name: "Loss-term ablation",
      props: {
        title: "Training-objective ablation",
        caption: "Validation loss and calibration error — lower is better for both.",
        source: "pretrain sweep · 2026-05",
        higherIsBetter: false,
        metricNames: ["val_loss", "ece", "ppl"],
        rows: [
          {
            name: "Full objective",
            isBaseline: true,
            metrics: { val_loss: 1.842, ece: 0.031, ppl: 6.31 },
          },
          { name: "− Auxiliary KL", metrics: { val_loss: 1.987, ece: 0.058, ppl: 7.29 } },
          { name: "− Label smoothing", metrics: { val_loss: 1.901, ece: 0.072, ppl: 6.69 } },
          { name: "− Contrastive term", metrics: { val_loss: 2.114, ece: 0.044, ppl: 8.28 } },
          { name: "− EMA teacher", metrics: { val_loss: 1.876, ece: 0.039, ppl: 6.52 } },
        ],
      },
    },
    {
      id: "retrieval-ablation",
      name: "RAG ablation",
      props: {
        title: "Retrieval-augmented QA ablation",
        caption: "Exact-match, F1, and faithfulness with each retrieval stage removed.",
        source: "open-domain QA · dev split",
        higherIsBetter: true,
        metricNames: ["em", "f1", "faithfulness"],
        rows: [
          {
            name: "Full pipeline",
            isBaseline: true,
            metrics: { em: 0.612, f1: 0.748, faithfulness: 0.91 },
          },
          { name: "− Reranker", metrics: { em: 0.541, f1: 0.689, faithfulness: 0.84 } },
          { name: "− Query rewrite", metrics: { em: 0.573, f1: 0.712, faithfulness: 0.88 } },
          { name: "− Hybrid BM25", metrics: { em: 0.598, f1: 0.731, faithfulness: 0.9 } },
          { name: "− Dedup filter", metrics: { em: 0.604, f1: 0.739, faithfulness: 0.86 } },
        ],
      },
    },
  ],
};
