import { Sidebar } from "@/app/_components/Sidebar";
import { TopBar } from "@/app/_components/TopBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Fixed app shell: the page itself never scrolls. The left sidebar and the
  // main pane each manage their own internal scrolling.
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <div className="hidden h-full shrink-0 lg:block">
          <Sidebar />
        </div>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
