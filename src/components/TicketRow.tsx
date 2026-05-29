import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Play, Pencil, ExternalLink, EllipsisVertical, Copy, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettingsStore } from "@/store";
import type { WorkSession } from "@/types";

const AUTO_CONTEXT_COMMENT_PREFIX_REGEX = /^#\d+\s-\s.+$/;

function stripAutoContextCommentPrefix(comment: string): string {
  const normalized = comment.replace(/\r\n/g, "\n");
  const [firstLine = "", ...restLines] = normalized.split("\n");

  if (!AUTO_CONTEXT_COMMENT_PREFIX_REGEX.test(firstLine.trim())) {
    return normalized;
  }

  return restLines.join("\n").replace(/^\n+/, "");
}

function TruncatedText({ children, className, tooltipClassName }: { children: string; className?: string; tooltipClassName?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (el) setIsTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  useEffect(() => {
    check();
    const observer = new ResizeObserver(check);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [check, children]);

  const span = (
    <span ref={ref} className={`truncate ${className ?? ""}`}>
      {children}
    </span>
  );

  if (!isTruncated) return span;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent className={tooltipClassName}>{children}</TooltipContent>
    </Tooltip>
  );
}

interface TicketRowProps {
  session: WorkSession;
  cumulativeSpent?: number;
  isActiveTimelineEntry?: boolean;
  onSelect: (session: WorkSession) => void;
  onEdit: (session: WorkSession) => void;
  onDuplicate: (session: WorkSession) => void;
  onDelete: (session: WorkSession) => void;
  isLast?: boolean;
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function TicketRow({ session, cumulativeSpent, isActiveTimelineEntry = false, onSelect, onEdit, onDuplicate, onDelete, isLast = false }: TicketRowProps) {
  const { t } = useTranslation();
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const { issue } = session;
  const loggedIssue = session.loggedIssue ?? issue;
  const isLoggedOnDifferentIssue = loggedIssue.id !== issue.id;
  const sessionComment = stripAutoContextCommentPrefix(session.comments).trim();
  const estimated = issue.estimated_hours ?? 0;
  const spent = cumulativeSpent ?? (issue.spent_hours ?? 0);
  const remaining = estimated - spent;
  const isOver = estimated > 0 && remaining < 0;
  const estimatedPct = isOver
    ? (estimated / spent) * 100
    : (estimated > 0 ? Math.min((spent / estimated) * 100, 100) : 0);
  const overPct = isOver ? ((spent - estimated) / spent) * 100 : 0;

  return (
    <div className={`flex gap-3 sm:gap-4 ${!isLast ? "mb-2" : ""}`}>
      {/* Timeline column */}
      <div className="relative w-14 shrink-0">
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-medium text-muted-foreground tabular-nums font-heading whitespace-nowrap z-10">
          {session.stoppedAt}
        </span>
        {/* Vertical line inside the card (between the two times) */}
        <div className="absolute left-1/2 -translate-x-1/2 top-5 bottom-5 w-px bg-surface-high" />
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-medium text-muted-foreground/60 tabular-nums font-heading whitespace-nowrap z-10">
          {session.startedAt}
        </span>
        {/* Connector line to next row */}
        {!isLast && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 w-px h-3 bg-surface-high translate-y-full" />
        )}
      </div>

      {/* Card */}
      <div className={`flex-1 rounded-xl border px-3 sm:px-5 py-3.5 transition-colors ${
        isActiveTimelineEntry
          ? "bg-tertiary/10 border-tertiary/40"
          : "bg-surface-low border-border hover:bg-surface-low/80"
      }`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-12 items-center gap-3 lg:gap-4">
          {/* Info: cols 1-5 */}
          <div className="col-span-2 lg:col-span-5 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                #{issue.id}
              </span>
              {isActiveTimelineEntry && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                  {t("ticketRow.inProgress")}
                </span>
              )}
              <TruncatedText className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-surface-highest px-2 py-0.5 rounded min-w-0">
                {issue.project.name}
              </TruncatedText>
            </div>
            <TruncatedText className="text-sm font-medium text-foreground block" tooltipClassName="max-w-xs">
              {issue.subject}
            </TruncatedText>
            {isLoggedOnDifferentIssue && (
              <TruncatedText className="text-[11px] text-muted-foreground block mt-1" tooltipClassName="max-w-sm">
                {t("ticketRow.imputedOn", { issueId: loggedIssue.id, project: loggedIssue.project.name })}
              </TruncatedText>
            )}
            {sessionComment && (
              <TruncatedText
                className="text-xs text-muted-foreground/90 block mt-1"
                tooltipClassName="max-w-sm whitespace-pre-wrap"
              >
                {sessionComment}
              </TruncatedText>
            )}
          </div>

          {/* Session duration: cols 6-7 */}
          <div className="col-span-2 lg:col-span-2 text-left lg:text-center">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mr-2 lg:hidden">
              {t("ticketRow.sessionSpent")}
            </span>
            <span className="text-sm font-semibold text-tertiary tabular-nums">
              {formatHoursMinutes(session.hours)}
            </span>
          </div>

          {/* Left/Over: cols 8-10 */}
          <div className="min-w-0 lg:col-span-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
                {estimated === 0 ? t("ticketRow.spent") : isOver ? t("ticketRow.over") : t("ticketRow.left")}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  estimated === 0 || isOver ? "text-destructive" : "text-foreground"
                }`}
              >
                {estimated === 0 ? formatHoursMinutes(spent) : formatHoursMinutes(Math.abs(remaining))}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-1 rounded-full bg-surface-highest overflow-hidden flex">
                {estimated === 0 ? (
                  <div
                    className="h-full w-full rounded-full"
                    style={{
                      backgroundImage: `repeating-linear-gradient(
                        -45deg,
                        transparent,
                        transparent 2px,
                        var(--destructive) 2px,
                        var(--destructive) 4px
                      )`,
                      backgroundColor: "rgba(255,180,171,0.25)",
                    }}
                  />
                ) : isOver ? (
                  <>
                    <div
                      className="h-full bg-destructive/50 transition-all duration-500"
                      style={{ width: `${estimatedPct}%` }}
                    />
                    <div
                      className="h-full rounded-r-full transition-all duration-500"
                      style={{
                        width: `${overPct}%`,
                        backgroundImage: `repeating-linear-gradient(
                          -45deg,
                          transparent,
                          transparent 2px,
                          var(--destructive) 2px,
                          var(--destructive) 4px
                        )`,
                        backgroundColor: "rgba(255,180,171,0.25)",
                      }}
                    />
                  </>
                ) : (
                  <div
                    className="h-full bg-tertiary rounded-full transition-all duration-500"
                    style={{ width: `${estimatedPct}%` }}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {estimated > 0 ? t("ticketRow.estimate", { value: formatHoursMinutes(estimated) }) : t("ticketRow.noEstimateShort")}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {t("ticketRow.totalAtEntry", { value: formatHoursMinutes(spent) })}
              </span>
            </div>
          </div>

          {/* Actions: cols 11-12 */}
          <div className="lg:col-span-2 flex items-center justify-end gap-1">
            {!isActiveTimelineEntry && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openUrl(`${redmineUrl.replace(/\/+$/, "")}/issues/${issue.id}`)}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("ticketRow.openInRedmine")}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 px-3 rounded-full bg-primary/10 text-primary hover:bg-primary/20"
                      onClick={() => onSelect(session)}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("ticketRow.startTimer")}</TooltipContent>
                </Tooltip>

                <Popover open={isActionsMenuOpen} onOpenChange={setIsActionsMenuOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-muted-foreground hover:text-foreground"
                        >
                          <EllipsisVertical className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t("ticketRow.moreActions")}</TooltipContent>
                  </Tooltip>
                  <PopoverContent side="bottom" align="end" className="w-44 p-1">
                    {session.redmineEntryId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          onEdit(session);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                        {t("ticketRow.editEntry")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        onDuplicate(session);
                      }}
                    >
                      <Copy className="w-4 h-4" />
                      {t("ticketRow.duplicateEntry")}
                    </Button>
                    {session.redmineEntryId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          onDelete(session);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        {t("ticketRow.deleteEntry")}
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
