import { useTranslation } from "react-i18next";

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

interface IssueBudgetProgressProps {
  estimatedHours?: number;
  spentHours?: number;
}

export function IssueBudgetProgress({ estimatedHours, spentHours }: IssueBudgetProgressProps) {
  const { t } = useTranslation();
  const estimated = estimatedHours ?? 0;
  const spent = spentHours ?? 0;
  const remaining = estimated - spent;
  const isOver = estimated > 0 && remaining < 0;
  const estimatedPct = isOver
    ? (estimated / spent) * 100
    : estimated > 0
      ? Math.min((spent / estimated) * 100, 100)
      : 0;
  const overPct = isOver ? ((spent - estimated) / spent) * 100 : 0;

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
          {estimated === 0 ? t("ticketRow.spent") : isOver ? t("ticketRow.over") : t("ticketRow.left")}
        </span>
        <span
          className={`text-xs font-semibold tabular-nums ${estimated === 0 || isOver ? "text-destructive" : "text-foreground"}`}
        >
          {estimated === 0 ? formatHoursMinutes(spent) : formatHoursMinutes(Math.abs(remaining))}
        </span>
      </div>

      <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-highest flex">
        {estimated === 0 ? (
          <div
            className="h-full w-full rounded-full"
            style={{
              backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 2px, var(--destructive) 2px, var(--destructive) 4px)`,
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
                backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 2px, var(--destructive) 2px, var(--destructive) 4px)`,
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

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {estimated > 0 ? t("ticketRow.estimate", { value: formatHoursMinutes(estimated) }) : t("ticketRow.noEstimateShort")}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {t("ticketRow.totalAtEntry", { value: formatHoursMinutes(spent) })}
        </span>
      </div>
    </div>
  );
}
