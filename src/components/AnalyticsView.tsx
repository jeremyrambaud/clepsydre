import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { Chart } from "@highcharts/react";
import "highcharts/esm/modules/accessibility.js";
import { Button } from "@/components/ui/button";
import { TimeEntryModal } from "@/components/TimeEntryModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchTimeEntriesForDateRange } from "@/lib/redmine";
import { useSettingsStore } from "@/store";
import type { RedmineIssue, WorkSession, WorkdayOverride } from "@/types";

const DEFAULT_DAILY_WORK_HOURS = 7;
const DEFAULT_DAILY_TARGET_TOLERANCE_MINUTES = 60;
const WEEK_CHART_FALLBACK_COLORS = [
  "#79AEE3",
  "#EE935A",
  "#79C879",
  "#EA7070",
  "#A48AD8",
  "#B78F75",
  "#E78CBC",
  "#9E9E9E",
  "#C9C85C",
  "#63C5DB",
];

interface AnalyticsViewProps {
  onCreateEntry?: () => void;
  onOpenDetails?: () => void;
}

interface CalendarCell {
  date: Date;
  dateKey: string;
  inCurrentMonth: boolean;
}

interface WeeklyStackPoint {
  dayKey: string;
  label: string;
  totalMinutes: number;
  segments: Array<{ project: string; minutes: number }>;
}

interface TimelineLaneItem {
  session: WorkSession;
  start: number;
  end: number;
  lane: number;
}

interface RankingItem {
  key: string;
  label: string;
  minutes: number;
}

