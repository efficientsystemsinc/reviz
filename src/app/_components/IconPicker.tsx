"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

/** A broad, curated set of lucide icons that all exist and read well at small sizes. */
export const ICON_CHOICES = [
  "Activity", "AlertTriangle", "ArrowRight", "ArrowUpRight", "Award", "BarChart3", "Beaker", "Bell",
  "Bookmark", "BookOpen", "Bot", "Box", "Brain", "Calendar", "Check", "CheckCircle2", "ChevronRight",
  "CircleDot", "Clock", "Cloud", "Code2", "Compass", "Cpu", "Crosshair", "Database", "Eye", "Filter",
  "Flag", "FlaskConical", "Folder", "Gauge", "GitBranch", "Globe", "GraduationCap", "Grid3x3", "Hash",
  "Heart", "HelpCircle", "Hexagon", "Home", "Image", "Info", "Key", "Layers", "Lightbulb", "LineChart",
  "Link", "Lock", "Magnet", "Mail", "Map", "MapPin", "Maximize2", "Microscope", "Minus", "Network",
  "Orbit", "Package", "Pause", "Pencil", "PieChart", "Play", "Plus", "Radar", "Rocket", "Ruler", "Scale",
  "ScanEye", "Search", "Send", "Server", "Settings", "Share2", "Shield", "Sigma", "Sparkles", "Star",
  "Sun", "Table2", "Tag", "Target", "Terminal", "ThumbsUp", "Timer", "TrendingDown", "TrendingUp",
  "Trophy", "Users", "Wand2", "Workflow", "Zap",
];

function Glyph({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : <Icons.Box className={className} />;
}

export function IconPicker({
  value,
  onChange,
  choices = ICON_CHOICES,
}: {
  value: string;
  onChange: (v: string) => void;
  choices?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const f = q.trim().toLowerCase();
    return f ? choices.filter((c) => c.toLowerCase().includes(f)) : choices;
  }, [q, choices]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[12px] text-ink outline-none transition-colors hover:border-border-strong focus:border-accent"
        title="Choose icon"
      >
        <Glyph name={value} className="h-4 w-4 text-accent" />
        <Icons.ChevronDown className="h-3 w-3 text-ink-faint" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-56 rounded-reviz border border-border bg-surface p-2 shadow-float-lg">
          <div className="relative mb-2">
            <Icons.Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search icons…"
              className="w-full rounded-md border border-border bg-canvas py-1 pl-7 pr-2 text-[12px] text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="grid max-h-48 grid-cols-7 gap-0.5 overflow-y-auto">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                  setQ("");
                }}
                className={cn(
                  "grid aspect-square place-items-center rounded-md transition-colors hover:bg-surface-alt",
                  value === name ? "bg-accent/10 text-accent ring-1 ring-accent/40" : "text-ink-muted",
                )}
              >
                <Glyph name={name} className="h-4 w-4" />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-7 py-3 text-center text-[11px] text-ink-faint">No icons match.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
