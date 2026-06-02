"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  ReplayButton,
  cn,
  formatCompact,
  mapRange,
  usePalette,
  useInView,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

type ColType = "text" | "number";

interface Column {
  key: string;
  label: string;
  type?: ColType;
  /** Render an inline mini-bar in this numeric column. */
  bar?: boolean;
}

type Row = Record<string, string | number>;

type SortDir = "asc" | "desc";

export interface DataTableProps {
  columns?: Column[];
  rows?: Row[];
  title?: string;
  caption?: string;
  source?: string;
  /** Key of a numeric column to heat-shade with the accent color. */
  heatColumn?: string;
  /** Initial sort column key (empty = original order). */
  sortKey?: string;
  zebra?: boolean;
  color?: string;
  duration?: number;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export default function DataTable({
  columns = [
    { key: "checkpoint", label: "Checkpoint", type: "text" },
    { key: "value_r2", label: "Value R²", type: "number", bar: true },
    { key: "prm_r2", label: "PRM R²", type: "number", bar: true },
    { key: "recall_10", label: "Recall@10", type: "number" },
  ],
  rows = [
    { checkpoint: "step-2k", value_r2: 0.412, prm_r2: 0.388, recall_10: 0.541 },
    { checkpoint: "step-8k", value_r2: 0.673, prm_r2: 0.602, recall_10: 0.708 },
    { checkpoint: "step-16k", value_r2: 0.781, prm_r2: 0.744, recall_10: 0.802 },
    { checkpoint: "step-32k", value_r2: 0.844, prm_r2: 0.812, recall_10: 0.861 },
    { checkpoint: "step-64k", value_r2: 0.879, prm_r2: 0.857, recall_10: 0.893 },
  ],
  title = "",
  caption = "",
  source = "",
  heatColumn = "recall_10",
  sortKey = "",
  zebra = true,
  color = "",
  duration = 700,
}: DataTableProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<number | null>(null);

  const cols = columns ?? [];
  const baseRows = rows ?? [];

  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(
    sortKey ? { key: sortKey, dir: "desc" } : null,
  );

  // Per-column numeric extents drive mini-bars and heat shading.
  const extents = useMemo(() => {
    const out: Record<string, { min: number; max: number }> = {};
    for (const c of cols) {
      if (c.type !== "number") continue;
      const vals = baseRows.map((r) => r[c.key]).filter(isNum) as number[];
      if (vals.length) out[c.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    return out;
  }, [cols, baseRows]);

  const sortedRows = useMemo(() => {
    if (!sort) return baseRows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...baseRows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (isNum(av) && isNum(bv)) return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [baseRows, sort]);

  const toggleSort = (key: string) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "desc" };
      if (cur.dir === "desc") return { key, dir: "asc" };
      return null; // third click clears sort → original order
    });
  };

  const fmt = (v: string | number, type?: ColType) => {
    if (type === "number" && isNum(v)) {
      if (Math.abs(v) >= 1000) return formatCompact(v, 1);
      return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
    }
    return String(v ?? "");
  };

