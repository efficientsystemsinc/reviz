"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useId, type ReactNode } from "react";

/** Small shared UI atoms for the showcase chrome. */

export function Button({
  children,
  onClick,
  variant = "default",
  size = "md",
  className,
  active,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "accent" | "ghost" | "outline";
  size?: "sm" | "md";
  className?: string;
  active?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 select-none";
  const sizes = { sm: "h-7 px-2.5 text-[12px]", md: "h-9 px-3.5 text-[13px]" };
  const variants = {
    default: "bg-surface-alt text-ink hover:bg-border/60 border border-border",
    accent: "bg-accent text-accent-contrast hover:opacity-90 shadow-float",
    ghost: cn("text-ink-muted hover:bg-surface-alt hover:text-ink", active && "bg-surface-alt text-ink"),
    outline: cn(
      "border border-border text-ink-muted hover:border-border-strong hover:text-ink",
      active && "border-accent text-accent bg-accent/5",
    ),
  };
  return (
    <motion.button
      type={type}
      title={title}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={cn(base, sizes[size], variants[variant], className)}
    >
      {children}
    </motion.button>
  );
}

export function Chip({
  children,
  className,
  tone = "muted",
}: {
  children: ReactNode;
  className?: string;
  tone?: "muted" | "accent" | "ok";
}) {
  const tones = {
    muted: "bg-surface-alt text-ink-muted border-border",
    accent: "bg-accent/10 text-accent border-accent/25",
    ok: "bg-ok/10 text-ok border-ok/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("font-mono text-[10.5px] uppercase tracking-label text-ink-faint", className)}>
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  // Vertical centering via flex (no framer `layout`, which would clobber the
  // CSS transform and drop the knob off-center). Horizontal move is a plain
  // CSS transition — rock-solid, no jitter.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200",
        checked ? "border-accent bg-accent" : "border-border bg-surface-alt",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-3.5 w-3.5 rounded-full bg-canvas shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-out",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  // Unique layoutId per instance — a shared id makes the active pill fly across
  // unrelated Segmented controls elsewhere on the page.
  const uid = useId();
  return (
    <div className={cn("flex rounded-lg border border-border bg-surface-alt p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="relative flex flex-1 items-center justify-center rounded-md px-2.5 py-1.5 text-[12px] font-medium leading-none"
          >
            {active && (
              <motion.span
                layoutId={`seg-${uid}`}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                className="absolute inset-0 rounded-md bg-surface shadow-float"
              />
            )}
            <span className={cn("relative z-10 inline-flex items-center justify-center gap-1.5", active ? "text-ink" : "text-ink-faint")}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
