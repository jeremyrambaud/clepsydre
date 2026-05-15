import type { RedmineIssue } from "@/types";

interface SearchResultItemProps {
  issue: RedmineIssue;
  onSelect: (issue: RedmineIssue) => void;
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function SearchResultItem({ issue, onSelect }: SearchResultItemProps) {
  const progress = issue.estimated_hours
    ? Math.min((issue.spent_hours ?? 0) / issue.estimated_hours, 1) * 100
    : 0;

  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-high transition-colors text-left"
      onClick={() => onSelect(issue)}
    >
      <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
        #{issue.id}
      </span>

      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide bg-surface-highest px-2 py-0.5 rounded">
        {issue.project.name}
      </span>

      <span className="text-sm text-foreground truncate flex-1">{issue.subject}</span>

      {issue.estimated_hours != null && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 h-1.5 rounded-full bg-surface-highest overflow-hidden">
            <div
              className="h-full rounded-full bg-tertiary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {formatHoursMinutes(issue.spent_hours ?? 0)} / {formatHoursMinutes(issue.estimated_hours)}
          </span>
        </div>
      )}
    </button>
  );
}
