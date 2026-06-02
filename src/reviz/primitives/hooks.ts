"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** SSR-safe layout effect. */
const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Respect the user's reduced-motion preference. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** True once the element scrolls into view. Drives entrance animations. */
export function useInView<T extends Element = HTMLDivElement>(
  options: { once?: boolean; margin?: string; amount?: number } = {},
) {
  const { once = true, margin = "0px 0px -10% 0px", amount = 0.15 } = options;
  const ref = useRef<T | null>(null);
  // Eager mode: a global escape hatch (set via ?eager=1 on the embed route) that
  // forces entrance state to "visible" immediately. Used for headless visual QA,
  // where IntersectionObserver is unreliable under Chrome's virtual-time budget.
  const eager =
    typeof window !== "undefined" && (window as unknown as { __REVIZ_EAGER__?: boolean }).__REVIZ_EAGER__;
  const [inView, setInView] = useState(Boolean(eager));
  useEffect(() => {
    if (eager) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin: margin, threshold: amount },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [once, margin, amount, eager]);
  return [ref, inView] as const;
}

/** Measure an element's box, updating on resize. */
export function useMeasure<T extends Element = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [rect, setRect] = useState({ width: 0, height: 0 });
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setRect({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, rect] as const;
}

const EASINGS = {
  linear: (t: number) => t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  spring: (t: number) => {
    // critically-ish damped overshoot
    return 1 - Math.cos(t * Math.PI * 0.5) * Math.exp(-t * 3.2);
  },
} as const;

export type EasingName = keyof typeof EASINGS;

/**
 * Tween a number from 0 (or a start) to `target` over `duration` ms.
 * Returns the live value. Honors reduced-motion (snaps to target).
 * `trigger` re-runs the tween when it changes (used for replay).
 */
export function useAnimatedNumber(
  target: number,
  opts: {
    duration?: number;
    delay?: number;
    easing?: EasingName;
    from?: number;
    enabled?: boolean;
    trigger?: unknown;
  } = {},
): number {
  const { duration = 900, delay = 0, easing = "easeOut", from = 0, enabled = true } = opts;
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(enabled && !reduced ? from : target);
  const raf = useRef<number>();
  const startRef = useRef<number>();

  useEffect(() => {
    if (!enabled || reduced) {
      setValue(target);
      return;
    }
    const ease = EASINGS[easing];
    let cancelled = false;
    startRef.current = undefined;
    const tick = (now: number) => {
      if (cancelled) return;
      if (startRef.current === undefined) startRef.current = now + delay;
      const elapsed = now - startRef.current;
      if (elapsed < 0) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / duration);
      setValue(from + (target - from) * ease(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, delay, easing, from, enabled, reduced, opts.trigger]);

  return value;
}

/**
 * A normalized 0→1 progress driver over `duration` ms.
 * Useful for staggered draw-ins, playheads, and timelines. Replays via key.
 */
export function useProgress(
  opts: { duration?: number; delay?: number; enabled?: boolean; loop?: boolean; trigger?: unknown } = {},
): number {
  const { duration = 1000, delay = 0, enabled = true, loop = false } = opts;
  const reduced = usePrefersReducedMotion();
  const [p, setP] = useState(enabled && !reduced ? 0 : 1);
  const raf = useRef<number>();
  const start = useRef<number>();
  useEffect(() => {
    if (!enabled || reduced) {
      setP(1);
      return;
    }
    let cancelled = false;
    start.current = undefined;
    const tick = (now: number) => {
      if (cancelled) return;
      if (start.current === undefined) start.current = now + delay;
      const elapsed = now - start.current;
      if (elapsed < 0) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      let t = Math.min(1, elapsed / duration);
      if (loop) t = (elapsed % duration) / duration;
      setP(t);
      if (loop || t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, delay, enabled, loop, reduced, opts.trigger]);
  return p;
}

/** A replay token: call `replay()` to re-trigger entrance animations. */
export function useReplay() {
  const [token, setToken] = useState(0);
  const replay = useCallback(() => setToken((t) => t + 1), []);
  return { token, replay };
}

/** Track hover index for interactive charts. */
export function useHoverIndex() {
  const [index, setIndex] = useState<number | null>(null);
  return { index, setIndex, clear: () => setIndex(null) };
}
