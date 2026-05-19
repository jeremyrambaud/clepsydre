import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pencil, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettingsStore } from "@/store";
import type { WorkSession } from "@/types";

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
  onSelect: (session: WorkSession) => void;
  onEdit: (session: WorkSession) => void;
  isLast?: boolean;
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function TicketRow({ session, cumulativeSpent, onSelect, onEdit, isLast = false }: TicketRowProps) {
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url);
  const { issue } = session;
  const estimated = issue.estimated_hours ?? 0;
  const spent = cumulativeSpent ?? (issue.spent_hours ?? 0);
  const remaining = estimated - spent;
  const isOver = estimated > 0 && remaining < 0;
  const estimatedPct = isOver
    ? (estimated / spent) * 100
    : (estimated > 0 ? Math.min((spent / estimated) * 100, 100) : 0);
  const overPct = isOver ? ((spent - estimated) / spent) * 100 : 0;

  return (
    <div className={`flex gap-4 ${!isLast ? "mb-2" : ""}`}>
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
      <div className="flex-1 rounded-xl bg-surface-low border border-border px-5 py-3.5 hover:bg-surface-low/80 transition-colors">
        <div className="grid grid-cols-12 items-center gap-4">
          {/* Info: cols 1-5 */}
          <div className="col-span-5 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                #{issue.id}
              </span>
              <TruncatedText className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-surface-highest px-2 py-0.5 rounded min-w-0">
                {issue.project.name}
              </TruncatedText>
            </div>
            <TruncatedText className="text-sm font-medium text-foreground block" tooltipClassName="max-w-xs">
              {issue.subject}
            </TruncatedText>
          </div>

          {/* Session duration: cols 6-7 */}
          <div className="col-span-2 text-center">
            <span className="text-sm font-semibold text-tertiary tabular-nums">
              {formatHoursMinutes(session.hours)}
            </span>
          </div>

          {/* Left/Over: cols 8-10 */}
          <div className="col-span-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
                {estimated === 0 ? "Spent:" : isOver ? "Over:" : "Left:"}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  estimated === 0 || isOver ? "text-destructive" : "text-foreground"
                }`}
              >
                {estimated === 0 ? formatHoursMinutes(spent) : formatHoursMinutes(Math.abs(remaining))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {estimated > 0 ? `Est: ${formatHoursMinutes(estimated)}` : "No est."}
              </span>
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
          </div>

          {/* Actions: cols 11-12 */}
          <div className="col-span-2 flex items-center justify-end gap-1">
            {session.redmineEntryId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(session)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit entry</TooltipContent>
              </Tooltip>
            )}

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
              <TooltipContent>Open in Redmine</TooltipContent>
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
              <TooltipContent>Start timer</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