  const heatExt = heatColumn ? extents[heatColumn] : undefined;
  const baseDelay = reduced ? 0 : 0.16;
  const stepDelay = reduced ? 0 : Math.min(0.06, (duration / 1000) / Math.max(1, sortedRows.length));

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="group/table relative">
        <div className="overflow-x-auto rounded-reviz border border-border bg-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border-strong bg-surface-alt/60">
                {cols.map((c) => {
                  const active = sort?.key === c.key;
                  const numeric = c.type === "number";
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={cn(
                        "select-none px-3.5 py-2.5 align-bottom",
                        numeric ? "text-right" : "text-left",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label transition-colors",
                          numeric && "flex-row-reverse",
                          active ? "text-ink" : "text-ink-muted hover:text-ink",
                        )}
                      >
                        <span>{c.label}</span>
                        <span
                          className={cn(
                            "transition-opacity",
                            active ? "opacity-100" : "opacity-0 group-hover/table:opacity-50",
                          )}
                          style={{ color: active ? accent : undefined }}
                        >
                          {active ? (
                            sort!.dir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3" />
                          )}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, ri) => {
                const isHover = hover === ri;
                return (
                  <motion.tr
                    key={`${token}-${ri}-${String(row[cols[0]?.key] ?? ri)}`}
                    initial={{ opacity: 0, x: reduced ? 0 : -10 }}
                    animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: reduced ? 0 : -10 }}
                    transition={{
                      duration: reduced ? 0 : Math.max(0.2, duration / 1000),
                      delay: baseDelay + ri * stepDelay,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    onMouseEnter={() => setHover(ri)}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      "border-b border-border/70 transition-colors last:border-b-0",
                      zebra && ri % 2 === 1 && "bg-surface-alt/35",
                    )}
                    style={isHover ? { backgroundColor: withAlpha(accent, 0.08) } : undefined}
                  >
                    {cols.map((c, ci) => {
                      const raw = row[c.key];
                      const numeric = c.type === "number";
                      const ext = extents[c.key];

                      // Heat shading: tint the cell background toward accent.
                      let cellBg: string | undefined;
                      if (heatColumn && c.key === heatColumn && heatExt && isNum(raw)) {
                        const t = mapRange(raw, heatExt.min, heatExt.max, 0.06, 0.42);
                        cellBg = withAlpha(accent, clampAlpha(t));
                      }

                      return (
                        <td
                          key={c.key}
                          className={cn(
                            "px-3.5 py-2.5 align-middle",
                            numeric
                              ? "text-right font-mono text-[12.5px] tabular-nums text-ink"
                              : "text-left",
                            ci === 0 && "font-mono text-[12px] text-ink",
                            !numeric && ci !== 0 && "font-sans text-[13px] text-ink-muted",
                          )}
                          style={cellBg ? { backgroundColor: cellBg } : undefined}
                        >
                          {c.bar && numeric && ext && isNum(raw) ? (
                            <MiniBar
                              value={raw}
                              min={ext.min}
                              max={ext.max}
                              label={fmt(raw, c.type)}
                              color={accent}
                              track={p.surfaceAlt}
                              inView={inView}
                              reduced={reduced}
                              duration={duration}
                              delay={baseDelay + ri * stepDelay + 0.05}
                              token={token}
                            />
                          ) : (
                            <span>{fmt(raw, c.type)}</span>
                          )}
                        </td>
                      );
                    })}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            {sortedRows.length} rows
            {sort && (
              <>
                {" · sorted by "}
                <span style={{ color: accent }}>
                  {cols.find((c) => c.key === sort.key)?.label ?? sort.key} {sort.dir}
                </span>
              </>
            )}
          </span>
          <ReplayButton
            onClick={replay}
            label="Replay"
            className="opacity-0 transition-opacity group-hover/table:opacity-100"
          />
        </div>
      </div>
    </Figure>
  );
}

function clampAlpha(t: number) {
  return Math.max(0, Math.min(0.5, t));
}

function MiniBar({
  value,
  min,
  max,
  label,
  color,
  track,
  inView,
  reduced,
  duration,
  delay,
  token,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  color: string;
  track: string;
  inView: boolean;
  reduced: boolean;
  duration: number;
  delay: number;
  token: number;
}) {
  // Bar fills relative to the column max; floor at the column min so all bars are visible.
  const lo = Math.min(min, 0);
  const pct = max === lo ? 100 : mapRange(value, lo, max, 6, 100);
  return (
    <div className="flex items-center justify-end gap-2.5">
      <span className="tabular-nums">{label}</span>
      <div
        className="relative h-1.5 w-16 overflow-hidden rounded-full"
        style={{ backgroundColor: withAlpha(track, 0.9) }}
        aria-hidden
      >
        <motion.div
          key={token}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${withAlpha(color, 0.65)}, ${color})` }}
          initial={{ width: reduced ? `${pct}%` : 0 }}
          animate={{ width: inView ? `${pct}%` : 0 }}
          transition={{ duration: reduced ? 0 : Math.max(0.25, duration / 1000), delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

export const meta: RevizMeta = {
  id: "data-table",
  name: "Data Table",
  category: "data-display",
  description:
    "A sortable, animated results table with mono headers, tabular numerals, inline mini-bars, and heat-shaded columns — turns a raw eval dump into a publishable figure.",
  tags: ["table", "results", "leaderboard", "sortable", "tabular"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "DataTable",
  sourcePath: "data-display/DataTable",
  aspect: 16 / 10,
  controls: [
    {
      key: "columns",
      label: "Columns",
      type: "json",
      group: "Data",
      help: "Array of { key, label, type: 'text'|'number', bar?: boolean }.",
      default: [
        { key: "checkpoint", label: "Checkpoint", type: "text" },
        { key: "value_r2", label: "Value R²", type: "number", bar: true },
        { key: "prm_r2", label: "PRM R²", type: "number", bar: true },
        { key: "recall_10", label: "Recall@10", type: "number" },
      ],
    },
    {
      key: "rows",
      label: "Rows",
      type: "json",
      group: "Data",
      help: "Array of row objects keyed by column key.",
      default: [
        { checkpoint: "step-2k", value_r2: 0.412, prm_r2: 0.388, recall_10: 0.541 },
        { checkpoint: "step-8k", value_r2: 0.673, prm_r2: 0.602, recall_10: 0.708 },
        { checkpoint: "step-16k", value_r2: 0.781, prm_r2: 0.744, recall_10: 0.802 },
        { checkpoint: "step-32k", value_r2: 0.844, prm_r2: 0.812, recall_10: 0.861 },
        { checkpoint: "step-64k", value_r2: 0.879, prm_r2: 0.857, recall_10: 0.893 },
      ],
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "heatColumn",
      label: "Heat column",
      type: "text",
      group: "Style",
      help: "Column key to heat-shade with the accent color (empty = none).",
      default: "recall_10",
    },
    {
      key: "sortKey",
      label: "Initial sort column",
      type: "text",
      group: "Layout",
      help: "Column key to sort by on load (empty = original order).",
      default: "",
    },
    { key: "zebra", label: "Zebra rows", type: "boolean", group: "Style", default: true },
    { key: "color", label: "Accent color", type: "color", group: "Style", default: "" },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 700, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "training-results",
      name: "Training results",
      props: {
        title: "Reward-model checkpoints",
        caption: "Validation fit and retrieval recall across training steps.",
        source: "internal eval · 2026-05",
        heatColumn: "recall_10",
        sortKey: "value_r2",
      },
    },
    {
      id: "latency-leaderboard",
      name: "Latency leaderboard",
      props: {
        title: "Serving latency by model",
        caption: "p50 / p99 latency and throughput on the production fleet.",
        heatColumn: "p99_ms",
        sortKey: "p99_ms",
        columns: [
          { key: "model", label: "Model", type: "text" },
          { key: "p50_ms", label: "p50 (ms)", type: "number", bar: true },
          { key: "p99_ms", label: "p99 (ms)", type: "number", bar: true },
          { key: "rps", label: "RPS", type: "number" },
        ],
        rows: [
          { model: "Aria-L", p50_ms: 412, p99_ms: 1180, rps: 86 },
          { model: "Aria-M", p50_ms: 168, p99_ms: 540, rps: 214 },
          { model: "Aria-S", p50_ms: 61, p99_ms: 198, rps: 612 },
          { model: "Distill-7B", p50_ms: 39, p99_ms: 142, rps: 940 },
        ],
      },
    },
  ],
};
