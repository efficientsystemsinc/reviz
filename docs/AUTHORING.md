# Authoring a reviz component

This is the contract **every** component follows. It exists so 100+ components,
authored independently, feel like one library. Read it fully before writing one.

## 1. File location & shape

- One component per file: `src/reviz/components/<category>/<PascalName>.tsx`.
- `<category>` is one of: `charts`, `statistical`, `ml-eval`, `trees-graphs`,
  `interpretability`, `diagrams`, `robotics-media`, `math`, `data-display`,
  `layout-annotation`, `text-narrative`.
- The file MUST:
  - start with `"use client";`
  - `export default` the React component
  - `export const meta: RevizMeta = { … }`
- Never edit `registry.generated.ts`; it is rebuilt by `yarn gen:registry`.

## 2. Imports

Import everything from the barrel:

```ts
import { usePalette, ResponsiveSvg, Figure, useInView, type RevizMeta } from "@/reviz";
```

Allowed extra deps: `framer-motion`, `d3-scale`, `d3-shape`, `d3-array`, `katex`,
`lucide-react`, `react`. Nothing else.

## 3. Color & type — NEVER hardcode

- Get all colors from `const p = usePalette()` (`p.accent`, `p.ink`, `p.inkMuted`,
  `p.inkFaint`, `p.grid`, `p.border`, `p.surface`, `p.series[]`, `p.ok/warn/bad`).
- A `color` prop, when set, overrides `p.accent`. Default the prop to `""` and do
  `const fill = color || p.accent`.
- Labels use the mono style (`font-mono uppercase tracking-label text-ink-muted`,
  or the `MonoLabel` primitive / `TICK_FONT` for SVG text). Captions use
  `font-serif italic`. This monospace-label + serif-caption pairing is the reviz
  signature — keep it.

## 4. Structure

- Wrap the visual in `<Figure variant="plain" align="center" title caption source>`.
  Accept `title`, `caption`, `source` props (default `""`). The showcase adds the
  card + export chrome around your plain figure.
- For SVG charts use `<ResponsiveSvg aspect margin>{({ inner, margin }) => …}</ResponsiveSvg>`
  and build d3 scales from `inner.width/height`. Translate the plot group by the margins.
- Use the axis primitives (`GridLines`, `AxisLeft`, `AxisBottom`, `Baseline`) and
  `FloatingTooltip` + `TooltipRow` for hover. Use `Legend` for multi-series.

## 5. Animation (required on every component)

- Entrance animation gated on `useInView()` so it plays when scrolled into view.
- Drive with `framer-motion` (`motion.rect`, `motion.path`, …) or the
  `useAnimatedNumber` / `useProgress` hooks.
- Always honor reduced-motion — the provided hooks already do; if you animate
  manually, snap to final state when `usePrefersReducedMotion()` is true.
- Expose a `duration` number control (ms). Stagger multi-element draw-ins.
- Where natural, offer a `replay` affordance (see `ReplayButton`).

## 6. The `meta` contract

```ts
export const meta: RevizMeta = {
  id: "bar-chart",            // unique, kebab-case, == URL slug
  name: "Bar Chart",
  category: "charts",
  description: "One vivid sentence on what it shows and why it's good.",
  tags: ["bar", "comparison"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "BarChart",      // PascalCase, used in generated code
  sourcePath: "charts/BarChart", // path under components/, no extension
  aspect: 16 / 10,
  controls: [ /* see below */ ],
  presets: [ { id, name, props } ],  // 1–3 great-looking presets
};
```

Every customizable prop MUST have a matching control. The control `default` is the
prop's default. Group controls with `group` (`"Data"`, `"Labels"`, `"Layout"`,
`"Style"`, `"Animation"`).

Control types: `number` (min/max/step/unit), `text`, `textarea`, `boolean`,
`select` (options), `color`, `colorArray`, `categorical` (`{label,value}[]`),
`points` (`{x,y}[]`), `series` (`{name,data[],color?}[]`), `matrix` (`number[][]`),
`json` (anything else; the editor shows a smart table for record arrays).

Pick the most specific control type that fits — `categorical` over `json` for
label/value data, etc. Rich record arrays (e.g. bars with error + highlight) use
`json` with a clean default.

## 7. Quality bar (checklist)

- [ ] Looks publication-ready at first paint — spacing, alignment, type scale.
- [ ] Fully themed: switch palette → every color updates, no hardcoded hex.
- [ ] Animated entrance + reduced-motion safe.
- [ ] Responsive (uses `ResponsiveSvg` or fluid layout; no fixed pixel width).
- [ ] Hover/interaction where it adds insight; tooltips use `FloatingTooltip`.
- [ ] `meta` complete; every prop has a control; 1–3 presets that look amazing.
- [ ] `title/caption/source` props supported via `<Figure variant="plain">`.
- [ ] TypeScript strict-clean; default export + named `meta`.

The reference implementation is `src/reviz/components/charts/BarChart.tsx`. Match
its standard or exceed it. Aim to make each figure 100× more beautiful and useful
than a typical hand-rolled chart.
