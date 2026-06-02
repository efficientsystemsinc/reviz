import Link from "next/link";
import { Logo } from "./_components/TopBar";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6">
      <div className="reviz-dotgrid absolute inset-0 -z-10 opacity-40" />
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="font-mono text-[12px] uppercase tracking-label text-accent">404</div>
        <h1 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-ink">
          This figure isn&apos;t in the library.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-ink-muted">
          The component you&apos;re looking for doesn&apos;t exist (yet). Browse the full library to
          find what you need.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/browse"
            className="rounded-xl bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-contrast shadow-float transition-transform hover:-translate-y-0.5"
          >
            Browse the library
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-border bg-surface px-5 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:border-border-strong"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
