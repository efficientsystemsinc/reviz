"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Sliders, Palette, Code2, ArrowUpRight } from "lucide-react";
import { getEntry } from "@/reviz/registry";
import { CATEGORIES } from "@/reviz/types";
import { propsForPreset } from "@/reviz/types";
import { generateCode } from "@/reviz/codegen";
import { cn } from "@/lib/utils";
import { ControlsPane } from "./ControlsPane";
import { ThemePane, resolvePreviewPalette, type PreviewTheme } from "./ThemePane";
import { LivePreview } from "./LivePreview";
import { CodePanel } from "./CodePanel";
import { Button, Chip, Segmented } from "./ui";

export function ComponentDetail({ id }: { id: string }) {
  const entry = getEntry(id);
  const [presetId, setPresetId] = useState(entry?.meta.presets?.[0]?.id);
  const [props, setProps] = useState<Record<string, unknown>>(() =>
    entry ? propsForPreset(entry.meta, entry.meta.presets?.[0]?.id) : {},
  );
  const [theme, setTheme] = useState<PreviewTheme>({ paletteId: "paper", overrides: {} });
  const [tab, setTab] = useState<"customize" | "theme">("customize");
  const [includeDefaults, setIncludeDefaults] = useState(false);

  const palette = useMemo(() => resolvePreviewPalette(theme), [theme]);
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

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-5 lg:px-8">
        <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-label text-ink-faint">
          <Link href="/browse" className="hover:text-ink">
            Library
          </Link>
          <span>/</span>
          <Link href={`/browse?cat=${meta.category}`} className="hover:text-ink">
            {category?.name}
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink">{meta.name}</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-muted">{meta.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {meta.badges?.map((b) => (
              <Chip key={b}>{b}</Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_340px]">
        {/* Left: preview + code */}
        <div className="flex min-w-0 flex-col gap-5 p-6 lg:p-8">
          {meta.presets && meta.presets.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">Presets</span>
              <div className="flex flex-wrap gap-1.5">
                {meta.presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPreset(p.id)}
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
          )}

          <LivePreview
            Component={Component}
            props={props}
            palette={palette}
            resetKey={resetKey}
            filename={meta.id}
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
            <Link
              href={`/editor/${meta.id}`}
              className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-accent hover:underline"
            >
              Open in editor <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Right: controls */}
        <aside className="flex flex-col border-t border-border lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:border-l lg:border-t-0">
          <div className="z-10 border-b border-border bg-canvas/80 p-3 backdrop-blur">
            <Segmented
              options={[
                { value: "customize", label: (<span className="inline-flex items-center gap-1.5"><Sliders className="h-3.5 w-3.5" /> Customize</span>) },
                { value: "theme", label: (<span className="inline-flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Theme</span>) },
              ]}
              value={tab}
              onChange={(v) => setTab(v as "customize" | "theme")}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
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
