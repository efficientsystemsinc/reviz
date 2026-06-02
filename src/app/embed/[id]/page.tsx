import { Suspense } from "react";
import { EmbedView } from "@/app/_components/EmbedView";

// Chrome-less single-component render (iframe embeds + visual QA). Dynamic so
// the client-graph registry resolves the entry.
export default function EmbedPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <EmbedView id={params.id} />
    </Suspense>
  );
}
