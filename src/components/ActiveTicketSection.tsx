import { useEffect, useState, useRef, useCallback } from "react";
import { Trash2, Pause, Play, Square, Clock, ExternalLink, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIssueStore, useSettingsStore } from "@/store";
import { useTimer } from "@/hooks/useTimer";
import { fetchIssueTodayLoggedHours } from "@/lib/redmine";

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function TruncatedIssueTitle({ title }: { title: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
  }, []);

  useEffect(() => {
    check();
    const observer = new ResizeObserver(check);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [check, title]);

  const heading = (
    <h3 ref={ref} className="text-xl font-semibold font-heading text-foreground leading-tight line-clamp-2 mb-1">
      {title}
    </h3>
  );

  if (!isTruncated) return heading;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{heading}</TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">{title}</TooltipContent>
    </Tooltip>
  );
}

interface ActiveTicketSectionProps {
  timer: ReturnType<typeof useTimer>;
  onStop?: () => void;
  onClearIssue?: () => void;
  onManualEntry?: () => void;
}

export function ActiveTicketSection({ timer, onStop, onClearIssue, onManualEntry }: ActiveTicketSectionProps) {
  const selectedIssue = useIssueStore((s) => s.selectedIssue);
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url);
  const [todayLoggedHours, setTodayLoggedHours] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleResetWithConfirm = useCallback(() => {
    timer.reset();
    setConfirmReset(false);
  }, [timer]);

  useEffect(() => {
    let mounted = true;

    if (!selectedIssue) {
      setTodayLoggedHours(0);
      return () => {
        mounted = false;
      };
    }

    fetchIssueTodayLoggedHours(selectedIssue.id)
      .then((hours) => {
        if (mounted) setTodayLoggedHours(hours);
      })
      .catch(() => {
        if (mounted) setTodayLoggedHours(0);
      });

    return () => {
      mounted = false;
    };
  }, [selectedIssue]);

  if (!selectedIssue) {
    return (
      <div className="rounded-xl bg-surface-container border border-border p-12 text-center">
        <p className="text-muted-foreground text-sm">
          Select a ticket to start tracking time
        </p>
      </div>
    );
  }

  const todayHours = timer.elapsedSeconds / 3600;
  const todayTotalHours = todayLoggedHours + todayHours;
  const totalSpent = (selectedIssue.spent_hours ?? 0) + todayHours;

  const estimated = selectedIssue.estimated_hours ?? 0;
  const isOver = estimated > 0 && totalSpent > estimated;
  const estimatedPct = isOver ? (estimated / totalSpent) * 100 : (estimated > 0 ? Math.min((totalSpent / estimated) * 100, 100) : 0);
  const overPct = isOver ? ((totalSpent - estimated) / totalSpent) * 100 : 0;

  return (
    <div className="rounded-xl bg-surface-container border-l-4 border-l-tertiary border border-border overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Ticket details (cols 1-4) */}
        <div className="lg:col-span-4 p-4 sm:p-6 border-b lg:border-b-0 lg:border-r border-border flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/15 text-primary">
                {selectedIssue.status.name}
              </span>
              <span className="text-xs text-muted-foreground">#{selectedIssue.id}</span>
              <div className="ml-auto flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 text-muted-foreground hover:text-foreground"
                      onClick={() => openUrl(`${redmineUrl.replace(/\/+$/, "")}/issues/${selectedIssue.id}`)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ouvrir dans Redmine</TooltipContent>
                </Tooltip>
                {onClearIssue && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 text-muted-foreground hover:text-foreground"
                        onClick={onClearIssue}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Fermer le ticket actif</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <TruncatedIssueTitle title={selectedIssue.subject} />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              {selectedIssue.project.name}
            </span>
          </div>

          {totalSpent > 0 && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-surface-highest overflow-hidden flex">
                {estimated === 0 ? (
                  <div
                    className="h-full w-full rounded-full transition-all duration-500"
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
              <div className="flex justify-between mt-1.5">
                <span className={`text-xs ${estimated === 0 || isOver ? "text-destructive" : "text-muted-foreground"}`}>
                  {formatHoursMinutes(totalSpent)} spent
                  {isOver && ` (+${formatHoursMinutes(totalSpent - estimated)})`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {estimated > 0 ? `${formatHoursMinutes(estimated)} est` : "No estimate"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Timer display (cols 5-9) */}
        <div className="lg:col-span-5 p-4 sm:p-6 flex flex-col items-center justify-center">
          {timer.startTime && (
            <div className="flex items-center gap-1.5 mb-3 flex-wrap justify-center">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase font-heading">
                Début
              </span>
              <Input
                type="time"
                value={`${timer.startTime.getHours().toString().padStart(2, "0")}:${timer.startTime.getMinutes().toString().padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (isNaN(h) || isNaN(m)) return;
                  const newStart = new Date(timer.startTime!);
                  newStart.setHours(h, m, 0, 0);
                  if (newStart.getTime() <= Date.now()) {
                    timer.setStartTime(newStart);
                  }
                }}
                className="h-7 w-20 sm:w-22 text-center text-sm font-heading tabular-nums bg-surface-highest border-border px-2"
              />
            </div>
          )}

          <div className="flex items-baseline tabular-nums select-none mb-6">
            <span className="text-5xl sm:text-6xl lg:text-7xl font-semibold font-heading text-foreground tracking-tight">
              {timer.hours}
            </span>
            <span className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-muted-foreground/40 mx-1">:</span>
            <span className="text-5xl sm:text-6xl lg:text-7xl font-semibold font-heading text-foreground tracking-tight">
              {timer.minutes}
            </span>
            <span className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-muted-foreground/40 mx-1">:</span>
            <span className="text-5xl sm:text-6xl lg:text-7xl font-semibold font-heading text-tertiary tracking-tight">
              {timer.seconds}
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <Popover open={confirmReset} onOpenChange={setConfirmReset}>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-surface-highest hover:bg-surface-highest/80"
                  disabled={!timer.isRunning && !timer.isPaused}
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-auto p-3">
                <p className="text-sm font-medium mb-3">Réinitialiser ce timer ?</p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleResetWithConfirm}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirmer
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                    Annuler
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              size="icon"
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${
                timer.isRunning && !timer.isPaused
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                  : "bg-tertiary hover:bg-tertiary/90 text-on-tertiary"
              }`}
              onClick={() => {
                if (!timer.isRunning) {
                  timer.start();
                } else if (timer.isPaused) {
                  timer.resume();
                } else {
                  timer.pause();
                }
              }}
            >
              {timer.isRunning && !timer.isPaused ? (
                <Pause className="w-6 h-6 sm:w-8 sm:h-8" />
              ) : (
                <Play className="w-6 h-6 sm:w-8 sm:h-8 ml-1" />
              )}
            </Button>

            <Button
              variant="secondary"
              size="icon"
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-error-bg/80 hover:bg-error-bg text-error-text"
              onClick={onStop ?? timer.stop}
              disabled={!timer.isRunning && !timer.isPaused}
            >
              <Square className="w-5 h-5" />
            </Button>
          </div>

          {onManualEntry && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={onManualEntry}
            >
              Saisie manuelle
            </Button>
          )}
        </div>

        {/* Totals panel (cols 10-12) */}
        <div className="lg:col-span-3 bg-surface-low p-4 sm:p-6 flex flex-row lg:flex-col justify-center gap-4 border-t lg:border-t-0 lg:border-l border-border">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase font-heading">
              Redmine Total
            </span>
            <p className="text-xl sm:text-2xl font-semibold font-heading text-foreground tabular-nums mt-1">
              {formatHoursMinutes(totalSpent)}
            </p>
          </div>

          <div className="w-px self-stretch bg-border lg:w-full lg:h-px" />

          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase font-heading">
              Today&apos;s Total
            </span>
            <p className="text-xl sm:text-2xl font-semibold font-heading text-tertiary tabular-nums mt-1">
              {formatHoursMinutes(todayTotalHours)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
