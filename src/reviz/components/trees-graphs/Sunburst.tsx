"use client";

import { arc as d3arc } from "d3-shape";
import { useMemo, useState } from "react";
import {
  Figure,
  FloatingTooltip,
  ReplayButton,
  ResponsiveSvg,
  SoftShadow,
  TooltipRow,
  clamp,
  formatCompact,
  mix,
  polarToCartesian,
  readableOn,
  uid,
  useInView,
  usePalette,
  useProgress,
  withAlpha,
  type RevizMeta,
} from "@/reviz";

/** A node in the hierarchy. Leaves carry a `value`; parents sum their children. */
export interface SunburstNode {
  label: string;
  value?: number;
  children?: SunburstNode[];
}

export interface SunburstProps {
  data: SunburstNode;
  title?: string;
  caption?: string;
  source?: string;
  centerLabel?: string;
  ringGap?: number;
  padAngle?: number;
  colors?: string[];
  duration?: number;
}

/** A laid-out arc segment in the radial partition. */
interface Segment {
  id: number;
  label: string;
  depth: number;
  value: number;
  /** Index of the top-level branch this segment belongs to (color family). */
  branch: number;
  /** Slash-joined path from root to this node, e.g. `core / transformer`. */
  path: string;
  x0: number; // start angle (radians, 0 = 12 o'clock via polarToCartesian)
  x1: number; // end angle
}

const TAU = Math.PI * 2;

