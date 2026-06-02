"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw, Plus, X } from "lucide-react";
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

type ColorKey = keyof RevizPalette;
const COLOR_GROUPS: { title: string; keys: [ColorKey, string][] }[] = [
  {
    title: "Background",
    keys: [
      ["canvas", "Canvas"],
      ["surface", "Surface"],
      ["surfaceAlt", "Surface alt"],
    ],
  },
  {
    title: "Text",
    keys: [
      ["ink", "Primary"],
      ["inkMuted", "Muted"],
      ["inkFaint", "Faint"],
    ],
  },
  {
    title: "Accent",
    keys: [
      ["accent", "Accent"],
      ["accentSoft", "Accent soft"],
      ["accentContrast", "On-accent"],
    ],
  },
  {
    title: "Structure",
    keys: [
      ["border", "Border"],
      ["borderStrong", "Border strong"],
      ["grid", "Grid"],
    ],
  },
  {
    title: "Status",
    keys: [
      ["ok", "Good"],
      ["warn", "Warn"],
      ["bad", "Bad"],
    ],
  },
];

const isHex = (s: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);

export function ThemePane({ theme, onChange }: { theme: PreviewTheme; onChange: (t: PreviewTheme) => void }) {
  const resolved = resolvePreviewPalette(theme);
  const overrideCount = Object.keys(theme.overrides).length;

  const setColor = (key: ColorKey, value: string) =>
    onChange({ ...theme, overrides: { ...theme.overrides, [key]: value } });
  const resetColor = (key: ColorKey) => {
    const next = { ...theme.overrides };
    delete next[key];
    onChange({ ...theme, overrides: next });
  };
  const setSeries = (arr: string[]) => onChange({ ...theme, overrides: { ...theme.overrides, series: arr } });

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-label text-ink-faint">Palette</span>
          {overrideCount > 0 && (
            <button
              onClick={() => onChange({ paletteId: theme.paletteId, overrides: {} })}
              className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wide text-ink-faint hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" /> Reset all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PALETTES.map((p) => {
            const active = p.id === theme.paletteId && overrideCount === 0;
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
                  <div className="truncate font-mono text-[9px] uppercase tracking-wide text-ink-faint">{p.mode}</div>
                </div>
                {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      </section>

      {COLOR_GROUPS.map((group) => (
        <section key={group.title}>
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-label text-ink-faint">{group.title}</div>
          <div className="flex flex-col gap-2">
            {group.keys.map(([key, label]) => (
              <ColorRow
                key={String(key)}
                label={label}
                value={resolved[key] as string}
                overridden={theme.overrides[key] != null}
                onChange={(v) => setColor(key, v)}
                onReset={() => resetColor(key)}
              />
            ))}
          </div>
        </section>
      ))}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-label text-ink-faint">Series ramp</span>
          {theme.overrides.series && (
            <button
              onClick={() => resetColor("series")}
              className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-wide text-ink-faint hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {resolved.series.map((c, i) => (
            <div key={i} className="group/sw relative">
              <Swatch value={c} onChange={(v) => setSeries(resolved.series.map((x, j) => (j === i ? v : x)))} />
              {resolved.series.length > 1 && (
                <button
                  onClick={() => setSeries(resolved.series.filter((_, j) => j !== i))}
                  title="Remove"
                  className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 place-items-center rounded-full bg-bad text-white group-hover/sw:grid"
                >
                  <X className="h-2 w-2" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setSeries([...resolved.series, resolved.accent])}
            title="Add series color"
            className="grid h-7 w-7 place-items-center rounded-md border border-dashed border-border text-ink-faint hover:border-accent hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
          The categorical ramp multi-series charts cycle through.
        </p>
      </section>
    </div>
  );
}

function Swatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label
      className="block h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-border"
      style={{ background: value }}
      title={value}
    >
      <input
        type="color"
        value={isHex(value) ? value : "#888888"}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

function ColorRow({
  label,
  value,
  overridden,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  overridden: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-ink">{label}</span>
      <div className="flex items-center gap-1.5">
        <Swatch value={value} onChange={onChange} />
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isHex(e.target.value)) onChange(e.target.value);
          }}
          className="w-[74px] rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={onReset}
          title="Reset to palette"
          className={cn("shrink-0 transition-colors", overridden ? "text-ink-faint hover:text-ink" : "invisible")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
