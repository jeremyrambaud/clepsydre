import { useCallback, useEffect, useRef, useState } from "react";
import type { RedmineIssue } from "@/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SearchResultItemProps {
  id: string;
  issue: RedmineIssue;
  isActive?: boolean;
  onSelect: (issue: RedmineIssue) => void;
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

export function SearchResultItem({ id, issue, isActive = false, onSelect, onHover }: SearchResultItemProps) {
  const estimated = issue.estimated_hours ?? 0;
  const spent = issue.spent_hours ?? 0;
  const isOver = estimated > 0 && spent > estimated;
  const estimatedPct = isOver
    ? (estimated / spent) * 100
    : (estimated > 0 ? Math.min((spent / estimated) * 100, 100) : 0);
  const overPct = isOver ? ((spent - estimated) / spent) * 100 : 0;

  return (
    <button
      id={id}
      role="option"
      aria-selected={isActive}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${isActive ? "bg-surface-high" : "hover:bg-surface-high"}`}
      onClick={() => onSelect(issue)}
      onMouseEnter={onHover}
    >
      <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
        #{issue.id}
      </span>

      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide bg-surface-highest px-2 py-0.5 rounded">
        {issue.project.name}
      </span>

      <TruncatedIssueSubject subject={issue.subject} />

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
            {formatHoursMinutes(spent)} / {estimated > 0 ? formatHoursMinutes(estimated) : "No est."}
          </span>
        </div>
    </button>
  );
}
