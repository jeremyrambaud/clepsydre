import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarRange,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  EllipsisVertical,
  ExternalLink,
  Filter,
  FolderTree,
  Hash,
  ListChecks,
  Loader2,
  Pencil,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IssueBudgetProgress } from "@/components/IssueBudgetProgress";
import { TimeEntryModal } from "@/components/TimeEntryModal";
import { deleteTimeEntry, fetchActivities, fetchTimeEntriesForDateRange } from "@/lib/redmine";
import { useIssueStore, useSettingsStore } from "@/store";
import type { RedmineIssue, WorkSession } from "@/types";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type DatePreset =
  | "custom"
  | "today"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "this-year";

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getDatePresetRange(preset: DatePreset): { from: string; to: string } | null {
  const today = new Date();

  if (preset === "today") {
    return { from: formatDateInputValue(today), to: formatDateInputValue(today) };
  }

  if (preset === "this-week") {
    return {
      from: formatDateInputValue(startOfWeek(today)),
      to: formatDateInputValue(endOfWeek(today)),
    };
  }

  if (preset === "last-week") {
    const reference = new Date(today);
    reference.setDate(reference.getDate() - 7);
    return {
      from: formatDateInputValue(startOfWeek(reference)),
      to: formatDateInputValue(endOfWeek(reference)),
    };
  }

  if (preset === "this-month") {
    return {
      from: formatDateInputValue(startOfMonth(today)),
      to: formatDateInputValue(today),
    };
  }

  if (preset === "last-month") {
    const reference = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return {
      from: formatDateInputValue(startOfMonth(reference)),
      to: formatDateInputValue(endOfMonth(reference)),
    };
  }

  if (preset === "this-year") {
    return {
      from: formatDateInputValue(new Date(today.getFullYear(), 0, 1)),
      to: formatDateInputValue(today),
    };
  }

  return null;
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatSpentOnDate(spentOn: string, locale: string): string {
  const date = new Date(`${spentOn}T00:00:00`);
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type SortColumn = "date" | "duration";
type SortDirection = "asc" | "desc";

const AUTO_CONTEXT_COMMENT_PREFIX_REGEX = /^#\d+\s-\s.+$/;

function stripAutoContextCommentPrefix(comment: string): string {
  const normalized = comment.replace(/\r\n/g, "\n");
  const [firstLine = "", ...restLines] = normalized.split("\n");
  if (!AUTO_CONTEXT_COMMENT_PREFIX_REGEX.test(firstLine.trim())) {
    return normalized;
  }
  return restLines.join("\n").replace(/^\n+/, "");
}

// The "context" ticket the work was done on (primary display, like the timeline).
function displayIssueOf(entry: WorkSession): RedmineIssue {
  return entry.issue;
}

// The ticket the time is actually billed to (may differ from the context ticket).
function loggedIssueOf(entry: WorkSession): RedmineIssue {
  return entry.loggedIssue ?? entry.issue;
}

function TruncatedText({
  text,
  className,
  tooltipClassName,
  multiline = false,
}: {
  text: string;
  className?: string;
  tooltipClassName?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el) return;
      setIsTruncated(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    };

    check();
    const observer = new ResizeObserver(check);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [text]);

  const content = (
    <span
      ref={ref}
      className={`${multiline ? "line-clamp-2" : "truncate"} block ${className ?? ""}`.trim()}
    >
      {text}
    </span>
  );

  if (!isTruncated) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className={tooltipClassName ?? "max-w-sm wrap-break-word"}>{text}</TooltipContent>
    </Tooltip>
  );
}

interface ProjectOption {
  id: number;
  name: string;
}

function ProjectMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: ProjectOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.name.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  };

  const label =
    selected.length === 0
      ? t("history.allProjects")
      : t("history.projectsSelected", { count: selected.length });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("history.projectPlaceholder")}
            className="h-8"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("history.noProjectResults")}
            </div>
          ) : (
            filtered.map((option) => {
              const isSelected = selected.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(option.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-high"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{option.name}</span>
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <div className="border-t border-border p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => onChange([])}
            >
              <X className="h-3.5 w-3.5" />
              {t("history.clearSelection")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface TicketOption {
  id: number;
  subject: string;
  projectName: string;
}

function TicketAutocomplete({
  options,
  value,
  onChange,
}: {
  options: TicketOption[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = options.find((option) => option.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    if (!q) return options.slice(0, 50);
    return options
      .filter((option) => String(option.id).includes(q) || option.subject.toLowerCase().includes(q))
      .slice(0, 50);
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal">
          <span className="truncate">
            {selectedOption ? `#${selectedOption.id} · ${selectedOption.subject}` : t("history.allTickets")}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("history.ticketPlaceholder")}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("history.noTicketResults")}
            </div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-high"
              >
                <span className="flex w-full items-center gap-2">
                  <span className="text-xs font-semibold text-primary">#{option.id}</span>
                  <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                    {option.projectName}
                  </span>
                </span>
                <span className="line-clamp-1 w-full text-sm text-foreground">{option.subject}</span>
              </button>
            ))
          )}
        </div>
        {value != null && (
          <div className="border-t border-border p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
              {t("history.clearSelection")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-1 font-medium uppercase tracking-wide transition-colors hover:text-foreground ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "text-foreground" : ""}`}
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}

function RowActions({
  entry,
  issue,
  redmineUrl,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  entry: WorkSession;
  issue: RedmineIssue;
  redmineUrl: string;
  onStart?: (issueId: number) => void;
  onEdit: (entry: WorkSession) => void;
  onDuplicate: (entry: WorkSession) => void;
  onDelete: (entry: WorkSession) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => openUrl(`${redmineUrl.replace(/\/+$/, "")}/issues/${issue.id}`)}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("ticketRow.openInRedmine")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => onStart?.(issue.id)}
          >
            <Play className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("ticketRow.startTimer")}</TooltipContent>
      </Tooltip>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("ticketRow.moreActions")}</TooltipContent>
        </Tooltip>
        <PopoverContent side="bottom" align="end" className="w-44 p-1">
          {entry.redmineEntryId && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => onEdit(entry)}
            >
              <Pencil className="h-4 w-4" />
              {t("ticketRow.editEntry")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => onDuplicate(entry)}
          >
            <Copy className="h-4 w-4" />
            {t("ticketRow.duplicateEntry")}
          </Button>
          {entry.redmineEntryId && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
              onClick={() => onDelete(entry)}
            >
              <Trash2 className="h-4 w-4" />
              {t("ticketRow.deleteEntry")}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface HistoryViewProps {
  onStartIssue?: (issueId: number) => void;
}

export function HistoryView({ onStartIssue }: HistoryViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr-FR" : "en-US";
  const requestIdRef = useRef(0);

  const initialMonthRange = useMemo(
    () => getDatePresetRange("this-month") ?? { from: "", to: "" },
    []
  );

  const activities = useSettingsStore((s) => s.activities);
  const setActivities = useSettingsStore((s) => s.setActivities);
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url);

  const [allEntries, setAllEntries] = useState<WorkSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState(initialMonthRange.from);
  const [toDate, setToDate] = useState(initialMonthRange.to);
  const [datePreset, setDatePreset] = useState<DatePreset>("this-month");
  const [activityFilter, setActivityFilter] = useState("all");
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Row action modals.
  const [editingSession, setEditingSession] = useState<WorkSession | null>(null);
  const [duplicatingSession, setDuplicatingSession] = useState<WorkSession | null>(null);
  const [deletingSession, setDeletingSession] = useState<WorkSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (activities.length === 0) {
          const synced = await fetchActivities();
          if (!cancelled) setActivities(synced);
        }
      } catch {
        // Keep history usable even when activity labels cannot be fetched.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) {
      setAllEntries([]);
      setHasLoadedOnce(true);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const sessions = await fetchTimeEntriesForDateRange(fromDate, toDate);
        if (requestId !== requestIdRef.current) return;
        setAllEntries(sessions);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setAllEntries([]);
      } finally {
        if (requestId !== requestIdRef.current) return;
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    })();
  }, [fromDate, toDate, reloadToken]);

  const activityNameById = useMemo(
    () => new Map(activities.map((activity) => [activity.id, activity.name])),
    [activities]
  );

  const projectOptions = useMemo<ProjectOption[]>(() => {
    const map = new Map<number, string>();
    allEntries.forEach((entry) => {
      const project = displayIssueOf(entry).project;
      if (!map.has(project.id)) map.set(project.id, project.name);
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEntries]);

  const projectFilteredEntries = useMemo(() => {
    if (selectedProjectIds.length === 0) return allEntries;
    const set = new Set(selectedProjectIds);
    return allEntries.filter((entry) => set.has(displayIssueOf(entry).project.id));
  }, [allEntries, selectedProjectIds]);

  const ticketOptions = useMemo<TicketOption[]>(() => {
    const map = new Map<number, TicketOption>();
    projectFilteredEntries.forEach((entry) => {
      const issue = displayIssueOf(entry);
      if (!map.has(issue.id)) {
        map.set(issue.id, { id: issue.id, subject: issue.subject, projectName: issue.project.name });
      }
    });
    return [...map.values()].sort((a, b) => a.id - b.id);
  }, [projectFilteredEntries]);

  const filteredEntries = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return projectFilteredEntries
      .filter((entry) => {
        if (selectedTicketId != null && displayIssueOf(entry).id !== selectedTicketId) return false;
        if (activityFilter !== "all" && entry.activityId !== Number(activityFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortColumn === "duration") {
          if (a.hours !== b.hours) return (a.hours - b.hours) * direction;
          return (a.spentOn < b.spentOn ? -1 : a.spentOn > b.spentOn ? 1 : 0) * direction;
        }
        if (a.spentOn !== b.spentOn) return (a.spentOn < b.spentOn ? -1 : 1) * direction;
        return (a.stoppedAt ?? "").localeCompare(b.stoppedAt ?? "") * direction;
      });
  }, [projectFilteredEntries, selectedTicketId, activityFilter, sortColumn, sortDirection]);

  const stats = useMemo(() => {
    const distinctProjects = new Set<number>();
    const distinctTickets = new Set<number>();
    let totalHours = 0;
    filteredEntries.forEach((entry) => {
      const issue = displayIssueOf(entry);
      distinctProjects.add(issue.project.id);
      distinctTickets.add(issue.id);
      totalHours += entry.hours;
    });
    return {
      totalHours,
      distinctProjects: distinctProjects.size,
      distinctTickets: distinctTickets.size,
      entryCount: filteredEntries.length,
    };
  }, [filteredEntries]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Reset to first page whenever the active filter set changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, activityFilter, selectedProjectIds, selectedTicketId, pageSize]);

  const pageEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  const hasActiveFilters =
    datePreset !== "this-month" ||
    fromDate !== initialMonthRange.from ||
    toDate !== initialMonthRange.to ||
    activityFilter !== "all" ||
    selectedProjectIds.length > 0 ||
    selectedTicketId != null;

  const resetFilters = () => {
    setFromDate(initialMonthRange.from);
    setToDate(initialMonthRange.to);
    setDatePreset("this-month");
    setActivityFilter("all");
    setSelectedProjectIds([]);
    setSelectedTicketId(null);
    setCurrentPage(1);
  };

  const refreshData = () => setReloadToken((token) => token + 1);

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingSession?.redmineEntryId) return;
    setIsDeleting(true);
    try {
      await deleteTimeEntry(deletingSession.redmineEntryId);
      useIssueStore.getState().removeSession(deletingSession.id);
      toast.success(t("timeEntry.deleteSuccess"));
      setDeletingSession(null);
      refreshData();
    } catch (error) {
      toast.error(t("timeEntry.deleteFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const totalHoursLabel = stats.entryCount === 0 && isLoading
    ? t("history.summary.calculating")
    : formatHoursMinutes(stats.totalHours);
  const isTableLoading = isLoading;

  return (
    <section className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <div className="shrink-0 rounded-xl border border-border border-l-4 border-l-tertiary bg-surface-container p-4 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md bg-surface-low px-2.5 py-1.5 text-xs text-foreground">
            <Filter className="h-3.5 w-3.5 text-tertiary" />
            <span className="font-medium uppercase tracking-wide">{t("history.filtersTitle")}</span>
          </div>
          <span className="text-xs text-muted-foreground">{t("history.filtersSubtitle")}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.ticket")}</p>
            <TicketAutocomplete options={ticketOptions} value={selectedTicketId} onChange={setSelectedTicketId} />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.project")}</p>
            <ProjectMultiSelect
              options={projectOptions}
              selected={selectedProjectIds}
              onChange={setSelectedProjectIds}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.activity")}</p>
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("history.activity")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("history.allActivities")}</SelectItem>
                {activities.map((activity) => (
                  <SelectItem key={activity.id} value={String(activity.id)}>
                    {activity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.datePreset")}</p>
            <Select
              value={datePreset}
              onValueChange={(value) => {
                const preset = value as DatePreset;
                setDatePreset(preset);
                const range = getDatePresetRange(preset);
                if (!range) return;
                setFromDate(range.from);
                setToDate(range.to);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("history.datePreset")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">{t("history.presets.custom")}</SelectItem>
                <SelectItem value="today">{t("history.presets.today")}</SelectItem>
                <SelectItem value="this-week">{t("history.presets.thisWeek")}</SelectItem>
                <SelectItem value="last-week">{t("history.presets.lastWeek")}</SelectItem>
                <SelectItem value="this-month">{t("history.presets.thisMonth")}</SelectItem>
                <SelectItem value="last-month">{t("history.presets.lastMonth")}</SelectItem>
                <SelectItem value="this-year">{t("history.presets.thisYear")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.fromDate")}</p>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setDatePreset("custom");
              }}
              aria-label={t("history.fromDate")}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.toDate")}</p>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setDatePreset("custom");
              }}
              aria-label={t("history.toDate")}
            />
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={resetFilters} disabled={!hasActiveFilters}>
            {t("history.resetFilters")}
          </Button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-container/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5 text-tertiary" />
            {t("history.summary.totalTime")}
          </div>
          <p className="text-lg font-semibold font-heading text-foreground">{totalHoursLabel}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-container/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <FolderTree className="h-3.5 w-3.5 text-tertiary" />
            {t("history.summary.totalProjects")}
          </div>
          <p className="text-lg font-semibold font-heading text-foreground">{stats.distinctProjects}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-container/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Hash className="h-3.5 w-3.5 text-tertiary" />
            {t("history.summary.totalTickets")}
          </div>
          <p className="text-lg font-semibold font-heading text-foreground">{stats.distinctTickets}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-container/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5 text-tertiary" />
            {t("history.summary.totalEntries")}
          </div>
          <p className="text-lg font-semibold font-heading text-foreground">{stats.entryCount}</p>
        </div>
      </div>

      {errorMessage && (
        <div className="shrink-0 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="mb-1 font-medium">{t("history.loadFailed")}</p>
          <p className="wrap-break-word text-destructive/80">{errorMessage}</p>
        </div>
      )}

      <div className="relative overflow-auto rounded-xl border border-border bg-surface-container/50 lg:flex-1 lg:min-h-0">
        <table className="hidden w-full min-w-[1140px] border-collapse text-sm md:table">
          <colgroup>
            <col className="w-[110px]" />
            <col className="w-[80px]" />
            <col className="w-[150px]" />
            <col />
            <col className="w-[130px]" />
            <col className="w-[110px]" />
            <col className="w-[180px]" />
            <col className="w-[240px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-high text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                <SortableHeader
                  label={t("history.table.date")}
                  active={sortColumn === "date"}
                  direction={sortDirection}
                  onClick={() => toggleSort("date")}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.id")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.project")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.ticket")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.activity")}</th>
              <th className="px-3 py-2 text-left font-medium">
                <SortableHeader
                  label={t("history.table.duration")}
                  active={sortColumn === "duration"}
                  direction={sortDirection}
                  onClick={() => toggleSort("duration")}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.progress")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.comment")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("history.table.actions")}</th>
            </tr>
          </thead>
          <tbody className={isTableLoading && hasLoadedOnce ? "opacity-60" : ""}>
            {pageEntries.length === 0 ? (
              <tr className="border-t border-border/70">
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={9}>
                  {isTableLoading ? t("history.loading") : t("history.empty")}
                </td>
              </tr>
            ) : (
              pageEntries.map((entry) => {
                const issue = displayIssueOf(entry);
                const loggedIssue = loggedIssueOf(entry);
                const isImputed = loggedIssue.id !== issue.id;
                const comment = stripAutoContextCommentPrefix(entry.comments ?? "").trim();
                return (
                  <tr
                    key={entry.id}
                    className="border-t border-border/70 align-middle transition-colors hover:bg-surface-low/70"
                  >
                    <td className="px-3 py-3 align-middle font-medium whitespace-nowrap text-foreground">
                      {formatSpentOnDate(entry.spentOn, locale)}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                        #{issue.id}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle text-foreground">
                      <TruncatedText
                        text={issue.project.name}
                        className="max-w-[140px] rounded bg-surface-highest px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      />
                    </td>
                    <td className="px-3 py-3 align-middle text-foreground">
                      <TruncatedText
                        text={issue.subject}
                        multiline
                        className="text-muted-foreground"
                        tooltipClassName="max-w-md wrap-break-word"
                      />
                      {isImputed && (
                        <TruncatedText
                          text={t("ticketRow.imputedOn", {
                            issueId: loggedIssue.id,
                            project: loggedIssue.project.name,
                          })}
                          className="mt-1 text-[11px] text-tertiary"
                          tooltipClassName="max-w-sm wrap-break-word"
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="inline-flex rounded bg-surface-high px-2 py-1 text-xs text-foreground">
                        {activityNameById.get(entry.activityId) ?? t("history.unknownActivity")}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle font-semibold whitespace-nowrap text-foreground">
                      {formatHoursMinutes(entry.hours)}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <IssueBudgetProgress
                        estimatedHours={issue.estimated_hours}
                        spentHours={issue.spent_hours}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {comment ? (
                        <TruncatedText
                          text={comment}
                          multiline
                          className="text-muted-foreground"
                          tooltipClassName="max-w-md whitespace-pre-wrap wrap-break-word"
                        />
                      ) : (
                        <span className="text-xs italic text-muted-foreground/60">{t("history.noComment")}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <RowActions
                        entry={entry}
                        issue={issue}
                        redmineUrl={redmineUrl}
                        onStart={onStartIssue}
                        onEdit={setEditingSession}
                        onDuplicate={setDuplicatingSession}
                        onDelete={setDeletingSession}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="divide-y divide-border/70 md:hidden">
          {pageEntries.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {isTableLoading ? t("history.loading") : t("history.empty")}
            </div>
          ) : (
            pageEntries.map((entry) => {
              const issue = displayIssueOf(entry);
              const loggedIssue = loggedIssueOf(entry);
              const isImputed = loggedIssue.id !== issue.id;
              const comment = stripAutoContextCommentPrefix(entry.comments ?? "").trim();
              return (
                <div key={entry.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                        #{issue.id}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatSpentOnDate(entry.spentOn, locale)}</span>
                      <span className="inline-flex rounded bg-surface-high px-2 py-0.5 text-[11px] text-foreground">
                        {activityNameById.get(entry.activityId) ?? t("history.unknownActivity")}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatHoursMinutes(entry.hours)}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 inline-block max-w-full truncate rounded bg-surface-highest px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground align-bottom">
                      {issue.project.name}
                    </span>
                    <p className="wrap-break-word text-sm text-foreground">{issue.subject}</p>
                    {isImputed && (
                      <p className="mt-1 wrap-break-word text-[11px] text-tertiary">
                        {t("ticketRow.imputedOn", {
                          issueId: loggedIssue.id,
                          project: loggedIssue.project.name,
                        })}
                      </p>
                    )}
                  </div>

                  <IssueBudgetProgress estimatedHours={issue.estimated_hours} spentHours={issue.spent_hours} />

                  {comment ? (
                    <p className="line-clamp-3 whitespace-pre-line wrap-break-word text-xs italic text-muted-foreground">
                      {comment}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <RowActions
                      entry={entry}
                      issue={issue}
                      redmineUrl={redmineUrl}
                      onStart={onStartIssue}
                      onEdit={setEditingSession}
                      onDuplicate={setDuplicatingSession}
                      onDelete={setDeletingSession}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {isTableLoading && hasLoadedOnce && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/45 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("history.loading")}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-border bg-surface-container/60 p-3 md:flex-row md:items-center md:justify-between">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarRange className="h-4 w-4 text-tertiary" />
          {t("history.pagination.totalCount", { total: filteredEntries.length })}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("history.pagination.perPage")}</span>
          <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
            <SelectTrigger className="w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1 || isTableLoading}
          >
            {t("history.pagination.previous")}
          </Button>

          <span className="min-w-28 text-center text-sm text-muted-foreground">
            {t("history.pagination.page", { page: currentPage, totalPages })}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages || isTableLoading}
          >
            {t("history.pagination.next")}
          </Button>
        </div>
      </div>

      {editingSession && (
        <TimeEntryModal
          mode="edit"
          open={Boolean(editingSession)}
          onClose={() => setEditingSession(null)}
          onSaved={() => {
            setEditingSession(null);
            useIssueStore.getState().refreshIssues();
            refreshData();
          }}
          onDeleted={() => {
            setEditingSession(null);
            useIssueStore.getState().refreshIssues();
            refreshData();
          }}
          issue={editingSession.issue}
          session={editingSession}
        />
      )}

      {duplicatingSession && (
        <TimeEntryModal
          mode="create"
          intent="duplicate"
          open={Boolean(duplicatingSession)}
          onClose={() => setDuplicatingSession(null)}
          onSaved={() => {
            setDuplicatingSession(null);
            useIssueStore.getState().refreshIssues();
            refreshData();
          }}
          issue={duplicatingSession.issue}
          loggingIssue={duplicatingSession.loggedIssue ?? duplicatingSession.issue}
          initialSpentOn={duplicatingSession.spentOn}
          initialActivityId={duplicatingSession.activityId}
          elapsedSeconds={Math.round(duplicatingSession.hours * 3600)}
          startedAt={duplicatingSession.startedAt}
          stoppedAt={duplicatingSession.stoppedAt}
          initialComment={duplicatingSession.comments}
        />
      )}

      <Dialog
        open={Boolean(deletingSession)}
        onOpenChange={(open) => {
          if (!isDeleting && !open) setDeletingSession(null);
        }}
      >
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("timeEntry.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("timeEntry.deleteConfirmDescription", {
                issueId: deletingSession ? displayIssueOf(deletingSession).id : "",
                start: deletingSession?.startedAt ?? "--:--",
                end: deletingSession?.stoppedAt ?? "--:--",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingSession(null)} disabled={isDeleting}>
              {t("timeEntry.discard")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleConfirmDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? t("timeEntry.saving") : t("timeEntry.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
