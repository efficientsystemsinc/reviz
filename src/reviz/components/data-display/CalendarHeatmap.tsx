"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  TooltipRow,
  mix,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface DayDatum {
  /** ISO date "YYYY-MM-DD". */
  date?: string;
  /** Activity value (any non-negative scale). */
  value?: number;
}

/** Accept either rich {date,value} records OR a bare number[] (auto-dated). */
type CalendarData = DayDatum[] | number[];

export interface CalendarHeatmapProps {
  data?: CalendarData;
  weeks?: number;
  title?: string;
  caption?: string;
  source?: string;
  color?: string;
  duration?: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MS_DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Date helpers (pure, timezone-stable via UTC)                        */
/* ------------------------------------------------------------------ */

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function fmtISO(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtLong(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function CalendarHeatmap({
  data = DEFAULT_DATA,
  weeks = 26,
  title = "Training runs per day",
  caption = "",
  source = "",
  color = "",
  duration = 1100,
}: CalendarHeatmapProps) {
  const p = usePalette();
  const accent = color || p.accent;
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  /* --- Normalize input into a dense, date-stamped grid ------------- */
  const grid = useMemo(() => buildGrid(data, weeks), [data, weeks]);
  const { cells, columns, maxValue, total, monthSpans, active } = grid;

  /* --- Sequential ramp: empty cells = faint surface, value -> accent  */
  const empty = mix(p.surfaceAlt, p.border, 0.4);
  const rampFor = (v: number) => {
    if (v <= 0) return empty;
    // 4 visible intensity steps (GitHub-style) eased toward accent.
    const t = maxValue <= 0 ? 0 : v / maxValue;
    const step = t <= 0.25 ? 0.3 : t <= 0.5 ? 0.52 : t <= 0.75 ? 0.76 : 1;
    return mix(mix(empty, accent, 0.18), accent, step);
  };

  /* --- Geometry: square cells with a small gutter ------------------ */
  const GAP = 3;
  const CELL = 13;
  const STEP = CELL + GAP;
  const LEFT = 30; // weekday gutter
  const TOP = 18; // month-label band
  const gridW = columns * STEP - GAP;
  const gridH = 7 * STEP - GAP;
  const width = LEFT + gridW + 4;
  const height = TOP + gridH + 6;

  /* --- Wave timing: diagonal sweep from top-left ------------------- */
  const baseDur = Math.max(0, duration) / 1000;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            role="img"
            aria-label={title || "Calendar heatmap"}
            style={{ display: "block", overflow: "visible", minWidth: width * 0.62 }}
          >
            {/* Month labels along the top */}
            {monthSpans.map((m) => (
              <text
                key={`${m.label}-${m.col}`}
                x={LEFT + m.col * STEP}
                y={TOP - 7}
                className="font-mono text-[9px] uppercase"
                style={{ letterSpacing: "0.04em" }}
                fill={p.inkFaint}
              >
                {m.label}
              </text>
            ))}

            {/* Weekday labels on the left (Mon/Wed/Fri, GitHub convention) */}
            {[1, 3, 5].map((wd) => (
              <text
                key={wd}
                x={LEFT - 8}
                y={TOP + wd * STEP + CELL / 2}
                dy="0.32em"
                textAnchor="end"
                className="font-mono text-[9px]"
                fill={p.inkFaint}
              >
                {WEEKDAYS[wd]}
              </text>
            ))}

            {/* Day cells */}
            {cells.map((c, i) => {
              const x = LEFT + c.col * STEP;
              const y = TOP + c.row * STEP;
              const fill = c.future ? "transparent" : rampFor(c.value);
              const isHover = hover?.i === i;
              const wave = (c.col + c.row) / (columns + 7);
              const delay = reduced ? 0 : baseDur * 0.55 * wave;
              return (
                <motion.rect
                  key={`${token}-${i}`}
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  ry={3}
                  fill={fill}
                  stroke={c.future ? "transparent" : isHover ? accent : withAlpha(p.ink, 0.06)}
                  strokeWidth={isHover ? 1.5 : 1}
                  initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                  animate={
                    inView
                      ? { opacity: c.future ? 0.0 : 1, scale: 1 }
                      : reduced
                        ? { opacity: c.future ? 0 : 1, scale: 1 }
                        : { opacity: 0, scale: 0.4 }
                  }
                  transition={{
                    duration: reduced ? 0 : 0.42,
                    delay,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{ transformOrigin: `${x + CELL / 2}px ${y + CELL / 2}px`, cursor: c.future ? "default" : "pointer" }}
                  onMouseMove={(e) => {
                    if (c.future) return;
                    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </svg>
        </div>

        {/* Footer: summary + legend + replay */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
            {total.toLocaleString()} events · {active} active {active === 1 ? "day" : "days"}
          </span>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-label text-ink-faint">Less</span>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <span
                  key={t}
                  className="inline-block h-3 w-3 rounded-[3px]"
                  style={{
                    background: t === 0 ? empty : mix(mix(empty, accent, 0.18), accent, t === 0.25 ? 0.3 : t === 0.5 ? 0.52 : t === 0.75 ? 0.76 : 1),
                    boxShadow: `inset 0 0 0 1px ${withAlpha(p.ink, 0.06)}`,
                  }}
                />
              ))}
              <span className="font-mono text-[9px] uppercase tracking-label text-ink-faint">More</span>
            </div>
            <ReplayButton onClick={replay} className="opacity-0 transition-opacity group-hover/figure:opacity-100" />
          </div>
        </div>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && cells[hover.i] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {fmtLong(cells[hover.i].ms)}
              </div>
              <TooltipRow
                label={cells[hover.i].value === 1 ? "event" : "events"}
                value={cells[hover.i].value.toLocaleString()}
              />
            </>
          )}
        </FloatingTooltip>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Grid construction                                                   */
/* ------------------------------------------------------------------ */

interface Cell {
  ms: number;
  value: number;
  row: number; // 0..6 (day of week, Sun=0)
  col: number; // week index 0..columns-1
  future: boolean;
}

function buildGrid(data: CalendarData, weeks: number) {
  const w = Math.max(1, Math.round(weeks));
  const days = w * 7;

  // Map of ISO date -> value.
  const byDate = new Map<string, number>();
  let total = 0;
  let active = 0;

  const isNumeric = Array.isArray(data) && data.every((d) => typeof d === "number");

  if (isNumeric) {
    // Bare number[] — auto-date ending today (UTC), most-recent last.
    const vals = data as number[];
    const today = Math.floor(Date.now() / MS_DAY) * MS_DAY;
    const startMs = today - (vals.length - 1) * MS_DAY;
    vals.forEach((v, i) => {
      const ms = startMs + i * MS_DAY;
      byDate.set(fmtISO(ms), Math.max(0, v || 0));
    });
  } else {
    (data as DayDatum[]).forEach((d) => {
      if (!d || !d.date) return;
      byDate.set(d.date, Math.max(0, d.value || 0));
    });
  }

  // End the calendar on the most recent date present (else today, UTC).
  let endMs: number;
  if (byDate.size > 0) {
    endMs = Math.max(...Array.from(byDate.keys()).map(toUTC));
  } else {
    endMs = Math.floor(Date.now() / MS_DAY) * MS_DAY;
  }

  // Align the final column to its Saturday so the grid reads as full weeks.
  const endDow = new Date(endMs).getUTCDay();
  const lastColEnd = endMs + (6 - endDow) * MS_DAY;
  const firstDayMs = lastColEnd - (days - 1) * MS_DAY;

  const cells: Cell[] = [];
  for (let i = 0; i < days; i++) {
    const ms = firstDayMs + i * MS_DAY;
    const iso = fmtISO(ms);
    const value = byDate.get(iso) ?? 0;
    const future = ms > endMs;
    cells.push({
      ms,
      value,
      row: new Date(ms).getUTCDay(),
      col: Math.floor(i / 7),
      future,
    });
    if (!future) {
      total += value;
      if (value > 0) active += 1;
    }
  }

  const columns = w;
  const maxValue = Math.max(0, ...cells.filter((c) => !c.future).map((c) => c.value));

  // Month labels: anchor each label to the first column the month *dominates*
  // (>=4 of its 7 days), not merely the column its 1st falls in. This keeps the
  // label aligned to the visual block of the month and never skips a month that
  // owns a full set of columns (e.g. December between Nov and Jan).
  const colMonth = (col: number): number => {
    const counts = new Array(12).fill(0);
    for (let k = 0; k < 7; k++) {
      const cell = cells[col * 7 + k];
      if (cell) counts[new Date(cell.ms).getUTCMonth()] += 1;
    }
    let best = 0;
    for (let m = 1; m < 12; m++) if (counts[m] > counts[best]) best = m;
    return best;
  };
  const monthSpans: { label: string; col: number }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < columns; col++) {
    if (!cells[col * 7]) continue;
    const month = colMonth(col);
    if (month !== lastMonth) {
      // Suppress a single-column partial remnant at the very start so the first
      // label isn't crowded against the left edge.
      const partialStart = col === 0 && columns > 1 && colMonth(1) !== month;
      if (!partialStart) monthSpans.push({ label: MONTHS[month], col });
      lastMonth = month;
    }
  }

  return { cells, columns, maxValue, total, active, monthSpans };
}

/* ------------------------------------------------------------------ */
/* Default data — ~26 weeks of plausible ML training activity          */
/* ------------------------------------------------------------------ */

function makeActivity(nDays: number, seed: number): DayDatum[] {
  // Deterministic pseudo-random walk with weekday bias + a couple of sprints.
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const today = Math.floor(Date.UTC(2026, 4, 30) / MS_DAY) * MS_DAY; // fixed for stable presets
  const out: DayDatum[] = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const ms = today - i * MS_DAY;
    const dow = new Date(ms).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const base = weekend ? 0.35 : 1;
    // Two crunch periods get visibly hotter.
    const day = nDays - 1 - i;
    const sprint = (day > 45 && day < 60) || (day > 120 && day < 138) ? 2.1 : 1;
    const roll = rnd();
    let v = 0;
    if (roll > 0.22 * (weekend ? 1.8 : 1)) {
      v = Math.round(rnd() * 9 * base * sprint + rnd() * 2);
    }
    out.push({ date: fmtISO(ms), value: v });
  }
  return out;
}

const DEFAULT_DATA: DayDatum[] = makeActivity(26 * 7, 20260530);

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "calendar-heatmap",
  name: "Calendar Heatmap",
  category: "data-display",
  description:
    "A GitHub-contributions-style calendar where each day's color intensity tracks activity, sweeping in on a diagonal wave with month and weekday guides.",
  tags: ["calendar", "heatmap", "activity", "contributions", "time-series"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "CalendarHeatmap",
  sourcePath: "data-display/CalendarHeatmap",
  aspect: 16 / 6,
  controls: [
    {
      key: "data",
      label: "Activity",
      type: "json",
      group: "Data",
      help: 'Either [{ "date": "YYYY-MM-DD", "value": n }] or a bare number[] (auto-dated, most recent last).',
      default: DEFAULT_DATA,
    },
    {
      key: "weeks",
      label: "Weeks",
      type: "number",
      group: "Layout",
      default: 26,
      min: 4,
      max: 53,
      step: 1,
      unit: "wk",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Training runs per day" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "color", label: "Ramp color", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
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
      id: "training",
      name: "Training activity",
      props: {
        title: "Training runs per day",
        caption: "Diagonal wave reveals two clear crunch periods before launch.",
        source: "cluster · 26 wk",
      },
    },
    {
      id: "commits",
      name: "Code velocity",
      props: {
        title: "Commits to model repo",
        weeks: 26,
        data: makeActivity(26 * 7, 991),
        caption: "Weekday-biased contribution rhythm across the half-year.",
      },
    },
    {
      id: "eval-uptime",
      name: "Eval job uptime",
      props: {
        title: "Eval jobs completed",
        weeks: 18,
        data: makeActivity(18 * 7, 4242),
      },
    },
  ],
};
