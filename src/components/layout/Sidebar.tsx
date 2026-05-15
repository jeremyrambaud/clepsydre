import { Clock, LayoutDashboard, History, Settings, Pause, Square, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useTimer } from "@/hooks/useTimer";
import { useIssueStore, useSettingsStore } from "@/store";
import type { RedmineIssue } from "@/types";

type View = "timer" | "analytics" | "history" | "settings";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  timer: ReturnType<typeof useTimer>;
}

const navItems: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "timer", label: "Timer", icon: Clock },
  { id: "analytics", label: "Analytics", icon: LayoutDashboard },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function MiniTimerWidget({ timer, issue }: { timer: ReturnType<typeof useTimer>; issue: RedmineIssue | null }) {
  if (!timer.isRunning && !timer.isPaused) return null;

  const progress = issue?.estimated_hours
    ? Math.min(((issue.spent_hours ?? 0) / issue.estimated_hours) * 100, 100)
    : 0;

  return (
    <div className="mx-3 mb-4 rounded-xl bg-surface-container p-3 border border-border">
      {issue && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-primary">#{issue.id}</span>
            <span className="text-xs text-muted-foreground truncate">{issue.project.name}</span>
          </div>
          <p className="text-sm font-medium text-foreground truncate mb-2">{issue.subject}</p>
        </>
      )}

      <div className="text-center font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums mb-2">
        {timer.hours}:{timer.minutes}:{timer.seconds}
      </div>

      {issue?.estimated_hours && (
        <div className="mb-3">
          <div className="h-1 rounded-full bg-surface-highest overflow-hidden">
            <div
              className="h-full rounded-full bg-tertiary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{formatHoursMinutes(issue.spent_hours ?? 0)}</span>
            <span>{formatHoursMinutes(issue.estimated_hours)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={timer.isPaused ? timer.resume : timer.pause}
        >
          <Pause className="w-3 h-3 mr-1" />
          {timer.isPaused ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="flex-1 h-7 text-xs bg-error-bg hover:bg-error-bg/80 text-error-text"
          onClick={timer.stop}
        >
          <Square className="w-3 h-3 mr-1" />
          Stop
        </Button>
      </div>
    </div>
  );
}

function SyncStatusBar() {
  const { syncActivities, isSyncing, lastSyncedAt } = useSettingsStore();

  const syncLabel = lastSyncedAt
    ? `Synced ${Math.round((Date.now() - lastSyncedAt.getTime()) / 60000)}m ago`
    : "Not synced";

  return (
    <div className="px-5 py-4 border-t border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${lastSyncedAt ? "bg-tertiary" : "bg-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">{syncLabel}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-muted-foreground hover:text-foreground"
              onClick={syncActivities}
              disabled={isSyncing}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Sync with Redmine</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function Sidebar({ currentView, onNavigate, timer }: SidebarProps) {
  const selectedIssue = useIssueStore((s) => s.selectedIssue);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-surface-low border-r border-border flex flex-col z-50">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground font-heading leading-tight">
              CLEPSYDRE
            </h1>
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
              Time Tracking
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = currentView === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5
                ${isActive
                  ? "bg-surface-highest/60 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-container/50"
                }
              `}
            >
              <Icon className="w-[18px] h-[18px]" />
              {label}
            </button>
          );
        })}
      </nav>

      {currentView !== "timer" && (
        <MiniTimerWidget timer={timer} issue={selectedIssue} />
      )}

      <SyncStatusBar />
    </aside>
  );
}
