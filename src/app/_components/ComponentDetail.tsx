"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Sliders, Palette, Code2, Download, ImageDown, Monitor, Square, Smartphone } from "lucide-react";
import { getEntry } from "@/reviz/registry";
import { CATEGORIES, propsForPreset } from "@/reviz/types";
import { generateCode } from "@/reviz/codegen";
import { fontVars } from "@/reviz/fonts";
import { downloadPng, downloadSvg } from "@/lib/exportSvg";
import { cn } from "@/lib/utils";
import { ControlsPane } from "./ControlsPane";
import { ThemePane, resolvePreviewPalette, type PreviewTheme } from "./ThemePane";
import { LivePreview, type PreviewBg, type PreviewWidth } from "./LivePreview";
import { CodePanel } from "./CodePanel";
import { Chip } from "./ui";

export function ComponentDetail({ id }: { id: string }) {
  const entry = getEntry(id);
  const [presetId, setPresetId] = useState(entry?.meta.presets?.[0]?.id);
  const [props, setProps] = useState<Record<string, unknown>>(() =>
    entry ? propsForPreset(entry.meta, entry.meta.presets?.[0]?.id) : {},
  );
  const [theme, setTheme] = useState<PreviewTheme>({ paletteId: "paper", overrides: {} });
  const [tab, setTab] = useState<"customize" | "theme">("customize");
  const [includeDefaults, setIncludeDefaults] = useState(false);
  const [bg, setBg] = useState<PreviewBg>("dots");
  const [width, setWidth] = useState<PreviewWidth>("full");
  const containerRef = useRef<HTMLDivElement>(null);

  const palette = useMemo(() => resolvePreviewPalette(theme), [theme]);
  const fonts = useMemo(() => fontVars(theme.fonts), [theme]);
  const code = useMemo(
    () => (entry ? generateCode(entry.meta, props, { includeDefaults }) : ""),
    [entry, props, includeDefaults],
  );

  if (!entry) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-ink-muted">
        <div className="text-center">
          <div className="mb-2 font-mono text-[12px] uppercase tracking-label">404</div>
          <p>Component “{id}” not found.</p>
          <Link href="/browse" className="mt-3 inline-block text-accent hover:underline">
            ← Back to library
          </Link>
        </div>
      </div>
    );
  }

  const { meta, Component } = entry;
  const category = CATEGORIES.find((c) => c.id === meta.category);
  const resetKey = JSON.stringify(props) + JSON.stringify(theme);

  const selectPreset = (pid: string) => {
    setPresetId(pid);
    setProps(propsForPreset(meta, pid));
  };

  const svg = () => containerRef.current?.querySelector("svg") as SVGSVGElement | null;

  return (
    <div className="flex h-full flex-col">
      {/* Header — fixed */}
      <div className="shrink-0 border-b border-border px-6 py-4 lg:px-8">
        <div className="mb-1.5 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-label text-ink-faint">
          <Link href="/browse" className="hover:text-ink">
            Library
          </Link>
          <span>/</span>
          <Link href={`/browse?cat=${meta.category}`} className="hover:text-ink">
            {category?.name}
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink">{meta.name}</h1>
            <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">{meta.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {meta.badges?.map((b) => (
              <Chip key={b}>{b}</Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Body — two independently-scrolling panes; page itself never scrolls */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
        {/* Left: preview + code */}
        <div className="flex min-w-0 flex-col gap-5 overflow-y-auto p-6 lg:p-8">
          {/* Examples + preview toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {meta.presets && meta.presets.length > 1 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">Examples</span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectPreset(p.id)}
                      title="Load this example into the editor"
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12px] transition-all",
                        presetId === p.id
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-ink-muted hover:border-border-strong hover:text-ink",
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <span />
            )}

            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface p-1">
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
              <ToolBtn onClick={() => { const s = svg(); if (s) downloadSvg(s, `${meta.id}.svg`); }} title="Download SVG">
                <Download className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn onClick={() => { const s = svg(); if (s) downloadPng(s, `${meta.id}.png`, 3, palette.canvas); }} title="Download PNG">
                <ImageDown className="h-3.5 w-3.5" />
              </ToolBtn>
            </div>
          </div>

          <LivePreview
            Component={Component}
            props={props}
            palette={palette}
            resetKey={resetKey}
            bg={bg}
            width={width}
            containerRef={containerRef}
            fontVars={fonts}
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-label text-ink-faint">
                <Code2 className="h-3.5 w-3.5" /> Generated code
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={includeDefaults}
                  onChange={(e) => setIncludeDefaults(e.target.checked)}
                  className="accent-accent"
                />
                Include defaults
              </label>
            </div>
            <CodePanel code={code} />
          </div>
        </div>

        {/* Right: customize / theme — its own scroll */}
        <aside className="flex min-h-0 flex-col border-t border-border lg:border-l lg:border-t-0">
          <div className="shrink-0 border-b border-border bg-canvas/80 p-3 backdrop-blur">
            <TabSwitch tab={tab} onChange={setTab} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "customize" ? (
              <ControlsPane
                controls={meta.controls}
                values={props}
                onChange={(k, v) => setProps((prev) => ({ ...prev, [k]: v }))}
                onReset={() => setProps(propsForPreset(meta, presetId))}
              />
            ) : (
              <ThemePane theme={theme} onChange={setTheme} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TabSwitch({ tab, onChange }: { tab: "customize" | "theme"; onChange: (t: "customize" | "theme") => void }) {
  const items: { value: "customize" | "theme"; label: string; icon: React.ReactNode }[] = [
    { value: "customize", label: "Customize", icon: <Sliders className="h-3.5 w-3.5" /> },
    { value: "theme", label: "Theme", icon: <Palette className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex rounded-lg border border-border bg-surface-alt p-0.5">
      {items.map((it) => {
        const active = it.value === tab;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium leading-none transition-colors",
              active ? "bg-surface text-ink shadow-float" : "text-ink-faint hover:text-ink",
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
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
