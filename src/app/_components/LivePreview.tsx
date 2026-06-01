"use client";

import { Download, ImageDown, Monitor, Smartphone, Square } from "lucide-react";
import { useRef, useState, type ComponentType } from "react";
import { ThemeScope } from "@/reviz/ThemeProvider";
import type { RevizPalette } from "@/reviz/theme";
import { downloadPng, downloadSvg } from "@/lib/exportSvg";
import { cn } from "@/lib/utils";
import { PreviewErrorBoundary } from "./ErrorBoundary";

type Bg = "dots" | "plain" | "grid";
type Width = "full" | "md" | "sm";

export function LivePreview({
  Component,
  props,
  palette,
  resetKey,
  instanceKey,
  filename = "reviz-figure",
  className,
  showToolbar = true,
}: {
  Component: ComponentType<Record<string, unknown>>;
  props: Record<string, unknown>;
  palette: RevizPalette;
  resetKey?: unknown;
  instanceKey?: unknown;
  filename?: string;
  className?: string;
  showToolbar?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [bg, setBg] = useState<Bg>("dots");
  const [width, setWidth] = useState<Width>("full");

  const svg = () => ref.current?.querySelector("svg") as SVGSVGElement | null;
  const widthClass = width === "full" ? "max-w-full" : width === "md" ? "max-w-2xl" : "max-w-sm";

  return (
    <div className={cn("relative flex flex-col", className)}>
      {showToolbar && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-surface/90 p-1 backdrop-blur">
          <ToolBtn active={bg === "dots"} onClick={() => setBg("dots")} title="Dot grid">
            <span className="text-[13px] leading-none">⠿</span>
          </ToolBtn>
          <ToolBtn active={bg === "grid"} onClick={() => setBg("grid")} title="Grid">
            <span className="text-[13px] leading-none">▦</span>
          </ToolBtn>
          <ToolBtn active={bg === "plain"} onClick={() => setBg("plain")} title="Plain">
            <Square className="h-3.5 w-3.5" />
          </ToolBtn>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <ToolBtn active={width === "full"} onClick={() => setWidth("full")} title="Full width">
            <Monitor className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn active={width === "md"} onClick={() => setWidth("md")} title="Medium">
            <Square className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn active={width === "sm"} onClick={() => setWidth("sm")} title="Narrow">
            <Smartphone className="h-3.5 w-3.5" />
          </ToolBtn>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <ToolBtn onClick={() => { const s = svg(); if (s) downloadSvg(s, `${filename}.svg`); }} title="Download SVG">
            <Download className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => { const s = svg(); if (s) downloadPng(s, `${filename}.png`, 3, palette.canvas); }} title="Download PNG">
            <ImageDown className="h-3.5 w-3.5" />
          </ToolBtn>
        </div>
      )}

      <ThemeScope
        palette={palette}
        className={cn(
          "flex min-h-[420px] flex-1 items-center justify-center overflow-auto rounded-reviz border border-border p-8 transition-colors",
          bg === "dots" && "reviz-dotgrid",
          bg === "grid" && "reviz-gridlines",
        )}
        style={{ background: `rgb(var(--rz-canvas))` }}
      >
        <div ref={ref} className={cn("w-full", widthClass)}>
          <PreviewErrorBoundary resetKey={resetKey}>
            <Component key={instanceKey as React.Key} {...props} />
          </PreviewErrorBoundary>
        </div>
      </ThemeScope>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink",
        active && "bg-surface-alt text-ink",
      )}
    >
      {children}
    </button>
  );
}
