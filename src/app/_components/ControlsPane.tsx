"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Control } from "@/reviz/types";
import { Segmented, Toggle } from "./ui";
import { IconPicker } from "./IconPicker";

/**
 * The schema-driven customization pane. Reads a component's `meta.controls` and
 * renders a bespoke, narrow editor for every prop. No raw textareas, no
 * comma-delimited blobs — every value is its own structured field. Number
 * inputs use a draft+focus model so you can freely type partials ("-", "1.")
 * and commas elsewhere never get clobbered mid-keystroke.
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
      (a, b) => ((order.indexOf(a[0]) + 100) % 1000) - ((order.indexOf(b[0]) + 100) % 1000),
    );
  }, [controls]);

  return (
    <div className="flex flex-col">
      {onReset && (
        <button
          onClick={onReset}
          className="mb-3 inline-flex w-fit items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint transition-colors hover:text-ink"
        >
          <RotateCcw className="h-3 w-3" /> Reset to example
        </button>
      )}
      <div className="flex flex-col gap-6">
        {groups.map(([group, items]) => (
          <section key={group}>
            <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-label text-ink-faint">{group}</div>
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

function Field({
  label,
  help,
  children,
  stacked,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={cn(stacked ? "flex flex-col gap-1.5" : "flex items-center justify-between gap-3")}>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-ink">{label}</div>
        {help && <div className="text-[11px] leading-snug text-ink-faint">{help}</div>}
      </div>
      <div className={cn(stacked ? "w-full" : "flex shrink-0 justify-end")}>{children}</div>
    </div>
  );
}

function ControlField({ control, value, onChange }: { control: Control; value: unknown; onChange: (v: unknown) => void }) {
  switch (control.type) {
    case "number":
      return (
        <Field label={control.label} help={control.help}>
          <NumberField
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
            <Dropdown value={String(value)} options={control.options} onChange={onChange} />
          ) : (
            <Segmented
              options={control.options.map((o) => ({ value: o.value, label: o.label }))}
              value={String(value)}
              onChange={onChange}
            />
          )}
        </Field>
      );
    case "icon":
      return (
        <Field label={control.label} help={control.help}>
          <IconPicker value={String(value ?? "")} onChange={onChange} choices={control.choices} />
        </Field>
      );
    case "text":
      return (
        <Field label={control.label} help={control.help} stacked>
          <TextField value={String(value ?? "")} placeholder={control.placeholder} onChange={onChange} />
        </Field>
      );
    case "textarea":
      return (
        <Field label={control.label} help={control.help} stacked>
          <AutoGrowText value={String(value ?? "")} onChange={onChange} minRows={control.rows ?? 2} />
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

const fmtNum = (v: number) => (Number.isFinite(v) ? String(v) : "");
const isPartial = (s: string) => s === "" || s === "-" || s === "." || s === "-." || s.endsWith(".");

/**
 * A number input that keeps a local draft string while focused so you can type
 * "-", "1.", or clear the field without it snapping back to 0 mid-keystroke.
 * Commits parsed (and clamped) values live; normalizes on blur.
 */
function NumberField({
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
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(fmtNum(value));
  useEffect(() => {
    if (!focused) setDraft(fmtNum(value));
  }, [value, focused]);

  const clamp = (n: number) => {
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  };
  const onText = (s: string) => {
    setDraft(s);
    if (isPartial(s)) return;
    const n = parseFloat(s);
    if (!Number.isNaN(n)) onChange(clamp(n));
  };
  const onBlur = () => {
    setFocused(false);
    const n = parseFloat(draft);
    if (Number.isNaN(n)) setDraft(fmtNum(value));
    else {
      const c = clamp(n);
      onChange(c);
      setDraft(fmtNum(c));
    }
  };

  return (
    <div className="flex items-center gap-2">
      {hasRange && (
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
          className="reviz-range h-1 w-24 cursor-pointer appearance-none rounded-full bg-border accent-accent"
        />
      )}
      <div className="flex items-center rounded-lg border border-border bg-surface focus-within:border-accent">
        <input
          inputMode="decimal"
          value={draft}
          step={step ?? 1}
          onFocus={() => setFocused(true)}
          onChange={(e) => onText(e.target.value)}
          onBlur={onBlur}
          className="w-14 bg-transparent px-2 py-1 text-right text-[12.5px] tabular-nums text-ink outline-none"
        />
        {unit && <span className="pr-2 text-[11px] text-ink-faint">{unit}</span>}
      </div>
    </div>
  );
}

function TextField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent"
    />
  );
}

