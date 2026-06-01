"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Control } from "@/reviz/types";
import { Segmented, Toggle } from "./ui";

/**
 * The schema-driven customization pane. Reads a component's `meta.controls` and
 * renders the right editor for every prop — sliders, toggles, selects, color
 * pickers, and structured data tables. No per-component form code exists; this
 * single pane serves the entire library.
 */
export function ControlsPane({
  controls,
  values,
  onChange,
  onReset,
}: {
  controls: Control[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset?: () => void;
}) {
  const groups = useMemo(() => {
    const order = ["Data", "Labels", "Layout", "Style", "Animation"];
    const map = new Map<string, Control[]>();
    for (const c of controls) {
      if (c.hidden) continue;
      const g = c.group ?? "Options";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    }
    return [...map.entries()].sort(
      (a, b) => (order.indexOf(a[0]) + 100) % 1000 - ((order.indexOf(b[0]) + 100) % 1000),
    );
  }, [controls]);

  return (
    <div className="flex flex-col">
      {onReset && (
        <button
          onClick={onReset}
          className="mb-3 inline-flex w-fit items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint transition-colors hover:text-ink"
        >
          <RotateCcw className="h-3 w-3" /> Reset to preset
        </button>
      )}
      <div className="flex flex-col gap-6">
        {groups.map(([group, items]) => (
          <section key={group}>
            <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-label text-ink-faint">
              {group}
            </div>
            <div className="flex flex-col gap-3.5">
              {items.map((c) => (
                <ControlField key={c.key} control={c} value={values[c.key]} onChange={(v) => onChange(c.key, v)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Field({ label, help, children, stacked }: { label: string; help?: string; children: React.ReactNode; stacked?: boolean }) {
  return (
    <div className={cn(stacked ? "flex flex-col gap-1.5" : "flex items-center justify-between gap-3")}>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-ink">{label}</div>
        {help && <div className="text-[11px] text-ink-faint">{help}</div>}
      </div>
      <div className={cn(stacked ? "w-full" : "shrink-0")}>{children}</div>
    </div>
  );
}

function ControlField({ control, value, onChange }: { control: Control; value: unknown; onChange: (v: unknown) => void }) {
  switch (control.type) {
    case "number":
      return (
        <Field label={control.label} help={control.help}>
          <NumberInput
            value={Number(value)}
            min={control.min}
            max={control.max}
            step={control.step}
            unit={control.unit}
            onChange={onChange}
          />
        </Field>
      );
    case "boolean":
      return (
        <Field label={control.label} help={control.help}>
          <Toggle checked={Boolean(value)} onChange={onChange} />
        </Field>
      );
    case "select":
      return (
        <Field label={control.label} help={control.help} stacked={control.options.length > 3}>
          {control.options.length > 3 ? (
            <select
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent"
            >
              {control.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Segmented
              options={control.options.map((o) => ({ value: o.value, label: o.label }))}
              value={String(value)}
              onChange={onChange}
            />
          )}
        </Field>
      );
    case "text":
      return (
        <Field label={control.label} help={control.help} stacked>
          <input
            value={String(value ?? "")}
            placeholder={control.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent"
          />
        </Field>
      );
    case "textarea":
      return (
        <Field label={control.label} help={control.help} stacked>
          <textarea
            value={String(value ?? "")}
            rows={control.rows ?? 4}
            onChange={(e) => onChange(e.target.value)}
            className="w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[11.5px] leading-relaxed text-ink outline-none focus:border-accent"
          />
        </Field>
      );
    case "color":
      return (
        <Field label={control.label} help={control.help}>
          <ColorInput value={String(value ?? "")} onChange={onChange} allowEmpty emptyLabel="theme" />
        </Field>
      );
    case "colorArray":
      return (
        <Field label={control.label} help={control.help} stacked>
          <ColorArrayEditor value={(value as string[]) ?? []} onChange={onChange} />
        </Field>
      );
    case "categorical":
      return (
        <Field label={control.label} help={control.help} stacked>
          <RecordTable
            value={(value as Record<string, unknown>[]) ?? []}
            columns={[
              { key: "label", type: "text" },
              { key: "value", type: "number" },
            ]}
            onChange={onChange}
            newRow={{ label: "New", value: 0 }}
          />
        </Field>
      );
    case "points":
      return (
        <Field label={control.label} help={control.help} stacked>
          <RecordTable
            value={(value as Record<string, unknown>[]) ?? []}
            columns={[
              { key: "x", type: "number" },
              { key: "y", type: "number" },
            ]}
            onChange={onChange}
            newRow={{ x: 0, y: 0 }}
          />
        </Field>
      );
    case "series":
      return (
        <Field label={control.label} help={control.help} stacked>
          <SeriesEditor value={(value as SeriesRow[]) ?? []} onChange={onChange} />
        </Field>
      );
    case "matrix":
      return (
        <Field label={control.label} help={control.help} stacked>
          <MatrixEditor value={(value as number[][]) ?? []} onChange={onChange} />
        </Field>
      );
    case "json":
      return (
        <Field label={control.label} help={control.help} stacked>
          <JsonEditor value={value} onChange={onChange} />
        </Field>
      );
    default:
      return null;
  }
}

/* --------------------------------- inputs -------------------------------- */

function NumberInput({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const hasRange = min != null && max != null;
  return (
    <div className="flex items-center gap-2">
      {hasRange && (
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="reviz-range h-1 w-28 cursor-pointer appearance-none rounded-full bg-border accent-accent"
        />
      )}
      <div className="flex items-center rounded-lg border border-border bg-surface">
        <input
          type="number"
          min={min}
          max={max}
          step={step ?? 1}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-16 bg-transparent px-2 py-1 text-right text-[12.5px] tabular-nums text-ink outline-none"
        />
        {unit && <span className="pr-2 text-[11px] text-ink-faint">{unit}</span>}
      </div>
    </div>
  );
}

function ColorInput({
  value,
  onChange,
  allowEmpty,
  emptyLabel = "auto",
}: {
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const empty = !value;
  return (
    <div className="flex items-center gap-1.5">
      <label
        className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-border"
        style={{
          background: empty
            ? "repeating-conic-gradient(rgb(var(--rz-border)) 0% 25%, transparent 0% 50%) 50% / 10px 10px"
            : value,
        }}
      >
        <input
          type="color"
          value={value || "#888888"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={value}
        placeholder={emptyLabel}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
      />
      {allowEmpty && !empty && (
        <button
          onClick={() => onChange("")}
          title="Use theme color"
          className="text-ink-faint transition-colors hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ColorArrayEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((c, i) => (
        <div key={i} className="group relative">
          <ColorInput
            value={c}
            onChange={(v) => {
              const next = [...value];
              next[i] = v;
              onChange(next);
            }}
          />
          <button
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-bad text-white group-hover:grid"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, "#888888"])}
        className="grid h-7 w-7 place-items-center rounded-md border border-dashed border-border text-ink-faint hover:border-accent hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

type Col = { key: string; type: "text" | "number" | "boolean" };

function RecordTable({
  value,
  columns,
  onChange,
  newRow,
}: {
  value: Record<string, unknown>[];
  columns: Col[];
  onChange: (v: Record<string, unknown>[]) => void;
  newRow: Record<string, unknown>;
}) {
  const rows = Array.isArray(value) ? value : [];
  const set = (ri: number, key: string, v: unknown) => {
    const next = rows.map((r, i) => (i === ri ? { ...r, [key]: v } : r));
    onChange(next);
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-surface-alt">
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-1 text-left font-mono text-[9.5px] uppercase tracking-wide text-ink-faint">
                {c.key}
              </th>
            ))}
            <th className="w-7" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-border">
              {columns.map((c) => (
                <td key={c.key} className="px-1 py-0.5">
                  <CellInput type={c.type} value={r[c.key]} onChange={(v) => set(ri, c.key, v)} />
                </td>
              ))}
              <td>
                <button
                  onClick={() => onChange(rows.filter((_, i) => i !== ri))}
                  className="grid h-6 w-6 place-items-center text-ink-faint hover:text-bad"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => onChange([...rows, { ...newRow }])}
        className="flex w-full items-center justify-center gap-1 border-t border-border bg-surface-alt/50 py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint hover:text-accent"
      >
        <Plus className="h-3 w-3" /> Add row
      </button>
    </div>
  );
}

function CellInput({ type, value, onChange }: { type: Col["type"]; value: unknown; onChange: (v: unknown) => void }) {
  if (type === "boolean") {
    return <Toggle checked={Boolean(value)} onChange={onChange} />;
  }
  return (
    <input
      type={type === "number" ? "number" : "text"}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
      className="w-full rounded bg-transparent px-1.5 py-1 text-[12px] text-ink outline-none focus:bg-surface-alt"
    />
  );
}

type SeriesRow = { name: string; data: number[]; color?: string };

function SeriesEditor({ value, onChange }: { value: SeriesRow[]; onChange: (v: SeriesRow[]) => void }) {
  const rows = Array.isArray(value) ? value : [];
  const update = (i: number, patch: Partial<SeriesRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((s, i) => (
        <div key={i} className="rounded-lg border border-border p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <ColorInput value={s.color ?? ""} onChange={(v) => update(i, { color: v })} allowEmpty />
            <input
              value={s.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
            />
            <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-ink-faint hover:text-bad">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            value={(s.data ?? []).join(", ")}
            onChange={(e) =>
              update(i, {
                data: e.target.value
                  .split(",")
                  .map((x) => parseFloat(x.trim()))
                  .filter((x) => !Number.isNaN(x)),
              })
            }
            placeholder="comma-separated values"
            className="w-full rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
          />
        </div>
      ))}
      <button
        onClick={() => onChange([...rows, { name: `Series ${rows.length + 1}`, data: [] }])}
        className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint hover:border-accent hover:text-accent"
      >
        <Plus className="h-3 w-3" /> Add series
      </button>
    </div>
  );
}

function MatrixEditor({ value, onChange }: { value: number[][]; onChange: (v: number[][]) => void }) {
  const text = useMemo(() => (value ?? []).map((row) => row.join(", ")).join("\n"), [value]);
  const [draft, setDraft] = useState(text);
  return (
    <textarea
      value={draft}
      onFocus={() => setDraft(text)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = draft
          .trim()
          .split("\n")
          .map((line) =>
            line
              .split(",")
              .map((x) => parseFloat(x.trim()))
              .filter((x) => !Number.isNaN(x)),
          )
          .filter((r) => r.length);
        onChange(parsed);
      }}
      rows={Math.min(8, (value?.length ?? 3) + 1)}
      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
      placeholder="rows on lines, values comma-separated"
    />
  );
}

function JsonEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  // Smart: array of flat objects -> editable table; otherwise JSON textarea.
  const isRecordArray =
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => v && typeof v === "object" && !Array.isArray(v));

  if (isRecordArray) {
    const rows = value as Record<string, unknown>[];
    const flatKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
      (k) => rows.every((r) => r[k] == null || typeof r[k] !== "object"),
    );
    const allFlat = rows.every((r) => Object.keys(r).every((k) => flatKeys.includes(k)));
    if (allFlat && flatKeys.length > 0) {
      const columns: Col[] = flatKeys.map((k) => {
        const sample = rows.find((r) => r[k] != null)?.[k];
        return { key: k, type: typeof sample === "number" ? "number" : typeof sample === "boolean" ? "boolean" : "text" };
      });
      const newRow = Object.fromEntries(columns.map((c) => [c.key, c.type === "number" ? 0 : c.type === "boolean" ? false : ""]));
      return <RecordTable value={rows} columns={columns} onChange={onChange} newRow={newRow} />;
    }
  }
  return <RawJson value={value} onChange={onChange} />;
}

function RawJson({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const pretty = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }, [value]);
  const [draft, setDraft] = useState(pretty);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={draft}
        onFocus={() => setDraft(pretty)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          try {
            onChange(JSON.parse(draft));
            setError(null);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        rows={8}
        spellCheck={false}
        className={cn(
          "w-full rounded-lg border bg-surface px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-ink outline-none",
          error ? "border-bad focus:border-bad" : "border-border focus:border-accent",
        )}
      />
      {error && <div className="text-[10.5px] text-bad">{error}</div>}
    </div>
  );
}
