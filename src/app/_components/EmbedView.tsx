"use client";

import { useSearchParams } from "next/navigation";
import { getEntry } from "@/reviz/registry";
import { propsForPreset } from "@/reviz/types";
import { getPalette } from "@/reviz/theme";
import { ThemeScope } from "@/reviz/ThemeProvider";
import { PreviewErrorBoundary } from "./ErrorBoundary";

/**
 * Full-bleed, chrome-less render of a single component with a chosen preset and
 * palette. Powers iframe embeds and headless visual QA.
 * Query params: ?p=<paletteId>&preset=<presetId>&w=<maxWidthPx>
 */
export function EmbedView({ id }: { id: string }) {
  const params = useSearchParams();
  // QA escape hatch: render entrance state eagerly (see useInView). Set before
  // the child component mounts so its hooks read it on first render.
  if (typeof window !== "undefined" && params.get("eager") === "1") {
    (window as unknown as { __REVIZ_EAGER__?: boolean }).__REVIZ_EAGER__ = true;
  }
  const entry = getEntry(id);
  if (!entry) {
    return <div className="grid min-h-screen place-items-center text-ink-faint">Unknown component: {id}</div>;
  }
  const palette = getPalette(params.get("p") ?? "paper");
  const props = propsForPreset(entry.meta, params.get("preset") ?? undefined);
  const maxW = params.get("w") ?? "760";
  const { Component } = entry;

  return (
    <ThemeScope
      palette={palette}
      className="grid min-h-screen place-items-center p-10"
      style={{ background: `rgb(var(--rz-canvas))` }}
    >
      <div style={{ width: "100%", maxWidth: `${maxW}px` }}>
        <PreviewErrorBoundary resetKey={id}>
          <Component {...props} />
        </PreviewErrorBoundary>
      </div>
    </ThemeScope>
  );
}
