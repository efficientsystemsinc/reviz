"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { REGISTRY } from "@/reviz/registry";
import { CATEGORIES, type RevizCategoryId } from "@/reviz/types";
import { cn } from "@/lib/utils";
import { ComponentCard } from "./ComponentCard";

export function BrowseGallery() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const catParam = params.get("cat") as RevizCategoryId | null;
  const [search, setSearch] = useState(q);
  const [cat, setCat] = useState<RevizCategoryId | "all">(catParam ?? "all");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of REGISTRY) m.set(e.meta.category, (m.get(e.meta.category) ?? 0) + 1);
    return m;
  }, []);

  const filtered = useMemo(() => {
    const f = search.trim().toLowerCase();
    return REGISTRY.filter((e) => cat === "all" || e.meta.category === cat).filter((e) => {
      if (!f) return true;
      return (
        e.meta.name.toLowerCase().includes(f) ||
        e.meta.description.toLowerCase().includes(f) ||
        (e.meta.tags ?? []).some((t) => t.toLowerCase().includes(f))
      );
    });
  }, [search, cat]);

  return (
    <div className="h-full overflow-y-auto px-6 py-7 lg:px-10">
      <div className="mb-6">
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink">The library</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          {REGISTRY.length} research-grade components — every one themeable, animated, and copy-pasteable.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="mr-2 w-44 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
        />
        <FilterPill active={cat === "all"} onClick={() => setCat("all")}>
          All <span className="opacity-50">{REGISTRY.length}</span>
        </FilterPill>
        {CATEGORIES.filter((c) => (counts.get(c.id) ?? 0) > 0).map((c) => (
          <FilterPill key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
            {c.name} <span className="opacity-50">{counts.get(c.id)}</span>
          </FilterPill>
        ))}
      </div>

      <motion.div layout className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((e, i) => (
          <ComponentCard key={e.meta.id} entry={e} index={i} />
        ))}
      </motion.div>

      {filtered.length === 0 && (
        <div className="grid place-items-center py-24 text-ink-faint">No components match your search.</div>
      )}
    </div>
  );
}

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-ink-muted hover:border-border-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
