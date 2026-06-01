import { Editor } from "@/app/_components/Editor";

// Dynamic: the registry is resolved client-side inside Editor.
export default function EditorWithId({ params }: { params: { id: string } }) {
  return <Editor initialId={params.id} />;
}
