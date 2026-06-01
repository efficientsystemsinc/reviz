"use client";

import { usePalette } from "../ThemeProvider";

/**
 * Reusable SVG <defs>. Components reference these by id. Each takes a unique id
 * (use the `uid()` helper) so multiple instances on a page don't collide.
 */

/** A soft drop shadow filter. */
export function SoftShadow({ id, dy = 4, blur = 8, opacity = 0.18 }: { id: string; dy?: number; blur?: number; opacity?: number }) {
  const p = usePalette();
  return (
    <filter id={id} x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy={dy} stdDeviation={blur} floodColor={p.shadow} floodOpacity={opacity} />
    </filter>
  );
}

/** A glow filter for emphasis. */
export function Glow({ id, blur = 6 }: { id: string; blur?: number }) {
  return (
    <filter id={id} x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation={blur} result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** A vertical fade gradient from a color to transparent (for area fills). */
export function VerticalFade({ id, color, from = 0.34, to = 0 }: { id: string; color: string; from?: number; to?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={from} />
      <stop offset="100%" stopColor={color} stopOpacity={to} />
    </linearGradient>
  );
}

/** A left→right two-color gradient. */
export function LinearGradient({
  id,
  from,
  to,
  angle = 0,
}: {
  id: string;
  from: string;
  to: string;
  angle?: number;
}) {
  const rad = (angle * Math.PI) / 180;
  const x2 = (Math.cos(rad) * 0.5 + 0.5).toFixed(4);
  const y2 = (Math.sin(rad) * 0.5 + 0.5).toFixed(4);
  return (
    <linearGradient id={id} x1={(1 - Number(x2)).toFixed(4)} y1={(1 - Number(y2)).toFixed(4)} x2={x2} y2={y2}>
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  );
}
