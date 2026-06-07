import { useState, useEffect, useRef, useCallback, useId } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Loader2, Trash2, Search, AlertCircle, Pencil, CircleHelp, RotateCcw } from "lucide-react";
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
import {
  logTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  fetchActivities,
  searchIssues,
  persistEntryTimesForCurrentDomain,
} from "@/lib/redmine";
import { SearchResultItem } from "./SearchResultItem";
import { toast } from "sonner";
import type { RedmineIssue, RedmineActivity, WorkSession, IssueSearchResult } from "@/types";

const DEBOUNCE_MS = 350;

interface BaseModalProps {
  open: boolean;
  onClose: () => void;
}

interface CreateModalProps extends BaseModalProps {
  mode: "create";
  intent?: "create" | "duplicate";
  issue?: RedmineIssue | null;
  loggingIssue?: RedmineIssue | null;
  initialSpentOn?: string;
  initialActivityId?: number;
  elapsedSeconds: number;
  startedAt: string;
  stoppedAt: string;
  initialComment?: string;
  onDraftCommentChange?: (comment: string) => void;
  onSaved: (issue: RedmineIssue, loggedIssue: RedmineIssue, entryId: number, hours: number, activityId: number, comments: string, spentOn: string, startedAt: string, stoppedAt: string) => void;
}

interface EditModalProps extends BaseModalProps {
  mode: "edit";
  issue: RedmineIssue;
  session: WorkSession;
  onSaved: (updates: Pick<WorkSession, "issue" | "loggedIssue" | "hours" | "activityId" | "comments" | "spentOn" | "startedAt" | "stoppedAt">) => void;
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
  const totalMinutes = Math.round(h * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
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

const AUTO_CONTEXT_COMMENT_PREFIX_REGEX = /^#\d+\s-\s.+$/;

function stripAutoContextCommentPrefix(comment: string): string {
  const normalized = comment.replace(/\r\n/g, "\n");
  const [firstLine = "", ...restLines] = normalized.split("\n");

  if (!AUTO_CONTEXT_COMMENT_PREFIX_REGEX.test(firstLine.trim())) {
    return normalized;
  }

  return restLines.join("\n").replace(/^\n+/, "");
}

function buildCommentWithContextPrefix(
  comment: string,
  contextIssue: RedmineIssue | null,
  loggingIssue: RedmineIssue | null,
): string {
  const baseComment = stripAutoContextCommentPrefix(comment).trim();

  if (!contextIssue || !loggingIssue || loggingIssue.id === contextIssue.id) {
    return baseComment;
  }

  const contextPrefix = `#${contextIssue.id} - ${contextIssue.subject}`;
  return baseComment ? `${contextPrefix}\n${baseComment}` : contextPrefix;
}

function TruncatedTicketSubject({
  subject,
  className = "text-sm font-medium text-foreground line-clamp-2 wrap-break-word",
  tooltipClassName = "max-w-sm wrap-break-word",
}: {
  subject: string;
  className?: string;
  tooltipClassName?: string;
}) {
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
    <p ref={ref} className={className}>
      {subject}
    </p>
  );

  if (!isTruncated) return paragraph;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{paragraph}</TooltipTrigger>
      <TooltipContent className={tooltipClassName}>{subject}</TooltipContent>
    </Tooltip>
  );
}

