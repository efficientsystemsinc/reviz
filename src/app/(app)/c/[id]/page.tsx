import { ComponentDetail } from "@/app/_components/ComponentDetail";

// Rendered dynamically: the component registry lives in the client graph (its
// modules are "use client"), so we resolve the entry inside ComponentDetail
// rather than importing the registry into this server segment.
export default function ComponentPage({ params }: { params: { id: string } }) {
  return <ComponentDetail id={params.id} />;
}