/** Auto-growing text field for prose — grows with content, no resize handle, no scrollbar. */
function AutoGrowText({ value, onChange, minRows = 2 }: { value: string; onChange: (v: string) => void; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      className="w-full resize-none overflow-hidden rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink outline-none focus:border-accent"
    />
  );
}

function Dropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const isHex = (s: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);

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
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commitText = (s: string) => {
    setDraft(s);
    if (s === "" || isHex(s)) onChange(s);
  };
  return (
    <div className="flex items-center gap-1.5">
      <label
        className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border"
        style={{
          background: empty
            ? "repeating-conic-gradient(rgb(var(--rz-border)) 0% 25%, transparent 0% 50%) 50% / 10px 10px"
            : value,
        }}
      >
        <input
          type="color"
          value={isHex(value) ? value : "#888888"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        value={draft}
        placeholder={emptyLabel}
        onChange={(e) => commitText(e.target.value)}
        className="w-[72px] rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
      />
      {allowEmpty && !empty && (
        <button
          onClick={() => onChange("")}
          title="Use theme color"
          className="shrink-0 text-ink-faint transition-colors hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ColorArrayEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {value.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5">
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
            title="Remove color"
            className="shrink-0 text-ink-faint transition-colors hover:text-bad"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, "#888888"])}
        className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint hover:border-accent hover:text-accent"
      >
        <Plus className="h-3 w-3" /> Add color
      </button>
    </div>
  );
}

/** A bare number cell with the same draft+focus model as NumberField. */
function NumberCell({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(fmtNum(value));
  useEffect(() => {
    if (!focused) setDraft(fmtNum(value));
  }, [value, focused]);
  return (
    <input
      inputMode="decimal"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const s = e.target.value;
        setDraft(s);
        if (!isPartial(s)) {
          const n = parseFloat(s);
          if (!Number.isNaN(n)) onChange(n);
        }
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseFloat(draft);
        if (Number.isNaN(n)) setDraft(fmtNum(value));
        else {
          onChange(n);
          setDraft(fmtNum(n));
        }
      }}
      className={cn("bg-transparent text-[12px] tabular-nums text-ink outline-none focus:bg-surface-alt", className)}
    />
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
  const set = (ri: number, key: string, v: unknown) => onChange(rows.map((r, i) => (i === ri ? { ...r, [key]: v } : r)));
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full table-fixed text-[12px]">
        <thead>
          <tr className="bg-surface-alt">
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-1 text-left font-mono text-[9.5px] uppercase tracking-wide text-ink-faint">
                {c.key}
              </th>
            ))}
            <th className="w-8" />
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
              <td className="px-0.5 text-center">
                <button
                  onClick={() => onChange(rows.filter((_, i) => i !== ri))}
                  title="Remove row"
                  className="inline-grid h-6 w-6 place-items-center text-ink-faint hover:text-bad"
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
  if (type === "boolean") return <Toggle checked={Boolean(value)} onChange={onChange} />;
  if (type === "number") return <NumberCell value={Number(value)} onChange={onChange} className="w-full rounded px-1.5 py-1" />;
  return (
    <input
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded bg-transparent px-1.5 py-1 text-[12px] text-ink outline-none focus:bg-surface-alt"
    />
  );
}

type SeriesRow = { name: string; data: number[]; color?: string };