export function TimeEntryModal(props: TimeEntryModalProps) {
  const { t } = useTranslation();
  const { open, onClose } = props;
  const { settings, activities, setActivities } = useSettingsStore();
  const allowDifferentLoggedTicket = settings.allow_different_logged_ticket;

  const isEdit = props.mode === "edit";
  const isDuplicateIntent = !isEdit && props.intent === "duplicate";
  const initialIssue = props.mode === "edit" ? props.issue : props.issue ?? null;
  const initialLoggedIssue = allowDifferentLoggedTicket
    ? (
      props.mode === "edit"
        ? (props.session.loggedIssue ?? props.issue)
        : (props.loggingIssue ?? props.issue ?? null)
    )
    : initialIssue;

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
        date: props.initialSpentOn ?? formatDate(new Date()),
        activity: props.initialActivityId?.toString() ?? settings.default_activity_id?.toString() ?? "",
        comments: props.initialComment ?? settings.default_comment,
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
  const [selectedIssue, setSelectedIssue] = useState<RedmineIssue | null>(initialIssue);
  const [isTicketSearchMode, setIsTicketSearchMode] = useState(false);
  const [ticketSearchQuery, setTicketSearchQuery] = useState("");
  const [ticketSearchResults, setTicketSearchResults] = useState<IssueSearchResult[]>([]);
  const [ticketSearchError, setTicketSearchError] = useState<string | null>(null);
  const [activeTicketIndex, setActiveTicketIndex] = useState(-1);
  const [loggedIssue, setLoggedIssue] = useState<RedmineIssue | null>(initialLoggedIssue);
  const [isLoggedTicketSearchMode, setIsLoggedTicketSearchMode] = useState(false);
  const [loggedTicketSearchQuery, setLoggedTicketSearchQuery] = useState("");
  const [loggedTicketSearchResults, setLoggedTicketSearchResults] = useState<IssueSearchResult[]>([]);
  const [loggedTicketSearchError, setLoggedTicketSearchError] = useState<string | null>(null);
  const [activeLoggedTicketIndex, setActiveLoggedTicketIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticketSearchWrapperRef = useRef<HTMLDivElement>(null);
  const loggedTicketSearchWrapperRef = useRef<HTMLDivElement>(null);
  const ticketSearchListboxId = useId();
  const loggedTicketSearchListboxId = useId();

  const getTicketOptionId = useCallback((issueId: number, index: number) => {
    return `ticket-search-result-${issueId}-${index}`;
  }, []);

  const getLoggedTicketOptionId = useCallback((issueId: number, index: number) => {
    return `logged-ticket-search-result-${issueId}-${index}`;
  }, []);

  const searchRedmineTickets = useCallback(async (query: string): Promise<IssueSearchResult[]> => {
    if (!query.trim()) {
      return [];
    }

    return searchIssues(query);
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedIssue(initialIssue);
      setLoggedIssue(initialLoggedIssue);
      setIsTicketSearchMode(!isEdit && !initialIssue);
      setIsLoggedTicketSearchMode(false);
      setTicketSearchQuery("");
      setTicketSearchResults([]);
      setTicketSearchError(null);
      setActiveTicketIndex(-1);
      setLoggedTicketSearchQuery("");
      setLoggedTicketSearchResults([]);
      setLoggedTicketSearchError(null);
      setActiveLoggedTicketIndex(-1);
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
  }, [defaults.activity, defaults.comments, defaults.date, defaults.duration, defaults.start, defaults.stop, initialIssue, initialLoggedIssue, isEdit, open]);

  useEffect(() => {
    if (allowDifferentLoggedTicket) return;

    setIsLoggedTicketSearchMode(false);
    setLoggedIssue((current) => {
      const nextLoggedIssue = selectedIssue ?? null;
      if ((current?.id ?? null) === (nextLoggedIssue?.id ?? null)) {
        return current;
      }
      return nextLoggedIssue;
    });
  }, [allowDifferentLoggedTicket, selectedIssue]);

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
    if (!open) return;

    setComments((currentComment) => {
      const nextComment = buildCommentWithContextPrefix(currentComment, selectedIssue, loggedIssue);
      return nextComment === currentComment ? currentComment : nextComment;
    });
  }, [loggedIssue, open, selectedIssue]);

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
    if (!isLoggedTicketSearchMode) return;

    function handleClickOutside(e: MouseEvent) {
      if (loggedTicketSearchWrapperRef.current && !loggedTicketSearchWrapperRef.current.contains(e.target as Node)) {
        setIsLoggedTicketSearchMode(false);
        setLoggedTicketSearchQuery("");
        setLoggedTicketSearchResults([]);
        setLoggedTicketSearchError(null);
        setActiveLoggedTicketIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isLoggedTicketSearchMode]);

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
    if (loggedTicketSearchResults.length === 0) {
      setActiveLoggedTicketIndex(-1);
      return;
    }

    setActiveLoggedTicketIndex((current) => {
      if (current < 0) return 0;
      return Math.min(current, loggedTicketSearchResults.length - 1);
    });
  }, [loggedTicketSearchResults]);

  useEffect(() => {
    if (!isTicketSearchMode || activeTicketIndex < 0 || activeTicketIndex >= ticketSearchResults.length) return;
    const optionId = getTicketOptionId(ticketSearchResults[activeTicketIndex].issue.id, activeTicketIndex);
    const option = document.getElementById(optionId);
    option?.scrollIntoView({ block: "nearest" });
  }, [activeTicketIndex, getTicketOptionId, isTicketSearchMode, ticketSearchResults]);

  useEffect(() => {
    if (!isLoggedTicketSearchMode || activeLoggedTicketIndex < 0 || activeLoggedTicketIndex >= loggedTicketSearchResults.length) return;
    const optionId = getLoggedTicketOptionId(loggedTicketSearchResults[activeLoggedTicketIndex].issue.id, activeLoggedTicketIndex);
    const option = document.getElementById(optionId);
    option?.scrollIntoView({ block: "nearest" });
  }, [activeLoggedTicketIndex, getLoggedTicketOptionId, isLoggedTicketSearchMode, loggedTicketSearchResults]);

  const effectiveLoggedIssue = allowDifferentLoggedTicket ? loggedIssue : selectedIssue;

  function handleTicketSearchChange(value: string) {
    setTicketSearchQuery(value);
    setActiveTicketIndex(-1);
    if (!value.trim()) {
      setTicketSearchResults([]);
      setTicketSearchError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setIsSearchingIssues(true);
      setTicketSearchError(null);
      void searchRedmineTickets(value)
        .then((issues) => {
          setTicketSearchResults(issues);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
          setTicketSearchError(msg);
          setTicketSearchResults([]);
        })
        .finally(() => {
          setIsSearchingIssues(false);
        });
    }, DEBOUNCE_MS);
  }

  function handleLoggedTicketSearchChange(value: string) {
    setLoggedTicketSearchQuery(value);
    setActiveLoggedTicketIndex(-1);
    if (!value.trim()) {
      setLoggedTicketSearchResults([]);
      setLoggedTicketSearchError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setIsSearchingIssues(true);
      setLoggedTicketSearchError(null);
      void searchRedmineTickets(value)
        .then((issues) => {
          setLoggedTicketSearchResults(issues);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
          setLoggedTicketSearchError(msg);
          setLoggedTicketSearchResults([]);
        })
        .finally(() => {
          setIsSearchingIssues(false);
        });
    }, DEBOUNCE_MS);
  }

  function handleTicketSelect(issue: RedmineIssue, matchedCommentFullText?: string) {
    const matchedComment = matchedCommentFullText?.trim();
    const previousSelectedIssueId = selectedIssue?.id;
    if (matchedComment) {
      setComments(matchedComment);
    }

    setSelectedIssue(issue);
    if (!allowDifferentLoggedTicket) {
      setLoggedIssue(issue);
    } else if (!loggedIssue || loggedIssue.id === previousSelectedIssueId) {
      setLoggedIssue(issue);
    }
    setIsTicketSearchMode(false);
    setTicketSearchQuery("");
    setTicketSearchResults([]);
    setTicketSearchError(null);
    setActiveTicketIndex(-1);
  }

  function handleLoggedTicketSelect(issue: RedmineIssue) {
    setLoggedIssue(issue);
    setIsLoggedTicketSearchMode(false);
    setLoggedTicketSearchQuery("");
    setLoggedTicketSearchResults([]);
    setLoggedTicketSearchError(null);
    setActiveLoggedTicketIndex(-1);
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
        handleTicketSelect(ticketSearchResults[activeTicketIndex].issue);
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

  function handleLoggedTicketSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (loggedTicketSearchResults.length === 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsLoggedTicketSearchMode(false);
        setLoggedTicketSearchQuery("");
        setLoggedTicketSearchError(null);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveLoggedTicketIndex((current) => (current + 1) % loggedTicketSearchResults.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveLoggedTicketIndex((current) => (current <= 0 ? loggedTicketSearchResults.length - 1 : current - 1));
      return;
    }

    if (e.key === "Enter") {
      if (activeLoggedTicketIndex >= 0 && activeLoggedTicketIndex < loggedTicketSearchResults.length) {
        e.preventDefault();
        handleLoggedTicketSelect(loggedTicketSearchResults[activeLoggedTicketIndex].issue);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsLoggedTicketSearchMode(false);
      setLoggedTicketSearchQuery("");
      setLoggedTicketSearchResults([]);
      setLoggedTicketSearchError(null);
      setActiveLoggedTicketIndex(-1);
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
    if (isTicketSearchMode || (allowDifferentLoggedTicket && isLoggedTicketSearchMode)) {
      toast.error(t("timeEntry.validationSelectTicket"));
      return;
    }

    if (!selectedIssue) {
      toast.error(t("timeEntry.validationSelectTicket"));
      return;
    }

    if (allowDifferentLoggedTicket && !effectiveLoggedIssue) {
      toast.error(t("timeEntry.validationSelectLoggedTicket"));
      return;
    }

    if (!activityId) {
      toast.error(t("timeEntry.validationSelectActivity"));
      return;
    }
    const hours = timeValueToHours(duration);
    if (hours <= 0) {
      toast.error(t("timeEntry.validationTimePositive"));
      return;
    }

    setIsSaving(true);
    try {
      const issueForLogging = effectiveLoggedIssue ?? selectedIssue;
      if (!issueForLogging) {
        toast.error(t("timeEntry.validationSelectTicket"));
        return;
      }

      const commentToLog = buildCommentWithContextPrefix(comments, selectedIssue, issueForLogging);

      if (isEdit) {
        await updateTimeEntry(props.session.redmineEntryId!, {
          issueId: issueForLogging.id,
          hours,
          activityId: Number(activityId),
          comments: commentToLog,
          spentOn,
        });
        await persistEntryTimesForCurrentDomain(props.session.redmineEntryId!, startTime, stopTime, {
          issue: selectedIssue,
          loggedIssue: issueForLogging,
        });
        toast.success(t("timeEntry.updated"), {
          description: t("timeEntry.loggedDescription", {
            duration,
            issueId: issueForLogging.id,
          }),
        });
        props.onSaved({
          issue: selectedIssue,
          loggedIssue: issueForLogging,
          hours,
          activityId: Number(activityId),
          comments: commentToLog,
          spentOn,
          startedAt: startTime,
          stoppedAt: stopTime,
        });
      } else {
        const entryId = await logTimeEntry({
          issueId: issueForLogging.id,
          hours,
          activityId: Number(activityId),
          comments: commentToLog,
          spentOn,
        });
        await persistEntryTimesForCurrentDomain(entryId, startTime, stopTime, {
          issue: selectedIssue,
          loggedIssue: issueForLogging,
        });
        toast.success(isDuplicateIntent ? t("timeEntry.duplicated") : t("timeEntry.logged"), {
          description: t("timeEntry.loggedDescription", {
            duration,
            issueId: issueForLogging.id,
          }),
        });
        props.onSaved(selectedIssue, issueForLogging, entryId, hours, Number(activityId), commentToLog, spentOn, startTime, stopTime);
      }
    } catch (err) {
      toast.error(isEdit ? t("timeEntry.updateFailed") : t("timeEntry.logFailed"), {
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
        className="bg-card border-border sm:max-w-md overflow-x-hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Clock className="w-5 h-5 text-primary" />
            {isEdit ? t("timeEntry.titleEdit") : isDuplicateIntent ? t("timeEntry.titleDuplicate") : t("timeEntry.titleCreate")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 min-w-0">
          {/* Ticket */}
          <div className="space-y-2 min-w-0">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
              {t("timeEntry.ticket")} <span className="text-destructive">*</span>
            </Label>
            {!isTicketSearchMode && selectedIssue ? (
              <button
                type="button"
                onClick={() => {
                  setIsLoggedTicketSearchMode(false);
                  setIsTicketSearchMode(true);
                }}
                className="w-full min-w-0 rounded-lg bg-muted border border-border p-3 text-left hover:bg-surface-high transition-colors"
              >
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <span className="text-xs font-semibold text-primary shrink-0">#{selectedIssue.id}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide truncate min-w-0 flex-1 block">
                    {selectedIssue.project.name}
                  </span>
                  {isEdit ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="ml-auto inline-flex">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t("timeEntry.clickToChange")}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{t("timeEntry.clickToChange")}</span>
                  )}
                </div>
                <TruncatedTicketSubject
                  subject={selectedIssue.subject}
                  className="text-sm font-medium text-foreground line-clamp-2 wrap-break-word min-w-0"
                />
              </button>
            ) : !isTicketSearchMode ? (
              <button
                type="button"
                onClick={() => {
                  setIsLoggedTicketSearchMode(false);
                  setIsTicketSearchMode(true);
                }}
                className="w-full rounded-lg bg-muted border border-border p-3 text-left hover:bg-surface-high transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">{t("timeEntry.selectTicket")}</span>
                </div>
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
                    placeholder={t("timeEntry.ticketSearchPlaceholder")}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={ticketSearchResults.length > 0 || isSearchingIssues || Boolean(ticketSearchError)}
                    aria-controls={ticketSearchListboxId}
                    aria-activedescendant={
                      activeTicketIndex >= 0 && activeTicketIndex < ticketSearchResults.length
                        ? getTicketOptionId(ticketSearchResults[activeTicketIndex].issue.id, activeTicketIndex)
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
                        {t("timeEntry.searching")}
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
                        {t("timeEntry.noResults", { query: ticketSearchQuery })}
                      </div>
                    )}

                    {ticketSearchResults.map((resultIssue, index) => (
                      <SearchResultItem
                        key={resultIssue.issue.id}
                        id={getTicketOptionId(resultIssue.issue.id, index)}
                        issue={resultIssue.issue}
                        searchQuery={ticketSearchQuery}
                        matchedCommentSnippet={resultIssue.matchedCommentSnippet}
                        matchedCommentFullText={resultIssue.matchedCommentFullText}
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

          {allowDifferentLoggedTicket && (
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-1">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
                {t("timeEntry.loggedTicket")} <span className="text-destructive">*</span>
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  >
                    <CircleHelp className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  {t("timeEntry.loggedTicketHelp")}
                </TooltipContent>
              </Tooltip>
            </div>
            {!isLoggedTicketSearchMode && loggedIssue ? (
              <div className="w-full min-w-0 rounded-lg bg-muted border border-border px-3 py-2 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs font-semibold text-primary shrink-0">#{loggedIssue.id}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm wrap-break-word">{loggedIssue.project.name}</TooltipContent>
                  </Tooltip>
                  <TruncatedTicketSubject
                    subject={loggedIssue.subject}
                    className="text-sm text-foreground min-w-0 flex-1 truncate"
                    tooltipClassName="max-w-sm wrap-break-word"
                  />
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          aria-label={t("timeEntry.clickToChange")}
                          onClick={() => {
                            setIsTicketSearchMode(false);
                            setIsLoggedTicketSearchMode(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("timeEntry.clickToChange")}</TooltipContent>
                    </Tooltip>
                    {selectedIssue && loggedIssue.id !== selectedIssue.id && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            aria-label={t("timeEntry.useSelectedTicket")}
                            onClick={() => setLoggedIssue(selectedIssue)}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("timeEntry.useSelectedTicket")}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            ) : !isLoggedTicketSearchMode ? (
              <button
                type="button"
                onClick={() => {
                  setIsTicketSearchMode(false);
                  setIsLoggedTicketSearchMode(true);
                }}
                className="w-full rounded-lg bg-muted border border-border p-3 text-left hover:bg-surface-high transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">{t("timeEntry.selectLoggedTicket")}</span>
                </div>
              </button>
            ) : (
              <div ref={loggedTicketSearchWrapperRef} className="relative">
                <div className="relative">
                  {isSearchingIssues ? (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                  <Input
                    type="text"
                    autoFocus
                    value={loggedTicketSearchQuery}
                    onChange={(e) => handleLoggedTicketSearchChange(e.target.value)}
                    onKeyDown={handleLoggedTicketSearchKeyDown}
                    placeholder={t("timeEntry.ticketSearchPlaceholder")}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={loggedTicketSearchResults.length > 0 || isSearchingIssues || Boolean(loggedTicketSearchError)}
                    aria-controls={loggedTicketSearchListboxId}
                    aria-activedescendant={
                      activeLoggedTicketIndex >= 0 && activeLoggedTicketIndex < loggedTicketSearchResults.length
                        ? getLoggedTicketOptionId(loggedTicketSearchResults[activeLoggedTicketIndex].issue.id, activeLoggedTicketIndex)
                        : undefined
                    }
                    className="bg-muted border-border pl-9"
                  />
                </div>

                {(loggedTicketSearchResults.length > 0 || isSearchingIssues || Boolean(loggedTicketSearchError) || loggedTicketSearchQuery.trim().length > 0) && (
                  <div
                    id={loggedTicketSearchListboxId}
                    role="listbox"
                    className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-surface-container border border-border shadow-xl overflow-hidden z-50 max-h-72 overflow-y-auto"
                  >
                    {isSearchingIssues && loggedTicketSearchResults.length === 0 && (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("timeEntry.searching")}
                      </div>
                    )}

                    {loggedTicketSearchError && (
                      <div className="flex items-center gap-2 px-4 py-4 text-sm text-destructive">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{loggedTicketSearchError}</span>
                      </div>
                    )}

                    {!isSearchingIssues && !loggedTicketSearchError && loggedTicketSearchResults.length === 0 && loggedTicketSearchQuery.trim().length > 0 && (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        {t("timeEntry.noResults", { query: loggedTicketSearchQuery })}
                      </div>
                    )}

                    {loggedTicketSearchResults.map((resultIssue, index) => (
                      <SearchResultItem
                        key={resultIssue.issue.id}
                        id={getLoggedTicketOptionId(resultIssue.issue.id, index)}
                        issue={resultIssue.issue}
                        searchQuery={loggedTicketSearchQuery}
                        matchedCommentSnippet={resultIssue.matchedCommentSnippet}
                        matchedCommentFullText={resultIssue.matchedCommentFullText}
                        showProgress={false}
                        isActive={index === activeLoggedTicketIndex}
                        onSelect={handleLoggedTicketSelect}
                        onHover={() => setActiveLoggedTicketIndex(index)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide font-heading">
              {t("timeEntry.date")} <span className="text-destructive">*</span>
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
                {t("timeEntry.start")} <span className="text-destructive">*</span>
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
                {t("timeEntry.end")} <span className="text-destructive">*</span>
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
                {t("timeEntry.duration")} <span className="text-destructive">*</span>
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
              {t("timeEntry.activity")} <span className="text-destructive">*</span>
            </Label>
            {isLoadingActivities ? (
              <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("timeEntry.loadingActivities")}
              </div>
            ) : (
              <Select value={activityId} onValueChange={setActivityId}>
                <SelectTrigger className={`bg-muted border-border ${!activityId ? "text-muted-foreground/70" : "text-foreground"}`}>
                  <SelectValue placeholder={t("timeEntry.selectActivity")} />
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
              {t("timeEntry.comment")}
            </Label>
            <textarea
              rows={3}
              placeholder={t("timeEntry.commentPlaceholder")}
              value={comments}
              onChange={(e) => {
                const nextComment = e.target.value;
                setComments(nextComment);
                if (!isEdit) {
                  props.onDraftCommentChange?.(nextComment);
                }
              }}
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
                <TooltipContent>{t("timeEntry.deleteTooltip")}</TooltipContent>
              </Tooltip>
              <PopoverContent side="top" align="start" className="w-auto p-3">
                <p className="text-sm font-medium mb-3">{t("timeEntry.deleteConfirmTitle")}</p>
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
                        toast.success(t("timeEntry.deleteSuccess"));
                        props.onDeleted?.(props.session.id);
                        onClose();
                      } catch (err) {
                        toast.error(t("timeEntry.deleteFailed"), {
                          description: err instanceof Error ? err.message : String(err),
                        });
                      } finally {
                        setIsDeleting(false);
                        setConfirmDelete(false);
                      }
                    }}
                  >
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    {t("timeEntry.confirm")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={isDeleting}>
                    {t("timeEntry.discard")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving || isDeleting}>
              { isEdit ? t("timeEntry.discard") : t("timeEntry.discardTime")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                isSaving ||
                isDeleting ||
                !activityId ||
                isTicketSearchMode ||
                (allowDifferentLoggedTicket && isLoggedTicketSearchMode) ||
                !selectedIssue ||
                !effectiveLoggedIssue
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving ? t("timeEntry.saving") : isEdit ? t("timeEntry.update") : isDuplicateIntent ? t("timeEntry.duplicate") : t("timeEntry.logTime")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
