"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import {
  Figure,
  Glow,
  ReplayButton,
  clamp,
  seededRandom,
  uid,
  useInView,
  useMeasure,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

type BoxStyle = "dashed" | "solid" | "glow";

export interface HighlightBoxProps {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  label?: string;
  style?: BoxStyle;
  accent?: string;
  duration?: number;
  title?: string;
  caption?: string;
  source?: string;
}

/** A point on the demo backdrop scatter. `hot` points sit inside the highlight. */
type Dot = { x: number; y: number; r: number; hot: boolean };

export default function HighlightBox({
  x = 52,
  y = 22,
  w = 34,
  h = 44,
  label = "Target cluster",
  style = "dashed",
  accent = "",
  duration = 1200,
  title = "",
  caption = "",
  source = "",
}: HighlightBoxProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const reduced = usePrefersReducedMotion();
  const [inViewRef, inView] = useInView<HTMLDivElement>();
  const [measureRef, rect] = useMeasure<HTMLDivElement>();
  const { token, replay } = useReplay();

  const ids = useMemo(
    () => ({ glow: uid("hb-glow"), tint: uid("hb-tint"), soft: uid("hb-soft") }),
    [],
  );

  const W = rect.width;
  const H = W > 0 ? Math.max(W / (16 / 10), 220) : 0;

  // Highlight rectangle in px, clamped so the tag and border stay on-canvas.
  const box = useMemo(() => {
    const bx = (clamp(x, 0, 100) / 100) * W;
    const by = (clamp(y, 0, 100) / 100) * H;
    const bw = (clamp(w, 2, 100) / 100) * W;
    const bh = (clamp(h, 2, 100) / 100) * H;
    const left = clamp(bx, 0, Math.max(0, W - bw));
    const top = clamp(by, 0, Math.max(0, H - bh));
    return { left, top, w: bw, h: bh };
  }, [x, y, w, h, W, H]);

  // Demo backdrop: two scatter blobs. The "signal" blob is positioned to sit
  // under the highlight box; a "background" blob fills the rest of the frame.
  const dots = useMemo<Dot[]>(() => {
    if (W === 0 || H === 0) return [];
    const rand = seededRandom(7);
    const out: Dot[] = [];
    // Center of the highlighted region (the cluster we are calling out).
    const cx = box.left + box.w / 2;
    const cy = box.top + box.h / 2;
    const sx = box.w * 0.28;
    const sy = box.h * 0.28;
    // Signal cluster — tight gaussian inside the box.
    for (let i = 0; i < 46; i++) {
      const g1 = (rand() + rand() + rand() - 1.5) * 2;
      const g2 = (rand() + rand() + rand() - 1.5) * 2;
      const px = cx + g1 * sx;
      const py = cy + g2 * sy;
      const hot = px >= box.left && px <= box.left + box.w && py >= box.top && py <= box.top + box.h;
      out.push({ x: px, y: py, r: 2.6 + rand() * 2.2, hot });
    }
    // Background scatter — broad, low density across the canvas.
    for (let i = 0; i < 74; i++) {
      const px = 14 + rand() * (W - 28);
      const py = 14 + rand() * (H - 28);
      const hot = px >= box.left && px <= box.left + box.w && py >= box.top && py <= box.top + box.h;
      out.push({ x: px, y: py, r: 2.2 + rand() * 1.8, hot });
    }
    return out;
  }, [W, H, box]);

  const animate = inView && !reduced;
  const dur = duration / 1000;

  // Border perimeter for the draw-on stroke effect.
  const perimeter = 2 * (box.w + box.h);
  const rx = clamp(Math.min(box.w, box.h) * 0.06, 4, 12);

  const dashArray = style === "dashed" ? "7 6" : undefined;

  // Tag sits on the top-left corner of the box, riding the border line.
  const tagOnTop = box.top > 26;

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={inViewRef} className="group/hb relative" style={{ width: "100%" }}>
        <div
          ref={measureRef}
          className="relative overflow-hidden rounded-reviz border border-border bg-surface-alt/40"
          style={{ height: H || undefined, minHeight: 220 }}
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
                <Glow id={ids.glow} blur={7} />
                <radialGradient id={ids.tint} cx="50%" cy="42%" r="75%">
                  <stop offset="0%" stopColor={fill} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={fill} stopOpacity={0.04} />
                </radialGradient>
                <radialGradient id={ids.soft} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={fill} stopOpacity={0.32} />
                  <stop offset="70%" stopColor={fill} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={fill} stopOpacity={0} />
                </radialGradient>
              </defs>

              {/* faint dotted grid backdrop */}
              {Array.from({ length: 6 }).map((_, i) => {
                const gy = 16 + ((H - 32) / 5) * i;
                return (
                  <line
                    key={`h${i}`}
                    x1={0}
                    x2={W}
                    y1={gy}
                    y2={gy}
                    stroke={p.grid}
                    strokeWidth={1}
                    strokeDasharray="2 6"
                    opacity={0.6}
                  />
                );
              })}
              {Array.from({ length: 9 }).map((_, i) => {
                const gx = 16 + ((W - 32) / 8) * i;
                return (
                  <line
                    key={`v${i}`}
                    x1={gx}
                    x2={gx}
                    y1={0}
                    y2={H}
                    stroke={p.grid}
                    strokeWidth={1}
                    strokeDasharray="2 6"
                    opacity={0.6}
                  />
                );
              })}

              {/* soft halo behind the highlighted cluster */}
              {style === "glow" && (
                <motion.ellipse
                  cx={box.left + box.w / 2}
                  cy={box.top + box.h / 2}
                  rx={box.w * 0.62}
                  ry={box.h * 0.62}
                  fill={`url(#${ids.soft})`}
                  initial={{ opacity: reduced ? 1 : 0 }}
                  animate={{ opacity: animate || reduced ? 1 : 0 }}
                  transition={{ duration: dur * 0.6, delay: reduced ? 0 : dur * 0.2 }}
                />
              )}

              {/* backdrop scatter — dimmed outside, vivid inside the box */}
              {dots.map((d, i) => (
                <motion.circle
                  key={i}
                  cx={d.x}
                  cy={d.y}
                  r={d.r}
                  fill={d.hot ? fill : p.inkFaint}
                  initial={{ opacity: reduced ? (d.hot ? 0.95 : 0.3) : 0, scale: reduced ? 1 : 0.4 }}
                  animate={{
                    opacity: animate || reduced ? (d.hot ? 0.95 : 0.3) : 0,
                    scale: animate || reduced ? 1 : 0.4,
                  }}
                  transition={{
                    duration: reduced ? 0 : 0.45,
                    delay: reduced ? 0 : (i / dots.length) * dur * 0.45,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{ transformOrigin: `${d.x}px ${d.y}px` }}
                />
              ))}

              {/* soft tint fill inside the highlight */}
              <motion.rect
                x={box.left}
                y={box.top}
                width={box.w}
                height={box.h}
                rx={rx}
                fill={`url(#${ids.tint})`}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: animate || reduced ? 1 : 0 }}
                transition={{ duration: dur * 0.5, delay: reduced ? 0 : dur * 0.35 }}
              />

              {/* the drawing border */}
              <g filter={style === "glow" ? `url(#${ids.glow})` : undefined}>
                <motion.rect
                  x={box.left}
                  y={box.top}
                  width={box.w}
                  height={box.h}
                  rx={rx}
                  fill="none"
                  stroke={fill}
                  strokeWidth={style === "glow" ? 2.4 : 2}
                  strokeDasharray={dashArray}
                  strokeLinecap="round"
                  initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
                  animate={{
                    pathLength: animate || reduced ? 1 : 0,
                    opacity: animate || reduced ? 1 : 0,
                  }}
                  transition={{
                    pathLength: { duration: dur * 0.85, ease: [0.4, 0, 0.2, 1] },
                    opacity: { duration: 0.2 },
                  }}
                  style={{ strokeDashoffset: 0 }}
                />
              </g>

              {/* corner ticks for a crisp, measured feel */}
              {[
                [box.left, box.top, 1, 1],
                [box.left + box.w, box.top, -1, 1],
                [box.left, box.top + box.h, 1, -1],
                [box.left + box.w, box.top + box.h, -1, -1],
              ].map(([cx, cy, sxd, syd], i) => {
                const len = clamp(Math.min(box.w, box.h) * 0.14, 8, 18);
                return (
                  <motion.path
                    key={`c${i}`}
                    d={`M ${cx} ${cy + syd * len} L ${cx} ${cy} L ${cx + sxd * len} ${cy}`}
                    fill="none"
                    stroke={fill}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    initial={{ opacity: reduced ? 1 : 0 }}
                    animate={{ opacity: animate || reduced ? 1 : 0 }}
                    transition={{ duration: 0.3, delay: reduced ? 0 : dur * 0.7 }}
                  />
                );
              })}

              {/* dimensions readout along the bottom edge */}
              <motion.text
                x={box.left + box.w / 2}
                y={box.top + box.h + 16}
                textAnchor="middle"
                fill={withAlpha(p.inkMuted, 0.85)}
                className="font-mono uppercase tracking-label"
                style={{ fontSize: 9.5 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: animate || reduced ? 1 : 0 }}
                transition={{ duration: 0.3, delay: reduced ? 0 : dur * 0.8 }}
              >
                {Math.round(clamp(w, 2, 100))}% × {Math.round(clamp(h, 2, 100))}%
              </motion.text>
            </svg>
          )}

          {/* corner label tag (HTML overlay, rides the box corner) */}
          <AnimatePresence>
            {W > 0 && (animate || reduced || inView) && (
              <motion.div
                key={`${token}-tag`}
                className="absolute flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10.5px] uppercase tracking-label shadow-float"
                style={{
                  left: box.left,
                  top: tagOnTop ? box.top : box.top + box.h,
                  transform: tagOnTop ? "translateY(-100%)" : "translateY(2px)",
                  background: fill,
                  color: p.surface,
                }}
                initial={{ opacity: 0, y: tagOnTop ? 6 : -6, scale: 0.95 }}
                animate={{ opacity: inView ? 1 : 0, y: 0, scale: 1 }}
                transition={{
                  duration: reduced ? 0 : 0.36,
                  delay: reduced ? 0 : dur * 0.78,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.surface }} />
                {label}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="pointer-events-none absolute right-2 top-2 opacity-0 transition-opacity group-hover/hb:opacity-100">
          <div className="pointer-events-auto">
            <ReplayButton onClick={replay} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "highlight-box",
  name: "Highlight Box",
  category: "layout-annotation",
  description:
    "An emphasis region whose border draws itself around a slice of a figure — soft tint, corner ticks, and a riding label tag to frame the cluster, the regime, or the outlier you want a reader to see first.",
  tags: ["highlight", "annotation", "region", "emphasis", "callout", "overlay", "cluster"],
  badges: ["animated", "interactive", "themed", "responsive"],
  exportName: "HighlightBox",
  sourcePath: "layout-annotation/HighlightBox",
  aspect: 16 / 10,
  controls: [
    {
      key: "x",
      label: "X",
      type: "number",
      group: "Layout",
      default: 52,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "y",
      label: "Y",
      type: "number",
      group: "Layout",
      default: 22,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "w",
      label: "Width",
      type: "number",
      group: "Layout",
      default: 34,
      min: 2,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "h",
      label: "Height",
      type: "number",
      group: "Layout",
      default: 44,
      min: 2,
      max: 100,
      step: 1,
      unit: "%",
    },
    {
      key: "style",
      label: "Border style",
      type: "select",
      group: "Style",
      default: "dashed",
      options: [
        { value: "dashed", label: "Dashed" },
        { value: "solid", label: "Solid" },
        { value: "glow", label: "Glow" },
      ],
    },
    { key: "label", label: "Label tag", type: "text", group: "Labels", default: "Target cluster" },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation",
      type: "number",
      group: "Animation",
      default: 1200,
      min: 0,
      max: 3000,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "cluster",
      name: "Highlight a cluster",
      props: {
        x: 52,
        y: 20,
        w: 34,
        h: 46,
        style: "dashed",
        label: "Target cluster",
        title: "Latent embedding · t-SNE projection",
        caption: "The dashed region isolates the high-reward mode discovered after RLHF.",
      },
    },
    {
      id: "regime",
      name: "Frame a regime",
      props: {
        x: 8,
        y: 10,
        w: 40,
        h: 78,
        style: "solid",
        label: "Stable regime",
        accent: "",
        title: "Loss landscape · learning-rate sweep",
      },
    },
    {
      id: "glow",
      name: "Spotlight an outlier",
      props: {
        x: 64,
        y: 48,
        w: 22,
        h: 30,
        style: "glow",
        label: "Outlier",
        title: "Activation atlas",
        caption: "A glowing spotlight on the anomalous activation pocket flagged by the probe.",
      },
    },
  ],
};
