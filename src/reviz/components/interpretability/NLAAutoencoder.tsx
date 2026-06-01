"use client";

import { motion } from "framer-motion";
import katex from "katex";
import { useMemo } from "react";
import {
  Figure,
  Glow,
  ResponsiveSvg,
  SoftShadow,
  ReplayButton,
  uid,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  mix,
  type RevizMeta,
} from "@/reviz";

export interface NLAAutoencoderProps {
  verbalizerLabel?: string;
  reconstructorLabel?: string;
  description?: string;
  lossLatex?: string;
  title?: string;
  caption?: string;
  source?: string;
  accent?: string;
  duration?: number;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function NLAAutoencoder({
  verbalizerLabel = "Activation Verbalizer",
  reconstructorLabel = "Activation Reconstructor",
  description = "The model is preparing to decline a request, weighing a safety policy against being helpful, with rising commitment to a polite refusal.",
  lossLatex = "\\min_{\\;\\theta}\\;\\bigl\\lVert\\, h_\\ell - \\hat{h}_\\ell \\,\\bigr\\rVert_2^{\\,2}",
  title = "",
  caption = "",
  source = "",
  accent = "",
  duration = 1600,
}: NLAAutoencoderProps) {
  const p = usePalette();
  const fill = accent || p.accent;
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();
  const reduced = usePrefersReducedMotion();

  const ids = useMemo(
    () => ({ shadow: uid("nla-shadow"), glow: uid("nla-glow") }),
    [],
  );

  const lossHtml = useMemo(() => {
    try {
      return katex.renderToString(lossLatex, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      return lossLatex;
    }
  }, [lossLatex]);

  // Per-step total duration in seconds; the sequence has ~7 beats.
  const beat = (reduced ? 0 : duration) / 1000 / 7;
  const t = (i: number) => i * beat;
  const draw = (i: number, span = 1) => ({
    initial: reduced ? false : { pathLength: 0, opacity: 0 },
    animate: { pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 },
    transition: { duration: beat * 0.9 * span, delay: t(i), ease: EASE },
  });
  const pop = (i: number) => ({
    initial: reduced ? false : { opacity: 0, scale: 0.92, y: 6 },
    animate: { opacity: inView ? 1 : 0, scale: inView ? 1 : 0.92, y: inView ? 0 : 6 },
    transition: { duration: beat * 1.1, delay: t(i), ease: EASE },
  });

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 7} margin={{ top: 18, right: 14, bottom: 70, left: 14 }}>
          {({ inner, margin }) => {
            const W = inner.width;
            const H = inner.height;

            // ---- layout: a 5-stage horizontal flow ------------------------
            const midY = H * 0.46;
            const vecW = Math.min(46, W * 0.05);
            const trapW = Math.min(120, W * 0.13);
            const quoteW = Math.min(248, W * 0.27);
            const gap = Math.max(
              16,
              (W - (vecW * 2 + trapW * 2 + quoteW)) / 4,
            );

            // x cursors for each stage
            const x0 = 0; // target model + h_l
            const x1 = x0 + vecW + gap; // verbalizer trapezoid
            const x2 = x1 + trapW + gap; // quote box
            const x3 = x2 + quoteW + gap; // reconstructor trapezoid
            const x4 = x3 + trapW + gap; // reconstructed vector

            // shared vertical extents
            const vecH = Math.min(118, H * 0.62);
            const vecTop = midY - vecH / 2;
            const trapH = Math.min(132, H * 0.7);
            const trapTop = midY - trapH / 2;
            const quoteH = Math.min(118, H * 0.62);
            const quoteTop = midY - quoteH / 2;

            const cellH = vecH / 6;

            const softFill = mix(p.surface, fill, 0.14);
            const arrowColor = mix(p.inkMuted, fill, 0.35);

            // arrow helper (straight, with arrowhead via marker-like triangle)
            const arrow = (from: number, to: number, key: string, beatIdx: number) => {
              const y = midY;
              const headLen = 7;
              const x2a = to - headLen;
              return (
                <g key={key}>
                  <motion.line
                    x1={from}
                    y1={y}
                    x2={x2a}
                    y2={y}
                    stroke={arrowColor}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    {...draw(beatIdx)}
                  />
                  <motion.path
                    d={`M ${x2a - 1} ${y - 4.2} L ${to} ${y} L ${x2a - 1} ${y + 4.2} Z`}
                    fill={arrowColor}
                    initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0.4 }}
                    transition={{ duration: beat * 0.6, delay: t(beatIdx) + beat * 0.7, ease: EASE }}
                    style={{ transformOrigin: `${to}px ${y}px` }}
                  />
                </g>
              );
            };

            const stageLabel = (cx: number, label: string, beatIdx: number) => (
              <motion.text
                x={cx}
                y={vecTop - 9}
                textAnchor="middle"
                fill={p.inkFaint}
                className="font-mono uppercase"
                style={{ fontSize: 9.5, letterSpacing: "0.13em" }}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: inView ? 1 : 0 }}
                transition={{ duration: beat, delay: t(beatIdx), ease: EASE }}
              >
                {label}
              </motion.text>
            );

            // vector cell stack (target h_l or reconstructed)
            const vector = (
              x: number,
              accentIt: boolean,
              hatLabel: boolean,
              beatIdx: number,
            ) => {
              const cells = Array.from({ length: 6 });
              return (
                <motion.g {...pop(beatIdx)} style={{ transformOrigin: `${x + vecW / 2}px ${midY}px` }}>
                  <rect
                    x={x}
                    y={vecTop}
                    width={vecW}
                    height={vecH}
                    rx={6}
                    fill={p.surface}
                    stroke={accentIt ? fill : p.border}
                    strokeWidth={accentIt ? 1.5 : 1}
                    filter={`url(#${ids.shadow})`}
                  />
                  {cells.map((_, i) => {
                    // deterministic-ish activation pattern
                    const seed = (i * 53 + (accentIt ? 11 : 29)) % 100;
                    const intensity = 0.16 + (seed / 100) * 0.66;
                    return (
                      <rect
                        key={i}
                        x={x + 4}
                        y={vecTop + 4 + i * cellH + (i === 0 ? 0 : 0)}
                        width={vecW - 8}
                        height={cellH - 3.2}
                        rx={2}
                        fill={accentIt ? withAlpha(fill, intensity) : withAlpha(p.inkMuted, intensity * 0.55)}
                      />
                    );
                  })}
                  {accentIt && (
                    <rect
                      x={x - 1.5}
                      y={vecTop - 1.5}
                      width={vecW + 3}
                      height={vecH + 3}
                      rx={7}
                      fill="none"
                      stroke={fill}
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      opacity={0.7}
                      filter={`url(#${ids.glow})`}
                    />
                  )}
                  <text
                    x={x + vecW / 2}
                    y={vecTop + vecH + 16}
                    textAnchor="middle"
                    fill={accentIt ? fill : p.inkMuted}
                    className="font-mono"
                    style={{ fontSize: 13 }}
                  >
                    {hatLabel ? "ĥℓ" : "hℓ"}
                  </text>
                </motion.g>
              );
            };

            // trapezoid (encoder narrows right; decoder widens right)
            const trapezoid = (
              x: number,
              label: string,
              direction: "narrow" | "widen",
              beatIdx: number,
            ) => {
              const topInset = direction === "narrow" ? 0 : trapH * 0.2;
              const botInset = direction === "narrow" ? 0 : trapH * 0.2;
              const rTopInset = direction === "narrow" ? trapH * 0.2 : 0;
              const rBotInset = direction === "narrow" ? trapH * 0.2 : 0;
              const pts = [
                [x, trapTop + topInset],
                [x + trapW, trapTop + rTopInset],
                [x + trapW, trapTop + trapH - rBotInset],
                [x, trapTop + trapH - botInset],
              ]
                .map((q) => q.join(","))
                .join(" ");
              const cx = x + trapW / 2;
              return (
                <motion.g {...pop(beatIdx)} style={{ transformOrigin: `${cx}px ${midY}px` }}>
                  <polygon
                    points={pts}
                    fill={softFill}
                    stroke={fill}
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                    filter={`url(#${ids.shadow})`}
                  />
                  <foreignObject x={x + 2} y={trapTop} width={trapW - 4} height={trapH}>
                    <div
                      style={{ height: "100%" }}
                      className="flex h-full items-center justify-center px-1 text-center"
                    >
                      <span
                        className="font-mono uppercase leading-tight text-ink"
                        style={{ fontSize: 9.5, letterSpacing: "0.08em" }}
                      >
                        {label}
                      </span>
                    </div>
                  </foreignObject>
                </motion.g>
              );
            };

            return (
              <g key={token} transform={`translate(${margin.left},${margin.top})`}>
                <defs>
                  <SoftShadow id={ids.shadow} dy={3} blur={7} opacity={0.14} />
                  <Glow id={ids.glow} blur={5} />
                </defs>

                {/* stage eyebrows */}
                {stageLabel(x0 + vecW / 2, "Target Model", 0)}
                {stageLabel(x2 + quoteW / 2, "Natural Language", 3)}
                {stageLabel(x4 + vecW / 2, "Reconstructed", 6)}

                {/* flow arrows (behind nodes' labels but drawn under boxes) */}
                {arrow(x0 + vecW, x1, "a1", 1)}
                {arrow(x1 + trapW, x2, "a2", 3)}
                {arrow(x2 + quoteW, x3, "a3", 4)}
                {arrow(x3 + trapW, x4, "a4", 6)}

                {/* stage 0: target model activation vector h_l */}
                {vector(x0, true, false, 0)}

                {/* stage 1: verbalizer (encoder) */}
                {trapezoid(x1, verbalizerLabel, "narrow", 2)}

                {/* stage 2: natural-language quote box */}
                <motion.g {...pop(3)} style={{ transformOrigin: `${x2 + quoteW / 2}px ${midY}px` }}>
                  <rect
                    x={x2}
                    y={quoteTop}
                    width={quoteW}
                    height={quoteH}
                    rx={10}
                    fill={withAlpha(fill, 0.05)}
                    stroke={fill}
                    strokeWidth={1.3}
                    strokeDasharray="5 4"
                  />
                  <foreignObject x={x2 + 12} y={quoteTop + 10} width={quoteW - 24} height={quoteH - 20}>
                    <div className="flex h-full flex-col justify-center">
                      <span className="mb-1 font-mono uppercase tracking-label text-accent" style={{ fontSize: 8.5, color: fill }}>
                        description
                      </span>
                      <p className="font-serif italic leading-snug text-ink" style={{ fontSize: 12 }}>
                        &ldquo;{description}&rdquo;
                      </p>
                    </div>
                  </foreignObject>
                </motion.g>

                {/* stage 3: reconstructor (decoder) */}
                {trapezoid(x3, reconstructorLabel, "widen", 5)}

                {/* stage 4: reconstructed vector h_hat_l */}
                {vector(x4, true, true, 6)}

                {/* bottom brace spanning the full pipeline with the loss eqn */}
                <Brace
                  x1={x0}
                  x2={x4 + vecW}
                  y={vecTop + vecH + 30}
                  color={p.borderStrong}
                  inView={inView}
                  reduced={reduced}
                  beat={beat}
                  delay={t(6) + beat}
                />
              </g>
            );
          }}
        </ResponsiveSvg>

        {/* loss equation rendered under the brace */}
        <motion.div
          key={token}
          className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1"
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: inView ? 1 : 0, y: inView ? 0 : 6 }}
          transition={{ duration: beat * 1.2, delay: (reduced ? 0 : duration) / 1000 * 0.92, ease: EASE }}
        >
          <span className="font-mono uppercase tracking-label text-ink-faint" style={{ fontSize: 9 }}>
            reconstruction objective
          </span>
          <div
            className="text-ink"
            style={{ fontSize: 15 }}
            dangerouslySetInnerHTML={{ __html: lossHtml }}
          />
        </motion.div>

        <ReplayButton onClick={replay} className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100" />
      </div>
    </Figure>
  );
}

