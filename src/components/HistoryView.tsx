import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock3, Filter, ListChecks, Loader2, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchActivities, fetchTimeEntriesPage, fetchTotalLoggedHours } from "@/lib/redmine";
import { useSettingsStore } from "@/store";
import type { WorkSession } from "@/types";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
type DatePreset = "custom" | "this-week" | "last-week" | "last-two-weeks" | "this-month" | "last-month";

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

  if (preset === "last-two-weeks") {
    const from = new Date(today);
    from.setDate(from.getDate() - 13);
    return {
      from: formatDateInputValue(from),
      to: formatDateInputValue(today),
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
      const overflowX = el.scrollWidth > el.clientWidth;
      const overflowY = el.scrollHeight > el.clientHeight;
      setIsTruncated(overflowX || overflowY);
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
      <TooltipContent className={tooltipClassName ?? "max-w-sm break-words"}>{text}</TooltipContent>
    </Tooltip>
  );
}

export function HistoryView() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr-FR" : "en-US";
  const requestIdRef = useRef(0);
  const totalHoursRequestIdRef = useRef(0);
  const initialMonthRange = useMemo(
    () => getDatePresetRange("this-month") ?? { from: "", to: "" },
    []
  );

  const activities = useSettingsStore((s) => s.activities);
  const setActivities = useSettingsStore((s) => s.setActivities);

  const [entries, setEntries] = useState<WorkSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [isTotalHoursLoading, setIsTotalHoursLoading] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [fromDateInput, setFromDateInput] = useState(initialMonthRange.from);
  const [toDateInput, setToDateInput] = useState(initialMonthRange.to);
  const [datePresetInput, setDatePresetInput] = useState<DatePreset>("this-month");
  const [activityFilterInput, setActivityFilterInput] = useState("all");

  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState(initialMonthRange.from);
  const [appliedToDate, setAppliedToDate] = useState(initialMonthRange.to);
  const [appliedActivityFilter, setAppliedActivityFilter] = useState("all");

  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (activities.length === 0) {
          const syncedActivities = await fetchActivities();
          if (!cancelled) {
            setActivities(syncedActivities);
          }
        }
      } catch {
        // Keep the history view usable even when activity labels cannot be fetched.
      } finally {
        if (!cancelled) {
          // no-op
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsedIssueFilter = useMemo(() => {
    const normalized = appliedSearch.trim().replace(/^#/, "");
    return /^\d+$/.test(normalized) ? Number(normalized) : null;
  }, [appliedSearch]);

  const hasUnsupportedTextFilter = useMemo(() => {
    const normalized = appliedSearch.trim().replace(/^#/, "");
    return normalized.length > 0 && !/^\d+$/.test(normalized);
  }, [appliedSearch]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const offset = (currentPage - 1) * pageSize;

    setIsLoading(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const { sessions, totalCount: fetchedTotalCount } = await fetchTimeEntriesPage({
          offset,
          limit: pageSize,
          from: appliedFromDate || undefined,
          to: appliedToDate || undefined,
          activityId: appliedActivityFilter === "all" ? undefined : Number(appliedActivityFilter),
          issueId: parsedIssueFilter ?? undefined,
        });

        if (requestId !== requestIdRef.current) return;
        setEntries(sessions);
        setTotalCount(fetchedTotalCount);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(message);
      } finally {
        if (requestId !== requestIdRef.current) return;
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    })();
  }, [appliedActivityFilter, appliedFromDate, appliedToDate, currentPage, pageSize, parsedIssueFilter]);

  useEffect(() => {
    const requestId = ++totalHoursRequestIdRef.current;
    setIsTotalHoursLoading(true);

    void (async () => {
      try {
        const hours = await fetchTotalLoggedHours({
          from: appliedFromDate || undefined,
          to: appliedToDate || undefined,
          activityId: appliedActivityFilter === "all" ? undefined : Number(appliedActivityFilter),
          issueId: parsedIssueFilter ?? undefined,
        });

        if (requestId !== totalHoursRequestIdRef.current) return;
        setTotalHours(hours);
      } catch {
        if (requestId !== totalHoursRequestIdRef.current) return;
        setTotalHours(null);
      } finally {
        if (requestId !== totalHoursRequestIdRef.current) return;
        setIsTotalHoursLoading(false);
      }
    })();
  }, [appliedActivityFilter, appliedFromDate, appliedToDate, parsedIssueFilter]);

  const activityNameById = useMemo(() => {
    return new Map(activities.map((activity) => [activity.id, activity.name]));
  }, [activities]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const applyFilters = () => {
    setAppliedSearch(searchInput);
    setAppliedFromDate(fromDateInput);
    setAppliedToDate(toDateInput);
    setAppliedActivityFilter(activityFilterInput);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearchInput("");
    setFromDateInput(initialMonthRange.from);
    setToDateInput(initialMonthRange.to);
    setDatePresetInput("this-month");
    setActivityFilterInput("all");
    setAppliedSearch("");
    setAppliedFromDate(initialMonthRange.from);
    setAppliedToDate(initialMonthRange.to);
    setAppliedActivityFilter("all");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    !!searchInput.trim()
    || activityFilterInput !== "all"
    || fromDateInput !== initialMonthRange.from
    || toDateInput !== initialMonthRange.to
    || datePresetInput !== "this-month";
  const isTableLoading = isLoading;
  const activeFilterCount = [
    appliedSearch.trim(),
    appliedFromDate,
    appliedToDate,
    appliedActivityFilter !== "all" ? "active" : "",
  ].filter(Boolean).length;
  const appliedRangeLabel = appliedFromDate || appliedToDate
    ? `${appliedFromDate ? formatSpentOnDate(appliedFromDate, locale) : "..."} -> ${appliedToDate ? formatSpentOnDate(appliedToDate, locale) : "..."}`
    : t("history.summary.anyRange");
  const totalHoursLabel = isTotalHoursLoading
    ? t("history.summary.calculating")
    : (totalHours == null ? "--" : formatHoursMinutes(totalHours));

  return (
    <section className="flex h-full flex-col gap-4">
      <div className="rounded-xl border border-border border-l-4 border-l-tertiary bg-surface-container p-4 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md bg-surface-low px-2.5 py-1.5 text-xs text-foreground">
            <Filter className="h-3.5 w-3.5 text-tertiary" />
            <span className="font-medium uppercase tracking-wide">{t("history.filtersTitle")}</span>
          </div>
          <span className="text-xs text-muted-foreground">{t("history.filtersSubtitle")}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.search")}</p>
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("history.searchIssuePlaceholder")}
              aria-label={t("history.search")}
              className="w-full"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyFilters();
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.datePreset")}</p>
            <Select
              value={datePresetInput}
              onValueChange={(value) => {
                const preset = value as DatePreset;
                setDatePresetInput(preset);

                const range = getDatePresetRange(preset);
                if (!range) return;

                setFromDateInput(range.from);
                setToDateInput(range.to);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("history.datePreset")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">{t("history.presets.custom")}</SelectItem>
                <SelectItem value="this-week">{t("history.presets.thisWeek")}</SelectItem>
                <SelectItem value="last-week">{t("history.presets.lastWeek")}</SelectItem>
                <SelectItem value="last-two-weeks">{t("history.presets.lastTwoWeeks")}</SelectItem>
                <SelectItem value="this-month">{t("history.presets.thisMonth")}</SelectItem>
                <SelectItem value="last-month">{t("history.presets.lastMonth")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.fromDate")}</p>
            <Input
              type="date"
              value={fromDateInput}
              onChange={(event) => {
                setFromDateInput(event.target.value);
                setDatePresetInput("custom");
              }}
              aria-label={t("history.fromDate")}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.toDate")}</p>
            <Input
              type="date"
              value={toDateInput}
              onChange={(event) => {
                setToDateInput(event.target.value);
                setDatePresetInput("custom");
              }}
              aria-label={t("history.toDate")}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("history.activity")}</p>
            <Select value={activityFilterInput} onValueChange={setActivityFilterInput}>
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
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={applyFilters}>
            {t("history.applyFilters")}
          </Button>
          <Button variant="outline" size="sm" onClick={resetFilters} disabled={!hasActiveFilters}>
            {t("history.resetFilters")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-container/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5 text-tertiary" />
            {t("history.summary.totalTime")}
          </div>
          <p className="text-lg font-semibold font-heading text-foreground">{totalHoursLabel}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-container/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5 text-tertiary" />
            {t("history.summary.totalEntries")}
          </div>
          <p className="text-lg font-semibold font-heading text-foreground">{totalCount}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-container/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-tertiary" />
            {t("history.summary.appliedRange")}
          </div>
          <p className="text-sm font-medium text-foreground">{appliedRangeLabel}</p>
        </div>

        <div className="rounded-xl border border-border bg-surface-container/80 p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <NotebookPen className="h-3.5 w-3.5 text-tertiary" />
            {t("history.summary.pageState")}
          </div>
          <p className="text-sm font-medium text-foreground">
            {t("history.pagination.page", { page: currentPage, totalPages })}
            <span className="ml-2 text-xs text-muted-foreground">({activeFilterCount} {t("history.summary.activeFilters")})</span>
          </p>
        </div>
      </div>

      {hasUnsupportedTextFilter && (
        <div className="rounded-xl border border-border bg-surface-container/40 p-3 text-sm text-muted-foreground">
          {t("history.searchIssueHint")}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium mb-1">{t("history.loadFailed")}</p>
          <p className="text-destructive/80 break-words">{errorMessage}</p>
        </div>
      )}

      <div className="relative overflow-auto rounded-xl border border-border bg-surface-container/50">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <colgroup>
            <col className="w-[120px]" />
            <col className="w-[180px]" />
            <col className="w-[240px]" />
            <col className="w-[150px]" />
            <col className="w-[110px]" />
            <col />
          </colgroup>
          <thead className="bg-surface-high text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.date")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.project")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.ticket")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.activity")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.duration")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("history.table.comment")}</th>
            </tr>
          </thead>
          <tbody className={isTableLoading && hasLoadedOnce ? "opacity-60" : ""}>
            {entries.length === 0 ? (
              <tr className="border-t border-border/70">
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                  {isTableLoading ? t("history.loading") : t("history.empty")}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border/70 align-middle transition-colors hover:bg-surface-low/70">
                  <td className="px-3 py-3 text-foreground whitespace-nowrap font-medium align-middle">
                    {formatSpentOnDate(entry.spentOn, locale)}
                  </td>
                  <td className="px-3 py-3 text-foreground align-middle">
                    <TruncatedText
                      text={entry.issue.project.name}
                      className="max-w-[170px] bg-surface-highest px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    />
                  </td>
                  <td className="px-3 py-3 text-foreground align-middle">
                    <div className="mb-1 inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                      #{entry.issue.id}
                    </div>
                    <TruncatedText
                      text={entry.issue.subject}
                      className="max-w-[220px] text-muted-foreground"
                      tooltipClassName="max-w-md break-words"
                    />
                  </td>
                  <td className="px-3 py-3 text-foreground align-middle">
                    <span className="inline-flex rounded bg-surface-high px-2 py-1 text-xs">
                      {activityNameById.get(entry.activityId) ?? t("history.unknownActivity")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-foreground whitespace-nowrap font-semibold align-middle">
                    {formatHoursMinutes(entry.hours)}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    {entry.comments?.trim() ? (
                      <TruncatedText
                        text={entry.comments.trim()}
                        multiline
                        className="max-w-[360px] text-muted-foreground"
                        tooltipClassName="max-w-md whitespace-pre-wrap break-words"
                      />
                    ) : (
                      <span className="text-xs italic text-muted-foreground/60">{t("history.noComment")}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {isTableLoading && hasLoadedOnce && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/45 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("history.loading")}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-container/60 p-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          {t("history.pagination.totalCount", {
            total: totalCount,
          })}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("history.pagination.perPage")}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => setPageSize(Number(value))}
          >
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
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || isTableLoading}
          >
            {t("history.pagination.next")}
          </Button>
        </div>
      </div>
    </section>
  );
}
