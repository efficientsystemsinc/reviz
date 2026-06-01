"use client";

import { Check, Code2, Download, ImageDown } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePalette } from "../ThemeProvider";
import { downloadPng, downloadSvg } from "@/lib/exportSvg";

/**
 * The consistent frame around every reviz figure.
 *
 * Provides the eyebrow/title/caption/source typographic scaffold seen in
 * research papers, plus one-click SVG/PNG export of the enclosed figure. The
 * frame is optional (set `bare`) for components that are their own frame.
 */
export function Figure({
  eyebrow,
  title,
  caption,
  source,
  children,
  actions,
  className,
  contentClassName,
  exportable,
  bare = false,
  padding = true,
  variant = "card",
  align = "left",
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  caption?: ReactNode;
  source?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
  exportable?: boolean;
  bare?: boolean;
  padding?: boolean;
  /** `card` = bordered surface with export chrome; `plain` = titled figure, no card. */
  variant?: "card" | "plain";
  align?: "left" | "center";
}) {
  const isCard = variant === "card";
  const showExport = exportable ?? isCard;
  const palette = usePalette();
  const contentRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<string | null>(null);

  const findSvg = () => contentRef.current?.querySelector("svg") as SVGSVGElement | null;

  const flash = (k: string) => {
    setDone(k);
    setTimeout(() => setDone(null), 1200);
  };

  const onSvg = () => {
    const svg = findSvg();
    if (svg) {
      downloadSvg(svg, `${slug(title)}.svg`);
      flash("svg");
    }
  };
  const onPng = () => {
    const svg = findSvg();
    if (svg) {
      downloadPng(svg, `${slug(title)}.png`, 3, palette.canvas);
      flash("png");
    }
  };

  if (bare) {
    return (
      <div ref={contentRef} className={cn("relative", className)}>
        {children}
      </div>
    );
  }

  const padX = isCard ? "px-5" : "";
  const centered = align === "center";

  return (
    <figure
      className={cn(
        "group/figure relative flex flex-col",
        isCard && "rounded-reviz border border-border bg-surface shadow-float",
        className,
      )}
    >
      {(eyebrow || title || actions || showExport) && (
        <div
          className={cn(
            "flex items-start gap-4",
            padX,
            isCard ? "pt-4" : "",
            centered ? "justify-center text-center" : "justify-between",
          )}
        >
          <div className={cn("min-w-0", centered && "mx-auto")}>
            {eyebrow && (
              <div className="mb-1 font-mono text-[11px] uppercase tracking-label text-accent">
                {eyebrow}
              </div>
            )}
            {title && (
              <h3
                className={cn(
                  "leading-tight text-ink",
                  isCard
                    ? "font-sans text-[15px] font-semibold"
                    : "font-mono text-[12px] uppercase tracking-label text-ink-muted",
                )}
              >
                {title}
              </h3>
            )}
          </div>
          {(actions || showExport) && !centered && (
            <div className="flex shrink-0 items-center gap-1.5 opacity-60 transition-opacity group-hover/figure:opacity-100">
              {actions}
              {showExport && (
                <div className="flex items-center gap-1">
                  <ExportBtn title="Download SVG" onClick={onSvg} done={done === "svg"}>
                    <Download className="h-3.5 w-3.5" />
                  </ExportBtn>
                  <ExportBtn title="Download PNG" onClick={onPng} done={done === "png"}>
                    <ImageDown className="h-3.5 w-3.5" />
                  </ExportBtn>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div
        ref={contentRef}
        className={cn("relative", padding && (isCard ? "px-5 py-4" : "py-3"), contentClassName)}
      >
        {children}
      </div>

      {(caption || source) && (
        <figcaption
          className={cn(
            "flex items-end gap-4 pb-1",
            padX,
            isCard && "px-5 pb-4",
            centered ? "flex-col items-center text-center" : "justify-between",
          )}
        >
          {caption && (
            <p className="font-serif text-[13px] italic leading-snug text-ink-muted">{caption}</p>
          )}
          {source && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {source}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

function ExportBtn({
  children,
  onClick,
  title,
  done,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  done: boolean;
}) {
  return (
    <motion.button
      type="button"
      title={title}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      className="grid h-7 w-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink"
    >
      {done ? <Check className="h-3.5 w-3.5 text-ok" /> : children}
    </motion.button>
  );
}

function slug(t: ReactNode): string {
  if (typeof t === "string")
    return t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "reviz-figure";
  return "reviz-figure";
}

export { Code2 };
