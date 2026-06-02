"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  OctagonAlert,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import {
  Figure,
  ReplayButton,
  useInView,
  usePalette,
  usePrefersReducedMotion,
  useReplay,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

type Tone = "info" | "success" | "warning" | "danger" | "note";

interface ToneSpec {
  /** Default label shown when no title is provided. */
  label: string;
  Icon: LucideIcon;
  /** Resolve the tone's accent from the active palette. */
  accent: (p: ReturnType<typeof usePalette>) => string;
}

const TONES: Record<Tone, ToneSpec> = {
  info: { label: "Note", Icon: Info, accent: (p) => p.accent },
  success: { label: "Success", Icon: CheckCircle2, accent: (p) => p.ok },
  warning: { label: "Warning", Icon: AlertTriangle, accent: (p) => p.warn },
  danger: { label: "Caution", Icon: OctagonAlert, accent: (p) => p.bad },
  note: { label: "Note", Icon: Pencil, accent: (p) => p.inkMuted },
};

export interface CalloutNoteProps {
  tone?: Tone;
  title?: string;
  body?: string;
  icon?: boolean;
  /** Figure title (chrome above the callout). Distinct from the callout's own title. */
  title_?: string;
  caption?: string;
  source?: string;
  duration?: number;
}

export default function CalloutNote({
  tone = "warning",
  title = "Distribution shift at inference time",
  body = "The held-out evaluation set was sampled from the same crawl as training data. Production traffic skews 14% toward longer, multi-turn prompts, so reported accuracy is an optimistic upper bound. Re-validate on a freshly logged slice before promoting this checkpoint.",
  icon = true,
  title_ = "",
  caption = "",
  source = "",
  duration = 700,
}: CalloutNoteProps) {
  const p = usePalette();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const { token, replay } = useReplay();

  const spec = TONES[tone] ?? TONES.info;
  const fill = useMemo(() => spec.accent(p), [spec, p]);
  const Icon = spec.Icon;
  const heading = title.trim() || spec.label;

  const active = inView || reduced;
  const sec = duration / 1000;
  const ease = [0.22, 1, 0.36, 1] as const;

  // When entrance state is forced visible up front (reduced-motion, or the headless
  // QA "eager" escape hatch), there is no scroll-in moment to animate from — so we
  // mount each element directly at its resting state by disabling `initial`. This
  // guarantees the static final frame is fully legible even if the reveal tween is
  // never given time to run, while leaving the normal scroll-in + replay animation
  // untouched. `animate` always targets the visible state; the hidden start values
  // live only in `initial`.
  const eager =
    typeof window !== "undefined" &&
    (window as unknown as { __REVIZ_EAGER__?: boolean }).__REVIZ_EAGER__ === true;
  const settled = eager || reduced;

  // Soft tint wash + matching border, scaled gently for dark mode legibility.
  const cardBg = withAlpha(fill, p.mode === "dark" ? 0.1 : 0.06);
  const cardBorder = withAlpha(fill, 0.28);
  const iconWash = withAlpha(fill, p.mode === "dark" ? 0.18 : 0.13);

  const rise = (delay: number) => ({
    initial: settled ? false : { opacity: 0, y: 8 },
    animate: settled || active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
    transition: { duration: sec, delay: reduced ? 0 : delay, ease },
  });

  return (
    <Figure variant="plain" align="left" title={title_} caption={caption} source={source}>
      <div ref={ref} className="group/callout relative">
        <motion.aside
          key={token}
          role="note"
          className="relative overflow-hidden rounded-reviz border"
          style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          initial={settled ? false : { opacity: 0, y: 12 }}
          animate={settled || active ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: sec, ease }}
        >
          {/* Left accent rail that wipes downward on entrance. */}
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] origin-top"
            style={{ backgroundColor: fill }}
            initial={settled ? false : { scaleY: 0 }}
            animate={{ scaleY: settled || active ? 1 : 0 }}
            transition={{ duration: sec * 0.9, delay: reduced ? 0 : 0.04, ease }}
          />

          <div className="relative flex gap-3.5 px-5 py-4 sm:gap-4 sm:px-6 sm:py-5">
            {icon && (
              <motion.div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: iconWash, color: fill }}
                initial={settled ? false : { opacity: 0, scale: 0.6 }}
                animate={settled || active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
                transition={{
                  duration: sec * 0.7,
                  delay: reduced ? 0 : 0.1,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} aria-hidden />
              </motion.div>
            )}

            <div className="min-w-0 flex-1">
              {heading && (
                <motion.h4
                  className="font-mono text-[12px] font-semibold uppercase tracking-label"
                  style={{ color: fill }}
                  {...rise(0.08)}
                >
                  {heading}
                </motion.h4>
              )}

              {body && (
                <motion.p
                  className="mt-1.5 text-pretty font-sans text-[14px] leading-relaxed text-ink-muted"
                  {...rise(0.16)}
                >
                  {body}
                </motion.p>
              )}
            </div>
          </div>
        </motion.aside>

        <div className="pointer-events-none absolute -bottom-2 right-0 translate-y-full pt-2 opacity-0 transition-opacity duration-200 group-hover/callout:pointer-events-auto group-hover/callout:opacity-100">
          <ReplayButton onClick={replay} />
        </div>
      </div>
    </Figure>
  );
}

