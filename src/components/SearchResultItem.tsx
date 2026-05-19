import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock3 } from "lucide-react";
import type { RedmineIssue } from "@/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const COMPACT_RESULT_WIDTH_PX = 620;

interface SearchResultItemProps {
  id: string;
  issue: RedmineIssue;
  isActive?: boolean;
  showProgress?: boolean;
  onSelect: (issue: RedmineIssue) => void;
  onManualEntry?: (issue: RedmineIssue) => void;
  onHover?: () => void;
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function TruncatedIssueSubject({ subject }: { subject: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  useEffect(() => {
    check();
    const observer = new ResizeObserver(check);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [check, subject]);

  const text = (
    <span ref={ref} className="text-sm text-foreground truncate flex-1 min-w-0">
      {subject}
    </span>
  );

  if (!isTruncated) return text;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{text}</TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">{subject}</TooltipContent>
    </Tooltip>
  );
}

export function SearchResultItem({ id, issue, isActive = false, showProgress = true, onSelect, onManualEntry, onHover }: SearchResultItemProps) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  const checkCompact = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setIsCompact(el.clientWidth < COMPACT_RESULT_WIDTH_PX);
  }, []);

  useEffect(() => {
    checkCompact();
    const observer = new ResizeObserver(checkCompact);
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, [checkCompact]);

  const estimated = issue.estimated_hours ?? 0;
  const spent = issue.spent_hours ?? 0;
  const isOver = estimated > 0 && spent > estimated;
  const estimatedPct = isOver
    ? (estimated / spent) * 100
    : (estimated > 0 ? Math.min((spent / estimated) * 100, 100) : 0);
  const overPct = isOver ? ((spent - estimated) / spent) * 100 : 0;

  return (
    <div
      ref={rowRef}
      id={id}
      role="option"
      aria-selected={isActive}
      className={`w-full flex gap-3 px-4 py-3 transition-colors text-left cursor-pointer ${isCompact ? "items-start" : "items-center"} ${isActive ? "bg-surface-high" : "hover:bg-surface-high"}`}
      onClick={() => onSelect(issue)}
      onMouseEnter={onHover}
    >
      <div className={`flex min-w-0 flex-1 ${isCompact ? "flex-col gap-1" : "flex-row items-center gap-3"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
            #{issue.id}
          </span>

          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide bg-surface-highest px-2 py-0.5 rounded truncate">
            {issue.project.name}
          </span>
        </div>

        <TruncatedIssueSubject subject={issue.subject} />
      </div>

      {showProgress && !isCompact && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 h-1.5 rounded-full bg-surface-highest overflow-hidden flex">
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
                className="h-full rounded-full bg-tertiary transition-all duration-500"
                style={{ width: `${estimatedPct}%` }}
              />
            )}
          </div>
          <span className={`text-xs tabular-nums whitespace-nowrap ${estimated === 0 || isOver ? "text-destructive" : "text-muted-foreground"}`}>
            {formatHoursMinutes(spent)} / {estimated > 0 ? formatHoursMinutes(estimated) : t("searchResult.noEstimateShort")}
          </span>
        </div>
      )}

      {onManualEntry && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-highest"
              onClick={(event) => {
                event.stopPropagation();
                onManualEntry(issue);
              }}
            >
              <Clock3 className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("searchResult.manualEntry")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
