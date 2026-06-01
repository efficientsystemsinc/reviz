"use client";

import { cn } from "@/lib/utils";

export interface LegendItem {
  label: string;
  color: string;
  /** Optional marker shape. */
  shape?: "square" | "circle" | "line" | "dashed";
}

/** A compact, mono-labeled series legend. */
export function Legend({
  items,
  className,
  align = "left",
}: {
  items: LegendItem[];
  className?: string;
  align?: "left" | "center" | "right";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5",
        align === "center" && "justify-center",
        align === "right" && "justify-end",
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <Marker color={it.color} shape={it.shape ?? "square"} />
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Marker({ color, shape }: { color: string; shape: NonNullable<LegendItem["shape"]> }) {
  if (shape === "circle")
    return <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
  if (shape === "line")
    return <span className="h-[2px] w-4 rounded-full" style={{ background: color }} />;
  if (shape === "dashed")
    return (
      <span
        className="h-[2px] w-4"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`,
        }}
      />
    );
  return <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />;
}
