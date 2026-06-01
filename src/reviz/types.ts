import type { ComponentType } from "react";

/**
 * The reviz meta-layer.
 *
 * Every component ships a `meta` describing its customizable props as a typed
 * control schema. That single schema powers three things at once:
 *   1. the auto-generated customization pane (no per-component form code),
 *   2. the code generator (copy-pasteable JSX with the user's props),
 *   3. the WYSIWYG editor's property inspector.
 *
 * This is the thing an ad-hoc coding agent won't reproduce: a coherent,
 * introspectable contract shared across 100+ components.
 */

export type RevizCategoryId =
  | "charts"
  | "statistical"
  | "ml-eval"
  | "trees-graphs"
  | "interpretability"
  | "diagrams"
  | "robotics-media"
  | "math"
  | "data-display"
  | "layout-annotation"
  | "text-narrative";

export interface RevizCategory {
  id: RevizCategoryId;
  name: string;
  blurb: string;
  /** lucide-react icon name. */
  icon: string;
}

export const CATEGORIES: RevizCategory[] = [
  {
    id: "charts",
    name: "Charts & Graphs",
    blurb: "The core grammar — bars, lines, areas, distributions, and every comparison in between.",
    icon: "BarChart3",
  },
  {
    id: "statistical",
    name: "Statistical",
    blurb: "Confidence, calibration, correlation — figures that survive peer review.",
    icon: "Sigma",
  },
  {
    id: "ml-eval",
    name: "ML & Evaluation",
    blurb: "Training curves, ablations, benchmarks, scaling laws, latency, leaderboards.",
    icon: "Brain",
  },
  {
    id: "trees-graphs",
    name: "Trees & Graphs",
    blurb: "Search trees, networks, flows, hierarchies — structure made legible.",
    icon: "GitBranch",
  },
  {
    id: "interpretability",
    name: "Interpretability",
    blurb: "Attention, activations, annotated transcripts, probes — see inside the model.",
    icon: "ScanEye",
  },
  {
    id: "diagrams",
    name: "Diagrams & Schematics",
    blurb: "Architecture, pipelines, topology, isometric stacks, concept maps.",
    icon: "Workflow",
  },
  {
    id: "robotics-media",
    name: "Media & Robotics",
    blurb: "Comparison sliders, rollouts, frame strips, synthetic-data timelines.",
    icon: "Film",
  },
  {
    id: "math",
    name: "Math & Equations",
    blurb: "Typeset equations, derivations, function plots, fields, number lines.",
    icon: "Radical",
  },
  {
    id: "data-display",
    name: "Data Display",
    blurb: "Tables, stat cards, KPI grids, sparklines, timelines, heat calendars.",
    icon: "Table2",
  },
  {
    id: "layout-annotation",
    name: "Layout & Annotation",
    blurb: "Figure frames, callouts, legends, scales, tabs, replay controls.",
    icon: "Frame",
  },
  {
    id: "text-narrative",
    name: "Narrative",
    blurb: "Pull quotes, key insights, definitions, highlights — the words around the figures.",
    icon: "Quote",
  },
];

/* ------------------------------------------------------------------ */
/* Control schema                                                      */
/* ------------------------------------------------------------------ */

interface ControlBase {
  /** Prop name on the component. */
  key: string;
  label: string;
  /** Optional grouping for the controls pane (e.g. "Data", "Style", "Animation"). */
  group?: string;
  help?: string;
  /** Hide from the pane but still part of props (advanced). */
  hidden?: boolean;
}

export interface NumberControl extends ControlBase {
  type: "number";
  default: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface TextControl extends ControlBase {
  type: "text";
  default: string;
  placeholder?: string;
}

export interface TextareaControl extends ControlBase {
  type: "textarea";
  default: string;
  rows?: number;
}

export interface BooleanControl extends ControlBase {
  type: "boolean";
  default: boolean;
}

export interface SelectControl extends ControlBase {
  type: "select";
  default: string;
  options: { value: string; label: string }[];
}

export interface ColorControl extends ControlBase {
  type: "color";
  default: string;
}

export interface ColorArrayControl extends ControlBase {
  type: "colorArray";
  default: string[];
}

/** Array of {label, value} — the bread-and-butter chart shape. */
export interface CategoricalControl extends ControlBase {
  type: "categorical";
  default: { label: string; value: number }[];
}

/** Array of {x, y} points. */
export interface PointsControl extends ControlBase {
  type: "points";
  default: { x: number; y: number }[];
}

/** Array of named numeric series. */
export interface SeriesControl extends ControlBase {
  type: "series";
  default: { name: string; data: number[]; color?: string }[];
}

/** 2D numeric matrix (heatmaps, confusion, attention). */
export interface MatrixControl extends ControlBase {
  type: "matrix";
  default: number[][];
}

/** Freeform structured value edited as JSON. */
export interface JsonControl extends ControlBase {
  type: "json";
  default: unknown;
}

export type Control =
  | NumberControl
  | TextControl
  | TextareaControl
  | BooleanControl
  | SelectControl
  | ColorControl
  | ColorArrayControl
  | CategoricalControl
  | PointsControl
  | SeriesControl
  | MatrixControl
  | JsonControl;

export type ControlType = Control["type"];

export interface RevizPreset {
  id: string;
  name: string;
  /** Partial prop overrides applied on top of control defaults. */
  props: Record<string, unknown>;
}

export type RevizBadge =
  | "animated"
  | "interactive"
  | "exportable"
  | "responsive"
  | "themed"
  | "live-data";

export interface RevizMeta {
  /** Globally unique, kebab-case — also the URL slug. */
  id: string;
  name: string;
  category: RevizCategoryId;
  description: string;
  tags?: string[];
  badges?: RevizBadge[];
  controls: Control[];
  presets?: RevizPreset[];
  /** Preview aspect ratio (w/h). Defaults to 16/10. */
  aspect?: number;
  /** Import name as it appears in generated code (PascalCase). */
  exportName: string;
  /** Source file path relative to src/reviz/components, for codegen import. */
  sourcePath: string;
}

export type RevizComponent = ComponentType<Record<string, unknown>>;

export interface RegistryEntry {
  meta: RevizMeta;
  Component: RevizComponent;
}

/** Resolve the default props object from a component's control schema. */
export function defaultPropsFromControls(controls: Control[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of controls) {
    out[c.key] = structuredCloneSafe(c.default);
  }
  return out;
}

/** Defaults merged with a preset's overrides. */
export function propsForPreset(meta: RevizMeta, presetId?: string): Record<string, unknown> {
  const base = defaultPropsFromControls(meta.controls);
  const preset = presetId
    ? meta.presets?.find((p) => p.id === presetId)
    : meta.presets?.[0];
  return preset ? { ...base, ...structuredCloneSafe(preset.props) } : base;
}

function structuredCloneSafe<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  return JSON.parse(JSON.stringify(v));
}
