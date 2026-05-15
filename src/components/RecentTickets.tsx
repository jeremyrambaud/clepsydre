import { useIssueStore } from "@/store";
import { TicketRow } from "./TicketRow";
import { Loader2, RotateCw, Clock, Hash, Timer, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkSession } from "@/types";

interface RecentTicketsProps {
  onSelectSession: (session: WorkSession) => void;
  onEditSession: (session: WorkSession) => void;
}

function formatDayLabel(dateStr: string): string {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

  if (dateStr === today) return "Aujourd'hui";
  if (dateStr === yesterday) return "Hier";

  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function RecentTickets({ onSelectSession, onEditSession }: RecentTicketsProps) {
  const recentSessions = useIssueStore((s) => s.recentSessions);
  const isLoadingSessions = useIssueStore((s) => s.isLoadingSessions);
  const isLoadingMore = useIssueStore((s) => s.isLoadingMore);
  const hasMore = useIssueStore((s) => s.hasMore);
  const loadMoreSessions = useIssueStore((s) => s.loadMoreSessions);

  const sorted = [...recentSessions].sort((a, b) => {
    const dayCompare = b.spentOn.localeCompare(a.spentOn);
    if (dayCompare !== 0) return dayCompare;
    return b.stoppedAt.localeCompare(a.stoppedAt);
  });

  if (isLoadingSessions && sorted.length === 0) {
    return (
      <section>
        <h4 className="text-[10px] font-medium tracking-[0.15em] text-muted-foreground uppercase mb-3 font-heading">
          Timeline
        </h4>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement depuis Redmine…
        </div>
      </section>
    );
  }

  if (sorted.length === 0) return null;

  // Compute cumulative spent hours per issue based on Redmine totals
  // base = issue.spent_hours - sum of all loaded sessions for that issue
  const chronological = [...sorted].reverse();
  const loadedTotalMap = new Map<number, number>();
  for (const s of chronological) {
    loadedTotalMap.set(s.issue.id, (loadedTotalMap.get(s.issue.id) ?? 0) + s.hours);
  }
  const cumulativeMap = new Map<number, number>();
  const sessionCumulative = new Map<string, number>();
  for (const s of chronological) {
    const issueId = s.issue.id;
    if (!cumulativeMap.has(issueId)) {
      const redmineTotal = s.issue.spent_hours ?? 0;
      const loadedTotal = loadedTotalMap.get(issueId) ?? 0;
      cumulativeMap.set(issueId, Math.max(0, redmineTotal - loadedTotal));
    }
    const cum = cumulativeMap.get(issueId)! + s.hours;
    cumulativeMap.set(issueId, cum);
    sessionCumulative.set(s.id, cum);
  }

  // Compute daily stats
  const dayStats = new Map<string, { totalHours: number; uniqueIssues: Set<number>; uniqueProjects: Set<number>; entries: number }>();
  for (const s of sorted) {
    const stat = dayStats.get(s.spentOn) ?? { totalHours: 0, uniqueIssues: new Set(), uniqueProjects: new Set(), entries: 0 };
    stat.totalHours += s.hours;
    stat.uniqueIssues.add(s.issue.id);
    stat.uniqueProjects.add(s.issue.project.id);
    stat.entries += 1;
    dayStats.set(s.spentOn, stat);
  }

  let lastDay = "";

  return (
    <section className="flex flex-col min-h-0 h-full">
      <h4 className="text-[10px] font-medium tracking-[0.15em] text-muted-foreground uppercase mb-3 font-heading shrink-0">
        Timeline
      </h4>
      <div className="relative flex-1 min-h-0 overflow-y-auto">
        {sorted.map((session, index) => {
          const showDaySeparator = session.spentOn !== lastDay;
          lastDay = session.spentOn;
          const nextSession = sorted[index + 1];
          const isLastOfDay = !nextSession || nextSession.spentOn !== session.spentOn;
          const isLast = index === sorted.length - 1;

          const stat = dayStats.get(session.spentOn);
          const formatH = (h: number) => {
            const hrs = Math.floor(h);
            const mins = Math.round((h - hrs) * 60);
            return `${hrs}h ${mins.toString().padStart(2, "0")}m`;
          };

          return (
            <div key={session.id}>
              {showDaySeparator && (
                <div className={`${index > 0 ? "mt-6" : ""} mb-2`}>
                  <div className="flex items-center gap-4 rounded-lg bg-surface-highest/50 px-4 py-2.5 text-[11px] text-muted-foreground">
                    <span className="text-xs font-bold tracking-wide text-foreground uppercase font-heading whitespace-nowrap mr-auto">
                      {formatDayLabel(session.spentOn)}
                    </span>
                    {stat && (
                      <>
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">
                          <Clock className="w-3.5 h-3.5 text-tertiary" />
                          {formatH(stat.totalHours)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <FolderOpen className="w-3.5 h-3.5" />
                          {stat.uniqueProjects.size} projet{stat.uniqueProjects.size > 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5" />
                          {stat.uniqueIssues.size} ticket{stat.uniqueIssues.size > 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Timer className="w-3.5 h-3.5" />
                          {stat.entries} entrée{stat.entries > 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
              <TicketRow
                session={session}
                cumulativeSpent={sessionCumulative.get(session.id) ?? session.hours}
                onSelect={onSelectSession}
                onEdit={onEditSession}
                isLast={isLastOfDay || isLast}
              />
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMoreSessions}
            disabled={isLoadingMore}
            className="gap-2"
          >
            {isLoadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
            {isLoadingMore ? "Chargement…" : "Charger plus"}
          </Button>
        </div>
      )}
    </section>
  );
}