export const meta: RevizMeta = {
  id: "callout-note",
  name: "Callout Note",
  category: "text-narrative",
  description:
    "An admonition box in five selectable tones — info, success, warning, danger, note — each with its own icon and palette-aware accent, a softly tinted wash, and a left accent rail that wipes in.",
  tags: ["callout", "admonition", "note", "warning", "narrative", "alert"],
  badges: ["animated", "themed", "responsive"],
  exportName: "CalloutNote",
  sourcePath: "text-narrative/CalloutNote",
  aspect: 16 / 6,
  controls: [
    {
      key: "tone",
      label: "Tone",
      type: "select",
      group: "Style",
      default: "warning",
      options: [
        { value: "info", label: "Info" },
        { value: "success", label: "Success" },
        { value: "warning", label: "Warning" },
        { value: "danger", label: "Danger" },
        { value: "note", label: "Note" },
      ],
    },
    {
      key: "title",
      label: "Title",
      type: "text",
      group: "Labels",
      default: "Distribution shift at inference time",
    },
    {
      key: "body",
      label: "Body",
      type: "textarea",
      group: "Labels",
      rows: 5,
      default:
        "The held-out evaluation set was sampled from the same crawl as training data. Production traffic skews 14% toward longer, multi-turn prompts, so reported accuracy is an optimistic upper bound. Re-validate on a freshly logged slice before promoting this checkpoint.",
    },
    { key: "icon", label: "Show icon", type: "boolean", group: "Layout", default: true },
    { key: "title_", label: "Figure title", type: "text", group: "Labels", default: "" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    {
      key: "duration",
      label: "Animation (ms)",
      type: "number",
      group: "Animation",
      default: 700,
      min: 0,
      max: 2500,
      step: 50,
      unit: "ms",
    },
  ],
  presets: [
    {
      id: "distribution-shift",
      name: "Warning · distribution shift",
      props: {
        tone: "warning",
        icon: true,
        title: "Distribution shift at inference time",
        body: "The held-out evaluation set was sampled from the same crawl as training data. Production traffic skews 14% toward longer, multi-turn prompts, so reported accuracy is an optimistic upper bound. Re-validate on a freshly logged slice before promoting this checkpoint.",
        source: "Model card · §4 Limitations",
      },
    },
    {
      id: "seed-reproducibility",
      name: "Info · reproducibility",
      props: {
        tone: "info",
        icon: true,
        title: "Reproducing these results",
        body: "All runs use a fixed seed (1337) and deterministic CUDA kernels. Set PYTHONHASHSEED=0 and disable TF32 to match the reported metrics exactly; otherwise expect ±0.3% variance across hardware.",
      },
    },
    {
      id: "checkpoint-shipped",
      name: "Success · checkpoint shipped",
      props: {
        tone: "success",
        icon: true,
        title: "Checkpoint promoted to production",
        body: "v2.4-rc3 cleared all gating evals: +1.8 pts on MMLU, no regressions on safety suites, and p99 latency within budget. Rollout is at 100% with automatic rollback armed.",
        source: "Release log · 2026-05-29",
      },
    },
  ],
};
