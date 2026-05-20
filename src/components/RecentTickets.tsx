import { useEffect, useMemo, useState } from "react";
import { useIssueStore } from "@/store";
import { useTranslation } from "react-i18next";
import { TicketRow } from "./TicketRow";
import { Loader2, RotateCw, Clock, Hash, Timer, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchUserDayStats, type UserDayStats } from "@/lib/redmine";
import type { WorkSession } from "@/types";

interface RecentTicketsProps {
  activeTimelineSession?: WorkSession | null;
  onSelectSession: (session: WorkSession) => void;
  onEditSession: (session: WorkSession) => void;
}

function formatDayLabel(dateStr: string, locale: string, t: (key: string) => string): string {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

  if (dateStr === today) return t("recent.today");
  if (dateStr === yesterday) return t("recent.yesterday");

  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function RecentTickets({ activeTimelineSession, onSelectSession, onEditSession }: RecentTicketsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr-FR" : "en-US";
  const [resolvedDayStats, setResolvedDayStats] = useState<Record<string, UserDayStats>>({});
  const recentSessions = useIssueStore((s) => s.recentSessions);
  const isLoadingSessions = useIssueStore((s) => s.isLoadingSessions);
  const isLoadingMore = useIssueStore((s) => s.isLoadingMore);
  const hasMore = useIssueStore((s) => s.hasMore);
  const loadMoreSessions = useIssueStore((s) => s.loadMoreSessions);

  const boundaryDay = useMemo(() => {
    if (!hasMore) return null;
    const redmineSessions = recentSessions.filter((s) => s.redmineEntryId);
    if (redmineSessions.length === 0) return null;
    return redmineSessions.reduce((oldest, session) => (session.spentOn < oldest ? session.spentOn : oldest), redmineSessions[0].spentOn);
  }, [hasMore, recentSessions]);

  useEffect(() => {
    if (!boundaryDay) return;
    let cancelled = false;

    void (async () => {
      try {
        const stats = await fetchUserDayStats(boundaryDay);
        if (cancelled) return;
        setResolvedDayStats((prev) => {
          const previous = prev[boundaryDay];
          if (
            previous
            && previous.totalHours === stats.totalHours
            && previous.entries === stats.entries
            && previous.uniqueIssueCount === stats.uniqueIssueCount
            && previous.uniqueProjectCount === stats.uniqueProjectCount
            && previous.issueIds.length === stats.issueIds.length
            && previous.projectIds.length === stats.projectIds.length
            && previous.issueIds.every((id, idx) => id === stats.issueIds[idx])
            && previous.projectIds.every((id, idx) => id === stats.projectIds[idx])
          ) {
            return prev;
          }

          return { ...prev, [boundaryDay]: stats };
        });
      } catch {
        // Keep locally computed stats as a fallback.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boundaryDay, isLoadingMore]);

  const timelineSessions = activeTimelineSession ? [...recentSessions, activeTimelineSession] : [...recentSessions];

  const sorted = timelineSessions.sort((a, b) => {
    const dayCompare = b.spentOn.localeCompare(a.spentOn);
    if (dayCompare !== 0) return dayCompare;
    return b.stoppedAt.localeCompare(a.stoppedAt);
  });

  if (isLoadingSessions && sorted.length === 0) {
    return (
      <section>
        <h4 className="text-[10px] font-medium tracking-[0.15em] text-muted-foreground uppercase mb-3 font-heading">
          {t("recent.timeline")}
        </h4>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("recent.loading")}
        </div>
      </section>
    );
  }

  if (sorted.length === 0) return null;

  // Compute cumulative spent hours per issue based on Redmine totals
  // base = issue.spent_hours - sum of all loaded sessions for that issue
  const chronological = [...recentSessions]
    .sort((a, b) => {
      const dayCompare = a.spentOn.localeCompare(b.spentOn);
      if (dayCompare !== 0) return dayCompare;
      return a.stoppedAt.localeCompare(b.stoppedAt);
    });
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
    if (s.id !== activeTimelineSession?.id) {
      stat.entries += 1;
    }
    dayStats.set(s.spentOn, stat);
  }

  let lastDay = "";

  return (
    <section className="flex flex-col lg:min-h-0 lg:h-full">
      <h4 className="text-[10px] font-medium tracking-[0.15em] text-muted-foreground uppercase mb-3 font-heading shrink-0">
        {t("recent.timeline")}
      </h4>
      <div className="relative lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
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

          const activeExtraForDay = activeTimelineSession?.spentOn === session.spentOn ? activeTimelineSession.hours : 0;
          const activeIssueExtra = activeTimelineSession?.spentOn === session.spentOn ? activeTimelineSession.issue.id : null;
          const activeProjectExtra = activeTimelineSession?.spentOn === session.spentOn ? activeTimelineSession.issue.project.id : null;
          const resolvedStat = resolvedDayStats[session.spentOn];

          const baseIssueCount = resolvedStat?.uniqueIssueCount ?? stat?.uniqueIssues.size ?? 0;
          const baseProjectCount = resolvedStat?.uniqueProjectCount ?? stat?.uniqueProjects.size ?? 0;
          const baseEntriesCount = resolvedStat?.entries ?? stat?.entries ?? 0;

          const hasIssueAlready =
            activeIssueExtra == null
              ? true
              : (resolvedStat
                ? resolvedStat.issueIds.includes(activeIssueExtra)
                : (stat?.uniqueIssues.has(activeIssueExtra) ?? false));
          const hasProjectAlready =
            activeProjectExtra == null
              ? true
              : (resolvedStat
                ? resolvedStat.projectIds.includes(activeProjectExtra)
                : (stat?.uniqueProjects.has(activeProjectExtra) ?? false));

          const displayedTotalHours =
            resolvedStat
              ? resolvedStat.totalHours + activeExtraForDay
              : (stat?.totalHours ?? 0);
          const displayedIssueCount = baseIssueCount + (hasIssueAlready ? 0 : 1);
          const displayedProjectCount = baseProjectCount + (hasProjectAlready ? 0 : 1);
          const displayedEntriesCount = baseEntriesCount;

          const isActiveTimelineEntry = session.id === activeTimelineSession?.id;
          const cumulativeSpent = isActiveTimelineEntry
            ? (session.issue.spent_hours ?? 0) + session.hours
            : (sessionCumulative.get(session.id) ?? session.hours);

          return (
            <div key={session.id}>
              {showDaySeparator && (
                <div className={`${index > 0 ? "mt-6" : ""} mb-2`}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface-highest/50 px-3 sm:px-4 py-2.5 text-[11px] text-muted-foreground">
                    <span className="text-xs font-bold tracking-wide text-foreground uppercase font-heading whitespace-nowrap mr-auto">
                      {formatDayLabel(session.spentOn, locale, t)}
                    </span>
                    {stat && (
                      <>
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">
                          <Clock className="w-3.5 h-3.5 text-tertiary" />
                          {formatH(displayedTotalHours)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <FolderOpen className="w-3.5 h-3.5" />
                          {t("recent.projectsCount", { count: displayedProjectCount })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5" />
                          {t("recent.ticketsCount", { count: displayedIssueCount })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Timer className="w-3.5 h-3.5" />
                          {t("recent.entriesCount", { count: displayedEntriesCount })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
              <TicketRow
                session={session}
                cumulativeSpent={cumulativeSpent}
                isActiveTimelineEntry={isActiveTimelineEntry}
                onSelect={onSelectSession}
                onEdit={onEditSession}
                isLast={isLastOfDay || isLast}
              />
            </div>
          );
        })}
      {hasMore && (
        <div className="flex justify-center mt-4 mb-4">
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
            {isLoadingMore ? t("recent.loadingMore") : t("recent.loadMore")}
          </Button>
        </div>
      )}
      </div>
    </section>
  );
}