function SeriesEditor({ value, onChange }: { value: SeriesRow[]; onChange: (v: SeriesRow[]) => void }) {
  const rows = Array.isArray(value) ? value : [];
  const update = (i: number, patch: Partial<SeriesRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((s, i) => (
        <div key={i} className="rounded-lg border border-border p-2">
          <div className="mb-2 flex items-center gap-2">
            <ColorInput value={s.color ?? ""} onChange={(v) => update(i, { color: v })} allowEmpty />
            <input
              value={s.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
            />
            <button
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              title="Remove series"
              className="shrink-0 text-ink-faint hover:text-bad"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <NumberListEditor value={s.data ?? []} onChange={(d) => update(i, { data: d })} />
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

/** Editable list of numbers as individual chips — no comma parsing, ever. */
function NumberListEditor({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const arr = Array.isArray(value) ? value : [];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {arr.map((n, i) => (
        <div key={i} className="group/chip relative flex items-center rounded-md border border-border bg-surface">
          <NumberCell value={n} onChange={(v) => onChange(arr.map((x, j) => (j === i ? v : x)))} className="w-11 px-1.5 py-0.5 text-center" />
          <button
            onClick={() => onChange(arr.filter((_, j) => j !== i))}
            title="Remove value"
            className="hidden pr-1 text-ink-faint hover:text-bad group-hover/chip:block"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...arr, arr.length ? arr[arr.length - 1] : 0])}
        title="Add value"
        className="grid h-7 w-7 place-items-center rounded-md border border-dashed border-border text-ink-faint hover:border-accent hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MatrixEditor({ value, onChange }: { value: number[][]; onChange: (v: number[][]) => void }) {
  const m = Array.isArray(value) && value.length ? value : [[0]];
  const cols = Math.max(1, ...m.map((r) => r.length));
  const setCell = (ri: number, ci: number, v: number) =>
    onChange(m.map((row, i) => (i === ri ? row.map((c, j) => (j === ci ? v : c)) : row)));
  const addRow = () => onChange([...m, Array.from({ length: cols }, () => 0)]);
  const removeRow = (ri: number) => onChange(m.filter((_, i) => i !== ri));
  const addCol = () => onChange(m.map((row) => [...row, 0]));
  const removeCol = () => (cols > 1 ? onChange(m.map((row) => row.slice(0, cols - 1))) : undefined);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border p-1.5">
        <table className="border-separate" style={{ borderSpacing: "3px" }}>
          <tbody>
            {m.map((row, ri) => (
              <tr key={ri}>
                {Array.from({ length: cols }, (_, ci) => (
                  <td key={ci}>
                    <NumberCell
                      value={row[ci] ?? 0}
                      onChange={(v) => setCell(ri, ci, v)}
                      className="h-7 w-12 rounded-md border border-border bg-surface text-center"
                    />
                  </td>
                ))}
                <td>
                  <button
                    onClick={() => removeRow(ri)}
                    title="Remove row"
                    className="grid h-7 w-6 place-items-center text-ink-faint hover:text-bad"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-wide">
        <button onClick={addRow} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-ink-faint hover:border-accent hover:text-accent">
          <Plus className="h-3 w-3" /> Row
        </button>
        <button onClick={addCol} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-ink-faint hover:border-accent hover:text-accent">
          <Plus className="h-3 w-3" /> Column
        </button>
        <button onClick={removeCol} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-ink-faint hover:border-bad hover:text-bad">
          <X className="h-3 w-3" /> Column
        </button>
      </div>
    </div>
  );
}

function JsonEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  return <StructuredJson value={value} onChange={onChange} />;
}

/**
 * Recursive structured editor: turns ANY nested data into bespoke fields,
 * sub-tables, and chips — never a raw JSON blob. Arrays of flat objects become
 * tables, arrays of objects-with-nested-values become labelled cards, primitive
 * arrays become chip/field lists, and nested arrays/objects recurse.
 */
function StructuredJson({ value, onChange, depth = 0 }: { value: unknown; onChange: (v: unknown) => void; depth?: number }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <button
          onClick={() => onChange([0])}
          className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint hover:border-accent hover:text-accent"
        >
          <Plus className="h-3 w-3" /> Add item
        </button>
      );
    }
    const allPrimitive = value.every((v) => v === null || typeof v !== "object");
    if (allPrimitive) {
      const numeric = value.every((v) => typeof v === "number");
      return <PrimitiveListEditor value={value as (string | number)[]} numeric={numeric} onChange={onChange} />;
    }
    const allObjects = value.every((v) => v && typeof v === "object" && !Array.isArray(v));
    if (allObjects) {
      const rows = value as Record<string, unknown>[];
      const flat = rows.every((r) => Object.values(r).every((x) => x === null || typeof x !== "object"));
      if (flat) {
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const columns: Col[] = keys.map((k) => {
          const sample = rows.find((r) => r[k] != null)?.[k];
          return { key: k, type: typeof sample === "number" ? "number" : typeof sample === "boolean" ? "boolean" : "text" };
        });
        const newRow = Object.fromEntries(columns.map((c) => [c.key, c.type === "number" ? 0 : c.type === "boolean" ? false : ""]));
        return <RecordTable value={rows} columns={columns} onChange={onChange} newRow={newRow} />;
      }
      return <ObjectCardsEditor value={rows} onChange={onChange} depth={depth} />;
    }
    // array of arrays / mixed — genuinely irregular, last resort
    return <RawJson value={value} onChange={onChange} />;
  }
  if (value && typeof value === "object") {
    return <ObjectFields value={value as Record<string, unknown>} onChange={onChange} depth={depth} />;
  }
  return <RawJson value={value} onChange={onChange} />;
}

const emptyLike = (v: unknown): unknown =>
  typeof v === "number"
    ? 0
    : typeof v === "boolean"
      ? false
      : typeof v === "string"
        ? ""
        : Array.isArray(v)
          ? []
          : v && typeof v === "object"
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, emptyLike(x)]))
            : null;

function ObjectCardsEditor({
  value,
  onChange,
  depth,
}: {
  value: Record<string, unknown>[];
  onChange: (v: unknown) => void;
  depth: number;
}) {
  const rows = value;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="rounded-lg border border-border p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[9.5px] uppercase tracking-wide text-ink-faint">#{i + 1}</span>
            <button
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              title="Remove item"
              className="text-ink-faint hover:text-bad"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <ObjectFields value={row} onChange={(nv) => onChange(rows.map((r, j) => (j === i ? nv : r)))} depth={depth + 1} />
        </div>
      ))}
      <button
        onClick={() => onChange([...rows, emptyLike(rows[rows.length - 1] ?? {}) as Record<string, unknown>])}
        className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint hover:border-accent hover:text-accent"
      >
        <Plus className="h-3 w-3" /> Add item
      </button>
    </div>
  );
}

