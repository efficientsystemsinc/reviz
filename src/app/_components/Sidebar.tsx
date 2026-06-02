"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { CATEGORIES } from "@/reviz/types";
import { REGISTRY, getEntry } from "@/reviz/registry";
import { PRIORITY, TIER_META, type PriorityTier } from "@/reviz/priority";
import { cn } from "@/lib/utils";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : <Icons.Box className={className} />;
}

type View = "priority" | "all";

export function Sidebar() {
  const pathname = usePathname();
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<View>("priority");
  const f = filter.trim().toLowerCase();

  const match = (id: string, name: string, tags?: string[]) =>
    !f || name.toLowerCase().includes(f) || id.includes(f) || (tags ?? []).some((t) => t.includes(f));

  // Priority view: the ranked 30, grouped by tier, in rank order.
  const tiers = useMemo(() => {
    const order: PriorityTier[] = ["P0", "P1", "P2"];
    return order
      .map((tier) => ({
        tier,
        items: PRIORITY.filter((p) => p.tier === tier)
          .map((p) => ({ p, entry: getEntry(p.id) }))
          .filter((x): x is { p: (typeof PRIORITY)[number]; entry: NonNullable<ReturnType<typeof getEntry>> } => Boolean(x.entry))
          .filter(({ p, entry }) => match(p.id, entry.meta.name, entry.meta.tags))
          .sort((a, b) => a.p.rank - b.p.rank),
      }))
      .filter((g) => g.items.length > 0);
  }, [f]);

  // All view: every component, grouped by category.
  const grouped = useMemo(
    () =>
      CATEGORIES.map((cat) => ({
        cat,
        items: REGISTRY.filter((e) => e.meta.category === cat.id)
          .filter((e) => match(e.meta.id, e.meta.name, e.meta.tags))
          .sort((a, b) => a.meta.name.localeCompare(b.meta.name)),
      })).filter((g) => g.items.length > 0),
    [f],
  );

  const isActive = (id: string) => pathname === `/c/${id}`;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border">
      <div className="flex flex-col gap-2 p-3">
        <ViewToggle view={view} onChange={setView} />
        <div className="relative">
          <Icons.Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter components…"
            className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-8">
        {view === "priority"
          ? tiers.map(({ tier, items }) => (
              <div key={tier} className="mb-4">
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide",
                      tier === "P0" && "bg-accent/15 text-accent",
                      tier === "P1" && "bg-ink/10 text-ink-muted",
                      tier === "P2" && "bg-surface-alt text-ink-faint",
                    )}
                  >
                    {tier}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-label text-ink-faint">
                    {TIER_META[tier].name}
                  </span>
                  <span className="ml-auto text-[10px] text-ink-faint/60">{items.length}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {items.map(({ p, entry }) => (
                    <NavRow
                      key={p.id}
                      id={p.id}
                      name={entry.meta.name}
                      active={isActive(p.id)}
                      rank={p.rank}
                    />
                  ))}
                </div>
              </div>
            ))
          : grouped.map(({ cat, items }) => (
              <div key={cat.id} className="mb-4">
                <div className="flex items-center gap-1.5 px-2 py-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint">
                  <Icon name={cat.icon} className="h-3 w-3" />
                  {cat.name}
                  <span className="ml-auto text-ink-faint/60">{items.length}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {items.map((e) => (
                    <NavRow key={e.meta.id} id={e.meta.id} name={e.meta.name} active={isActive(e.meta.id)} />
                  ))}
                </div>
              </div>
            ))}

        {((view === "priority" && tiers.length === 0) || (view === "all" && grouped.length === 0)) && (
          <div className="px-3 py-6 text-center text-[12px] text-ink-faint">No matches.</div>
        )}
      </nav>
    </aside>
  );
}

function NavRow({ id, name, active, rank }: { id: string; name: string; active: boolean; rank?: number }) {
  return (
    <Link
      href={`/c/${id}`}
      className={cn(
        "group relative flex items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px] transition-colors",
        active ? "bg-accent/10 font-medium text-accent" : "text-ink-muted hover:bg-surface-alt hover:text-ink",
      )}
    >
      {/* stable active rail — no layout animation, never mis-positions */}
      <span
        className={cn(
          "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="min-w-0 truncate">{name}</span>
      {rank != null && (
        <span className="ml-auto shrink-0 font-mono text-[9.5px] tabular-nums text-ink-faint/60">
          {rank}
        </span>
      )}
    </Link>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const items: { value: View; label: string }[] = [
    { value: "priority", label: "Priority" },
    { value: "all", label: "All" },
  ];
  return (
    <div className="flex rounded-lg border border-border bg-surface-alt p-0.5">
      {items.map((it) => {
        const active = it.value === view;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "flex-1 rounded-md px-2.5 py-1 text-[12px] font-medium leading-none transition-colors",
              active ? "bg-surface text-ink shadow-float" : "text-ink-faint hover:text-ink",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
