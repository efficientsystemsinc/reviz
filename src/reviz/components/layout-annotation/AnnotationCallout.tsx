"use client";

import { area as d3Area, curveBasis, line as d3Line } from "d3-shape";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  Glow,
  ReplayButton,
  VerticalFade,
  clamp,
  uid,
  useInView,
  useMeasure,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

type Direction =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | "left"
  | "right";

type Marker = "dot" | "ring" | "box";

export interface AnnotationCalloutProps {
  targetX?: number;
  targetY?: number;
  direction?: Direction;
  label?: string;
  note?: string;
  marker?: Marker;
  accent?: string;
  duration?: number;
  title?: string;
  caption?: string;
  source?: string;
}

/** Resolve the card's anchor corner + leader geometry for a given direction. */
function resolveLayout(dir: Direction, tx: number, ty: number, w: number, h: number) {
  // Card box dimensions (px) and a comfortable gap from the edges.
  const cardW = clamp(w * 0.34, 150, 230);
  const pad = 14;

  // Pick the card's outer corner anchored to a side of the frame.
  const horiz = dir.includes("left") ? "left" : dir.includes("right") ? "right" : "center";
  const vert = dir.includes("top") ? "top" : dir.includes("bottom") ? "bottom" : "middle";

  // Horizontal card position.
  let cardLeft: number;
  if (horiz === "left") cardLeft = pad;
  else if (horiz === "right") cardLeft = w - cardW - pad;
  else cardLeft = clamp(tx - cardW / 2, pad, w - cardW - pad);

  // The leader should connect to the card edge closest to the target.
  // We compute an estimated card height for connection math; the real card
  // sizes to content, so we anchor the leader to the card's near vertical edge.
  const estCardH = clamp(h * 0.28, 78, 124);
  let cardTop: number;
  if (vert === "top") cardTop = pad;
  else if (vert === "bottom") cardTop = h - estCardH - pad;
  else cardTop = clamp(ty - estCardH / 2, pad, h - estCardH - pad);

  // Connection point on the card (nearest edge midpoint toward the target).
  const cardCx = cardLeft + cardW / 2;
  const cardCy = cardTop + estCardH / 2;

  // Choose which card edge the leader leaves from.
  const dx = tx - cardCx;
  const dy = ty - cardCy;
  let connX: number;
  let connY: number;
  if (Math.abs(dx) > Math.abs(dy)) {
    connX = dx > 0 ? cardLeft + cardW : cardLeft;
    connY = clamp(ty, cardTop + 16, cardTop + estCardH - 16);
  } else {
    connY = dy > 0 ? cardTop + estCardH : cardTop;
    connX = clamp(tx, cardLeft + 18, cardLeft + cardW - 18);
  }

  return { cardW, cardLeft, cardTop, connX, connY, vert, horiz };
}

