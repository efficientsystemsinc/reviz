"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PALETTES, type RevizPalette } from "@/reviz/theme";

export interface PreviewTheme {
  paletteId: string;
  overrides: Partial<RevizPalette>;
}

export function resolvePreviewPalette(t: PreviewTheme): RevizPalette {
  const base = PALETTES.find((p) => p.id === t.paletteId) ?? PALETTES[0];
  return { ...base, ...t.overrides };
}

const OVERRIDE_FIELDS: { key: keyof RevizPalette; label: string }[] = [
  { key: "accent", label: "Accent" },
  { key: "canvas", label: "Background" },
  { key: "ink", label: "Text" },
  { key: "grid", label: "Grid" },
];

export function ThemePane({
  theme,
  onChange,
}: {
  theme: PreviewTheme;
  onChange: (t: PreviewTheme) => void;
}) {
  const resolved = resolvePreviewPalette(theme);
  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-label text-ink-faint">Palette</div>
        <div className="grid grid-cols-2 gap-1.5">
          {PALETTES.map((p) => {
            const active = p.id === theme.paletteId && Object.keys(theme.overrides).length === 0;
            return (
              <button
                key={p.id}
                onClick={() => onChange({ paletteId: p.id, overrides: {} })}
                className={cn(
                  "group flex items-center gap-2 rounded-lg border p-2 text-left transition-all",
                  active ? "border-accent bg-accent/5" : "border-border hover:border-border-strong",
                )}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                  style={{ background: p.canvas, borderColor: p.border }}
                >
                  <div className="flex gap-0.5">
                    <span className="h-3 w-1 rounded-full" style={{ background: p.accent }} />
                    <span className="h-3 w-1 rounded-full" style={{ background: p.series[1] }} />
                    <span className="h-3 w-1 rounded-full" style={{ background: p.ink }} />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-ink">{p.name}</div>
                  <div className="truncate font-mono text-[9px] uppercase tracking-wide text-ink-faint">
                    {p.mode}
                  </div>
                </div>
                {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-label text-ink-faint">
          Custom colors
        </div>
        <div className="flex flex-col gap-2.5">
          {OVERRIDE_FIELDS.map((f) => {
            const current = (theme.overrides[f.key] as string) ?? (resolved[f.key] as string);
            const overridden = theme.overrides[f.key] != null;
            return (
              <div key={String(f.key)} className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-ink">{f.label}</span>
                <div className="flex items-center gap-1.5">
                  <label
                    className="h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-border"
                    style={{ background: current }}
                  >
                    <input
                      type="color"
                      value={current}
                      onChange={(e) => onChange({ ...theme, overrides: { ...theme.overrides, [f.key]: e.target.value } })}
                      className="h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  <input
                    value={current}
                    onChange={(e) => onChange({ ...theme, overrides: { ...theme.overrides, [f.key]: e.target.value } })}
                    className="w-20 rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
                  />
                  {overridden && (
                    <button
                      onClick={() => {
                        const next = { ...theme.overrides };
                        delete next[f.key];
                        onChange({ ...theme, overrides: next });
                      }}
                      className="font-mono text-[9px] uppercase text-ink-faint hover:text-ink"
                    >
                      reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
