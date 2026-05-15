import { Sidebar } from "./Sidebar";
import type { useTimer } from "@/hooks/useTimer";

type View = "timer" | "analytics" | "history" | "settings";

interface AppLayoutProps {
  currentView: View;
  onNavigate: (view: View) => void;
  timer: ReturnType<typeof useTimer>;
  children: React.ReactNode;
}

const viewTitles: Record<View, string> = {
  timer: "",
  analytics: "Analytics",
  history: "History",
  settings: "Settings",
};

export function AppLayout({ currentView, onNavigate, timer, children }: AppLayoutProps) {
  const title = viewTitles[currentView];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={onNavigate} timer={timer} />

      <div className="ml-[260px] flex flex-col flex-1 overflow-hidden">
        {title && (
          <header className="h-16 flex items-center px-8 border-b border-border backdrop-blur-sm bg-background/80 shrink-0">
            <h2 className="text-xl font-semibold font-heading text-foreground">
              {title}
            </h2>
          </header>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
