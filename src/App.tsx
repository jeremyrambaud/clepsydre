import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { TimerView } from "@/components/TimerView";
import { SettingsView } from "@/components/SettingsView";
import { useTimer } from "@/hooks/useTimer";
import { useSettingsStore } from "@/store";

type View = "timer" | "analytics" | "history" | "settings";

function App() {
  const [currentView, setCurrentView] = useState<View>("timer");
  const timer = useTimer();
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  return (
    <TooltipProvider>
      <AppLayout currentView={currentView} onNavigate={setCurrentView} timer={timer}>
        {currentView === "timer" && <TimerView timer={timer} />}
        {currentView === "settings" && <SettingsView />}
        {currentView === "analytics" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Analytics — Coming soon
          </div>
        )}
        {currentView === "history" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            History — Coming soon
          </div>
        )}
      </AppLayout>
      <Toaster position="bottom-right" theme="dark" />
    </TooltipProvider>
  );
}

export default App;