function Brace({
  x1,
  x2,
  y,
  color,
  inView,
  reduced,
  beat,
  delay,
}: {
  x1: number;
  x2: number;
  y: number;
  color: string;
  inView: boolean;
  reduced: boolean;
  beat: number;
  delay: number;
}) {
  const w = x2 - x1;
  const mid = x1 + w / 2;
  const drop = 8;
  // a smooth curly-ish brace using two cubic segments meeting at a central tick
  const d = `M ${x1} ${y}
    C ${x1 + w * 0.06} ${y}, ${x1 + w * 0.1} ${y + drop}, ${mid - 6} ${y + drop}
    L ${mid} ${y + drop + 4}
    L ${mid + 6} ${y + drop}
    C ${x2 - w * 0.1} ${y + drop}, ${x2 - w * 0.06} ${y}, ${x2} ${y}`;
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={reduced ? false : { pathLength: 0, opacity: 0 }}
      animate={{ pathLength: inView ? 1 : 0, opacity: inView ? 1 : 0 }}
      transition={{ duration: beat * 1.4, delay, ease: EASE }}
    />
  );
}

export const meta: RevizMeta = {
  id: "nla-autoencoder",
  name: "NL Autoencoder Diagram",
  category: "interpretability",
  description:
    "An architecture diagram of a natural-language autoencoder: a model activation is verbalized into a plain-English description, then reconstructed, trained to minimize the residual.",
  tags: ["autoencoder", "verbalizer", "activations", "architecture", "interpretability", "diagram"],
  badges: ["animated", "exportable", "themed", "responsive"],
  exportName: "NLAAutoencoder",
  sourcePath: "interpretability/NLAAutoencoder",
  aspect: 16 / 7,
  controls: [
    {
      key: "description",
      label: "NL description",
      type: "textarea",
      group: "Data",
      rows: 3,
      default:
        "The model is preparing to decline a request, weighing a safety policy against being helpful, with rising commitment to a polite refusal.",
    },
    {
      key: "lossLatex",
      label: "Loss (LaTeX)",
      type: "text",
      group: "Data",
      default: "\\min_{\\;\\theta}\\;\\bigl\\lVert\\, h_\\ell - \\hat{h}_\\ell \\,\\bigr\\rVert_2^{\\,2}",
    },
    {
      key: "verbalizerLabel",
      label: "Verbalizer label",
      type: "text",
      group: "Labels",
      default: "Activation Verbalizer",
    },
    {
      key: "reconstructorLabel",
      label: "Reconstructor label",
      type: "text",
      group: "Labels",
      default: "Activation Reconstructor",
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "accent", label: "Accent", type: "color", group: "Style", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 1600,
      min: 0,
      max: 4000,
      step: 100,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "nla",
      name: "NL Autoencoder",
      props: {
        title: "Natural-language autoencoder",
        caption:
          "An activation hℓ is verbalized to a plain-English description, then reconstructed; training minimizes the activation residual.",
        verbalizerLabel: "Activation Verbalizer",
        reconstructorLabel: "Activation Reconstructor",
        description:
          "The model is preparing to decline a request, weighing a safety policy against being helpful, with rising commitment to a polite refusal.",
      },
    },
    {
      id: "concept",
      name: "Concept probe",
      props: {
        title: "Verbalizing a refusal direction",
        verbalizerLabel: "Concept Verbalizer",
        reconstructorLabel: "Concept Decoder",
        description:
          "Strong activation along a deception-detection feature; the residual stream is signaling that the prior statement was likely untrue.",
        lossLatex: "\\mathcal{L} = \\bigl\\lVert h_\\ell - \\hat{h}_\\ell \\bigr\\rVert_2^{2} + \\lambda\\,\\lVert z \\rVert_1",
      },
    },
  ],
};
