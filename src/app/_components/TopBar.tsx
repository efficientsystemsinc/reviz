"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Github, Palette, Search, Check } from "lucide-react";
import { useTheme } from "@/reviz/ThemeProvider";
import { cn } from "@/lib/utils";
import { TOTAL_COMPONENTS } from "@/reviz/registry";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  const navItem = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={cn(
          "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
          active ? "bg-surface-alt text-ink" : "text-ink-muted hover:text-ink",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-canvas/80 px-4 backdrop-blur-xl lg:px-6">
      <Link href="/" className="group flex items-center gap-2">
        <Logo />
      </Link>
      <span className="hidden rounded-full border border-border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-ink-faint sm:inline">
        {TOTAL_COMPONENTS} components
      </span>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/browse?q=${encodeURIComponent(q)}`);
        }}
        className="ml-2 hidden flex-1 items-center gap-2 md:flex"
      >
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library…"
            className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
          />
        </div>
      </form>

      <nav className="ml-auto flex items-center gap-1">
        {navItem("/browse", "Library")}
        {navItem("/editor", "Editor")}
        <GlobalThemeSwitcher />
        <a
          href="https://github.com/efficientsystemsinc/reviz"
          target="_blank"
          rel="noreferrer"
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
          title="GitHub"
        >
          <Github className="h-4 w-4" />
        </a>
      </nav>
    </header>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span className="relative grid h-6 w-6 place-items-center">
        <svg viewBox="0 0 24 24" className="h-6 w-6">
          <rect x="2" y="13" width="4" height="9" rx="1.2" className="fill-accent" />
          <rect x="8.5" y="7" width="4" height="15" rx="1.2" className="fill-ink" />
          <rect x="15" y="3" width="4" height="19" rx="1.2" className="fill-accent" opacity="0.55" />
        </svg>
      </span>
      <span className="font-sans text-[17px] font-bold tracking-tight text-ink">reviz</span>
    </span>
  );
}

function GlobalThemeSwitcher() {
  const { palettes, paletteId, setPaletteId } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
        title="Theme"
      >
        <Palette className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-52 rounded-reviz border border-border bg-surface p-1.5 shadow-float-lg">
            <div className="px-2 py-1 font-mono text-[9.5px] uppercase tracking-label text-ink-faint">
              Site theme
            </div>
            {palettes.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPaletteId(p.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-alt"
              >
                <span className="flex gap-0.5">
                  <span className="h-3.5 w-1.5 rounded-full" style={{ background: p.accent }} />
                  <span className="h-3.5 w-1.5 rounded-full" style={{ background: p.ink }} />
                </span>
                <span className="text-[12.5px] text-ink">{p.name}</span>
                {p.id === paletteId && <Check className="ml-auto h-3.5 w-3.5 text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
