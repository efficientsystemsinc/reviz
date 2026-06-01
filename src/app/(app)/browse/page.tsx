import { Suspense } from "react";
import { BrowseGallery } from "@/app/_components/BrowseGallery";

export const metadata = { title: "Library" };

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="p-10 text-ink-faint">Loading library…</div>}>
      <BrowseGallery />
    </Suspense>
  );
}
