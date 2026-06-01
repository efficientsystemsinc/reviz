"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Figure,
  ReplayButton,
  clamp,
  uid,
  usePalette,
  usePrefersReducedMotion,
  useInView,
  useReplay,
  withAlpha,
  mix,
  type RevizMeta,
} from "@/reviz";

export interface CompareSliderProps {
  leftSrc?: string;
  rightSrc?: string;
  leftLabel?: string;
  rightLabel?: string;
  title?: string;
  caption?: string;
  source?: string;
  /** Initial divider position, 0–100 (% from the left). */
  initial?: number;
  /** Auto-sweep the divider once on entrance. */
  autoSweep?: boolean;
  duration?: number;
}

/**
 * A side-by-side comparison with a draggable wipe divider — the canonical
 * "world-model vs. reality" or "generated vs. ground-truth" reveal. Two layered
 * panels (real image URLs, or themed procedural placeholders), a frosted handle
 * you drag with pointer events, corner labels, and an optional entrance sweep.
 */
export default function CompareSlider({
  leftSrc = "",
  rightSrc = "",
  leftLabel = "World Model",
  rightLabel = "Real",
  title = "",
  caption = "",
  source = "",
  initial = 50,
  autoSweep = true,
  duration = 1400,
}: CompareSliderProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const trackRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => clamp(initial, 0, 100));
  const [dragging, setDragging] = useState(false);
  const [hasUserMoved, setHasUserMoved] = useState(false);
  const sweepRaf = useRef<number | undefined>(undefined);

  const gradA = useRef(uid("cmp-a"));
  const gradB = useRef(uid("cmp-b"));
  const gridA = useRef(uid("cmp-grid-a"));
  const gridB = useRef(uid("cmp-grid-b"));

  // Reset to the configured starting position whenever it (or replay) changes.
  useEffect(() => {
    setPos(clamp(initial, 0, 100));
    setHasUserMoved(false);
  }, [initial, token]);

  // Entrance auto-sweep: a single eased pass that settles at `initial`.
  useEffect(() => {
    if (sweepRaf.current) cancelAnimationFrame(sweepRaf.current);
    const target = clamp(initial, 0, 100);
    if (!inView || !autoSweep || reduced || hasUserMoved) {
      setPos(target);
      return;
    }
    const start = performance.now();
    const total = Math.max(200, duration);
    // sweep: settle → right reveal → back to target, all eased.
    const keys = [target, 88, 14, target];
    const tick = (now: number) => {
      const t = clamp((now - start) / total, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const seg = ease * (keys.length - 1);
      const i = Math.min(keys.length - 2, Math.floor(seg));
      const f = seg - i;
      const smooth = f * f * (3 - 2 * f);
      setPos(keys[i] + (keys[i + 1] - keys[i]) * smooth);
      if (t < 1) sweepRaf.current = requestAnimationFrame(tick);
    };
    sweepRaf.current = requestAnimationFrame(tick);
    return () => {
      if (sweepRaf.current) cancelAnimationFrame(sweepRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, autoSweep, reduced, duration, initial, token]);

  const setFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next = ((clientX - r.left) / Math.max(1, r.width)) * 100;
    setPos(clamp(next, 0, 100));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (sweepRaf.current) cancelAnimationFrame(sweepRaf.current);
      setHasUserMoved(true);
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setFromClientX(e.clientX);
    },
    [setFromClientX],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setFromClientX(e.clientX);
    },
    [dragging, setFromClientX],
  );
  const endDrag = useCallback(() => setDragging(false), []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setHasUserMoved(true);
      setPos((v) => clamp(v + (e.key === "ArrowLeft" ? -step : step), 0, 100));
    } else if (e.key === "Home") {
      setHasUserMoved(true);
      setPos(0);
    } else if (e.key === "End") {
      setHasUserMoved(true);
      setPos(100);
    }
  }, []);

  const onReplay = useCallback(() => {
    setHasUserMoved(false);
    replay();
  }, [replay]);

  // Two procedural placeholder palettes — synthetic (cool) vs. real (accent).
  const synthFrom = useMemo(() => mix(p.surfaceAlt, p.accent, 0.18), [p]);
  const synthTo = useMemo(() => mix(p.canvas, p.accent, 0.06), [p]);
  const realFrom = useMemo(() => mix(p.surface, p.series[3] || p.ink, 0.1), [p]);
  const realTo = useMemo(() => mix(p.surfaceAlt, p.ink, 0.16), [p]);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={viewRef} className="relative">
        <motion.div
          ref={trackRef}
          className="group/cmp relative aspect-[16/10] w-full select-none overflow-hidden rounded-reviz border border-border bg-surface-alt"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerCancel={endDrag}
          style={{ cursor: dragging ? "ew-resize" : "grab", touchAction: "none" }}
        >
          {/* RIGHT layer (full, beneath) */}
          <Panel
            src={rightSrc}
            kind="real"
            gradId={gradB.current}
            gridId={gridB.current}
            from={realFrom}
            to={realTo}
            stroke={withAlpha(p.ink, 0.08)}
            dot={withAlpha(p.ink, 0.16)}
          />

          {/* LEFT layer (clipped by divider, on top) */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          >
            <Panel
              src={leftSrc}
              kind="synthetic"
              gradId={gradA.current}
              gridId={gridA.current}
              from={synthFrom}
              to={synthTo}
              stroke={withAlpha(p.accent, 0.16)}
              dot={withAlpha(p.accent, 0.28)}
            />
          </div>

          {/* Corner labels */}
          <CornerLabel side="left" text={leftLabel} dim={pos < 12} p={p} accent />
          <CornerLabel side="right" text={rightLabel} dim={pos > 88} p={p} />

          {/* Divider line */}
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-px"
            style={{
              left: `${pos}%`,
              background: `linear-gradient(to bottom, ${withAlpha(p.surface, 0)}, ${withAlpha(
                p.surface,
                0.95,
              )} 18%, ${withAlpha(p.surface, 0.95)} 82%, ${withAlpha(p.surface, 0)})`,
              boxShadow: `0 0 0 1px ${withAlpha(p.ink, 0.18)}`,
            }}
          />

          {/* Handle */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Comparison divider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            onKeyDown={onKeyDown}
            className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 outline-none"
            style={{ left: `${pos}%`, cursor: "ew-resize" }}
          >
            <motion.div
              className="grid h-9 w-9 place-items-center rounded-full border backdrop-blur-sm"
              style={{
                borderColor: withAlpha(p.ink, 0.16),
                background: withAlpha(p.surface, 0.82),
                boxShadow: `0 4px 14px ${withAlpha(p.shadow, 0.22)}`,
              }}
              animate={{ scale: dragging ? 1.12 : 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
            >
              <Grip color={p.inkMuted} />
            </motion.div>
          </div>

          {/* Position readout */}
          <div
            className="pointer-events-none absolute bottom-2.5 left-1/2 z-20 -translate-x-1/2 rounded-full border px-2 py-0.5 font-mono text-[10px] tabular-nums tracking-label text-ink-muted opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover/cmp:opacity-100"
            style={{ borderColor: p.border, background: withAlpha(p.surface, 0.7) }}
          >
            {Math.round(pos)}%
          </div>
        </motion.div>

        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
            Drag to compare
          </span>
          <ReplayButton onClick={onReplay} label="Sweep" />
        </div>
      </div>
    </Figure>
  );
}

function Panel({
  src,
  kind,
  gradId,
  gridId,
  from,
  to,
  stroke,
  dot,
}: {
  src: string;
  kind: "synthetic" | "real";
  gradId: string;
  gridId: string;
  from: string;
  to: string;
  stroke: string;
  dot: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={kind}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  // Procedural placeholder: a horizon-like scene with a soft grid so the two
  // sides read as paired renders of the same world, distinguished by treatment.
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0 L0 0 0 20" fill="none" stroke={stroke} strokeWidth="0.75" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="320" height="200" fill={`url(#${gradId})`} />
      {/* perspective floor */}
      <g opacity={kind === "synthetic" ? 0.9 : 0.55}>
        <rect x="0" y="118" width="320" height="82" fill={`url(#${gridId})`} />
        {[40, 80, 120, 160, 200, 240, 280].map((x) => (
          <line key={x} x1={x} y1={118} x2={160 + (x - 160) * 3.2} y2={200} stroke={stroke} strokeWidth="0.75" />
        ))}
        <line x1="0" y1="118" x2="320" y2="118" stroke={dot} strokeWidth="1" />
      </g>
      {/* sky objects */}
      {kind === "synthetic" ? (
        <>
          <circle cx="232" cy="58" r="26" fill={dot} opacity="0.5" />
          <rect x="44" y="74" width="46" height="38" rx="4" fill={dot} opacity="0.42" />
          <rect x="100" y="64" width="30" height="48" rx="3" fill={stroke} />
        </>
      ) : (
        <>
          <circle cx="232" cy="58" r="26" fill="none" stroke={dot} strokeWidth="1.5" />
          <rect x="44" y="74" width="46" height="38" rx="4" fill="none" stroke={dot} strokeWidth="1.5" />
          <rect x="100" y="64" width="30" height="48" rx="3" fill="none" stroke={dot} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

function CornerLabel({
  side,
  text,
  dim,
  p,
  accent = false,
}: {
  side: "left" | "right";
  text: string;
  dim: boolean;
  p: ReturnType<typeof usePalette>;
  accent?: boolean;
}) {
  if (!text) return null;
  return (
    <div
      className="pointer-events-none absolute top-3 z-10 flex items-center gap-1.5 rounded-md border px-2 py-1 backdrop-blur-sm transition-opacity duration-300"
      style={{
        [side]: "0.75rem",
        borderColor: p.border,
        background: withAlpha(p.surface, 0.78),
        opacity: dim ? 0.25 : 1,
      } as React.CSSProperties}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: accent ? p.accent : p.inkMuted }}
      />
      <span className="font-mono text-[10px] uppercase tracking-label text-ink">{text}</span>
    </div>
  );
}

function Grip({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 4 L3 8 L6 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 4 L13 8 L10 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const meta: RevizMeta = {
  id: "compare-slider",
  name: "Comparison Slider",
  category: "robotics-media",
  description:
    "A draggable wipe divider that reveals one render over another — the canonical world-model-vs-reality or generated-vs-ground-truth comparison.",
  tags: ["comparison", "slider", "before-after", "world-model", "media", "wipe"],
  badges: ["animated", "interactive", "responsive", "themed"],
  exportName: "CompareSlider",
  sourcePath: "robotics-media/CompareSlider",
  aspect: 16 / 10,
  controls: [
    { key: "leftSrc", label: "Left image URL", type: "text", group: "Data", default: "", placeholder: "https://… (optional)" },
    { key: "rightSrc", label: "Right image URL", type: "text", group: "Data", default: "", placeholder: "https://… (optional)" },
    { key: "leftLabel", label: "Left label", type: "text", group: "Labels", default: "World Model" },
    { key: "rightLabel", label: "Right label", type: "text", group: "Labels", default: "Real" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "initial", label: "Divider position", type: "number", group: "Layout", default: 50, min: 0, max: 100, step: 1, unit: "%" },
    { key: "autoSweep", label: "Auto-sweep on entrance", type: "boolean", group: "Animation", default: true },
    { key: "duration", label: "Sweep duration", type: "number", group: "Animation", default: 1400, min: 0, max: 4000, step: 100, unit: "ms" },
  ],
  presets: [
    {
      id: "wm-vs-real",
      name: "World model vs. real",
      props: {
        title: "Neural world model vs. real rollout",
        caption: "Same action sequence replayed through the learned world model and the physical robot.",
        leftLabel: "World Model",
        rightLabel: "Real",
        initial: 48,
        source: "1X Technologies",
      },
    },
    {
      id: "gen-vs-gt",
      name: "Generated vs. ground truth",
      props: {
        title: "Generated frame vs. ground truth",
        leftLabel: "Generated",
        rightLabel: "Ground Truth",
        initial: 60,
        autoSweep: true,
      },
    },
  ],
};
