import { CATEGORIES, type RegistryEntry, type RevizCategoryId } from "./types";
import { REGISTRY } from "./registry.generated";

export { REGISTRY };

export function getEntry(id: string): RegistryEntry | undefined {
  return REGISTRY.find((e) => e.meta.id === id);
}

export function entriesByCategory(cat: RevizCategoryId): RegistryEntry[] {
  return REGISTRY.filter((e) => e.meta.category === cat).sort((a, b) =>
    a.meta.name.localeCompare(b.meta.name),
  );
}

export function categoriesWithCounts() {
  return CATEGORIES.map((c) => ({
    ...c,
    count: REGISTRY.filter((e) => e.meta.category === c.id).length,
  }));
}

export function searchEntries(query: string): RegistryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return REGISTRY;
  return REGISTRY.filter((e) => {
    const hay = [
      e.meta.name,
      e.meta.description,
      e.meta.category,
      ...(e.meta.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export const TOTAL_COMPONENTS = REGISTRY.length;