export default function AnnotationCallout({
  targetX = 64,
  targetY = 30,
  direction = "top-right",
  label = "Peak success",
  note = "Throughput peaks at step 14k before the policy plateaus — the inflection the ablation was tuned to find.",
  marker = "ring",
  accent = "",
  duration = 1100,
  title = "",
  caption = "",
  source = "",
}: AnnotationCalloutProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const reduced = usePrefersReducedMotion();
  const [inViewRef, inView] = useInView<HTMLDivElement>();
  const [measureRef, rect] = useMeasure<HTMLDivElement>();
  const { token, replay } = useReplay();

  const ids = useMemo(() => ({ glow: uid("ac-glow"), fade: uid("ac-fade") }), []);

  const W = rect.width;
  const H = W > 0 ? Math.max(W / (16 / 9), 200) : 0;

  const tx = (clamp(targetX, 0, 100) / 100) * W;
  const ty = (clamp(targetY, 0, 100) / 100) * H;

  // A smooth scientific "ridge" backdrop so the callout has a peak to annotate.
  const backdrop = useMemo(() => {
    if (W === 0 || H === 0) return { line: "", fill: "" };
    const n = 56;
    const peakAt = clamp(targetX, 8, 92) / 100;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Two gaussian-ish bumps; the main one centered at the target X.
      const main = Math.exp(-Math.pow((t - peakAt) / 0.16, 2));
      const minor = 0.42 * Math.exp(-Math.pow((t - peakAt * 0.45 - 0.12) / 0.2, 2));
      const base = 0.12 + 0.06 * Math.sin(t * 7.5);
      const v = clamp(base + main + minor, 0, 1.45) / 1.45;
      pts.push([t * W, H - 18 - v * (H - 54)]);
    }
    const lineGen = d3Line<[number, number]>().x((d) => d[0]).y((d) => d[1]).curve(curveBasis);
    const areaGen = d3Area<[number, number]>()
      .x((d) => d[0])
      .y0(H - 18)
      .y1((d) => d[1])
      .curve(curveBasis);
    return { line: lineGen(pts) ?? "", fill: areaGen(pts) ?? "" };
  }, [W, H, targetX]);

  const layout = useMemo(
    () => (W > 0 ? resolveLayout(direction, tx, ty, W, H) : null),
    [direction, tx, ty, W, H],
  );

  // Leader path: target -> elbow -> card connection point.
  const leaderPath = useMemo(() => {
    if (!layout) return "";
    const { connX, connY } = layout;
    const midX = (tx + connX) / 2;
    return `M ${tx} ${ty} Q ${midX} ${ty} ${(midX + connX) / 2} ${(ty + connY) / 2} T ${connX} ${connY}`;
  }, [layout, tx, ty]);

  const animate = inView && !reduced;
  const dur = duration / 1000;
  const markerSize = clamp(W * 0.022, 7, 13);

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div
        ref={inViewRef}
        className="group/ac relative"
        style={{ width: "100%" }}
      >
        <div
          ref={measureRef}
          className="relative overflow-hidden rounded-reviz border border-border bg-surface-alt/40"
          style={{ height: H || undefined, minHeight: 200 }}
        >
          {W > 0 && (
            <svg
              key={token}
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              role="img"
              className="absolute inset-0"
              style={{ display: "block", overflow: "visible" }}
            >
              <defs>
                <Glow id={ids.glow} blur={5} />
                <VerticalFade id={ids.fade} color={fill} from={0.22} to={0} />
              </defs>

              {/* faint baseline grid */}
              {Array.from({ length: 5 }).map((_, i) => {
                const y = 18 + ((H - 36) / 4) * i;
                return (
                  <line
                    key={`h${i}`}
                    x1={0}
                    x2={W}
                    y1={y}
                    y2={y}
                    stroke={p.grid}
                    strokeWidth={1}
                    strokeDasharray="2 5"
                    opacity={0.7}
                  />
                );
              })}

              {/* backdrop ridge — the thing being annotated */}
              <motion.path
                d={backdrop.fill}
                fill={`url(#${ids.fade})`}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: animate || reduced ? 1 : 0 }}
                transition={{ duration: dur * 0.5 }}
              />
              <motion.path
                d={backdrop.line}
                fill="none"
                stroke={withAlpha(p.inkMuted, 0.55)}
                strokeWidth={1.5}
                strokeLinecap="round"
                initial={{ pathLength: reduced ? 1 : 0 }}
                animate={{ pathLength: animate || reduced ? 1 : 0 }}
                transition={{ duration: dur * 0.75, ease: [0.22, 1, 0.36, 1] }}
              />

              {/* leader line drawing in */}
              <motion.path
                d={leaderPath}
                fill="none"
                stroke={fill}
                strokeWidth={1.4}
                strokeLinecap="round"
                initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
                animate={{
                  pathLength: animate || reduced ? 1 : 0,
                  opacity: animate || reduced ? 1 : 0,
                }}
                transition={{
                  pathLength: { duration: dur * 0.45, delay: dur * 0.35, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.2, delay: dur * 0.35 },
                }}
              />

              {/* target marker */}
              <Target
                kind={marker}
                x={tx}
                y={ty}
                size={markerSize}
                fill={fill}
                ink={p.surface}
                glow={ids.glow}
                animate={animate}
                reduced={reduced}
                dur={dur}
                delay={dur * 0.78}
              />
            </svg>
          )}

          {/* note card (HTML overlay) */}
          <AnimatePresence>
            {W > 0 && layout && (animate || reduced || inView) && (
              <motion.div
                key={`${token}-card`}
                className="absolute rounded-lg border border-border bg-surface px-3 py-2.5 shadow-float"
                style={{
                  left: layout.cardLeft,
                  top: layout.cardTop,
                  width: layout.cardW,
                  borderColor: withAlpha(fill, 0.35),
                }}
                initial={{ opacity: 0, y: layout.vert === "bottom" ? 8 : -8, scale: 0.97 }}
                animate={{ opacity: inView ? 1 : 0, y: 0, scale: 1 }}
                transition={{
                  duration: reduced ? 0 : 0.4,
                  delay: reduced ? 0 : dur * 0.55,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div
                  className="mb-1 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label"
                  style={{ color: fill }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: fill }}
                  />
                  {label}
                </div>
                <p className="font-serif text-[12.5px] italic leading-snug text-ink-muted">
                  {note}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="pointer-events-none absolute right-2 top-2 opacity-0 transition-opacity group-hover/ac:opacity-100">
          <div className="pointer-events-auto">
            <ReplayButton onClick={replay} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

function Target({
  kind,
  x,
  y,
  size,
  fill,
  ink,
  glow,
  animate,
  reduced,
  dur,
  delay,
}: {
  kind: Marker;
  x: number;
  y: number;
  size: number;
  fill: string;
  ink: string;
  glow: string;
  animate: boolean;
  reduced: boolean;
  dur: number;
  delay: number;
}) {
  const spring = { type: "spring" as const, stiffness: 380, damping: 18, delay: reduced ? 0 : delay };
  const visible = animate || reduced;

  if (kind === "box") {
    const s = size * 1.6;
    return (
      <g>
        {visible && !reduced && (
          <motion.rect
            x={x - s}
            y={y - s}
            width={s * 2}
            height={s * 2}
            rx={3}
            fill="none"
            stroke={fill}
            strokeWidth={1.25}
            initial={{ opacity: 0.5, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 1.4, repeat: Infinity, delay, ease: "easeOut" }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        <motion.rect
          x={x - s}
          y={y - s}
          width={s * 2}
          height={s * 2}
          rx={3}
          fill="none"
          stroke={fill}
          strokeWidth={1.75}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: visible ? 1 : 0, scale: 1 }}
          transition={spring}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      </g>
    );
  }

  if (kind === "ring") {
    return (
      <g>
        {visible && !reduced && (
          <motion.circle
            cx={x}
            cy={y}
            r={size}
            fill="none"
            stroke={fill}
            strokeWidth={1.5}
            initial={{ opacity: 0.6, scale: 0.5 }}
            animate={{ opacity: 0, scale: 2.4 }}
            transition={{ duration: 1.6, repeat: Infinity, delay, ease: "easeOut" }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        <motion.circle
          cx={x}
          cy={y}
          r={size}
          fill="none"
          stroke={fill}
          strokeWidth={2}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: visible ? 1 : 0, scale: 1 }}
          transition={spring}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
        <motion.circle
          cx={x}
          cy={y}
          r={size * 0.36}
          fill={fill}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: visible ? 1 : 0, scale: 1 }}
          transition={{ ...spring, delay: reduced ? 0 : delay + 0.08 }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      </g>
    );
  }

  // dot
  return (
    <g filter={`url(#${glow})`}>
      {visible && !reduced && (
        <motion.circle
          cx={x}
          cy={y}
          r={size}
          fill={withAlpha(fill, 0.4)}
          initial={{ opacity: 0.7, scale: 0.5 }}
          animate={{ opacity: 0, scale: 2.2 }}
          transition={{ duration: 1.5, repeat: Infinity, delay, ease: "easeOut" }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}
      <motion.circle
        cx={x}
        cy={y}
        r={size * 0.62}
        fill={fill}
        stroke={ink}
        strokeWidth={1.5}
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: visible ? 1 : 0, scale: 1 }}
        transition={spring}
        style={{ transformOrigin: `${x}px ${y}px` }}
      />
    </g>
  );
}

export const meta: RevizMeta = {
  id: "annotation-callout",
  name: "Annotation Callout",
  category: "layout-annotation",
  description:
    "A target marker with a leader line that draws into a fading note card — point a reader straight at the peak, the regression, or the outlier in any figure.",
  tags: ["annotation", "callout", "leader-line", "marker", "overlay", "note"],
  badges: ["animated", "interactive", "themed", "responsive"],
  exportName: "AnnotationCallout",
  sourcePath: "layout-annotation/AnnotationCallout",
  aspect: 16 / 9,
  controls: [
    {
      key: "targetX",
      label: "Target X",
      type: "number",
      group: "Layout",
      default: 64,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "targetY",
      label: "Target Y",
      type: "number",
      group: "Layout",
      default: 30,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "direction",
      label: "Card direction",
      type: "select",
      group: "Layout",
      default: "top-right",
      options: [
        { value: "top-left", label: "Top left" },
        { value: "top", label: "Top" },
        { value: "top-right", label: "Top right" },
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
        { value: "bottom-left", label: "Bottom left" },
        { value: "bottom", label: "Bottom" },
        { value: "bottom-right", label: "Bottom right" },
      ],
    },
    {
      key: "marker",
      label: "Marker",
      type: "select",
      group: "Style",
      default: "ring",
      options: [
        { value: "dot", label: "Dot" },
        { value: "ring", label: "Ring" },
        { value: "box", label: "Box" },
      ],
    },
    { key: "label", label: "Label", type: "text", group: "Labels", default: "Peak success" },
    {
      key: "note",
      label: "Note",
      type: "textarea",
      group: "Labels",
      rows: 3,
      default:
        "Throughput peaks at step 14k before the policy plateaus — the inflection the ablation was tuned to find.",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
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
      id: "peak",
      name: "Point at the peak",
      props: {
        targetX: 62,
        targetY: 22,
        direction: "top-right",
        marker: "ring",
        label: "Peak success",
        note: "Throughput peaks at step 14k before the policy plateaus — the inflection the ablation was tuned to find.",
        title: "Reward over training",
      },
    },
    {
      id: "regression",
      name: "Flag a regression",
      props: {
        targetX: 84,
        targetY: 58,
        direction: "bottom-left",
        marker: "box",
        label: "Regression",
        accent: "",
        note: "A 4-point drop after the v3 data refresh — traced to mislabeled long-horizon rollouts.",
        title: "Eval pass@1 by checkpoint",
      },
    },
    {
      id: "onset",
      name: "Mark an onset",
      props: {
        targetX: 28,
        targetY: 64,
        direction: "left",
        marker: "dot",
        label: "Emergence",
        note: "Capability switches on sharply between 7B and 13B — the classic emergent-ability knee.",
        title: "",
      },
    },
  ],
};
