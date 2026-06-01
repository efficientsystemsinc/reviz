"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Sparkles, Palette, Code2, Layers, ScanEye } from "lucide-react";
import * as Icons from "lucide-react";
import { TopBar } from "./_components/TopBar";
import { ThemeScope } from "@/reviz/ThemeProvider";
import { getPalette } from "@/reviz/theme";
import { REGISTRY, getEntry } from "@/reviz/registry";
import { CATEGORIES, propsForPreset } from "@/reviz/types";
import { ComponentCard } from "./_components/ComponentCard";

const HERO_IDS = [
  "benchmark-bars",
  "training-curve",
  "search-tree",
  "annotated-transcript",
  "scaling-law",
  "confusion-matrix",
  "donut-chart",
  "attention-matrix",
];

const FEATURED_IDS = [
  "benchmark-bars",
  "search-tree",
  "annotated-transcript",
  "training-curve",
  "nla-autoencoder",
  "calendar-heatmap",
  "scaling-law",
  "radial-concept",
];

export default function Landing() {
  const heroEntries = useMemo(() => HERO_IDS.map(getEntry).filter(Boolean), []);
  const featured = useMemo(() => FEATURED_IDS.map(getEntry).filter(Boolean), []);
  const heroPalette = getPalette("paper");

  return (
    <div className="min-h-screen bg-canvas">
      <TopBar />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 reviz-dotgrid opacity-50" />
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, rgb(var(--rz-accent)/0.5), transparent 70%)" }}
        />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:px-10 lg:py-24">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[10.5px] uppercase tracking-label text-ink-muted"
            >
              <Sparkles className="h-3 w-3 text-accent" />
              {REGISTRY.length}+ components · built for research
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="text-balance font-sans text-5xl font-bold leading-[1.05] tracking-tight text-ink lg:text-6xl"
            >
              Present your research
              <br />
              <span className="text-accent">exactly</span> as you imagined it.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-muted"
            >
              reviz is the world&apos;s largest library of research-grade visualization components —
              charts, trees, attention maps, equations, comparison sliders, and more. Every one is
              themeable, animated, exportable, and copy-pasteable. One coherent design language, so a
              figure made from ten components still looks like one figure.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="mt-7 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/browse"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-accent-contrast shadow-float transition-transform hover:-translate-y-0.5"
              >
                Browse the library <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/editor"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-[14px] font-semibold text-ink transition-colors hover:border-border-strong"
              >
                <Code2 className="h-4 w-4" /> Open the editor
              </Link>
            </motion.div>
          </div>

          {/* Rotating live hero figure */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="relative"
          >
            <div className="absolute -inset-3 rounded-[20px] bg-gradient-to-br from-accent/10 to-transparent blur-xl" />
            <ThemeScope
              palette={heroPalette}
              className="relative rounded-[18px] border border-border p-5 shadow-float-lg"
              style={{ background: heroPalette.surface }}
            >
              <HeroRotator entries={heroEntries} />
            </ThemeScope>
          </motion.div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-label text-accent">Why reviz</h2>
        <p className="mb-10 max-w-2xl text-2xl font-semibold tracking-tight text-ink">
          Things your own coding agent can&apos;t hand you in an afternoon.
        </p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Pillar
            icon={<Palette className="h-5 w-5" />}
            title="One design language"
            body="Eight tuned research palettes, monospace labels, elegant type. Mix any ten components and they still read as one coherent figure."
          />
          <Pillar
            icon={<Layers className="h-5 w-5" />}
            title="Customize without code"
            body="Every component ships a typed schema that auto-generates a controls pane and copy-pasteable code. Tweak, theme, export."
          />
          <Pillar
            icon={<ScanEye className="h-5 w-5" />}
            title="Research-specific breadth"
            body="MCTS trees, calibration plots, annotated transcripts, attention matrices, scaling laws — the figures research actually needs."
          />
          <Pillar
            icon={<Sparkles className="h-5 w-5" />}
            title="Animated & exportable"
            body="Tasteful motion on every component, reduced-motion safe, with crisp SVG/PNG export baked in by construction."
          />
        </div>
      </section>

      {/* Categories */}
      <section className="border-y border-border bg-surface-alt/40">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight text-ink">Explore by category</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {CATEGORIES.map((c) => {
              const count = REGISTRY.filter((e) => e.meta.category === c.id).length;
              const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[c.icon] ?? Icons.Box;
              return (
                <Link
                  key={c.id}
                  href={`/browse?cat=${c.id}`}
                  className="group rounded-reviz border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-float"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="font-mono text-[11px] text-ink-faint">{count}</span>
                  </div>
                  <div className="text-[14px] font-semibold text-ink">{c.name}</div>
                  <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-ink-muted">{c.blurb}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured live */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Featured, live</h2>
          <Link href="/browse" className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
            See all {REGISTRY.length} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((e, i) => (
            <ComponentCard key={e!.meta.id} entry={e!} index={i} />
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 text-[12.5px] text-ink-muted sm:flex-row lg:px-10">
          <span>reviz — research visualization, perfected.</span>
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
            {REGISTRY.length} components · {CATEGORIES.length} categories
          </span>
        </div>
      </footer>
    </div>
  );
}

function HeroRotator({ entries }: { entries: ReturnType<typeof getEntry>[] }) {
  const [i, setI] = useState(0);
  const valid = entries.filter(Boolean);
  useEffect(() => {
    if (valid.length <= 1) return;
    const t = setInterval(() => setI((x) => (x + 1) % valid.length), 4800);
    return () => clearInterval(t);
  }, [valid.length]);

  if (valid.length === 0) {
    return <div className="grid h-72 place-items-center text-ink-faint">Loading figures…</div>;
  }
  const entry = valid[i % valid.length]!;
  const Comp = entry.Component;
  return (
    <div className="relative min-h-[320px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={entry.meta.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <Comp {...propsForPreset(entry.meta)} />
        </motion.div>
      </AnimatePresence>
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {valid.map((_, j) => (
          <button
            key={j}
            onClick={() => setI(j)}
            className={`h-1.5 rounded-full transition-all ${j === i % valid.length ? "w-6 bg-accent" : "w-1.5 bg-border-strong"}`}
            aria-label={`Figure ${j + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function Pillar({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5 }}
      className="rounded-reviz border border-border bg-surface p-5"
    >
      <span className="mb-3 inline-grid h-10 w-10 place-items-center rounded-lg bg-accent/10 text-accent">{icon}</span>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
    </motion.div>
  );
}
