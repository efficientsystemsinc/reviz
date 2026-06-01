"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The soft, rounded, translucent tooltip pill seen across research figures.
 * Positioned absolutely inside a `position: relative` chart container.
 */
export function FloatingTooltip({
  x,
  y,
  visible,
  children,
  align = "center",
  className,
}: {
  x: number;
  y: number;
  visible: boolean;
  children: ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const tx = align === "center" ? "-50%" : align === "right" ? "-100%" : "0%";
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "pointer-events-none absolute z-30 max-w-[260px] rounded-lg px-3 py-2 text-left shadow-float-lg",
            "bg-ink/85 backdrop-blur-sm",
            className,
          )}
          style={{
            left: x,
            top: y,
            transform: `translate(${tx}, calc(-100% - 10px))`,
          }}
        >
          <div className="text-[12px] leading-snug text-canvas">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A compact key/value row for tooltip bodies. */
export function TooltipRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