const DEFAULT_DATA: SunburstNode = {
  label: "repo",
  children: [
    {
      label: "core",
      children: [
        { label: "transformer", value: 18400 },
        { label: "tokenizer", value: 6200 },
        { label: "scheduler", value: 4100 },
      ],
    },
    {
      label: "training",
      children: [
        { label: "trainer", value: 12800 },
        { label: "data_loader", value: 7600 },
        { label: "optim", value: 5300 },
      ],
    },
    {
      label: "eval",
      children: [
        { label: "harness", value: 9100 },
        { label: "benchmarks", value: 4800 },
        { label: "metrics", value: 2600 },
      ],
    },
    {
      label: "infra",
      children: [
        { label: "serve", value: 8700 },
        { label: "kv_cache", value: 3400 },
        { label: "telemetry", value: 2900 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Recursive radial layout.                                            */
/* Each node owns an angular wedge; children split it in proportion to */
/* their summed value. Depth maps to ring radius.                      */
/* ------------------------------------------------------------------ */

/** Sum a node's value: explicit leaf value, else the sum of its children. */
function sumValue(node: SunburstNode): number {
  if (node.children && node.children.length > 0) {
    return node.children.reduce((s, c) => s + sumValue(c), 0);
  }
  return Math.max(0, node.value ?? 0);
}

function layout(root: SunburstNode): { segments: Segment[]; maxDepth: number; total: number } {
  const segments: Segment[] = [];
  let id = 0;
  let maxDepth = 0;

  const total = sumValue(root) || 1;

  // Walk children of the root as ring 1; the root itself is the center (ring 0).
  const walk = (
    node: SunburstNode,
    depth: number,
    branch: number,
    parentPath: string,
    x0: number,
    x1: number,
  ) => {
    const span = x1 - x0;
    if (span <= 0) return;
    const path = parentPath ? `${parentPath} / ${node.label}` : node.label;
    const value = sumValue(node);
    if (depth > maxDepth) maxDepth = depth;

    segments.push({ id: id++, label: node.label, depth, value, branch, path, x0, x1 });

    const kids = node.children?.filter((c) => sumValue(c) > 0) ?? [];
    if (kids.length === 0) return;
    const childTotal = kids.reduce((s, c) => s + sumValue(c), 0) || 1;
    let cursor = x0;
    for (const child of kids) {
      const frac = sumValue(child) / childTotal;
      const next = cursor + frac * span;
      walk(child, depth + 1, branch, path, cursor, next);
      cursor = next;
    }
  };

  const top = root.children?.filter((c) => sumValue(c) > 0) ?? [];
  const topTotal = top.reduce((s, c) => s + sumValue(c), 0) || 1;
  let cursor = 0;
  top.forEach((child, i) => {
    const frac = sumValue(child) / topTotal;
    const next = cursor + frac * TAU;
    walk(child, 1, i, "", cursor, next);
    cursor = next;
  });

  return { segments, maxDepth, total };
}

export default function Sunburst({
  data = DEFAULT_DATA,
  title,
  caption,
  source,
  centerLabel = "",
  ringGap = 2,
  padAngle = 0.006,
  colors = [],
  duration = 1100,
}: SunburstProps) {
  const p = usePalette();
  const ring = colors.length > 0 ? colors : p.series;
  const [ref, inView] = useInView<HTMLDivElement>();
  const [token, setToken] = useState(0);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);

  const sweep = useProgress({ duration, enabled: inView, trigger: token });

  const { segments, maxDepth, total } = useMemo(() => layout(data), [data]);

  const branchCount = useMemo(
    () => Math.max(1, segments.reduce((m, s) => Math.max(m, s.branch + 1), 0)),
    [segments],
  );
  const colorFor = (branch: number) => ring[branch % ring.length];

  const shadowId = useMemo(() => uid("sunburst-shadow"), []);

  const active = hover ? segments.find((s) => s.id === hover.id) ?? null : null;

  const fmtVal = (v: number) => formatCompact(v, v >= 1000 ? 1 : 0);
  const fmtPct = (v: number) => {
    const pct = (v / total) * 100;
    return pct >= 9.95 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
  };

  return (
    <Figure variant="plain" align="center" title={title} caption={caption} source={source}>
      <div ref={ref} className="relative">
        <ResponsiveSvg aspect={16 / 10} margin={{ top: 14, right: 14, bottom: 14, left: 14 }}>
          {({ inner, margin }) => {
            const cx = inner.width / 2;
            const cy = inner.height / 2;
            const radius = clamp(Math.min(inner.width, inner.height) / 2 - 6, 24, 1000);

            // Reserve a hub for the center readout; rings fill the remainder.
            const hub = radius * 0.32;
            const bandTotal = radius - hub;
            const band = bandTotal / Math.max(1, maxDepth);
            const gap = clamp(ringGap, 0, 8);
            const pad = clamp(padAngle, 0, 0.04);

            const radiusFor = (depth: number) => ({
              inner: hub + (depth - 1) * band + gap / 2,
              outer: hub + depth * band - gap / 2,
            });

            // d3 arc: angles measured from 12 o'clock, matching polarToCartesian.
            const arcGen = d3arc<{
              inner: number;
              outer: number;
              start: number;
              end: number;
            }>()
              .innerRadius((a) => a.inner)
              .outerRadius((a) => a.outer)
              .startAngle((a) => a.start)
              .endAngle((a) => a.end)
              .padAngle(pad)
              .cornerRadius(1.5);

            const activeBranch = active ? active.branch : -1;

            return (
              <g transform={`translate(${margin.left}, ${margin.top})`}>
                <defs>
                  <SoftShadow id={shadowId} dy={3} blur={8} opacity={0.24} />
                </defs>

                <g transform={`translate(${cx}, ${cy})`}>
                  {/* Faint track for each ring band, for a finished, framed look. */}
                  {Array.from({ length: maxDepth }, (_, d) => {
                    const r = radiusFor(d + 1);
                    return (
                      <circle
                        key={`track-${d}`}
                        r={(r.inner + r.outer) / 2}
                        fill="none"
                        stroke={p.surfaceAlt}
                        strokeWidth={Math.max(0, r.outer - r.inner)}
                        opacity={0.45}
                      />
                    );
                  })}

                  {/* Rings group: scale + fade entrance keyed to progress.
                      The arc geometry never depends on `sweep`, so the final
                      (and any forced-visible) frame always shows full wedges. */}
                  <g
                    transform={`scale(${0.94 + 0.06 * sweep})`}
                    opacity={0.001 + 0.999 * sweep}
                  >
                  {segments.map((s) => {
                    const r = radiusFor(s.depth);
                    if (r.outer <= r.inner) return null;

                    // Geometry is ALWAYS the full wedge (s.x0 -> s.x1) so the
                    // static / completed frame is correct regardless of the
                    // progress value. The entrance is carried by the ring
                    // group's opacity + scale below, not by mutating the arc
                    // 'd' — which keeps every segment present in every frame.
                    const span = s.x1 - s.x0;
                    const end = s.x1;

                    const fill = colorFor(s.branch);
                    // Deeper rings read as lighter tints of the branch color.
                    const tint = mix(fill, p.surface, clamp((s.depth - 1) * 0.22, 0, 0.6));
                    const isActive = active?.id === s.id;
                    const sameBranch = activeBranch >= 0 && s.branch === activeBranch;
                    const dim = activeBranch >= 0 && !sameBranch;

                    // Lift the segment outward along its bisector on hover.
                    const mid = (s.x0 + s.x1) / 2;
                    const deg = (mid * 180) / Math.PI;
                    const lift = isActive ? Math.max(4, band * 0.22) : 0;
                    const off = isActive ? polarToCartesian(0, 0, lift, deg) : { x: 0, y: 0 };

                    const path =
                      arcGen({ inner: r.inner, outer: r.outer, start: s.x0, end }) ?? undefined;
                    if (!path) return null;

                    // Curved label for wide-enough segments once revealed.
                    const reveal = (end - s.x0) / Math.max(1e-4, span);
                    const frac = span / TAU;
                    const lr = (r.inner + r.outer) / 2;
                    const lp = polarToCartesian(0, 0, lr, deg);
                    const labelSize = clamp(band * 0.26, 7.5, 11);
                    const ink = readableOn(tint);

                    // Outer-ring (leaf) segments label radially so even thin
                    // wedges fit their full name along the band's depth rather
                    // than its narrow arc — no truncation, no missing labels.
                    const isLeaf = s.depth === maxDepth;
                    const radialRoom = r.outer - r.inner - 8;
                    const showRadial =
                      isLeaf &&
                      reveal > 0.85 &&
                      span * lr > labelSize * 1.4 &&
                      radialRoom > 16;
                    const showLabel =
                      !isLeaf && frac > 0.05 && reveal > 0.85 && r.outer - r.inner > 13;
                    // Run text outward from the inner edge; flip on the left
                    // half so it always reads upright.
                    const onLeft = deg > 180;
                    const radStart = polarToCartesian(0, 0, r.inner + 4, deg);
                    const radRot = deg - 90 + (onLeft ? 180 : 0);
                    const radAnchor = onLeft ? "end" : "start";

                    return (
                      <g
                        key={s.id}
                        transform={`translate(${off.x}, ${off.y})`}
                        style={{ transition: "transform 220ms cubic-bezier(0.22,1,0.36,1)" }}
                      >
                        <path
                          d={path}
                          fill={tint}
                          opacity={dim ? 0.34 : 1}
                          stroke={p.canvas}
                          strokeWidth={1}
                          filter={isActive ? `url(#${shadowId})` : undefined}
                          style={{ transition: "opacity 220ms ease", cursor: "pointer" }}
                          onMouseMove={(e) => {
                            const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                            const box = svg.getBoundingClientRect();
                            setHover({ id: s.id, x: e.clientX - box.left, y: e.clientY - box.top });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                        {showLabel && (
                          <text
                            x={lp.x}
                            y={lp.y}
                            dy="0.32em"
                            textAnchor="middle"
                            className="font-mono uppercase"
                            fontSize={labelSize}
                            letterSpacing={0.4}
                            fill={dim ? p.inkFaint : ink}
                            opacity={dim ? 0.5 : 0.95}
                            style={{ pointerEvents: "none" }}
                          >
                            {clipLabel(s.label, span * lr)}
                          </text>
                        )}
                        {showRadial && (
                          <text
                            transform={`translate(${radStart.x}, ${radStart.y}) rotate(${radRot})`}
                            dy="0.32em"
                            textAnchor={radAnchor}
                            className="font-mono uppercase"
                            fontSize={labelSize}
                            letterSpacing={0.4}
                            fill={dim ? p.inkFaint : ink}
                            opacity={dim ? 0.5 : 0.95}
                            style={{ pointerEvents: "none" }}
                          >
                            {clipLabel(s.label, radialRoom)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  </g>

                  {/* Center hub readout — total, or the hovered node. */}
                  <circle r={hub - gap} fill={p.surface} stroke={p.border} strokeWidth={1} />
                  <g style={{ pointerEvents: "none" }}>
                    <text
                      textAnchor="middle"
                      y={-8}
                      className="font-mono uppercase"
                      fontSize={8.5}
                      letterSpacing={0.6}
                      fill={p.inkFaint}
                    >
                      {active ? active.label : centerLabel || "Total"}
                    </text>
                    <text
                      textAnchor="middle"
                      y={13}
                      className="font-sans tabular-nums"
                      fontSize={clamp(hub * 0.42, 15, 30)}
                      fontWeight={600}
                      fill={active ? colorFor(active.branch) : p.ink}
                    >
                      {active ? fmtVal(active.value) : fmtVal(total)}
                    </text>
                    <text
                      textAnchor="middle"
                      y={hub * 0.42 + 14}
                      className="font-mono tabular-nums"
                      fontSize={9}
                      fill={p.inkMuted}
                    >
                      {active ? fmtPct(active.value) : `${branchCount} branches`}
                    </text>
                  </g>

                  {/* Crisp outer rim. */}
                  <circle
                    r={radius}
                    fill="none"
                    stroke={withAlpha(p.borderStrong, 0.55)}
                    strokeWidth={1}
                  />
                </g>
              </g>
            );
          }}
        </ResponsiveSvg>

        <FloatingTooltip x={hover?.x ?? 0} y={hover?.y ?? 0} visible={active != null}>
          {active != null && (
            <>
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: colorFor(active.branch) }}
                />
                <span className="font-mono text-[10px] uppercase tracking-wide opacity-80">
                  {active.label}
                </span>
              </div>
              <TooltipRow label="path" value={active.path} />
              <TooltipRow label="value" value={fmtVal(active.value)} />
              <TooltipRow label="share" value={fmtPct(active.value)} />
            </>
          )}
        </FloatingTooltip>

        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover/figure:opacity-100">
          <ReplayButton onClick={() => setToken((t) => t + 1)} />
        </div>
      </div>
    </Figure>
  );
}

/** Truncate a label to roughly fit `arcLen` px of curved space (mono ~6px/char). */
function clipLabel(label: string, arcLen: number): string {
  const max = Math.max(3, Math.floor(arcLen / 7));
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(2, max - 1))}…`;
}

export const meta: RevizMeta = {
  id: "sunburst",
  name: "Sunburst",
  category: "trees-graphs",
  description:
    "A radial hierarchy whose concentric ring segments are sized by value and colored by top-level branch; segments sweep in by angle, lift under the cursor, and the hub reports the focused node's path and share.",
  tags: ["sunburst", "hierarchy", "radial", "tree", "partition", "composition", "drilldown"],
  badges: ["animated", "interactive", "exportable", "themed", "responsive"],
  exportName: "Sunburst",
  sourcePath: "trees-graphs/Sunburst",
  aspect: 16 / 10,
  controls: [
    {
      key: "data",
      label: "Hierarchy",
      type: "json",
      group: "Data",
      help: "Nested { label, value?, children? }. Leaves carry value; parents sum their children.",
      default: DEFAULT_DATA,
    },
    { key: "title", label: "Title", type: "text", group: "Labels", default: "Codebase by subsystem" },
    { key: "caption", label: "Caption", type: "text", group: "Labels", default: "" },
    { key: "source", label: "Source", type: "text", group: "Labels", default: "" },
    { key: "centerLabel", label: "Center label", type: "text", group: "Labels", default: "" },
    { key: "ringGap", label: "Ring gap", type: "number", group: "Layout", default: 2, min: 0, max: 8, step: 0.5, unit: "px" },
    { key: "padAngle", label: "Segment gap", type: "number", group: "Layout", default: 0.006, min: 0, max: 0.04, step: 0.002 },
    { key: "colors", label: "Branch colors", type: "colorArray", group: "Style", default: [] },
    { key: "duration", label: "Animation (ms)", type: "number", group: "Animation", default: 1100, min: 0, max: 2500, step: 50 },
  ],
  presets: [
    {
      id: "codebase",
      name: "Codebase by subsystem",
      props: {
        title: "Codebase by subsystem",
        caption: "Lines of code per package, nested under subsystems.",
        source: "git ls-files",
        centerLabel: "LOC",
        data: DEFAULT_DATA,
      },
    },
    {
      id: "token-budget",
      name: "Context budget",
      props: {
        title: "Context budget by category",
        caption: "Token allocation across a 200k context window, by source.",
        source: "1M-token run",
        centerLabel: "Tokens",
        ringGap: 3,
        data: {
          label: "context",
          children: [
            {
              label: "instructions",
              children: [
                { label: "system", value: 4200 },
                { label: "tool_schemas", value: 9800 },
                { label: "policies", value: 3100 },
              ],
            },
            {
              label: "retrieval",
              children: [
                { label: "docs", value: 86000 },
                { label: "code", value: 52000 },
                { label: "memory", value: 14000 },
              ],
            },
            {
              label: "conversation",
              children: [
                { label: "history", value: 31000 },
                { label: "scratchpad", value: 11000 },
              ],
            },
            {
              label: "output",
              children: [
                { label: "plan", value: 4600 },
                { label: "completion", value: 8200 },
              ],
            },
          ],
        },
      },
    },
    {
      id: "params",
      name: "Parameter count",
      props: {
        title: "Parameters by component",
        caption: "Where a 7B transformer's weights live, by block.",
        centerLabel: "Params",
        data: {
          label: "model",
          children: [
            {
              label: "attention",
              children: [
                { label: "q_proj", value: 1180 },
                { label: "k_proj", value: 1180 },
                { label: "v_proj", value: 1180 },
                { label: "o_proj", value: 1180 },
              ],
            },
            {
              label: "mlp",
              children: [
                { label: "gate", value: 1610 },
                { label: "up", value: 1610 },
                { label: "down", value: 1610 },
              ],
            },
            {
              label: "embeddings",
              children: [
                { label: "tok_embed", value: 525 },
                { label: "lm_head", value: 525 },
              ],
            },
            {
              label: "norms",
              children: [
                { label: "input_ln", value: 12 },
                { label: "post_ln", value: 12 },
                { label: "final_ln", value: 4 },
              ],
            },
          ],
        },
      },
    },
  ],
};