interface CalendarContextMenuState {
  dateKey: string;
  x: number;
  y: number;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getEasterSunday(year: number): Date {
  // Meeus/Jones/Butcher Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getFrenchPublicHolidays(year: number): Array<{ dateKey: string; nameKey: string }> {
  const easterSunday = getEasterSunday(year);

  const fixedHolidays = [
    { date: new Date(year, 0, 1), nameKey: "newYear" },
    { date: new Date(year, 4, 1), nameKey: "laborDay" },
    { date: new Date(year, 4, 8), nameKey: "victory1945" },
    { date: new Date(year, 6, 14), nameKey: "nationalDay" },
    { date: new Date(year, 7, 15), nameKey: "assumption" },
    { date: new Date(year, 10, 1), nameKey: "allSaints" },
    { date: new Date(year, 10, 11), nameKey: "armistice" },
    { date: new Date(year, 11, 25), nameKey: "christmas" },
  ];

  const movingHolidays = [
    { date: addDays(easterSunday, 1), nameKey: "easterMonday" },
    { date: addDays(easterSunday, 39), nameKey: "ascension" },
    { date: addDays(easterSunday, 50), nameKey: "whitMonday" },
  ];

  return [...fixedHolidays, ...movingHolidays].map(({ date, nameKey }) => ({
    dateKey: toDateKey(date),
    nameKey,
  }));
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = addDays(date, diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(date: Date): Date {
  const end = addDays(startOfWeek(date), 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function resolveEndMinutes(startMinutes: number, stopTime: string): number {
  let endMinutes = parseTimeToMinutes(stopTime);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return endMinutes;
}

function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatSignedHoursMinutes(hours: number): string {
  const sign = hours >= 0 ? "+" : "-";
  return `${sign}${formatHoursMinutes(Math.abs(hours))}`;
}

function formatMinutesClock(minutes: number): string {
  const safeMinutes = Math.max(0, minutes);
  const h = Math.floor(safeMinutes / 60);
  const m = safeMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatMinutesAsHoursLabel(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const h = Math.floor(safeMinutes / 60);
  const m = safeMinutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function formatHourTick(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return `${h.toString().padStart(2, "0")}:00`;
}

function formatHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function getSessionDurationMinutes(session: WorkSession): number {
  return Math.max(1, Math.round(session.hours * 60));
}

function buildCalendarCells(month: Date): CalendarCell[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const leadingDays = (monthStart.getDay() + 6) % 7;
  const trailingDays = (7 - ((leadingDays + monthEnd.getDate()) % 7)) % 7;

  const firstCellDate = addDays(monthStart, -leadingDays);
  const totalCells = leadingDays + monthEnd.getDate() + trailingDays;

  return Array.from({ length: totalCells }, (_, index) => {
    const date = addDays(firstCellDate, index);
    return {
      date,
      dateKey: toDateKey(date),
      inCurrentMonth: date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear(),
    };
  });
}

function readRootColorVar(variableName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function getWeeklySeriesColor(index: number, totalSeries: number): string {
  if (index < WEEK_CHART_FALLBACK_COLORS.length) {
    return WEEK_CHART_FALLBACK_COLORS[index];
  }

  const safeTotal = Math.max(totalSeries, 1);
  const hue = Math.round((index / safeTotal) * 360) % 360;
  return `hsl(${hue} 62% 66%)`;
}

export function AnalyticsView({ onOpenDetails: _onOpenDetails }: AnalyticsViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr-FR" : "en-US";
  const setSettings = useSettingsStore((s) => s.setSettings);
  const dailyWorkHours = useSettingsStore((s) => s.settings.daily_work_hours);
  const dailyWorkToleranceMinutes = useSettingsStore((s) => s.settings.daily_work_tolerance_minutes);
  const workdayOverrides = useSettingsStore((s) => s.settings.workday_overrides ?? {});
  const showWeekendsInWeeklyActivity = useSettingsStore((s) => s.settings.show_weekends_in_weekly_activity);

  const monthRequestRef = useRef(0);
  const weekRequestRef = useRef(0);

  const [activeMonth, setActiveMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState("");

  const [monthSessions, setMonthSessions] = useState<WorkSession[]>([]);
  const [previousWeekSessions, setPreviousWeekSessions] = useState<WorkSession[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTimelineSession, setEditingTimelineSession] = useState<WorkSession | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualIssue, setManualIssue] = useState<RedmineIssue | null>(null);
  const [manualAnchorTime, setManualAnchorTime] = useState<Date>(new Date());
  const [calendarContextMenu, setCalendarContextMenu] = useState<CalendarContextMenuState | null>(null);
  const [hoveredLegendProject, setHoveredLegendProject] = useState<string | null>(null);
  const [legendHoverPosition, setLegendHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [isMonthLoading, setIsMonthLoading] = useState(true);
  const [isWeekLoading, setIsWeekLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const calendarCells = useMemo(() => buildCalendarCells(activeMonth), [activeMonth]);

  const frenchHolidayKeys = useMemo(() => {
    const years = [...new Set(calendarCells.map((cell) => cell.date.getFullYear()))];
    const allHolidayKeys = new Set<string>();

    years.forEach((year) => {
      getFrenchPublicHolidays(year).forEach(({ dateKey }) => {
        allHolidayKeys.add(dateKey);
      });
    });

    return allHolidayKeys;
  }, [calendarCells]);

  const frenchHolidayNamesByDate = useMemo(() => {
    const years = [...new Set(calendarCells.map((cell) => cell.date.getFullYear()))];
    const allHolidays = new Map<string, string>();

    years.forEach((year) => {
      getFrenchPublicHolidays(year).forEach(({ dateKey, nameKey }) => {
        allHolidays.set(dateKey, nameKey);
      });
    });

    return allHolidays;
  }, [calendarCells]);

  useEffect(() => {
    if (!calendarContextMenu) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCalendarContextMenu(null);
      }
    };

    const handleViewportChange = () => {
      setCalendarContextMenu(null);
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [calendarContextMenu]);

  const calendarRange = useMemo(() => {
    const firstCell = calendarCells[0];
    const lastCell = calendarCells[calendarCells.length - 1];
    const fallbackFrom = toDateKey(startOfMonth(activeMonth));
    const fallbackTo = toDateKey(endOfMonth(activeMonth));

    return {
      from: firstCell?.dateKey ?? fallbackFrom,
      to: lastCell?.dateKey ?? fallbackTo,
    };
  }, [activeMonth, calendarCells]);

  const selectedDate = useMemo(() => {
    const fallback = new Date(`${calendarRange.from}T00:00:00`);
    if (!selectedDayKey) return fallback;

    const parsed = new Date(`${selectedDayKey}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }, [calendarRange.from, selectedDayKey]);

  const effectiveSelectedDayKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);

  const selectedWeekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const selectedWeekEnd = useMemo(() => endOfWeek(selectedDate), [selectedDate]);

  const weekRanges = useMemo(() => {
    const thisWeekFrom = toDateKey(selectedWeekStart);
    const thisWeekTo = toDateKey(selectedWeekEnd);
    const previousWeekStart = addDays(selectedWeekStart, -7);
    const previousWeekEnd = addDays(selectedWeekEnd, -7);

    return {
      thisWeekFrom,
      thisWeekTo,
      previousWeekFrom: toDateKey(previousWeekStart),
      previousWeekTo: toDateKey(previousWeekEnd),
    };
  }, [selectedWeekEnd, selectedWeekStart]);

  useEffect(() => {
    const requestId = ++monthRequestRef.current;
    setIsMonthLoading(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const sessions = await fetchTimeEntriesForDateRange(calendarRange.from, calendarRange.to);

        if (requestId !== monthRequestRef.current) return;
        setMonthSessions(sessions);
      } catch (error) {
        if (requestId !== monthRequestRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(message);
      } finally {
        if (requestId !== monthRequestRef.current) return;
        setIsMonthLoading(false);
      }
    })();
  }, [calendarRange.from, calendarRange.to, refreshNonce]);

  useEffect(() => {
    const requestId = ++weekRequestRef.current;
    setIsWeekLoading(true);

    void (async () => {
      try {
        const previousWeek = await fetchTimeEntriesForDateRange(weekRanges.previousWeekFrom, weekRanges.previousWeekTo);

        if (requestId !== weekRequestRef.current) return;
        setPreviousWeekSessions(previousWeek);
      } catch (error) {
        if (requestId !== weekRequestRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage((prev) => prev ?? message);
      } finally {
        if (requestId !== weekRequestRef.current) return;
        setIsWeekLoading(false);
      }
    })();
  }, [refreshNonce, weekRanges.previousWeekFrom, weekRanges.previousWeekTo]);

  useEffect(() => {
    const inDisplayedRange = selectedDayKey >= calendarRange.from && selectedDayKey <= calendarRange.to;
    if (inDisplayedRange) return;

    const todayKey = toDateKey(new Date());
    if (todayKey >= calendarRange.from && todayKey <= calendarRange.to) {
      setSelectedDayKey(todayKey);
      return;
    }

    const firstEntryDay = [...new Set(monthSessions.map((session) => session.spentOn))]
      .filter((dateKey) => dateKey >= calendarRange.from && dateKey <= calendarRange.to)
      .sort()[0];

    setSelectedDayKey(firstEntryDay ?? toDateKey(startOfMonth(activeMonth)));
  }, [activeMonth, calendarRange.from, calendarRange.to, monthSessions, selectedDayKey]);

  const filteredMonthSessions = useMemo(() => {
    return monthSessions;
  }, [monthSessions]);

  const activeMonthRange = useMemo(() => {
    const monthStart = startOfMonth(activeMonth);
    const monthEnd = endOfMonth(activeMonth);
    return {
      startKey: toDateKey(monthStart),
      endKey: toDateKey(monthEnd),
    };
  }, [activeMonth]);

  const activeMonthSessions = useMemo(() => {
    return filteredMonthSessions.filter(
      (session) => session.spentOn >= activeMonthRange.startKey && session.spentOn <= activeMonthRange.endKey
    );
  }, [activeMonthRange.endKey, activeMonthRange.startKey, filteredMonthSessions]);

  const filteredCurrentWeekSessions = useMemo(() => {
    return filteredMonthSessions.filter(
      (session) => session.spentOn >= weekRanges.thisWeekFrom && session.spentOn <= weekRanges.thisWeekTo
    );
  }, [filteredMonthSessions, weekRanges.thisWeekFrom, weekRanges.thisWeekTo]);

  const filteredPreviousWeekSessions = useMemo(() => {
    return previousWeekSessions;
  }, [previousWeekSessions]);

  const weeklyTotalHours = useMemo(() => {
    return filteredCurrentWeekSessions.reduce((sum, session) => sum + session.hours, 0);
  }, [filteredCurrentWeekSessions]);

  const previousWeekTotalHours = useMemo(() => {
    return filteredPreviousWeekSessions.reduce((sum, session) => sum + session.hours, 0);
  }, [filteredPreviousWeekSessions]);

  const weekDeltaHours = weeklyTotalHours - previousWeekTotalHours;

  const mostActiveProject = useMemo(() => {
    if (filteredCurrentWeekSessions.length === 0) return null;

    const projectHours = new Map<string, number>();
    filteredCurrentWeekSessions.forEach((session) => {
      const projectName = session.issue.project.name;
      projectHours.set(projectName, (projectHours.get(projectName) ?? 0) + session.hours);
    });

    const sorted = [...projectHours.entries()].sort((a, b) => b[1] - a[1]);
    const [name, hours] = sorted[0];
    const share = weeklyTotalHours > 0 ? (hours / weeklyTotalHours) * 100 : 0;

    return { name, hours, share };
  }, [filteredCurrentWeekSessions, weeklyTotalHours]);

  const monthDailyMinutes = useMemo(() => {
    const totals = new Map<string, number>();
    filteredMonthSessions.forEach((session) => {
      totals.set(session.spentOn, (totals.get(session.spentOn) ?? 0) + getSessionDurationMinutes(session));
    });
    return totals;
  }, [filteredMonthSessions]);

  const selectedDaySessions = useMemo(() => {
    return filteredMonthSessions
      .filter((session) => session.spentOn === effectiveSelectedDayKey)
      .sort((a, b) => parseTimeToMinutes(a.startedAt) - parseTimeToMinutes(b.startedAt));
  }, [effectiveSelectedDayKey, filteredMonthSessions]);

  const selectedDayTotalMinutes = useMemo(() => {
    return selectedDaySessions.reduce((sum, session) => sum + getSessionDurationMinutes(session), 0);
  }, [selectedDaySessions]);

  const targetDailyMinutes = useMemo(() => {
    const safeHours = Number.isFinite(dailyWorkHours) ? dailyWorkHours : DEFAULT_DAILY_WORK_HOURS;
    return Math.round(Math.min(24, Math.max(1, safeHours)) * 60);
  }, [dailyWorkHours]);

  const targetDailyToleranceMinutes = useMemo(() => {
    const safeTolerance = Number.isFinite(dailyWorkToleranceMinutes)
      ? dailyWorkToleranceMinutes
      : DEFAULT_DAILY_TARGET_TOLERANCE_MINUTES;
    return Math.round(Math.min(300, Math.max(0, safeTolerance)));
  }, [dailyWorkToleranceMinutes]);

  const minimumDailyMinutes = useMemo(() => {
    return Math.max(0, targetDailyMinutes - targetDailyToleranceMinutes);
  }, [targetDailyMinutes, targetDailyToleranceMinutes]);

  const applyWorkdayOverride = (dateKey: string, nextOverride: WorkdayOverride | null) => {
    const next = { ...workdayOverrides };

    if (nextOverride === null) {
      delete next[dateKey];
    } else {
      next[dateKey] = nextOverride;
    }

    setSettings({ workday_overrides: next });
    setCalendarContextMenu(null);
  };

  const calendarContextMenuDate = useMemo(() => {
    if (!calendarContextMenu) return null;
    const parsed = new Date(`${calendarContextMenu.dateKey}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [calendarContextMenu]);

  const contextMenuDayStatus = useMemo(() => {
    if (!calendarContextMenu || !calendarContextMenuDate) {
      return {
        override: null as WorkdayOverride | null,
        isWorkingDay: false,
      };
    }

    const override = workdayOverrides[calendarContextMenu.dateKey] ?? null;
    const isWeekendDay = isWeekend(calendarContextMenuDate);
    const isHoliday = frenchHolidayKeys.has(calendarContextMenu.dateKey);
    const defaultWorkingDay = !isWeekendDay && !isHoliday;
    const isWorkingDay = override === "working" ? true : override === "off" ? false : defaultWorkingDay;

    return {
      override,
      isWorkingDay,
    };
  }, [calendarContextMenu, calendarContextMenuDate, frenchHolidayKeys, workdayOverrides]);

  const monthlyCompletion = useMemo(() => {
    const monthStart = startOfMonth(activeMonth);
    const monthEnd = endOfMonth(activeMonth);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (monthStart > today) {
      return {
        isFutureMonth: true,
        requiredWorkdays: 0,
        expectedMinutes: 0,
        workedMinutes: 0,
        missingMinutes: 0,
        overMinutes: 0,
      };
    }

    const cutoff = monthEnd < today ? monthEnd : today;
    const holidayKeys = new Set<string>();

    for (let year = monthStart.getFullYear(); year <= cutoff.getFullYear(); year += 1) {
      getFrenchPublicHolidays(year).forEach(({ dateKey }) => {
        holidayKeys.add(dateKey);
      });
    }

    let requiredWorkdays = 0;
    let expectedMinutes = 0;
    let workedMinutes = 0;
    const cursor = new Date(monthStart);

    while (cursor <= cutoff) {
      const day = cursor.getDay();
      const dateKey = toDateKey(cursor);
      const isWeekendDay = day === 0 || day === 6;
      const isHoliday = holidayKeys.has(dateKey);

      const override = workdayOverrides[dateKey];
      const isWorkingDay = override === "working" ? true : override === "off" ? false : (!isWeekendDay && !isHoliday);

      if (isWorkingDay) {
        requiredWorkdays += 1;
        expectedMinutes += targetDailyMinutes;
        const dayMinutes = monthDailyMinutes.get(dateKey) ?? 0;
        workedMinutes += dayMinutes;
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    const missingMinutes = Math.max(0, expectedMinutes - workedMinutes);
    const overMinutes = Math.max(0, workedMinutes - expectedMinutes);

    return {
      isFutureMonth: false,
      requiredWorkdays,
      expectedMinutes,
      workedMinutes,
      missingMinutes,
      overMinutes,
    };
  }, [activeMonth, monthDailyMinutes, targetDailyMinutes, workdayOverrides]);

  const timelineLaneLayout = useMemo((): { items: TimelineLaneItem[]; laneCount: number } => {
    const entries = selectedDaySessions
      .map((session) => {
        const start = parseTimeToMinutes(session.startedAt);
        const end = resolveEndMinutes(start, session.stoppedAt);
        return { session, start, end };
      })
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const laneEnds: number[] = [];
    const items: TimelineLaneItem[] = entries.map((entry) => {
      let lane = laneEnds.findIndex((laneEnd) => entry.start >= laneEnd);

      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(entry.end);
      } else {
        laneEnds[lane] = entry.end;
      }

      return {
        session: entry.session,
        start: entry.start,
        end: entry.end,
        lane,
      };
    });

    return {
      items,
      laneCount: Math.max(1, laneEnds.length),
    };
  }, [selectedDaySessions]);

  const timelineLayoutMetrics = useMemo(() => {
    const laneCount = timelineLaneLayout.laneCount;

    if (laneCount <= 1) {
      return {
        isStacked: false,
        laneHeight: 0,
        laneGap: 0,
        verticalPadding: 8,
        containerHeight: 112,
      };
    }

    const laneHeight = 40;
    const laneGap = 4;
    const verticalPadding = 6;
    const containerHeight = verticalPadding * 2 + laneCount * laneHeight + (laneCount - 1) * laneGap;

    return {
      isStacked: true,
      laneHeight,
      laneGap,
      verticalPadding,
      containerHeight,
    };
  }, [timelineLaneLayout.laneCount]);

  const weeklyStackData = useMemo((): { points: WeeklyStackPoint[]; projects: string[]; maxMinutes: number } => {
    const weekDayKeys = Array.from({ length: 7 }, (_, index) => toDateKey(addDays(selectedWeekStart, index)));
    const dayKeys = showWeekendsInWeeklyActivity
      ? weekDayKeys
      : weekDayKeys.filter((dayKey) => {
          const day = new Date(`${dayKey}T00:00:00`).getDay();
          return day !== 0 && day !== 6;
        });

    const byProject = new Map<string, number>();
    const byDayAndProject = new Map<string, Map<string, number>>();

    filteredCurrentWeekSessions.forEach((session) => {
      byProject.set(session.issue.project.name, (byProject.get(session.issue.project.name) ?? 0) + getSessionDurationMinutes(session));

      const dayMap = byDayAndProject.get(session.spentOn) ?? new Map<string, number>();
      dayMap.set(session.issue.project.name, (dayMap.get(session.issue.project.name) ?? 0) + getSessionDurationMinutes(session));
      byDayAndProject.set(session.spentOn, dayMap);
    });

    const rankedProjects = [...byProject.entries()].sort((a, b) => b[1] - a[1]);
    const projectOrder = rankedProjects.map(([name]) => name);

    const points = dayKeys.map((dayKey) => {
      const dayMap = byDayAndProject.get(dayKey) ?? new Map<string, number>();

      const segments = projectOrder
        .map((project) => ({ project, minutes: dayMap.get(project) ?? 0 }))
        .filter((segment) => segment.minutes > 0);

      const totalMinutes = segments.reduce((sum, segment) => sum + segment.minutes, 0);
      const date = new Date(`${dayKey}T00:00:00`);
      const label = date
        .toLocaleDateString(locale, { weekday: "short" })
        .replace(".", "")
        .slice(0, 3)
        .toUpperCase();

      return {
        dayKey,
        label,
        totalMinutes,
        segments,
      };
    });

    const maxMinutes = Math.max(...points.map((point) => point.totalMinutes), targetDailyMinutes);
    return { points, projects: projectOrder, maxMinutes };
  }, [filteredCurrentWeekSessions, locale, selectedWeekStart, showWeekendsInWeeklyActivity, targetDailyMinutes]);

  const weeklyDayMetadataByKey = useMemo(() => {
    const years = [...new Set(weeklyStackData.points.map((point) => new Date(`${point.dayKey}T00:00:00`).getFullYear()))];
    const holidayNameKeyByDate = new Map<string, string>();
    years.forEach((year) => {
      getFrenchPublicHolidays(year).forEach(({ dateKey, nameKey }) => {
        holidayNameKeyByDate.set(dateKey, nameKey);
      });
    });

    const metadataByKey = new Map<string, {
      isWorkingDay: boolean;
      isHoliday: boolean;
      holidayName: string;
      dayName: string;
    }>();

    weeklyStackData.points.forEach((point) => {
      const date = new Date(`${point.dayKey}T00:00:00`);
      if (Number.isNaN(date.getTime())) return;

      const isWeekendDay = isWeekend(date);
      const holidayNameKey = holidayNameKeyByDate.get(point.dayKey);
      const isHoliday = Boolean(holidayNameKey);
      const override = workdayOverrides[point.dayKey];
      const isWorkingDay = override === "working" ? true : override === "off" ? false : (!isWeekendDay && !isHoliday);
      const holidayName = holidayNameKey ? t(`analytics.holidayNames.${holidayNameKey}`) : "";
      const dayName = date.toLocaleDateString(locale, { weekday: "long" });

      metadataByKey.set(point.dayKey, {
        isWorkingDay,
        isHoliday,
        holidayName,
        dayName,
      });
    });

    return metadataByKey;
  }, [locale, t, weeklyStackData.points, workdayOverrides]);

  const hasWeeklyActivityData = useMemo(() => {
    return weeklyStackData.points.some((point) => point.totalMinutes > 0);
  }, [weeklyStackData.points]);

  const shouldWrapWeeklyProjectsLegend = weeklyStackData.projects.length > 6;

  const weeklyProjectMinutesMap = useMemo(() => {
    const byProject = new Map<string, number>();
    filteredCurrentWeekSessions.forEach((session) => {
      byProject.set(
        session.issue.project.name,
        (byProject.get(session.issue.project.name) ?? 0) + getSessionDurationMinutes(session)
      );
    });
    return byProject;
  }, [filteredCurrentWeekSessions]);

  const monthlyTaskRanking = useMemo((): RankingItem[] => {
    const totalsByIssue = new Map<number, RankingItem>();

    activeMonthSessions.forEach((session) => {
      const issueId = session.issue.id;
      const existing = totalsByIssue.get(issueId);
      const minutes = getSessionDurationMinutes(session);

      if (existing) {
        existing.minutes += minutes;
        return;
      }

      totalsByIssue.set(issueId, {
        key: `issue-${issueId}`,
        label: `#${issueId} · ${session.issue.subject}`,
        minutes,
      });
    });

    return [...totalsByIssue.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8);
  }, [activeMonthSessions]);

  const monthlyProjectRanking = useMemo((): RankingItem[] => {
    const totalsByProject = new Map<number, RankingItem>();

    activeMonthSessions.forEach((session) => {
      const projectId = session.issue.project.id;
      const existing = totalsByProject.get(projectId);
      const minutes = getSessionDurationMinutes(session);

      if (existing) {
        existing.minutes += minutes;
        return;
      }

      totalsByProject.set(projectId, {
        key: `project-${projectId}`,
        label: session.issue.project.name,
        minutes,
      });
    });

    return [...totalsByProject.values()]
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8);
  }, [activeMonthSessions]);

  const weeklyChartSeries = useMemo(() => {
    return weeklyStackData.projects.map((project, index) => {
      const data = weeklyStackData.points.map((point) => {
        const segment = point.segments.find((item) => item.project === project);
        return segment?.minutes ?? null;
      });

      return {
        type: "column",
        name: project,
        data,
        stack: "weekly-activity",
        color: getWeeklySeriesColor(index, weeklyStackData.projects.length),
        opacity: hoveredLegendProject && hoveredLegendProject !== project ? 0.2 : 1,
        borderWidth: hoveredLegendProject === project ? 1 : 0,
      };
    });
  }, [hoveredLegendProject, weeklyStackData.points, weeklyStackData.projects]);

  const weeklyProjectColorMap = useMemo(() => {
    const colorMap = new Map<string, string>();
    weeklyChartSeries.forEach((series) => {
      const color = typeof series.color === "string" ? series.color : WEEK_CHART_FALLBACK_COLORS[0];
      colorMap.set(series.name, color);
    });
    return colorMap;
  }, [weeklyChartSeries]);

  const weeklyChartOptions = useMemo(() => {
    const foreground = readRootColorVar("--foreground", "#d4e4fa");
    const mutedForeground = readRootColorVar("--muted-foreground", "#c6c6cd");
    const border = readRootColorVar("--border", "rgba(69, 70, 77, 0.2)");
    const strongGrid = readRootColorVar("--input", "rgba(69, 70, 77, 0.3)");
    const dailyGoalLineColor = readRootColorVar("--tertiary", "#79AEE3");
    const holidayBandColor = "rgba(121, 174, 227, 0.14)";
    const nonWorkingBandColor = "rgba(198, 198, 205, 0.1)";
    const hourFormatter = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    });

    const weeklyNonWorkingDayBands = weeklyStackData.points.reduce<Array<{
      from: number;
      to: number;
      color: string;
      label?: {
        text: string;
        align: "center";
        verticalAlign: "middle";
        y: number;
        style: {
          color: string;
          fontSize: string;
          fontWeight: string;
          textOverflow: string;
        };
      };
    }>>((bands, point, index) => {
      const metadata = weeklyDayMetadataByKey.get(point.dayKey);
      if (!metadata || metadata.isWorkingDay) return bands;

      const isHoliday = metadata.isHoliday;
      const band: {
        from: number;
        to: number;
        color: string;
        label?: {
          text: string;
          align: "center";
          verticalAlign: "middle";
          y: number;
          style: {
            color: string;
            fontSize: string;
            fontWeight: string;
            textOverflow: string;
          };
        };
      } = {
        from: index - 0.42,
        to: index + 0.42,
        color: isHoliday ? holidayBandColor : nonWorkingBandColor,
      };
      if (isHoliday && metadata.holidayName) {
        band.label = {
          text: metadata.holidayName,
          align: "center",
          verticalAlign: "middle",
          y: 0,
          style: {
            color: mutedForeground,
            fontSize: "10px",
            fontWeight: "600",
            textOverflow: "ellipsis",
          },
        };
      } else {
        band.label = {
          text: metadata.dayName,
          align: "center",
          verticalAlign: "middle",
          y: 0,
          style: {
            color: mutedForeground,
            fontSize: "10px",
            fontWeight: "600",
            textOverflow: "ellipsis",
          },
        };
      }
      bands.push(band);

      return bands;
    }, []);

    return {
      chart: {
        type: "column",
        backgroundColor: "transparent",
        spacing: [8, 4, 4, 4],
        animation: false,
        style: {
          fontFamily: "var(--font-sans, inherit)",
        },
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories: weeklyStackData.points.map((point) => point.label),
        lineColor: border,
        gridLineWidth: 1,
        gridLineColor: border,
        plotBands: weeklyNonWorkingDayBands,
        tickLength: 0,
        labels: {
          style: {
            color: mutedForeground,
            fontSize: "11px",
            fontWeight: "600",
          },
        },
      },
      yAxis: {
        min: 0,
        softMax: weeklyStackData.maxMinutes,
        title: {
          text: t("analytics.yAxisHours"),
          style: {
            color: mutedForeground,
            fontSize: "11px",
            fontWeight: "600",
          },
        },
        gridLineColor: strongGrid,
        gridLineWidth: 1,
        tickInterval: 60,
        labels: {
          enabled: true,
          style: {
            color: mutedForeground,
            fontSize: "10px",
          },
          formatter: function (this: any): string {
            const minutes = typeof this.value === "number" ? this.value : Number(this.value) || 0;
            const hours = minutes / 60;
            return `${hourFormatter.format(hours)}h`;
          },
        },
        plotLines: [
          {
            value: targetDailyMinutes,
            color: dailyGoalLineColor,
            width: 2,
            dashStyle: "ShortDash",
            zIndex: 5,
            label: {
              text: `${t("analytics.dailyGoal")} (${formatMinutesAsHoursLabel(targetDailyMinutes)})`,
              align: "right",
              x: -4,
              y: -6,
              style: {
                color: dailyGoalLineColor,
                fontSize: "10px",
                fontWeight: "600",
              },
            },
          },
        ],
      },
      tooltip: {
        shared: true,
        useHTML: true,
        formatter: function (this: any): string {
          const pointIndex = this.points?.[0]?.point?.index ?? -1;
          const dayKey = weeklyStackData.points[pointIndex]?.dayKey;
          const metadata = dayKey ? weeklyDayMetadataByKey.get(dayKey) : null;
          const dayLabel = dayKey
            ? new Date(`${dayKey}T00:00:00`).toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })
            : `${this.x ?? ""}`;

          const header = `<span style=\"font-size: 11px\">${dayLabel}</span><br/>`;
          const status = metadata && !metadata.isWorkingDay
            ? `<span style=\"font-size:10px;color:${mutedForeground}\">${
                metadata.isHoliday && metadata.holidayName
                  ? `${t("analytics.publicHoliday")}: ${metadata.holidayName}`
                  : t("analytics.dayStatusNonWorking")
              }</span><br/>`
            : "";
          const rows = (this.points ?? [])
            .filter((point: any) => (typeof point.y === "number" ? point.y : 0) > 0)
            .map((point: any) => {
              const minutes = typeof point.y === "number" ? point.y : 0;
              return `<span style=\"color:${point.color}\">\u25CF</span> ${point.series.name}: <b>${formatMinutesAsHoursLabel(minutes)}</b><br/>`;
            })
            .join("");

          if (!rows) {
            return `${header}${status}<span>${t("analytics.noData")}</span>`;
          }

          return `${header}${status}${rows}`;
        },
      },
      plotOptions: {
        series: {
          animation: false,
          cursor: "pointer",
          point: {
            events: {
              click: (event: any) => {
                const pointIndex = event?.point?.index ?? -1;
                const clickedDayKey = weeklyStackData.points[pointIndex]?.dayKey;
                if (!clickedDayKey) return;

                setSelectedDayKey(clickedDayKey);

                const clickedDate = new Date(`${clickedDayKey}T00:00:00`);
                if (Number.isNaN(clickedDate.getTime())) return;

                if (
                  clickedDate.getMonth() !== activeMonth.getMonth()
                  || clickedDate.getFullYear() !== activeMonth.getFullYear()
                ) {
                  setActiveMonth(startOfMonth(clickedDate));
                }
              },
            },
          },
          states: {
            inactive: {
              enabled: false,
            },
          },
        },
        column: {
          stacking: "normal",
          borderWidth: 0,
          pointPadding: 0.01,
          groupPadding: 0.04,
          minPointLength: 0,
        },
      },
      accessibility: {
        enabled: true,
        description: `${t("analytics.weeklyActivity")}. ${t("analytics.weeklyActivitySubtitle")}`,
        keyboardNavigation: {
          enabled: true,
        },
        point: {
          valueDescriptionFormat: "{xDescription}, {series.name}, {point.y:.0f} minutes",
        },
      },
      series: weeklyChartSeries,
      lang: {
        noData: t("analytics.noData"),
      },
      noData: {
        style: {
          color: foreground,
        },
      },
    } as const;
  }, [
    activeMonth,
    locale,
    t,
    targetDailyMinutes,
    weeklyChartSeries,
    weeklyStackData.maxMinutes,
    weeklyStackData.points,
    weeklyDayMetadataByKey,
  ]);

  const monthlyTaskRankingChartOptions = useMemo(() => {
    const mutedForeground = readRootColorVar("--muted-foreground", "#c6c6cd");
    const border = readRootColorVar("--border", "rgba(69, 70, 77, 0.2)");
    const strongGrid = readRootColorVar("--input", "rgba(69, 70, 77, 0.3)");
    const taskColor = readRootColorVar("--chart-2", "#EE935A");
    const hourFormatter = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    });

    return {
      chart: {
        type: "bar",
        backgroundColor: "transparent",
        spacing: [8, 4, 4, 4],
        animation: false,
        style: {
          fontFamily: "var(--font-sans, inherit)",
        },
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories: monthlyTaskRanking.map((item) => item.label),
        lineColor: border,
        tickLength: 0,
        labels: {
          style: {
            color: mutedForeground,
            fontSize: "11px",
          },
          formatter: function (this: any): string {
            const value = String(this.value ?? "");
            return value.length > 45 ? `${value.substring(0, 45)}…` : value;
          },
        },
      },
      yAxis: {
        min: 0,
        title: { text: undefined },
        gridLineColor: strongGrid,
        labels: {
          style: {
            color: mutedForeground,
            fontSize: "10px",
          },
          formatter: function (this: any): string {
            const minutes = typeof this.value === "number" ? this.value : Number(this.value) || 0;
            const hours = minutes / 60;
            return `${hourFormatter.format(hours)}h`;
          },
        },
      },
      tooltip: {
        useHTML: true,
        formatter: function (this: any): string {
          const index = this.point?.index ?? 0;
          const item = monthlyTaskRanking[index];
          if (!item) return "";
          return `<span style="font-size:11px">${item.label}</span><br/><b>${formatMinutesAsHoursLabel(item.minutes)}</b>`;
        },
      },
      plotOptions: {
        series: {
          animation: false,
        },
        bar: {
          borderWidth: 0,
          borderRadius: 4,
          pointPadding: 0.08,
          groupPadding: 0.12,
          dataLabels: {
            enabled: true,
            crop: false,
            overflow: "none",
            style: {
              color: mutedForeground,
              textOutline: "none",
              fontSize: "10px",
            },
            formatter: function (this: any): string {
              const minutes = typeof this.y === "number" ? this.y : 0;
              return formatMinutesAsHoursLabel(minutes);
            },
          },
        },
      },
      accessibility: {
        enabled: true,
        description: t("analytics.monthlyTaskRanking"),
      },
      series: [
        {
          type: "bar",
          data: monthlyTaskRanking.map((item) => item.minutes),
          color: taskColor,
        },
      ],
    } as const;
  }, [locale, monthlyTaskRanking, t]);

  const monthlyProjectRankingChartOptions = useMemo(() => {
    const mutedForeground = readRootColorVar("--muted-foreground", "#c6c6cd");
    const border = readRootColorVar("--border", "rgba(69, 70, 77, 0.2)");
    const strongGrid = readRootColorVar("--input", "rgba(69, 70, 77, 0.3)");
    const projectColor = readRootColorVar("--chart-3", "#79C879");
    const hourFormatter = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    });

    return {
      chart: {
        type: "bar",
        backgroundColor: "transparent",
        spacing: [8, 4, 4, 4],
        animation: false,
        style: {
          fontFamily: "var(--font-sans, inherit)",
        },
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories: monthlyProjectRanking.map((item) => item.label),
        lineColor: border,
        tickLength: 0,
        labels: {
          style: {
            color: mutedForeground,
            fontSize: "11px",
          },
          formatter: function (this: any): string {
            const value = String(this.value ?? "");
            return value.length > 28 ? `${value.substring(0, 28)}…` : value;
          },
        },
      },
      yAxis: {
        min: 0,
        title: { text: undefined },
        gridLineColor: strongGrid,
        labels: {
          style: {
            color: mutedForeground,
            fontSize: "10px",
          },
          formatter: function (this: any): string {
            const minutes = typeof this.value === "number" ? this.value : Number(this.value) || 0;
            const hours = minutes / 60;
            return `${hourFormatter.format(hours)}h`;
          },
        },
      },
      tooltip: {
        useHTML: true,
        formatter: function (this: any): string {
          const index = this.point?.index ?? 0;
          const item = monthlyProjectRanking[index];
          if (!item) return "";
          return `<span style="font-size:11px">${item.label}</span><br/><b>${formatMinutesAsHoursLabel(item.minutes)}</b>`;
        },
      },
      plotOptions: {
        series: {
          animation: false,
        },
        bar: {
          borderWidth: 0,
          borderRadius: 4,
          pointPadding: 0.08,
          groupPadding: 0.12,
          dataLabels: {
            enabled: true,
            crop: false,
            overflow: "none",
            style: {
              color: mutedForeground,
              textOutline: "none",
              fontSize: "10px",
            },
            formatter: function (this: any): string {
              const minutes = typeof this.y === "number" ? this.y : 0;
              return formatMinutesAsHoursLabel(minutes);
            },
          },
        },
      },
      accessibility: {
        enabled: true,
        description: t("analytics.monthlyProjectRanking"),
      },
      series: [
        {
          type: "bar",
          data: monthlyProjectRanking.map((item) => item.minutes),
          color: projectColor,
        },
      ],
    } as const;
  }, [locale, monthlyProjectRanking, t]);

  const timelineRange = useMemo(() => {
    if (selectedDaySessions.length === 0) {
      return { startMinutes: 8 * 60, endMinutes: 17 * 60 };
    }

    let minMinutes = 8 * 60;
    let maxMinutes = 17 * 60;

    selectedDaySessions.forEach((session) => {
      const start = parseTimeToMinutes(session.startedAt);
      const end = resolveEndMinutes(start, session.stoppedAt);
      minMinutes = Math.min(minMinutes, start);
      maxMinutes = Math.max(maxMinutes, end);
    });

    const snappedStart = Math.floor(minMinutes / 60) * 60;
    const snappedEnd = Math.ceil(maxMinutes / 60) * 60;

    if (snappedEnd - snappedStart < 8 * 60) {
      return { startMinutes: snappedStart, endMinutes: snappedStart + 8 * 60 };
    }

    return { startMinutes: snappedStart, endMinutes: snappedEnd };
  }, [selectedDaySessions]);

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let minute = timelineRange.startMinutes; minute <= timelineRange.endMinutes; minute += 60) {
      ticks.push(minute);
    }
    return ticks;
  }, [timelineRange.endMinutes, timelineRange.startMinutes]);

  const hourTickMarkers = useMemo(() => {
    const totalRange = timelineRange.endMinutes - timelineRange.startMinutes || 1;

    return hourTicks.map((tick, index) => {
      const ratio = (tick - timelineRange.startMinutes) / totalRange;
      const left = Math.max(0, Math.min(100, ratio * 100));
      const alignClass = index === 0
        ? "left-0 translate-x-0"
        : index === hourTicks.length - 1
          ? "left-full -translate-x-full"
          : "-translate-x-1/2";

      return {
        key: `tick-${tick}`,
        lineKey: `tick-line-${tick}`,
        left,
        alignClass,
        label: formatHourTick(tick),
      };
    });
  }, [hourTicks, timelineRange.endMinutes, timelineRange.startMinutes]);

  const projectColorMap = useMemo(() => {
    const allProjects = [
      ...new Set(filteredMonthSessions.map((session) => session.issue.project.name)),
    ];

    const colorMap = new Map<string, string>();
    allProjects.forEach((project, index) => {
      colorMap.set(project, getWeeklySeriesColor(index, allProjects.length));
    });

    return colorMap;
  }, [filteredMonthSessions]);

  const currentTimeMarker = useMemo(() => {
    const todayKey = toDateKey(new Date());
    if (effectiveSelectedDayKey !== todayKey) return null;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes < timelineRange.startMinutes || nowMinutes > timelineRange.endMinutes) {
      return null;
    }

    const ratio = (nowMinutes - timelineRange.startMinutes) / (timelineRange.endMinutes - timelineRange.startMinutes || 1);
    return `${Math.max(0, Math.min(100, ratio * 100))}%`;
  }, [effectiveSelectedDayKey, timelineRange.endMinutes, timelineRange.startMinutes]);

