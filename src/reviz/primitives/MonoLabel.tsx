import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** The uppercase, letter-spaced monospace label used across reviz figures. */
export const MONO_LABEL_CLASS =
  "font-mono uppercase tracking-label text-[11px] leading-none text-ink-muted";

export function MonoLabel({
  children,
  className,
  as: As = "span",
  muted = true,
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "div" | "p" | "h3" | "figcaption";
  muted?: boolean;
}) {
  return (
    <As
      className={cn(
        "font-mono uppercase tracking-label text-[11px] leading-none",
        muted ? "text-ink-muted" : "text-ink",
        className,
      )}
    >
      {children}
    </As>
  );
}
