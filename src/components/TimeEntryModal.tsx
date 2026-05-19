import { useState, useEffect, useRef, useCallback, useId } from "react";
import { Clock, Loader2, Trash2, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettingsStore } from "@/store";
import { logTimeEntry, updateTimeEntry, deleteTimeEntry, fetchActivities, searchIssues } from "@/lib/redmine";
import { SearchResultItem } from "./SearchResultItem";
import { toast } from "sonner";
import type { RedmineIssue, RedmineActivity, WorkSession } from "@/types";

const DEBOUNCE_MS = 350;

interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  issue: RedmineIssue;
}

interface CreateModalProps extends BaseModalProps {
  mode: "create";
  elapsedSeconds: number;
  startedAt: string;
  stoppedAt: string;
  onSaved: (issue: RedmineIssue, entryId: number, hours: number, activityId: number, comments: string, spentOn: string, startedAt: string, stoppedAt: string) => void;
}

interface EditModalProps extends BaseModalProps {
  mode: "edit";
  session: WorkSession;
  onSaved: (updates: Pick<WorkSession, "issue" | "hours" | "activityId" | "comments" | "spentOn" | "startedAt" | "stoppedAt">) => void;
  onDeleted?: (sessionId: string) => void;
}

type TimeEntryModalProps = CreateModalProps | EditModalProps;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function durationFromRange(start: string, end: string): string {
  let diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff < 0) diff += 24 * 60;
  return minutesToTime(diff);
}

function endFromStartAndDuration(start: string, duration: string): string {
  const total = timeToMinutes(start) + timeToMinutes(duration);
  return minutesToTime(total);
}

