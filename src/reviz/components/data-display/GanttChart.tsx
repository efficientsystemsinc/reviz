"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  TooltipRow,
  clamp,
  mix,
  readableOn,
  uid,
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

interface Task {
  /** Row label. */
  name?: string;
  /** Start position on the time axis (in `timeUnit`s). */
  start?: number;
  /** End position on the time axis (in `timeUnit`s). */
  end?: number;
  /** Optional group / swimlane — drives the bar color. */
  group?: string;
  /** Optional completion fraction 0..1 (renders a filled overlay). */
  progress?: number;
  /** Optional zero-or-more upstream task names this one depends on. */
  deps?: string[];
  /** Render as a diamond milestone marker instead of a bar (start == end). */
  milestone?: boolean;
}

export interface GanttChartProps {
  tasks?: Task[];
  title?: string;
  caption?: string;
  source?: string;
  /** Axis unit label, e.g. "week", "sprint", "month". */
  timeUnit?: string;
  /** Position of the "today" / now marker (in `timeUnit`s). <0 hides it. */
  today?: number;
  /** Tick spacing on the time axis (in `timeUnit`s). */
  tickStep?: number;
  /** Draw dependency connectors between tasks. */
  showDeps?: boolean;
  /** Show the per-bar progress overlay. */
  showProgress?: boolean;
  /** Per-row height in px. */
  rowHeight?: number;
  /** Bar corner radius. */
  cornerRadius?: number;
  /** Override the primary color (otherwise group colors / accent). */
  color?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/* Default data — a research roadmap (M1..M16 spanning ~16 weeks)      */
/* ------------------------------------------------------------------ */

const DEFAULT_TASKS: Task[] = [
  { name: "Literature & scoping", start: 0, end: 2, group: "Research", progress: 1 },
  { name: "Data collection", start: 1, end: 5, group: "Data", progress: 1, deps: ["Literature & scoping"] },
  { name: "Data cleaning + labels", start: 4, end: 7, group: "Data", progress: 0.85, deps: ["Data collection"] },
  { name: "Baseline models", start: 3, end: 6, group: "Modeling", progress: 1, deps: ["Literature & scoping"] },
  { name: "Architecture search", start: 6, end: 10, group: "Modeling", progress: 0.55, deps: ["Baseline models", "Data cleaning + labels"] },
  { name: "Scaling runs", start: 9, end: 13, group: "Modeling", progress: 0.2, deps: ["Architecture search"] },
  { name: "Eval harness", start: 5, end: 8, group: "Eval", progress: 0.9, deps: ["Baseline models"] },
  { name: "Ablation studies", start: 10, end: 13, group: "Eval", progress: 0.1, deps: ["Scaling runs", "Eval harness"] },
  { name: "Internal review", start: 13, end: 14, group: "Writeup", progress: 0, milestone: true, deps: ["Ablation studies"] },
  { name: "Paper draft", start: 12, end: 16, group: "Writeup", progress: 0.05, deps: ["Scaling runs"] },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function GanttChart({
  tasks = DEFAULT_TASKS,
  title = "Research roadmap",
  caption = "",
  source = "",
  timeUnit = "week",
  today = 8.5,
  tickStep = 2,
  showDeps = true,
  showProgress = true,
  rowHeight = 34,
  cornerRadius = 5,
  color = "",
  duration = 1100,
}: GanttChartProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const gradId = useMemo(() => uid("gantt"), []);

  /* --- Normalize tasks + assign stable group colors ---------------- */
  const { rows, groups, domainMin, domainMax, indexByName } = useMemo(() => {
    const safe = (Array.isArray(tasks) ? tasks : []).filter(Boolean);
    const groupOrder: string[] = [];
    for (const t of safe) {
      const g = t.group || "—";
      if (!groupOrder.includes(g)) groupOrder.push(g);
    }
    const rows = safe.map((t, i) => {
      const s = Number(t.start ?? 0);
      const eRaw = Number(t.end ?? s);
      const e = Math.max(eRaw, s);
      const isMilestone = t.milestone || e === s;
      return {
        i,
        name: t.name || `Task ${i + 1}`,
        start: s,
        end: e,
        group: t.group || "—",
        progress: clamp(Number(t.progress ?? 0), 0, 1),
        deps: Array.isArray(t.deps) ? t.deps : [],
        milestone: isMilestone,
      };
    });
    const indexByName = new Map<string, number>();
    rows.forEach((r) => indexByName.set(r.name, r.i));
    const starts = rows.map((r) => r.start);
    const ends = rows.map((r) => r.end);
    const domainMin = rows.length ? Math.min(...starts) : 0;
    const domainMax = rows.length ? Math.max(...ends) : 1;
    return { rows, groups: groupOrder, domainMin, domainMax, indexByName };
  }, [tasks]);

  const colorForGroup = (group: string): string => {
    if (color) return color;
    if (groups.length <= 1) return p.accent;
    const idx = groups.indexOf(group);
    return p.series[(idx + p.series.length) % p.series.length] || p.accent;
  };

  /* --- Geometry ----------------------------------------------------- */
  const GAP_Y = 8; // gap between rows
  const labelW = 168;
  const padTop = 28; // axis band
  const padBottom = 18;
  const padRight = 18;
  const plotLeft = labelW;
  const plotH = rows.length * (rowHeight + GAP_Y) - GAP_Y;
  const height = padTop + Math.max(plotH, 0) + padBottom;

  // Add a little headroom on the right so the last tick label fits.
  const span = Math.max(1e-6, domainMax - domainMin);
  const dMin = domainMin;
  const dMax = domainMax + span * 0.02;

  const baseDur = Math.max(0, duration) / 1000;

  /* --- Time ticks --------------------------------------------------- */
  const ticks = useMemo(() => {
    const step = Math.max(0.0001, tickStep);
    const out: number[] = [];
    const first = Math.ceil(dMin / step) * step;
    for (let t = first; t <= dMax + 1e-9; t += step) {
      out.push(Math.round(t * 1000) / 1000);
    }
    if (out.length === 0) out.push(dMin, dMax);
    return out;
  }, [dMin, dMax, tickStep]);

  const barH = rowHeight - 8;

  return (
    <Figure variant="plain" align="left" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 1000 ${height}`}
            width="100%"
            preserveAspectRatio="xMidYMin meet"
            role="img"
            aria-label={title || "Gantt chart"}
            style={{ display: "block", overflow: "visible", minWidth: 520 }}
          >
            <Inner
              width={1000}
              plotLeft={plotLeft}
              padRight={padRight}
              padTop={padTop}
              rows={rows}
              ticks={ticks}
              dMin={dMin}
              dMax={dMax}
              rowHeight={rowHeight}
              gapY={GAP_Y}
              barH={barH}
              cornerRadius={cornerRadius}
              today={today}
              timeUnit={timeUnit}
              showDeps={showDeps}
              showProgress={showProgress}
              colorForGroup={colorForGroup}
              indexByName={indexByName}
              inView={inView}
              reduced={reduced}
              baseDur={baseDur}
              token={token}
              gradId={gradId}
              hover={hover}
              setHover={setHover}
              p={p}
            />
          </svg>
        </div>

        {/* Footer: group legend + replay */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {groups.length > 1 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {groups.map((g) => (
                <span key={g} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: colorForGroup(g) }}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">{g}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
              {rows.length} task{rows.length === 1 ? "" : "s"}
            </span>
          )}
          <ReplayButton onClick={replay} className="opacity-0 transition-opacity group-hover/figure:opacity-100" />
        </div>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={hover != null}>
          {hover != null && rows[hover.i] && (
            <>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide opacity-70">
                {rows[hover.i].name}
              </div>
              <TooltipRow
                label="span"
                value={`${fmtNum(rows[hover.i].start)} – ${fmtNum(rows[hover.i].end)} ${timeUnit}${rows[hover.i].end - rows[hover.i].start === 1 ? "" : "s"}`}
              />
              <TooltipRow
                label="duration"
                value={`${fmtNum(rows[hover.i].end - rows[hover.i].start)} ${timeUnit}${rows[hover.i].end - rows[hover.i].start === 1 ? "" : "s"}`}
              />
              {rows[hover.i].group !== "—" && <TooltipRow label="group" value={rows[hover.i].group} />}
              {showProgress && !rows[hover.i].milestone && (
                <TooltipRow label="progress" value={`${Math.round(rows[hover.i].progress * 100)}%`} />
              )}
            </>
          )}
        </FloatingTooltip>
      </div>
    </Figure>
  );
}

/* ------------------------------------------------------------------ */
/* Inner SVG (uses a stable viewBox width of 1000 for crisp export)    */
/* ------------------------------------------------------------------ */

type Row = {
  i: number;
  name: string;
  start: number;
  end: number;
  group: string;
  progress: number;
  deps: string[];
  milestone: boolean;
};

function Inner({
  width,
  plotLeft,
  padRight,
  padTop,
  rows,
  ticks,
  dMin,
  dMax,
  rowHeight,
  gapY,
  barH,
  cornerRadius,
  today,
  timeUnit,
  showDeps,
  showProgress,
  colorForGroup,
  indexByName,
  inView,
  reduced,
  baseDur,
  token,
  gradId,
  hover,
  setHover,
  p,
}: {
  width: number;
  plotLeft: number;
  padRight: number;
  padTop: number;
  rows: Row[];
  ticks: number[];
  dMin: number;
  dMax: number;
  rowHeight: number;
  gapY: number;
  barH: number;
  cornerRadius: number;
  today: number;
  timeUnit: string;
  showDeps: boolean;
  showProgress: boolean;
  colorForGroup: (g: string) => string;
  indexByName: Map<string, number>;
  inView: boolean;
  reduced: boolean;
  baseDur: number;
  token: number;
  gradId: string;
  hover: { i: number; x: number; y: number } | null;
  setHover: (h: { i: number; x: number; y: number } | null) => void;
  p: ReturnType<typeof usePalette>;
}) {
  const plotW = width - plotLeft - padRight;
  const x = scaleLinear().domain([dMin, dMax]).range([0, plotW]);
  const rowY = (i: number) => padTop + i * (rowHeight + gapY);
  const barY = (i: number) => rowY(i) + (rowHeight - barH) / 2;
  const plotBottom = padTop + Math.max(rows.length * (rowHeight + gapY) - gapY, 0);

  const showToday = today >= dMin && today <= dMax;
  const todayX = plotLeft + x(today);

  // Dependency elbow path: from end of `from` to start of `to`.
  const depPath = (from: Row, to: Row): string => {
    const sx = plotLeft + x(from.end);
    const sy = barY(from.i) + barH / 2;
    const tx = plotLeft + x(to.start);
    const ty = barY(to.i) + barH / 2;
    const midX = Math.max(sx + 12, (sx + tx) / 2);
    const r = 6;
    const down = ty > sy ? 1 : -1;
    // horizontal out -> vertical -> horizontal into target start with arrow
    if (Math.abs(tx - sx) < 1) {
      return `M ${sx} ${sy} L ${sx + 10} ${sy} L ${sx + 10} ${ty} L ${tx} ${ty}`;
    }
    return [
      `M ${sx} ${sy}`,
      `L ${midX - r} ${sy}`,
      `Q ${midX} ${sy} ${midX} ${sy + r * down}`,
      `L ${midX} ${ty - r * down}`,
      `Q ${midX} ${ty} ${midX + r} ${ty}`,
      `L ${tx} ${ty}`,
    ].join(" ");
  };

  return (
    <>
      <defs>
        <marker
          id={`${gradId}-arrow`}
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" fill={p.inkFaint} />
        </marker>
      </defs>

      {/* Vertical gridlines per tick */}
      {ticks.map((t, i) => (
        <line
          key={`grid-${i}`}
          x1={plotLeft + x(t)}
          x2={plotLeft + x(t)}
          y1={padTop - 6}
          y2={plotBottom}
          stroke={p.grid}
          strokeWidth={1}
          strokeDasharray="2 4"
          shapeRendering="crispEdges"
        />
      ))}

      {/* Top axis labels */}
      {ticks.map((t, i) => (
        <text
          key={`tick-${i}`}
          x={plotLeft + x(t)}
          y={padTop - 12}
          textAnchor="middle"
          fill={p.inkFaint}
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em" }}
        >
          {fmtNum(t)}
        </text>
      ))}
      <text
        x={plotLeft - 10}
        y={padTop - 12}
        textAnchor="end"
        fill={p.inkMuted}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {timeUnit}
      </text>

      {/* Row backgrounds (zebra) */}
      {rows.map((r) =>
        r.i % 2 === 1 ? (
          <rect
            key={`zebra-${r.i}`}
            x={plotLeft - 8}
            y={rowY(r.i)}
            width={plotW + 8}
            height={rowHeight}
            rx={4}
            fill={withAlpha(p.ink, 0.025)}
          />
        ) : null,
      )}

      {/* Dependency connectors (under bars) */}
      {showDeps &&
        rows.map((r) =>
          r.deps.map((depName, k) => {
            const fi = indexByName.get(depName);
            if (fi == null) return null;
            const from = rows[fi];
            return (
              <motion.path
                key={`dep-${r.i}-${k}`}
                d={depPath(from, r)}
                fill="none"
                stroke={p.inkFaint}
                strokeWidth={1.25}
                strokeLinecap="round"
                markerEnd={`url(#${gradId}-arrow)`}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: inView ? 0.5 : reduced ? 0.5 : 0 }}
                transition={{ duration: 0.4, delay: reduced ? 0 : baseDur * 0.6 + r.i * 0.04 }}
              />
            );
          }),
        )}

      {/* Bars / milestones */}
      {rows.map((r) => {
        const fill = colorForGroup(r.group);
        const bx = plotLeft + x(r.start);
        const bw = Math.max(0, x(r.end) - x(r.start));
        const by = barY(r.i);
        const cy = by + barH / 2;
        const isHover = hover?.i === r.i;
        const delay = reduced ? 0 : r.i * 0.07;

        if (r.milestone) {
          const d = barH * 0.55;
          return (
            <g key={`row-${r.i}-${token}`}>
              <motion.path
                d={diamond(bx, cy, d)}
                fill={fill}
                stroke={p.surface}
                strokeWidth={1.5}
                initial={reduced ? false : { opacity: 0, scale: 0.2 }}
                animate={{ opacity: inView ? 1 : reduced ? 1 : 0, scale: inView ? 1 : reduced ? 1 : 0.2 }}
                transition={{ duration: 0.45, delay, ease: [0.34, 1.56, 0.64, 1] }}
                style={{ transformOrigin: `${bx}px ${cy}px`, cursor: "pointer" }}
                onMouseMove={(e) => onMove(e, r.i, setHover)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        }

        return (
          <g key={`row-${r.i}-${token}`}>
            {/* Track */}
            <rect x={bx} y={by} width={bw} height={barH} rx={cornerRadius} fill={withAlpha(fill, 0.16)} />
            {/* Bar grows from its start */}
            <motion.rect
              x={bx}
              y={by}
              height={barH}
              rx={cornerRadius}
              fill={withAlpha(fill, isHover ? 0.95 : 0.82)}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: inView ? bw : reduced ? bw : 0 }}
              transition={{ duration: baseDur, delay, ease: [0.22, 1, 0.36, 1] }}
              style={{ cursor: "pointer" }}
              onMouseMove={(e) => onMove(e, r.i, setHover)}
              onMouseLeave={() => setHover(null)}
            />
            {/* Progress overlay */}
            {showProgress && r.progress > 0 && (
              <motion.rect
                x={bx}
                y={by}
                height={barH}
                rx={cornerRadius}
                fill={mix(fill, p.ink, 0.32)}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: inView ? bw * r.progress : reduced ? bw * r.progress : 0 }}
                transition={{ duration: baseDur, delay: delay + baseDur * 0.25, ease: [0.22, 1, 0.36, 1] }}
                style={{ pointerEvents: "none" }}
              />
            )}
            {/* Label inside or after the bar */}
            <motion.text
              x={bw > 64 ? bx + 9 : bx + bw + 8}
              y={cy}
              dy="0.32em"
              textAnchor="start"
              fill={bw > 64 ? readableOn(mix(fill, p.canvas, 0.12)) : p.inkMuted}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, pointerEvents: "none" }}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: inView ? 1 : reduced ? 1 : 0 }}
              transition={{ duration: 0.4, delay: delay + baseDur * 0.55 }}
            >
              {showProgress && !r.milestone && r.progress >= 1 ? "✓ " : ""}
              {truncate(r.name, bw > 64 ? Math.floor(bw / 7) : 22)}
            </motion.text>
          </g>
        );
      })}

      {/* Row labels on the left */}
      {rows.map((r) => (
        <text
          key={`label-${r.i}`}
          x={plotLeft - 14}
          y={barY(r.i) + barH / 2}
          dy="0.32em"
          textAnchor="end"
          fill={hover?.i === r.i ? p.ink : p.inkMuted}
          style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}
        >
          {truncate(r.name, 22)}
        </text>
      ))}

      {/* Today / now marker (drawn on top) */}
      {showToday && (
        <g>
          <motion.line
            x1={todayX}
            x2={todayX}
            y1={padTop - 6}
            y2={plotBottom}
            stroke={p.accent}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: inView ? 0.85 : reduced ? 0.85 : 0 }}
            transition={{ duration: 0.5, delay: reduced ? 0 : baseDur * 0.4 }}
          />
          <motion.g
            initial={reduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: inView ? 1 : reduced ? 1 : 0, y: 0 }}
            transition={{ duration: 0.4, delay: reduced ? 0 : baseDur * 0.4 }}
          >
            <rect
              x={todayX - 19}
              y={padTop - 24}
              width={38}
              height={14}
              rx={7}
              fill={p.accent}
            />
            <text
              x={todayX}
              y={padTop - 17}
              dy="0.32em"
              textAnchor="middle"
              fill={p.accentContrast}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              now
            </text>
          </motion.g>
        </g>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function onMove(
  e: React.MouseEvent<SVGElement>,
  i: number,
  setHover: (h: { i: number; x: number; y: number } | null) => void,
) {
  const svg = e.currentTarget.ownerSVGElement as SVGSVGElement | null;
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
}