const isColorKey = (k: string) => /color|colour|fill|stroke|tint/i.test(k);

function ObjectFields({
  value,
  onChange,
  depth,
}: {
  value: Record<string, unknown>;
  onChange: (v: unknown) => void;
  depth: number;
}) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(value).map(([k, v]) => {
        const nested = v != null && typeof v === "object";
        const isString = !nested && (typeof v === "string" || v == null);
        return (
          <div key={k} className={nested || isString ? "flex flex-col gap-1" : "flex items-center justify-between gap-2"}>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">{k}</span>
            {nested ? (
              <div className="border-l-2 border-border pl-2">
                <StructuredJson value={v} onChange={(nv) => set(k, nv)} depth={depth + 1} />
              </div>
            ) : isColorKey(k) && typeof v === "string" ? (
              <div className="flex justify-end">
                <ColorInput value={v} onChange={(nv) => set(k, nv)} allowEmpty />
              </div>
            ) : typeof v === "number" ? (
              <div className="flex justify-end">
                <NumberCell
                  value={v}
                  onChange={(nv) => set(k, nv)}
                  className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right"
                />
              </div>
            ) : typeof v === "boolean" ? (
              <div className="flex justify-end">
                <Toggle checked={v} onChange={(nv) => set(k, nv)} />
              </div>
            ) : (
              <input
                value={v == null ? "" : String(v)}
                onChange={(e) => set(k, e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A flat list of strings or numbers, each its own field — no JSON, no commas. */
function PrimitiveListEditor({
  value,
  numeric,
  onChange,
}: {
  value: (string | number)[];
  numeric: boolean;
  onChange: (v: (string | number)[]) => void;
}) {
  const arr = Array.isArray(value) ? value : [];
  if (numeric) {
    return <NumberListEditor value={arr as number[]} onChange={(v) => onChange(v)} />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {arr.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-5 shrink-0 text-right font-mono text-[10px] text-ink-faint">{i + 1}</span>
          <input
            value={String(item)}
            onChange={(e) => onChange(arr.map((x, j) => (j === i ? e.target.value : x)))}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
          />
          <button
            onClick={() => onChange(arr.filter((_, j) => j !== i))}
            title="Remove"
            className="shrink-0 text-ink-faint hover:text-bad"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...arr, ""])}
        className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint hover:border-accent hover:text-accent"
      >
        <Plus className="h-3 w-3" /> Add item
      </button>
    </div>
  );
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
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!focused) setDraft(pretty);
  }, [pretty, focused]);
  return (
    <div className="flex flex-col gap-1">
      <AutoGrowText
        value={draft}
        minRows={4}
        onChange={(s) => {
          setFocused(true);
          setDraft(s);
          try {
            onChange(JSON.parse(s));
            setError(null);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {error && <div className="text-[10.5px] text-bad">Invalid JSON</div>}
    </div>
  );
}
