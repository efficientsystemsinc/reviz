"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { RegistryEntry } from "@/reviz/types";
import { propsForPreset } from "@/reviz/types";
import { useInView } from "@/reviz/primitives/hooks";
import { PreviewErrorBoundary } from "./ErrorBoundary";

export function ComponentCard({ entry, index = 0 }: { entry: RegistryEntry; index?: number }) {
  const { meta, Component } = entry;
  const [ref, inView] = useInView<HTMLAnchorElement>({ once: true, amount: 0.05 });
  const props = propsForPreset(meta);

  return (
    <motion.a
      ref={ref}
      href={`/c/${meta.id}`}
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: Math.min(index * 0.03, 0.4), ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col overflow-hidden rounded-reviz border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-float-lg"
    >
      <div className="relative h-48 overflow-hidden border-b border-border bg-canvas p-4">
        <div className="pointer-events-none absolute inset-0 reviz-dotgrid opacity-40" />
        <div className="mask-fade-b pointer-events-none relative flex h-full items-center justify-center [&_*]:!cursor-default">
          {inView && (
            <div className="w-full">
              <PreviewErrorBoundary resetKey={meta.id}>
                <Component {...props} />
              </PreviewErrorBoundary>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 p-3.5">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-ink">{meta.name}</div>
          <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-muted">{meta.description}</div>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-ink-faint transition-all group-hover:border-accent group-hover:bg-accent group-hover:text-accent-contrast">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </motion.a>
  );
}