function diamond(cx: number, cy: number, r: number): string {
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
}

function truncate(s: string, max: number): string {
  if (max <= 1) return "";
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

export const meta: RevizMeta = {
  id: "gantt-chart",
  name: "Gantt Chart",
  category: "data-display",
  description:
    "A research-grade Gantt schedule: tasks as time-spanning bars across a unit axis, with group colors, completion overlays, dependency connectors, and a sweeping 'now' marker.",
  tags: ["gantt", "schedule", "timeline", "roadmap", "project", "planning"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "GanttChart",
  sourcePath: "data-display/GanttChart",
  aspect: 16 / 10,
  controls: [
    {
      key: "tasks",
      label: "Tasks",
      type: "json",
      group: "Data",
      help: 'Array of { name, start, end, group?, progress? (0–1), deps?: string[], milestone? }. start/end are in timeUnits.',
      default: DEFAULT_TASKS,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Research roadmap" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "timeUnit", label: "Time unit", type: "text", group: "Labels", default: "week" },
    {
      key: "today",
      label: "Now marker",
      type: "number",
      group: "Layout",
      help: "Position of the 'now' line, in timeUnits. Outside the range hides it.",
      default: 8.5,
      min: -1,
      max: 30,
      step: 0.5,
    },
    {
      key: "tickStep",
      label: "Tick step",
      type: "number",
      group: "Layout",
      default: 2,
      min: 0.5,
      max: 10,
      step: 0.5,
      unit: "u",
    },
    {
      key: "rowHeight",
      label: "Row height",
      type: "number",
      group: "Layout",
      default: 34,
      min: 22,
      max: 56,
      step: 1,
      unit: "px",
    },
    { key: "showDeps", label: "Show dependencies", type: "boolean", group: "Style", default: true },
    { key: "showProgress", label: "Show progress", type: "boolean", group: "Style", default: true },
    {
      key: "cornerRadius",
      label: "Corner radius",
      type: "number",
      group: "Style",
      default: 5,
      min: 0,
      max: 16,
      step: 1,
    },
    { key: "color", label: "Bar color", type: "color", group: "Style", default: "" },
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
      id: "roadmap",
      name: "Research roadmap",
      props: {
        title: "Research roadmap",
        caption: "Sixteen-week plan with dependencies, completion overlays, and a milestone review.",
        source: "planning · 16 wk",
        timeUnit: "week",
        today: 8.5,
      },
    },
    {
      id: "sprints",
      name: "Sprint plan",
      props: {
        title: "Agent platform · sprint plan",
        timeUnit: "sprint",
        tickStep: 1,
        today: 3.5,
        color: "",
        tasks: [
          { name: "Tool sandbox", start: 0, end: 2, group: "Infra", progress: 1 },
          { name: "Trace logging", start: 1, end: 3, group: "Infra", progress: 0.7, deps: ["Tool sandbox"] },
          { name: "Planner v1", start: 2, end: 5, group: "Agent", progress: 0.4, deps: ["Tool sandbox"] },
          { name: "Memory store", start: 3, end: 6, group: "Agent", progress: 0.25, deps: ["Trace logging"] },
          { name: "Eval suite", start: 4, end: 6, group: "Eval", progress: 0.15, deps: ["Planner v1"] },
          { name: "Beta launch", start: 6, end: 7, group: "Launch", progress: 0, milestone: true, deps: ["Memory store", "Eval suite"] },
        ],
      },
    },
    {
      id: "release",
      name: "Model release",
      props: {
        title: "Frontier model · release timeline",
        timeUnit: "month",
        tickStep: 1,
        today: 4.5,
        showDeps: false,
        tasks: [
          { name: "Pretraining", start: 0, end: 3, group: "Train", progress: 1 },
          { name: "Mid-training", start: 3, end: 4, group: "Train", progress: 1 },
          { name: "Post-training (RLHF)", start: 4, end: 6, group: "Align", progress: 0.5 },
          { name: "Red-teaming", start: 5, end: 7, group: "Safety", progress: 0.2 },
          { name: "Capability evals", start: 5, end: 7, group: "Eval", progress: 0.3 },
          { name: "System card", start: 6, end: 8, group: "Release", progress: 0 },
          { name: "GA launch", start: 8, end: 9, group: "Release", progress: 0, milestone: true },
        ],
      },
    },
  ],
};
