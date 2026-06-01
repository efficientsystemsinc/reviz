import type { Control, RevizMeta } from "./types";
import { defaultPropsFromControls } from "./types";

/**
 * Code generation.
 *
 * Turns a component's meta + a live props object into copy-pasteable JSX. This
 * is half of why reviz exists: the same schema that renders the controls pane
 * emits production code, so what you customize is exactly what you ship.
 */

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function key(k: string): string {
  return IDENT.test(k) ? k : JSON.stringify(k);
}

function lit(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const allScalar = value.every((v) => v === null || typeof v !== "object");
    if (allScalar && value.length <= 12) {
      return `[${value.map((v) => lit(v, indent)).join(", ")}]`;
    }
    const items = value.map((v) => `${padIn}${lit(v, indent + 1)}`).join(",\n");
    return `[\n${items},\n${pad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const inline =
      entries.length <= 3 &&
      entries.every(([, v]) => v === null || typeof v !== "object");
    if (inline) {
      return `{ ${entries.map(([k, v]) => `${key(k)}: ${lit(v, indent)}`).join(", ")} }`;
    }
    const body = entries
      .map(([k, v]) => `${padIn}${key(k)}: ${lit(v, indent + 1)}`)
      .join(",\n");
    return `{\n${body},\n${pad}}`;
  }
  return "undefined";
}

function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function renderProp(control: Control, value: unknown, indent: number): string {
  // string props use ="..." form; everything else uses ={...}
  if (control.type === "text" || control.type === "textarea" || control.type === "select") {
    if (typeof value === "string") return `${control.key}=${JSON.stringify(value)}`;
  }
  if (control.type === "boolean") {
    return value ? control.key : `${control.key}={false}`;
  }
  if (control.type === "color") {
    return `${control.key}=${JSON.stringify(value)}`;
  }
  return `${control.key}={${lit(value, indent)}}`;
}

export interface CodegenOptions {
  /** Include props equal to their default. */
  includeDefaults?: boolean;
  /** Include the import statement. */
  withImport?: boolean;
  importSource?: string;
}

export function generateCode(
  meta: RevizMeta,
  props: Record<string, unknown>,
  opts: CodegenOptions = {},
): string {
  const { includeDefaults = false, withImport = true, importSource = "reviz" } = opts;
  const defaults = defaultPropsFromControls(meta.controls);

  const visible = meta.controls.filter((c) => !c.hidden);
  const used = visible.filter((c) => includeDefaults || !isEqual(props[c.key], defaults[c.key]));

  const name = meta.exportName;
  let jsx: string;
  if (used.length === 0) {
    jsx = `<${name} />`;
  } else {
    const lines = used.map((c) => `  ${renderProp(c, props[c.key], 1)}`);
    jsx = `<${name}\n${lines.join("\n")}\n/>`;
  }

  const importLine = withImport ? `import { ${name} } from "${importSource}";\n\n` : "";
  return `${importLine}${jsx}`;
}

/** A fuller usage snippet wrapped in a component, for the "full file" view. */
export function generateFile(meta: RevizMeta, props: Record<string, unknown>): string {
  const body = generateCode(meta, props, { withImport: false, includeDefaults: false });
  return `import { ${meta.exportName} } from "reviz";

export default function Example() {
  return (
${body
  .split("\n")
  .map((l) => `    ${l}`)
  .join("\n")}
  );
}
`;
}