function hoursToTimeValue(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function secondsToTimeValue(s: number): string {
  return hoursToTimeValue(s / 3600);
}

function timeValueToHours(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatHHMM(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function TruncatedTicketSubject({ subject }: { subject: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
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
  }, [check, subject]);

  const paragraph = (
    <p ref={ref} className="text-sm font-medium text-foreground line-clamp-2 break-words">
      {subject}
    </p>
  );

  if (!isTruncated) return paragraph;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{paragraph}</TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">{subject}</TooltipContent>
    </Tooltip>
  );
}

export function TimeEntryModal(props: TimeEntryModalProps) {
  const { open, onClose, issue } = props;
  const { settings, activities, setActivities } = useSettingsStore();

  const isEdit = props.mode === "edit";

  const defaults = isEdit
    ? {
        duration: hoursToTimeValue(props.session.hours),
        date: props.session.spentOn,
        activity: props.session.activityId.toString(),
        comments: props.session.comments,
        start: props.session.startedAt,
        stop: props.session.stoppedAt,
      }
    : {
        duration: secondsToTimeValue(props.elapsedSeconds),
        date: formatDate(new Date()),
        activity: settings.default_activity_id?.toString() ?? "",
        comments: settings.default_comment,
        start: props.startedAt ?? formatHHMM(new Date()),
        stop: props.stoppedAt ?? formatHHMM(new Date()),
      };

  const [duration, setDuration] = useState(defaults.duration);
  const [spentOn, setSpentOn] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.start);
  const [stopTime, setStopTime] = useState(defaults.stop);
  const [activityId, setActivityId] = useState<string>(defaults.activity);
  const [comments, setComments] = useState(defaults.comments);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSearchingIssues, setIsSearchingIssues] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [lastEdited, setLastEdited] = useState<"duration" | "range">("duration");
  const [selectedIssue, setSelectedIssue] = useState(issue);
  const [isTicketSearchMode, setIsTicketSearchMode] = useState(false);
  const [ticketSearchQuery, setTicketSearchQuery] = useState("");
  const [ticketSearchResults, setTicketSearchResults] = useState<RedmineIssue[]>([]);
  const [ticketSearchError, setTicketSearchError] = useState<string | null>(null);
  const [activeTicketIndex, setActiveTicketIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticketSearchWrapperRef = useRef<HTMLDivElement>(null);
  const ticketSearchListboxId = useId();

  const getTicketOptionId = useCallback((issueId: number, index: number) => {
    return `ticket-search-result-${issueId}-${index}`;
  }, []);

  const searchRedmineTickets = useCallback(async (query: string) => {
    if (!query.trim()) {
      setTicketSearchResults([]);
      setTicketSearchError(null);
      return;
    }

    setIsSearchingIssues(true);
    setTicketSearchError(null);

    try {
      const issues = await searchIssues(query);
      setTicketSearchResults(issues);
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setTicketSearchError(msg);
      setTicketSearchResults([]);
    } finally {
      setIsSearchingIssues(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedIssue(issue);
      setIsTicketSearchMode(false);
      setTicketSearchQuery("");
      setTicketSearchResults([]);
      setTicketSearchError(null);
      setActiveTicketIndex(-1);
      setDuration(defaults.duration);
      setSpentOn(defaults.date);
      setStartTime(defaults.start);
      setStopTime(defaults.stop);
      setActivityId(defaults.activity);
      setComments(defaults.comments);
      setLastEdited("duration");
      setConfirmDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && activities.length === 0) {
      setIsLoadingActivities(true);
      fetchActivities()
        .then((acts) => setActivities(acts))
        .catch(() => {})
        .finally(() => setIsLoadingActivities(false));
    }
  }, [open, activities.length, setActivities]);

  useEffect(() => {
    if (!isTicketSearchMode) return;

    function handleClickOutside(e: MouseEvent) {
      if (ticketSearchWrapperRef.current && !ticketSearchWrapperRef.current.contains(e.target as Node)) {
        setIsTicketSearchMode(false);
        setTicketSearchQuery("");
        setTicketSearchResults([]);
        setTicketSearchError(null);
        setActiveTicketIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isTicketSearchMode]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (ticketSearchResults.length === 0) {
      setActiveTicketIndex(-1);
      return;
    }

    setActiveTicketIndex((current) => {
      if (current < 0) return 0;
      return Math.min(current, ticketSearchResults.length - 1);
    });
  }, [ticketSearchResults]);

  useEffect(() => {
    if (!isTicketSearchMode || activeTicketIndex < 0 || activeTicketIndex >= ticketSearchResults.length) return;
    const optionId = getTicketOptionId(ticketSearchResults[activeTicketIndex].id, activeTicketIndex);
    const option = document.getElementById(optionId);
    option?.scrollIntoView({ block: "nearest" });
  }, [activeTicketIndex, getTicketOptionId, isTicketSearchMode, ticketSearchResults]);

  function handleTicketSearchChange(value: string) {
    setTicketSearchQuery(value);
    setActiveTicketIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void searchRedmineTickets(value);
    }, DEBOUNCE_MS);
  }

  function handleTicketSelect(issue: RedmineIssue) {
    setSelectedIssue(issue);
    setIsTicketSearchMode(false);
    setTicketSearchQuery("");
    setTicketSearchResults([]);
    setTicketSearchError(null);
    setActiveTicketIndex(-1);
  }

  function handleTicketSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (ticketSearchResults.length === 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsTicketSearchMode(false);
        setTicketSearchQuery("");
        setTicketSearchError(null);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveTicketIndex((current) => (current + 1) % ticketSearchResults.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveTicketIndex((current) => (current <= 0 ? ticketSearchResults.length - 1 : current - 1));
      return;
    }

    if (e.key === "Enter") {
      if (activeTicketIndex >= 0 && activeTicketIndex < ticketSearchResults.length) {
        e.preventDefault();
        handleTicketSelect(ticketSearchResults[activeTicketIndex]);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsTicketSearchMode(false);
      setTicketSearchQuery("");
      setTicketSearchResults([]);
      setTicketSearchError(null);
      setActiveTicketIndex(-1);
    }
  }

  function handleDurationChange(value: string) {
    setDuration(value);
    setLastEdited("duration");
    if (value && startTime) {
      setStopTime(endFromStartAndDuration(startTime, value));
    }
  }

  function handleStartChange(value: string) {
    setStartTime(value);
    setLastEdited("range");
    if (value && stopTime) {
      setDuration(durationFromRange(value, stopTime));
    }
  }

  function handleStopChange(value: string) {
    setStopTime(value);
    setLastEdited("range");
    if (startTime && value) {
      setDuration(durationFromRange(startTime, value));
    }
  }

  async function handleSubmit() {
    if (isTicketSearchMode) {
      toast.error("Please select a ticket from the list or cancel the search");
      return;
    }

    if (!activityId) {
      toast.error("Please select an activity");
      return;
    }
    const hours = timeValueToHours(duration);
    if (hours <= 0) {
      toast.error("Time must be greater than 00:00");
      return;
    }

    setIsSaving(true);
    try {
      if (isEdit) {
        await updateTimeEntry(props.session.redmineEntryId!, {
          issueId: selectedIssue.id,
          hours,
          activityId: Number(activityId),
          comments,
          spentOn,
        });
        toast.success("Time entry updated", {
          description: `${duration} on #${selectedIssue.id}`,
        });
        props.onSaved({
          issue: selectedIssue,
          hours,
          activityId: Number(activityId),
          comments,
          spentOn,
          startedAt: startTime,
          stoppedAt: stopTime,
        });
      } else {
        const entryId = await logTimeEntry({
          issueId: selectedIssue.id,
          hours,
          activityId: Number(activityId),
          comments,
          spentOn,
        });
        toast.success("Time logged successfully", {
          description: `${duration} on #${selectedIssue.id}`,
        });
        props.onSaved(selectedIssue, entryId, hours, Number(activityId), comments, spentOn, startTime, stopTime);
      }
    } catch (err) {
      toast.error(isEdit ? "Failed to update time entry" : "Failed to log time", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="bg-card border-border sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Clock className="w-5 h-5 text-primary" />
            {isEdit ? "Edit Time Entry" : "Log Time Entry"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Ticket */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
              Ticket <span className="text-destructive">*</span>
            </Label>
            {!isTicketSearchMode ? (
              <button
                type="button"
                onClick={() => setIsTicketSearchMode(true)}
                className="w-full rounded-lg bg-muted border border-border p-3 text-left hover:bg-surface-high transition-colors"
              >
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <span className="text-xs font-semibold text-primary shrink-0">#{selectedIssue.id}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide truncate min-w-0">
                    {selectedIssue.project.name}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">Cliquer pour changer</span>
                </div>
                <TruncatedTicketSubject subject={selectedIssue.subject} />
              </button>
            ) : (
              <div ref={ticketSearchWrapperRef} className="relative">
                <div className="relative">
                  {isSearchingIssues ? (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                  <Input
                    type="text"
                    autoFocus
                    value={ticketSearchQuery}
                    onChange={(e) => handleTicketSearchChange(e.target.value)}
                    onKeyDown={handleTicketSearchKeyDown}
                    placeholder="Search ticket by ID, project, or title..."
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={ticketSearchResults.length > 0 || isSearchingIssues || Boolean(ticketSearchError)}
                    aria-controls={ticketSearchListboxId}
                    aria-activedescendant={
                      activeTicketIndex >= 0 && activeTicketIndex < ticketSearchResults.length
                        ? getTicketOptionId(ticketSearchResults[activeTicketIndex].id, activeTicketIndex)
                        : undefined
                    }
                    className="bg-muted border-border pl-9"
                  />
                </div>

                {(ticketSearchResults.length > 0 || isSearchingIssues || Boolean(ticketSearchError) || ticketSearchQuery.trim().length > 0) && (
                  <div
                    id={ticketSearchListboxId}
                    role="listbox"
                    className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-surface-container border border-border shadow-xl overflow-hidden z-50 max-h-72 overflow-y-auto"
                  >
                    {isSearchingIssues && ticketSearchResults.length === 0 && (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Searching Redmine...
                      </div>
                    )}

                    {ticketSearchError && (
                      <div className="flex items-center gap-2 px-4 py-4 text-sm text-destructive">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{ticketSearchError}</span>
                      </div>
                    )}

                    {!isSearchingIssues && !ticketSearchError && ticketSearchResults.length === 0 && ticketSearchQuery.trim().length > 0 && (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        No tickets found for "{ticketSearchQuery}"
                      </div>
                    )}

                    {ticketSearchResults.map((resultIssue, index) => (
                      <SearchResultItem
                        key={resultIssue.id}
                        id={getTicketOptionId(resultIssue.id, index)}
                        issue={resultIssue}
                        showProgress={false}
                        isActive={index === activeTicketIndex}
                        onSelect={handleTicketSelect}
                        onHover={() => setActiveTicketIndex(index)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
              Date <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
              className="bg-muted border-border"
            />
          </div>

          {/* Start / End / Duration row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
                Start <span className="text-destructive">*</span>
              </Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => handleStartChange(e.target.value)}
                className={`bg-muted border-border tabular-nums ${lastEdited === "range" ? "ring-1 ring-primary/30" : ""}`}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
                End <span className="text-destructive">*</span>
              </Label>
              <Input
                type="time"
                value={stopTime}
                onChange={(e) => handleStopChange(e.target.value)}
                className={`bg-muted border-border tabular-nums ${lastEdited === "range" ? "ring-1 ring-primary/30" : ""}`}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
                Duration <span className="text-destructive">*</span>
              </Label>
              <Input
                type="time"
                value={duration}
                onChange={(e) => handleDurationChange(e.target.value)}
                className={`bg-muted border-border tabular-nums text-tertiary font-semibold ${lastEdited === "duration" ? "ring-1 ring-primary/30" : ""}`}
              />
            </div>
          </div>

          {/* Activity */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
              Activity <span className="text-destructive">*</span>
            </Label>
            {isLoadingActivities ? (
              <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading activities...
              </div>
            ) : (
              <Select value={activityId} onValueChange={setActivityId}>
                <SelectTrigger className={`bg-muted border-border ${!activityId ? "text-muted-foreground/70" : "text-foreground"}`}>
                  <SelectValue placeholder="Select an activity" />
                </SelectTrigger>
                <SelectContent>
                  {activities.map((a: RedmineActivity) => (
                    <SelectItem key={a.id} value={a.id.toString()}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
              Comment
            </Label>
            <textarea
              rows={3}
              placeholder="Describe what you worked on..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full rounded-md bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none outline-none"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center sm:justify-between gap-2">
          {isEdit ? (
            <Popover open={confirmDelete} onOpenChange={setConfirmDelete}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto h-9 w-9"
                      disabled={isSaving}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Supprimer cette entrée</TooltipContent>
              </Tooltip>
              <PopoverContent side="top" align="start" className="w-auto p-3">
                <p className="text-sm font-medium mb-3">Supprimer cette entrée ?</p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    className="gap-1.5"
                    onClick={async () => {
                      setIsDeleting(true);
                      try {
                        await deleteTimeEntry(props.session.redmineEntryId!);
                        toast.success("Time entry deleted");
                        props.onDeleted?.(props.session.id);
                        onClose();
                      } catch (err) {
                        toast.error("Failed to delete", {
                          description: err instanceof Error ? err.message : String(err),
                        });
                      } finally {
                        setIsDeleting(false);
                        setConfirmDelete(false);
                      }
                    }}
                  >
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Confirmer
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={isDeleting}>
                    Annuler
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving || isDeleting}>
              { isEdit ? "Cancel" : "Discard time"}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving || isDeleting || !activityId || isTicketSearchMode}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving ? "Saving..." : isEdit ? "Update" : "Log Time"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
