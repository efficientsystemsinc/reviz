"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { CATEGORIES } from "@/reviz/types";
import { REGISTRY } from "@/reviz/registry";
import { cn } from "@/lib/utils";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : <Icons.Box className={className} />;
}

export function Sidebar() {
  const pathname = usePathname();
  const [filter, setFilter] = useState("");

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return CATEGORIES.map((cat) => ({
      cat,
      items: REGISTRY.filter((e) => e.meta.category === cat.id)
        .filter((e) => !f || e.meta.name.toLowerCase().includes(f) || (e.meta.tags ?? []).some((t) => t.includes(f)))
        .sort((a, b) => a.meta.name.localeCompare(b.meta.name)),
    })).filter((g) => g.items.length > 0);
  }, [filter]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border">
      <div className="p-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter components…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-8">
        {grouped.map(({ cat, items }) => (
          <div key={cat.id} className="mb-4">
            <div className="flex items-center gap-1.5 px-2 py-1.5 font-mono text-[10px] uppercase tracking-label text-ink-faint">
              <Icon name={cat.icon} className="h-3 w-3" />
              {cat.name}
              <span className="ml-auto text-ink-faint/60">{items.length}</span>
            </div>
            <div className="flex flex-col">
              {items.map((e) => {
                const href = `/c/${e.meta.id}`;
                const active = pathname === href;
                return (
                  <Link
                    key={e.meta.id}
                    href={href}
                    className={cn(
                      "rounded-md px-2 py-1 text-[13px] transition-colors",
                      active
                        ? "bg-accent/10 font-medium text-accent"
                        : "text-ink-muted hover:bg-surface-alt hover:text-ink",
                    )}
                  >
                    {e.meta.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-ink-faint">No matches.</div>
        )}
      </nav>
    </aside>
  );
}
