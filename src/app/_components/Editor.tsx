"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Play, Sliders, Palette, Code2, ArrowUpRight } from "lucide-react";
import { REGISTRY, getEntry } from "@/reviz/registry";
import { CATEGORIES, propsForPreset } from "@/reviz/types";
import { generateCode } from "@/reviz/codegen";
import { cn } from "@/lib/utils";
import { ControlsPane } from "./ControlsPane";
import { ThemePane, resolvePreviewPalette, type PreviewTheme } from "./ThemePane";
import { LivePreview } from "./LivePreview";
import { CodePanel } from "./CodePanel";
import { Segmented } from "./ui";

export function Editor({ initialId }: { initialId?: string }) {
  const first = getEntry(initialId ?? "") ? initialId! : REGISTRY[0]?.meta.id;
  const [id, setId] = useState(first);
  const entry = getEntry(id);
  const [presetId, setPresetId] = useState(entry?.meta.presets?.[0]?.id);
  const [props, setProps] = useState<Record<string, unknown>>(() =>
    entry ? propsForPreset(entry.meta, entry.meta.presets?.[0]?.id) : {},
  );
  const [theme, setTheme] = useState<PreviewTheme>({ paletteId: "paper", overrides: {} });
  const [tab, setTab] = useState<"customize" | "theme">("customize");
  const [showCode, setShowCode] = useState(true);
  const [replay, setReplay] = useState(0);

  const palette = useMemo(() => resolvePreviewPalette(theme), [theme]);
  const code = useMemo(() => (entry ? generateCode(entry.meta, props) : ""), [entry, props]);

  const switchTo = (newId: string) => {
    const e = getEntry(newId);
    if (!e) return;
    setId(newId);
    setPresetId(e.meta.presets?.[0]?.id);
    setProps(propsForPreset(e.meta, e.meta.presets?.[0]?.id));
    setReplay((r) => r + 1);
  };

  if (!entry) {
    return <div className="grid h-full place-items-center text-ink-faint">No components available yet.</div>;
  }
  const { meta, Component } = entry;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <ComponentSelect id={id} onChange={switchTo} />
        {meta.presets && meta.presets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {meta.presets.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPresetId(p.id);
                  setProps(propsForPreset(meta, p.id));
                  setReplay((r) => r + 1);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] transition-all",
                  presetId === p.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-ink-muted hover:text-ink",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setReplay((r) => r + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
          >
            <Play className="h-3.5 w-3.5" /> Replay
          </button>
          <button
            onClick={() => setShowCode((s) => !s)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
              showCode ? "border-accent text-accent" : "border-border text-ink-muted hover:text-ink",
            )}
          >
            <Code2 className="h-3.5 w-3.5" /> Code
          </button>
          <Link
            href={`/c/${meta.id}`}
            className="inline-flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-ink"
          >
            Details <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left rail */}
        <aside className="flex w-[330px] shrink-0 flex-col border-r border-border">
          <div className="border-b border-border p-3">
            <Segmented
              options={[
                { value: "customize", label: (<span className="inline-flex items-center gap-1.5"><Sliders className="h-3.5 w-3.5" /> Customize</span>) },
                { value: "theme", label: (<span className="inline-flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Theme</span>) },
              ]}
              value={tab}
              onChange={(v) => setTab(v as "customize" | "theme")}
            />
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

        {/* Canvas + code */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 p-6">
            <LivePreview
              Component={Component}
              props={props}
              palette={palette}
              resetKey={JSON.stringify(props)}
              instanceKey={replay}
              filename={meta.id}
              className="h-full"
            />
          </div>
          {showCode && (
            <div className="max-h-[42%] overflow-auto border-t border-border p-4">
              <CodePanel code={code} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ComponentSelect({ id, onChange }: { id: string; onChange: (id: string) => void }) {
  const grouped = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        c,
        items: REGISTRY.filter((e) => e.meta.category === c.id).sort((a, b) =>
          a.meta.name.localeCompare(b.meta.name),
        ),
      })).filter((g) => g.items.length),
    [],
  );
  return (
    <div className="relative">
      <select
        value={id}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-border bg-surface py-1.5 pl-3 pr-8 text-[13px] font-medium text-ink outline-none focus:border-accent"
      >
        {grouped.map((g) => (
          <optgroup key={g.c.id} label={g.c.name}>
            {g.items.map((e) => (
              <option key={e.meta.id} value={e.meta.id}>
                {e.meta.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
    </div>
  );
}