  const monthLabel = useMemo(() => {
    return activeMonth.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  }, [activeMonth, locale]);

  const isCurrentActiveMonth = useMemo(() => {
    const today = new Date();
    return (
      activeMonth.getFullYear() === today.getFullYear()
      && activeMonth.getMonth() === today.getMonth()
    );
  }, [activeMonth]);

  return (
    <section className="flex flex-col max-w-6xl mx-auto gap-4">
      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-container p-4 min-h-33">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{t("analytics.weeklyHours")}</div>
          <div className="min-h-18 flex flex-col justify-center">
            {isWeekLoading ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("analytics.loadingWeeklyHours")}
              </div>
            ) : (
              <>
                <div className="text-3xl font-semibold font-heading text-foreground">{formatHoursMinutes(weeklyTotalHours)}</div>
                <p className={`mt-2 text-xs ${weekDeltaHours >= 0 ? "text-tertiary" : "text-destructive"}`}>
                  {`${formatSignedHoursMinutes(weekDeltaHours)} ${t("analytics.vsLastWeek")}`}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-container p-4 min-h-33">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{t("analytics.mostActiveProject")}</div>
          <div className="min-h-18 flex flex-col justify-center">
            {isWeekLoading ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("analytics.loadingMostActiveProject")}
              </div>
            ) : mostActiveProject ? (
              <>
                <div className="text-xl font-semibold font-heading text-foreground truncate">{mostActiveProject.name}</div>
                <p className="mt-2 text-xs text-primary">
                  {formatHoursMinutes(mostActiveProject.hours)}
                  <span className="text-muted-foreground"> · {mostActiveProject.share.toFixed(0)}% {t("analytics.ofWeek")}</span>
                </p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">{t("analytics.noData")}</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-container p-4 min-h-33">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{t("analytics.monthlyCompletion")}</div>
          <div className="min-h-18 flex flex-col justify-center">
            {isMonthLoading ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("analytics.loadingMonthlyCompletion")}
              </div>
            ) : monthlyCompletion.isFutureMonth ? (
              <>
                <div className="text-3xl font-semibold font-heading text-foreground">--</div>
                <p className="mt-2 text-xs text-muted-foreground">{t("analytics.monthlyCompletionFuture")}</p>
              </>
            ) : monthlyCompletion.requiredWorkdays === 0 ? (
              <>
                <div className="text-3xl font-semibold font-heading text-foreground">--</div>
                <p className="mt-2 text-xs text-muted-foreground">{t("analytics.monthlyCompletionNoWorkday")}</p>
              </>
            ) : monthlyCompletion.missingMinutes <= 0 ? (
              <>
                <div className="text-3xl font-semibold font-heading text-tertiary">
                  {monthlyCompletion.overMinutes > 0
                    ? `${t("analytics.monthlyCompletionOk")} +${formatMinutesAsHoursLabel(monthlyCompletion.overMinutes)}`
                    : t("analytics.monthlyCompletionOk")}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {monthlyCompletion.overMinutes > 0
                    ? t("analytics.monthlyCompletionAboveTarget", {
                        value: formatMinutesAsHoursLabel(monthlyCompletion.overMinutes),
                      })
                    : isCurrentActiveMonth
                      ? t("analytics.monthlyCompletionOkHint")
                      : t("analytics.monthlyCompletionOkHintMonth")}
                </p>
              </>
            ) : (
              <>
                <div className="text-3xl font-semibold font-heading text-destructive">
                  {formatMinutesAsHoursLabel(monthlyCompletion.missingMinutes)}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isCurrentActiveMonth ? t("analytics.monthlyCompletionMissing") : t("analytics.monthlyCompletionMissingMonth")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:flex-1 xl:grid-cols-12 xl:min-h-96">
      <div className="relative rounded-xl border border-border bg-surface-container p-4 xl:col-span-5 xl:h-full min-h-0 overflow-hidden flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-tertiary" />
              <h3 className="text-3 font-semibold font-heading text-foreground">{t("analytics.activityCalendar")}</h3>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setActiveMonth((prev) => startOfMonth(addDays(prev, -1)))}
                aria-label={t("analytics.previousMonth")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-28 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {monthLabel}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setActiveMonth((prev) => startOfMonth(addDays(endOfMonth(prev), 1)))}
                aria-label={t("analytics.nextMonth")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
            {Array.from({ length: 7 }, (_, index) => {
              const reference = addDays(startOfWeek(new Date("2026-01-05T00:00:00")), index);
              const label = reference.toLocaleDateString(locale, { weekday: "narrow" });
              return <span key={index}>{label}</span>;
            })}
          </div>

          <div className="grid flex-1 min-h-0 auto-rows-fr grid-cols-7 gap-1 overflow-y-auto">
            {calendarCells.map((cell) => {
              const dayMinutes = monthDailyMinutes.get(cell.dateKey) ?? 0;
              const isSelected = cell.dateKey === effectiveSelectedDayKey;
              const isInSelectedWeek = cell.dateKey >= weekRanges.thisWeekFrom && cell.dateKey <= weekRanges.thisWeekTo;
              const dayOverride = workdayOverrides[cell.dateKey] ?? null;
              const isForcedWorking = dayOverride === "working";
              const isForcedOff = dayOverride === "off";
              const isHoliday = frenchHolidayKeys.has(cell.dateKey);
              const isWeekendDay = isWeekend(cell.date);
              const defaultWorkingDay = !isWeekendDay && !isHoliday;
              const isWorkingDay = isForcedWorking ? true : isForcedOff ? false : defaultWorkingDay;
              const isWithinDailyTarget =
                isWorkingDay
                && dayMinutes >= minimumDailyMinutes
                && dayMinutes <= targetDailyMinutes + targetDailyToleranceMinutes;
              const isOverDailyTarget =
                isWorkingDay && dayMinutes > targetDailyMinutes + targetDailyToleranceMinutes;
              const dayMinutesColorClass = isWithinDailyTarget
                ? "text-tertiary"
                : isOverDailyTarget
                  ? "text-[#8b5cf6]"
                  : "text-chart-4";
              const holidayNameKey = frenchHolidayNamesByDate.get(cell.dateKey);
              const holidayName = holidayNameKey ? t(`analytics.holidayNames.${holidayNameKey}`) : "";
              const dayLabel = cell.date.toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              });
              const holidayLabel = holidayName
                ? `${t("analytics.publicHoliday")}: ${holidayName}`
                : t("analytics.publicHoliday");
              const specialLabel = isForcedWorking
                ? t("analytics.dayStatusWorking")
                : isForcedOff
                  ? t("analytics.dayStatusNonWorking")
                  : isHoliday
                    ? holidayLabel
                    : isWeekendDay
                      ? t("analytics.weekend")
                      : "";
              const cellTitle = specialLabel ? `${dayLabel} - ${specialLabel}` : dayLabel;

              const overrideClass = isForcedWorking
                ? cell.inCurrentMonth
                  ? "border-tertiary/35 bg-tertiary/10 hover:bg-tertiary/15"
                  : "border-tertiary/22 bg-tertiary/5 text-muted-foreground/70 hover:bg-tertiary/10"
                : isForcedOff
                  ? cell.inCurrentMonth
                    ? "border-chart-5/40 bg-chart-5/15 hover:bg-chart-5/20"
                    : "border-chart-5/22 bg-chart-5/6 text-muted-foreground/70 hover:bg-chart-5/10"
                  : null;

              const specialClass = isHoliday
                ? cell.inCurrentMonth
                  ? "border-chart-4/25 bg-chart-4/7 hover:bg-chart-4/10"
                  : "border-chart-4/16 bg-chart-4/4 text-muted-foreground/70 hover:bg-chart-4/7"
                : isWeekendDay
                  ? cell.inCurrentMonth
                    ? "border-primary/22 bg-primary/6 hover:bg-primary/9"
                    : "border-primary/14 bg-primary/4 text-muted-foreground/70 hover:bg-primary/7"
                  : null;

              const selectedWeekClass = isForcedWorking
                ? "border-tertiary/45 bg-tertiary/16 hover:bg-tertiary/22"
                : isForcedOff
                  ? "border-chart-5/45 bg-chart-5/18 hover:bg-chart-5/24"
                  : isHoliday
                    ? "border-chart-4/30 bg-chart-4/10 hover:bg-chart-4/14"
                    : isWeekendDay
                      ? "border-primary/26 bg-primary/10 hover:bg-primary/13"
                      : cell.inCurrentMonth
                        ? "border-tertiary/35 bg-tertiary/10 hover:bg-tertiary/15"
                        : "border-tertiary/25 bg-tertiary/5 hover:bg-tertiary/10";

              const calendarDayButton = (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => {
                    setSelectedDayKey(cell.dateKey);
                    setCalendarContextMenu(null);
                    if (!cell.inCurrentMonth) {
                      setActiveMonth(startOfMonth(cell.date));
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSelectedDayKey(cell.dateKey);

                    const menuWidth = 260;
                    const menuHeight = 190;
                    const margin = 8;
                    const maxX = Math.max(margin, window.innerWidth - menuWidth - margin);
                    const maxY = Math.max(margin, window.innerHeight - menuHeight - margin);

                    setCalendarContextMenu({
                      dateKey: cell.dateKey,
                      x: Math.max(margin, Math.min(event.clientX, maxX)),
                      y: Math.max(margin, Math.min(event.clientY, maxY)),
                    });
                  }}
                  title={cellTitle}
                  aria-label={cellTitle}
                  className={`flex h-full min-h-8 flex-col rounded-md border px-1.5 py-1 text-left transition-colors ${
                    isSelected
                      ? "border-tertiary bg-tertiary/15"
                      : isInSelectedWeek
                        ? selectedWeekClass
                        : overrideClass
                          ? overrideClass
                          : specialClass
                            ? specialClass
                            : cell.inCurrentMonth
                              ? "border-border bg-surface-low hover:bg-surface-high"
                              : "border-border/25 bg-surface-low/40 text-muted-foreground/65 hover:bg-surface-low/55"
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <div
                      className={`text-[10px] font-semibold ${
                        isForcedWorking
                          ? "text-tertiary/90"
                          : isForcedOff
                            ? "text-chart-5"
                            : isHoliday
                          ? "text-chart-4/85"
                          : isWeekendDay
                            ? "text-primary/85"
                            : ""
                      }`}
                    >
                      {cell.date.getDate()}
                    </div>
                    {isHoliday && cell.inCurrentMonth && (
                      <div className="mt-0.5 max-w-full truncate text-[9px] leading-tight text-muted-foreground/75">{holidayName}</div>
                    )}
                  </div>
                  {dayMinutes > 0 && (
                    <div className={`mt-auto text-[10px] ${dayMinutesColorClass}`}>
                      {formatMinutesClock(dayMinutes)}
                    </div>
                  )}
                </button>
              );

              if (isHoliday) {
                return (
                  <Tooltip key={cell.dateKey}>
                    <TooltipTrigger asChild>{calendarDayButton}</TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {holidayName}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return calendarDayButton;
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-tertiary" />
              {t("analytics.goalReached")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
              {t("analytics.goalExceeded")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-chart-4" />
              {t("analytics.incomplete")}
            </span>
          </div>

          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("analytics.dailyGoal")} : {formatMinutesAsHoursLabel(targetDailyMinutes)}
            {targetDailyToleranceMinutes > 0 ? ` ± ${targetDailyToleranceMinutes} min` : ""}
          </p>

          {isMonthLoading && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface-container/50 backdrop-blur-[1px]">
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("analytics.loadingCalendar")}
              </div>
            </div>
          )}
        </div>

        <div className="relative rounded-xl border border-border bg-surface-container p-4 xl:col-span-7 xl:h-full min-h-0 overflow-hidden flex flex-col">
          <h3 className="text-3 font-semibold font-heading text-foreground">{t("analytics.weeklyActivity")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{t("analytics.weeklyActivitySubtitle")}</p>

          <div className="min-h-0 flex-1 border-y border-border/60 py-3">
            {hasWeeklyActivityData ? (
              <Chart
                options={weeklyChartOptions as any}
                containerProps={{
                  className: "h-full w-full",
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {!isWeekLoading && t("analytics.noData")}
              </div>
            )}
          </div>

          <div
            className={`mt-4 flex items-center pb-1 text-xs ${
              shouldWrapWeeklyProjectsLegend
                ? "flex-wrap gap-x-4 gap-y-2"
                : "flex-nowrap gap-4 overflow-x-auto"
            }`}
          >
            {weeklyStackData.projects.map((project, index) => (
              <div
                key={project}
                className={`flex items-center gap-1.5 text-muted-foreground transition-opacity ${
                  hoveredLegendProject && hoveredLegendProject !== project ? "opacity-40" : "opacity-100"
                }`}
                onMouseEnter={(event) => {
                  setHoveredLegendProject(project);
                  setLegendHoverPosition({
                    x: event.clientX + 14,
                    y: event.clientY + 14,
                  });
                }}
                onMouseMove={(event) => {
                  setLegendHoverPosition({
                    x: event.clientX + 14,
                    y: event.clientY + 14,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredLegendProject(null);
                  setLegendHoverPosition(null);
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: weeklyProjectColorMap.get(project) ?? getWeeklySeriesColor(index, weeklyStackData.projects.length) }}
                />
                <span>{project}</span>
              </div>
            ))}

            {hoveredLegendProject && legendHoverPosition && (
              <div
                className="pointer-events-none fixed z-40 rounded-md border border-border bg-background/95 px-2.5 py-1.5 text-[11px] text-foreground shadow-sm"
                style={{
                  left: `${legendHoverPosition.x}px`,
                  top: `${legendHoverPosition.y}px`,
                }}
              >
                {t("analytics.weeklyProjectTotal", {
                  value: formatMinutesAsHoursLabel(weeklyProjectMinutesMap.get(hoveredLegendProject) ?? 0),
                })}
              </div>
            )}
          </div>

          {isWeekLoading && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface-container/50 backdrop-blur-[1px]">
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("analytics.loadingWeeklyActivity")}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative shrink-0 rounded-xl border border-border bg-surface-container p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-3 font-semibold font-heading text-foreground">{t("analytics.dayTimeline")}</h3>
            <p className="text-xs text-muted-foreground">
              {selectedDate.toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {selectedDayTotalMinutes > 0 ? ` · ${formatMinutesClock(selectedDayTotalMinutes)}` : ""}
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const now = new Date();
              setManualIssue(null);
              setManualAnchorTime(now);
              setManualModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("analytics.newEntry")}
          </Button>
        </div>

        <div className="relative mb-2 h-4 text-[10px] font-medium text-muted-foreground">
          {hourTickMarkers.map((marker) => (
            <span
              key={marker.key}
              className={`absolute top-0 whitespace-nowrap transform ${marker.alignClass}`}
              style={{ left: `${marker.left}%` }}
            >
              {marker.label}
            </span>
          ))}
        </div>

        <div
          className="relative overflow-hidden rounded-lg border border-border/60 bg-surface-low/70"
          style={{ height: `${timelineLayoutMetrics.containerHeight}px` }}
        >
          <div className="pointer-events-none absolute inset-0 z-0">
            {hourTickMarkers.map((marker) => (
              <div
                key={marker.lineKey}
                  className="absolute top-0 bottom-0 w-px bg-border/70"
                style={{ left: `${marker.left}%` }}
              />
            ))}
          </div>

          {selectedDaySessions.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {!isMonthLoading && t("analytics.noEntriesForDay")}
            </div>
          ) : (
            timelineLaneLayout.items.map((item) => {
              const { session, start, end, lane } = item;
              const totalRange = timelineRange.endMinutes - timelineRange.startMinutes || 1;
              const rawLeft = ((start - timelineRange.startMinutes) / totalRange) * 100;
              const rawWidth = ((end - start) / totalRange) * 100;
              const left = Math.max(0, Math.min(100, rawLeft));
              const width = Math.max(0, Math.min(100 - left, rawWidth));
              const projectColor = projectColorMap.get(session.issue.project.name) ?? WEEK_CHART_FALLBACK_COLORS[0];
              const top = timelineLayoutMetrics.isStacked
                ? timelineLayoutMetrics.verticalPadding + lane * (timelineLayoutMetrics.laneHeight + timelineLayoutMetrics.laneGap)
                : undefined;
              const height = timelineLayoutMetrics.isStacked ? timelineLayoutMetrics.laneHeight : undefined;

              return (
                <Tooltip key={session.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                        className={`absolute z-10 overflow-hidden rounded-md border px-2 py-1 text-left ${timelineLayoutMetrics.isStacked ? "text-[10px]" : "top-2 bottom-2 text-xs"}`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: projectColor,
                        borderColor: projectColor,
                        color: "#1f2937",
                        ...(timelineLayoutMetrics.isStacked
                          ? {
                              top: `${top}px`,
                              height: `${height}px`,
                            }
                          : {}),
                      }}
                      onClick={() => {
                        if (!session.redmineEntryId) return;
                        setEditingTimelineSession(session);
                        setEditModalOpen(true);
                      }}
                      disabled={!session.redmineEntryId}
                      aria-label={`${session.issue.project.name} #${session.issue.id}`}
                    >
                      <p className="truncate text-[10px] font-semibold uppercase tracking-wide">{session.issue.project.name}</p>
                      {timelineLayoutMetrics.isStacked ? (
                        <p className="truncate text-[10px] opacity-80">{formatHoursMinutes(session.hours)}</p>
                      ) : (
                        <>
                          <p className="truncate text-[11px]">#{session.issue.id} · {session.issue.subject}</p>
                          <p className="text-[10px] opacity-80">{formatHoursMinutes(session.hours)}</p>
                        </>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm text-xs">
                    <div className="space-y-0.5">
                      <p className="font-semibold">{session.issue.project.name}</p>
                      <p>#{session.issue.id} · {session.issue.subject}</p>
                      <p>
                        {session.startedAt} - {session.stoppedAt} · {formatHoursMinutes(session.hours)}
                      </p>
                      {session.comments.trim() && <p className="text-muted-foreground">{session.comments}</p>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })
          )}

          {currentTimeMarker && (
            <div className="pointer-events-none absolute top-1 bottom-1 w-px bg-tertiary" style={{ left: currentTimeMarker }}>
              <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-tertiary" />
            </div>
          )}
        </div>

        {isMonthLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-surface-container/55 backdrop-blur-[1px]">
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("analytics.loadingTimeline")}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="relative rounded-xl border border-border bg-surface-container p-4 min-h-80">
          <h3 className="text-3 font-semibold font-heading text-foreground">{t("analytics.monthlyTaskRanking")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{t("analytics.monthlyTaskRankingSubtitle")}</p>

          <div className="h-64">
            {isMonthLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2">{t("analytics.loading")}</span>
              </div>
            ) : monthlyTaskRanking.length > 0 ? (
              <Chart
                options={monthlyTaskRankingChartOptions as any}
                containerProps={{
                  className: "h-full w-full",
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t("analytics.noData")}
              </div>
            )}
          </div>
        </div>

        <div className="relative rounded-xl border border-border bg-surface-container p-4 min-h-80">
          <h3 className="text-3 font-semibold font-heading text-foreground">{t("analytics.monthlyProjectRanking")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">{t("analytics.monthlyProjectRankingSubtitle")}</p>

          <div className="h-64">
            {isMonthLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2">{t("analytics.loading")}</span>
              </div>
            ) : monthlyProjectRanking.length > 0 ? (
              <Chart
                options={monthlyProjectRankingChartOptions as any}
                containerProps={{
                  className: "h-full w-full",
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t("analytics.noData")}
              </div>
            )}
          </div>
        </div>
      </div>

      {calendarContextMenu && calendarContextMenuDate && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setCalendarContextMenu(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className="absolute w-64 rounded-lg border border-border bg-background p-2 shadow-lg"
            style={{
              left: `${calendarContextMenu.x}px`,
              top: `${calendarContextMenu.y}px`,
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="px-2 pb-2">
              <p className="text-xs font-semibold text-foreground">
                {calendarContextMenuDate.toLocaleDateString(locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("analytics.dayStatusMenuTitle")}: {contextMenuDayStatus.isWorkingDay ? t("analytics.dayStatusWorking") : t("analytics.dayStatusNonWorking")}
              </p>
            </div>

            <div className="h-px bg-border" />

            <button
              type="button"
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-high"
              onClick={() => applyWorkdayOverride(calendarContextMenu.dateKey, "working")}
            >
              {t("analytics.markAsWorkingDay")}
            </button>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-high"
              onClick={() => applyWorkdayOverride(calendarContextMenu.dateKey, "off")}
            >
              {t("analytics.markAsNonWorkingDay")}
            </button>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-surface-high disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => applyWorkdayOverride(calendarContextMenu.dateKey, null)}
              disabled={!contextMenuDayStatus.override}
            >
              {t("analytics.resetDayStatus")}
            </button>
          </div>
        </div>
      )}

      {manualModalOpen && (
        <TimeEntryModal
          mode="create"
          open={manualModalOpen}
          onClose={() => {
            setManualModalOpen(false);
            setManualIssue(null);
          }}
          onSaved={(issue, _loggedIssue, _entryId, _hours, _activityId, _comments, spentOn) => {
            setManualModalOpen(false);
            setManualIssue(issue);
            setSelectedDayKey(spentOn);

            const savedDate = new Date(`${spentOn}T00:00:00`);
            if (!Number.isNaN(savedDate.getTime())) {
              const savedMonth = startOfMonth(savedDate);
              if (
                savedMonth.getMonth() !== activeMonth.getMonth()
                || savedMonth.getFullYear() !== activeMonth.getFullYear()
              ) {
                setActiveMonth(savedMonth);
              }
            }

            setRefreshNonce((current) => current + 1);
          }}
          issue={manualIssue}
          initialSpentOn={effectiveSelectedDayKey}
          elapsedSeconds={0}
          startedAt={formatHHMM(manualAnchorTime)}
          stoppedAt={formatHHMM(manualAnchorTime)}
        />
      )}

      {editingTimelineSession && (
        <TimeEntryModal
          mode="edit"
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditingTimelineSession(null);
          }}
          onSaved={() => {
            setEditModalOpen(false);
            setEditingTimelineSession(null);
            setRefreshNonce((current) => current + 1);
          }}
          onDeleted={() => {
            setEditModalOpen(false);
            setEditingTimelineSession(null);
            setRefreshNonce((current) => current + 1);
          }}
          issue={editingTimelineSession.issue}
          session={editingTimelineSession}
        />
      )}

    </section>
  );
}
