"use client";

import { RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** The small "replay" control seen on animated research figures. */
export function ReplayButton({
  onClick,
  label = "Replay",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      whileHover={{ y: -1 }}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5",
        "font-mono text-[10px] uppercase tracking-label text-ink-muted",
        "transition-colors hover:border-border-strong hover:text-ink",
        className,
      )}
    >
      <RotateCcw className="h-3 w-3 transition-transform duration-500 group-hover:-rotate-180" />
      {label}
    </motion.button>
  );
}
