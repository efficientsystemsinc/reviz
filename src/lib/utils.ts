import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clamp a number into [min, max]. */
export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Linear interpolate. */
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Map a value from one range to another. */
export function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return outMin;
  return outMin + ((v - inMin) * (outMax - outMin)) / (inMax - inMin);
}

/** Deterministic, seedable pseudo-random generator (mulberry32). */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Format a number compactly (1.2k, 3.4M) for axis ticks / labels. */
export function formatCompact(n: number, digits = 1): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(digits).replace(/\.0$/, "") + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(digits).replace(/\.0$/, "") + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(digits).replace(/\.0$/, "") + "k";
  if (abs > 0 && abs < 1) return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return String(Math.round(n * 100) / 100);
}

/** Round to a sensible number of decimals for display. */
export function round(n: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

let _id = 0;
/** Stable-per-session unique id, useful for SVG defs (gradients, clips). */
export function uid(prefix = "rz") {
  _id += 1;
  return `${prefix}-${_id}`;
}

/** Convert polar coordinates to cartesian (for arcs, radial layouts). */
export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
