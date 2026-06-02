"use client";

import { type ComponentType, type RefObject } from "react";
import { ThemeScope } from "@/reviz/ThemeProvider";
import type { RevizPalette } from "@/reviz/theme";
import { cn } from "@/lib/utils";
import { PreviewErrorBoundary } from "./ErrorBoundary";

export type PreviewBg = "dots" | "plain" | "grid";
export type PreviewWidth = "full" | "md" | "sm";

/**
 * The themed preview surface. Deliberately chrome-less — no overlay toolbar on
 * top of the figure (it distracts from the component). Background / width /
 * export controls live in the page chrome and are passed in as props.
 */
export function LivePreview({
  Component,
  props,
  palette,
  resetKey,
  instanceKey,
  className,
  bg = "dots",
  width = "full",
  containerRef,
  fontVars,
}: {
  Component: ComponentType<Record<string, unknown>>;
  props: Record<string, unknown>;
  palette: RevizPalette;
  resetKey?: unknown;
  instanceKey?: unknown;
  className?: string;
  bg?: PreviewBg;
  width?: PreviewWidth;
  containerRef?: RefObject<HTMLDivElement>;
  fontVars?: Record<string, string>;
}) {
  const widthClass = width === "full" ? "max-w-full" : width === "md" ? "max-w-2xl" : "max-w-sm";

  return (
    <ThemeScope
      palette={palette}
      className={cn(
        "flex min-h-[420px] flex-1 items-center justify-center overflow-auto rounded-reviz border border-border p-8 transition-colors",
        bg === "dots" && "reviz-dotgrid",
        bg === "grid" && "reviz-gridlines",
        className,
      )}
      style={{ background: `rgb(var(--rz-canvas))`, ...fontVars }}
    >
      <div ref={containerRef} className={cn("w-full", widthClass)}>
        <PreviewErrorBoundary resetKey={resetKey}>
          <Component key={instanceKey as React.Key} {...props} />
        </PreviewErrorBoundary>
      </div>
    </ThemeScope>
  );
}
