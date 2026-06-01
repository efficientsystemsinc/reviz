# reviz

**The world's largest library of research-grade visualization components.**

reviz is a React + Next.js + TypeScript platform housing a vast, modular library
of beautiful, animated, fully themeable visualization components — built so any
research team, anywhere, can document and present their findings perfectly.

It is not "another chart library." The moat is fourfold and compounding:

1. **A coherent design system.** Every component shares one typographic and color
   language (monospace labels, elegant Urbanist/Newsreader type, eight tuned
   research palettes). A figure made from ten different components still looks
   like one figure. An ad-hoc agent building components one-off cannot produce
   this coherence.
2. **A schema-driven meta-layer.** Every component ships a typed `meta` describing
   its props. That single schema powers (a) an auto-generated customization pane,
   (b) a copy-pasteable code generator, and (c) the WYSIWYG editor — for free,
   across 100+ components.
3. **Research-specific breadth.** MCTS trees, value-head distributions, calibration
   plots, annotated transcripts, attention matrices, comparison sliders, scaling
   laws, synthetic-data timelines — the figures research actually needs, not just
   bars and lines.
4. **An interaction grammar.** Animation, replay, hover, annotation, theming, and
   crisp SVG/PNG export are baked into every component by construction.

## Stack

- **Next.js 14** (App Router) · **React 18** · **TypeScript**
- **Tailwind CSS** with CSS-variable design tokens (live theming)
- **framer-motion** for animation · **d3-scale/shape** for chart math
- **KaTeX** for equations · **yarn** for package management

## Develop

```bash
yarn install
yarn dev            # http://localhost:3000
yarn gen:registry   # rebuild the component registry after adding components
yarn build          # production build (runs gen:registry first)
yarn typecheck
```

## Project layout

```
src/
  reviz/
    theme.ts                 # palettes + color tokens
    ThemeProvider.tsx        # live theming context + ThemeScope
    types.ts                 # RevizMeta + control schema (the meta-layer)
    codegen.ts               # schema -> copy-pasteable JSX
    registry.ts              # registry helpers
    registry.generated.ts    # AUTO-GENERATED — do not edit
    primitives/              # shared building blocks (Figure, axes, tooltip, …)
    components/<category>/    # the library — one file per component
  app/                       # the showcase platform + editor
scripts/gen-registry.mjs     # globs components -> registry (conflict-free authoring)
docs/AUTHORING.md            # the component contract every component follows
```

## Adding a component

See [`docs/AUTHORING.md`](docs/AUTHORING.md). In short: drop a file in
`src/reviz/components/<category>/<Name>.tsx` that exports a default React
component and a named `meta`, then run `yarn gen:registry`. No shared files to
touch — authoring is conflict-free by design.
