import { Sidebar } from "@/app/_components/Sidebar";
import { TopBar } from "@/app/_components/TopBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopBar />
      <div className="flex flex-1">
        <div className="sticky top-14 hidden h-[calc(100vh-3.5rem)] lg:block">
          <Sidebar />
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
