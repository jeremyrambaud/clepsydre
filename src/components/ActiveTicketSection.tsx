import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Pause, Play, Square, Clock, ExternalLink, X, Pencil, CircleHelp, RotateCcw, Plus } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchBar } from "@/components/SearchBar";
import { useIssueStore, useSettingsStore } from "@/store";
import { useTimer } from "@/hooks/useTimer";
import { fetchIssueTodayLoggedHours } from "@/lib/redmine";
import type { RedmineIssue } from "@/types";

const COMMENT_EDITOR_SIZE_STORAGE_KEY = "clepsydre-draft-comment-editor-size";
const COMMENT_EDITOR_MIN_WIDTH = 280;
const COMMENT_EDITOR_MIN_HEIGHT = 210;
const COMMENT_EDITOR_DEFAULT_SIZE = { width: 320, height: 260 };

function normalizeCommentEditorSize(size: { width: number; height: number }): { width: number; height: number } {
  return {
    width: Math.max(COMMENT_EDITOR_MIN_WIDTH, Math.round(size.width)),
    height: Math.max(COMMENT_EDITOR_MIN_HEIGHT, Math.round(size.height)),
  };
}

function readStoredCommentEditorSize(): { width: number; height: number } {
  try {
    const raw = localStorage.getItem(COMMENT_EDITOR_SIZE_STORAGE_KEY);
    if (!raw) return COMMENT_EDITOR_DEFAULT_SIZE;

    const parsed = JSON.parse(raw) as Partial<{ width: number; height: number }>;
    return normalizeCommentEditorSize({
      width: parsed.width ?? COMMENT_EDITOR_DEFAULT_SIZE.width,
      height: parsed.height ?? COMMENT_EDITOR_DEFAULT_SIZE.height,
    });
  } catch {
    return COMMENT_EDITOR_DEFAULT_SIZE;
  }
}

function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
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
      <TooltipContent className="max-w-sm wrap-break-word">{title}</TooltipContent>
    </Tooltip>
  );
}

interface ActiveTicketSectionProps {
  timer: ReturnType<typeof useTimer>;
  onReset?: () => void;
  onStop?: () => void;
  onClearIssue?: () => void;
  onSwitchIssue?: (issue: RedmineIssue, matchedComment?: string) => void;
  billingIssue?: RedmineIssue | null;
  onBillingIssueChange?: (issue: RedmineIssue | null) => void;
  openBillingIssueDialogRequestToken?: number;
  onManualEntry?: () => void;
  commentDraft?: string;
  onCommentDraftChange?: (comment: string) => void;
}

function TruncatedDraftComment({ comment }: { comment: string }) {
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
  }, [check, comment]);

  const paragraph = (
    <p ref={ref} className="text-xs text-muted-foreground/90 line-clamp-4 whitespace-pre-line wrap-break-word italic">
      {comment}
    </p>
  );

  if (!isTruncated) return paragraph;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{paragraph}</TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-pre-wrap">{comment}</TooltipContent>
    </Tooltip>
  );
}

function limitText(value: string, maxChars: number): { text: string; wasTrimmedByChars: boolean } {
  if (value.length <= maxChars) {
    return { text: value, wasTrimmedByChars: false };
  }

  return {
    text: `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`,
    wasTrimmedByChars: true,
  };
}

function TruncatedInlineLabel({
  value,
  maxChars,
  className,
  tooltipClassName,
}: {
  value: string;
  maxChars: number;
  className?: string;
  tooltipClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const { text: displayValue, wasTrimmedByChars } = limitText(value, maxChars);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsOverflowing(el.scrollWidth > el.clientWidth);
  }, []);

  useEffect(() => {
    check();
    const observer = new ResizeObserver(check);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [check, value, displayValue]);

  const shouldShowTooltip = wasTrimmedByChars || isOverflowing;

  const content = (
    <span ref={ref} className={className}>
      {displayValue}
    </span>
  );

  if (!shouldShowTooltip) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className={tooltipClassName}>{value}</TooltipContent>
    </Tooltip>
  );
}

export function ActiveTicketSection({
  timer,
  onReset,
  onStop,
  onClearIssue,
  onSwitchIssue,
  billingIssue = null,
  onBillingIssueChange,
  openBillingIssueDialogRequestToken,
  onManualEntry,
  commentDraft = "",
  onCommentDraftChange,
}: ActiveTicketSectionProps) {
  const { t } = useTranslation();
  const selectedIssue = useIssueStore((s) => s.selectedIssue);
  const setSearchQuery = useIssueStore((s) => s.setSearchQuery);
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url);
  const [todayLoggedHours, setTodayLoggedHours] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isSwitchTicketOpen, setIsSwitchTicketOpen] = useState(false);
  const [isBillingIssueDialogOpen, setIsBillingIssueDialogOpen] = useState(false);
  const [isCommentEditorOpen, setIsCommentEditorOpen] = useState(false);
  const [commentEditorValue, setCommentEditorValue] = useState("");
  const [commentEditorSize, setCommentEditorSize] = useState<{ width: number; height: number }>(() => readStoredCommentEditorSize());
  const commentEditorContentRef = useRef<HTMLDivElement | null>(null);
  const lastBillingIssueDialogRequestTokenRef = useRef<number>(0);

  const trimmedDraftComment = commentDraft.trim();

  useEffect(() => {
    if (!isCommentEditorOpen) return;
    setCommentEditorValue(commentDraft);
  }, [commentDraft, isCommentEditorOpen]);

  useEffect(() => {
    if (!isCommentEditorOpen) return;
    setCommentEditorSize(readStoredCommentEditorSize());
  }, [isCommentEditorOpen]);

  const persistCommentEditorSize = useCallback((size: { width: number; height: number }) => {
    const normalized = normalizeCommentEditorSize(size);

    setCommentEditorSize((prev) => {
      if (prev.width === normalized.width && prev.height === normalized.height) {
        return prev;
      }

      return normalized;
    });

    localStorage.setItem(COMMENT_EDITOR_SIZE_STORAGE_KEY, JSON.stringify(normalized));
  }, []);

  const handleCommentEditorOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      const el = commentEditorContentRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width >= COMMENT_EDITOR_MIN_WIDTH && rect.height >= COMMENT_EDITOR_MIN_HEIGHT) {
          persistCommentEditorSize({ width: rect.width, height: rect.height });
        }
      }
    }

    setIsCommentEditorOpen(nextOpen);
  }, [persistCommentEditorSize]);

  useEffect(() => {
    if (!isCommentEditorOpen) return;

    const el = commentEditorContentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      // Ignore transient measurements while popover is being mounted/unmounted.
      if (
        entry.contentRect.width < COMMENT_EDITOR_MIN_WIDTH
        || entry.contentRect.height < COMMENT_EDITOR_MIN_HEIGHT
      ) {
        return;
      }

      const nextWidth = Math.max(COMMENT_EDITOR_MIN_WIDTH, Math.round(entry.contentRect.width));
      const nextHeight = Math.max(COMMENT_EDITOR_MIN_HEIGHT, Math.round(entry.contentRect.height));

      persistCommentEditorSize({ width: nextWidth, height: nextHeight });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isCommentEditorOpen, persistCommentEditorSize]);

  const handleResetWithConfirm = useCallback(() => {
    (onReset ?? timer.reset)();
    setCommentEditorValue("");
    setIsCommentEditorOpen(false);
    setConfirmReset(false);
  }, [onReset, timer]);

  const handleSaveDraftComment = useCallback(() => {
    onCommentDraftChange?.(commentEditorValue.trim());
    setIsCommentEditorOpen(false);
  }, [commentEditorValue, onCommentDraftChange]);

  const handleSwitchDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setSearchQuery("");
    }
    setIsSwitchTicketOpen(nextOpen);
  }, [setSearchQuery]);

  const handleSwitchTicketSelected = useCallback((issue: RedmineIssue, matchedComment?: string) => {
    if (issue.id === selectedIssue?.id) {
      handleSwitchDialogOpenChange(false);
      return;
    }

    onSwitchIssue?.(issue, matchedComment);
    handleSwitchDialogOpenChange(false);
  }, [handleSwitchDialogOpenChange, onSwitchIssue, selectedIssue?.id]);

  const handleBillingIssueDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setSearchQuery("");
    }
    setIsBillingIssueDialogOpen(nextOpen);
  }, [setSearchQuery]);

  const handleBillingIssueSelected = useCallback((issue: RedmineIssue) => {
    onBillingIssueChange?.(issue);
    handleBillingIssueDialogOpenChange(false);
  }, [handleBillingIssueDialogOpenChange, onBillingIssueChange]);

  useEffect(() => {
    if (!onBillingIssueChange || !selectedIssue) return;
    if (!openBillingIssueDialogRequestToken) return;
    if (openBillingIssueDialogRequestToken <= lastBillingIssueDialogRequestTokenRef.current) return;

    lastBillingIssueDialogRequestTokenRef.current = openBillingIssueDialogRequestToken;
    handleBillingIssueDialogOpenChange(true);
  }, [
    handleBillingIssueDialogOpenChange,
    onBillingIssueChange,
    openBillingIssueDialogRequestToken,
    selectedIssue,
  ]);

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
          {t("activeTicket.empty")}
        </p>
      </div>
    );
  }

  const todayHours = timer.elapsedSeconds / 3600;
  const todayTotalHours = todayLoggedHours + todayHours;
  const totalSpent = (selectedIssue.spent_hours ?? 0) + todayHours;
  const canChangeLoggedTicket = typeof onBillingIssueChange === "function";
  const logTargetIssue = billingIssue ?? selectedIssue;
  const isLoggingOnSelectedIssue = logTargetIssue.id === selectedIssue.id;

  const estimated = selectedIssue.estimated_hours ?? 0;
  const remaining = estimated > 0 ? estimated - totalSpent : 0;
  const isOver = estimated > 0 && totalSpent > estimated;
  const estimatedPct = isOver ? (estimated / totalSpent) * 100 : (estimated > 0 ? Math.min((totalSpent / estimated) * 100, 100) : 0);
  const overPct = isOver ? ((totalSpent - estimated) / totalSpent) * 100 : 0;

  return (
    <div className="rounded-xl bg-surface-container border-l-4 border-l-tertiary border border-border overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Ticket details (cols 1-6) */}
        <div className="lg:col-span-6 p-4 sm:p-6 border-b lg:border-b-0 lg:border-r border-border flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                #{selectedIssue.id}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-surface-highest px-2 py-0.5 rounded min-w-0">
                {selectedIssue.project.name}
              </span>
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
                  <TooltipContent>{t("activeTicket.openInRedmine")}</TooltipContent>
                </Tooltip>
                {onSwitchIssue && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 text-muted-foreground hover:text-foreground"
                        onClick={() => handleSwitchDialogOpenChange(true)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("activeTicket.switchTicket")}</TooltipContent>
                  </Tooltip>
                )}
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
                    <TooltipContent>{t("activeTicket.closeActiveTicket")}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <TruncatedIssueTitle title={selectedIssue.subject} />

          </div>

          <div className="mt-4 flex flex-1 min-h-0 flex-col gap-3">
            <div className="rounded-md border border-border bg-surface-low p-3 flex-1 min-h-[170px] flex flex-col">
              {canChangeLoggedTicket && (
                <div className="mb-2 flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase font-heading shrink-0">
                    {t("activeTicket.logOnLabel")}:
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs font-semibold text-muted-foreground bg-surface-highest px-2 py-0.5 rounded shrink-0">
                        #{logTargetIssue.id}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm wrap-break-word">
                      {logTargetIssue.project.name}
                    </TooltipContent>
                  </Tooltip>
                  <TruncatedInlineLabel
                    value={logTargetIssue.subject}
                    maxChars={64}
                    className={`text-xs min-w-0 flex-1 inline-block truncate ${isLoggingOnSelectedIssue ? "text-muted-foreground/85" : "text-foreground"}`}
                    tooltipClassName="max-w-sm wrap-break-word"
                  />
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => handleBillingIssueDialogOpenChange(true)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("activeTicket.logOnChange")}</TooltipContent>
                    </Tooltip>
                    {!isLoggingOnSelectedIssue && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => onBillingIssueChange?.(null)}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("activeTicket.logOnUseActive")}</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        >
                          <CircleHelp className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        {t("activeTicket.logOnIssueDescription")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 flex flex-col">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase font-heading">
                    {t("activeTicket.draftCommentLabel")}
                  </span>
                  {onCommentDraftChange && (
                    <Popover open={isCommentEditorOpen} onOpenChange={handleCommentEditorOpenChange}>
                      <Tooltip>
                        <PopoverTrigger asChild>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={trimmedDraftComment ? t("activeTicket.draftCommentEdit") : t("activeTicket.draftCommentAdd")}
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            >
                              {trimmedDraftComment ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            </Button>
                          </TooltipTrigger>
                        </PopoverTrigger>
                        <TooltipContent className="text-xs">
                          {trimmedDraftComment ? t("activeTicket.draftCommentEdit") : t("activeTicket.draftCommentAdd")}
                        </TooltipContent>
                      </Tooltip>
                      <PopoverContent
                        ref={commentEditorContentRef}
                        side="bottom"
                        align="start"
                        className="draft-comment-editor-resizable max-w-[calc(100vw-2rem)] p-3 resize overflow-auto min-w-[280px] min-h-[210px] flex flex-col"
                        style={{
                          width: `${commentEditorSize.width}px`,
                          height: `${commentEditorSize.height}px`,
                        }}
                      >
                        <p className="mb-2 text-sm font-medium">{t("activeTicket.draftCommentEditorTitle")}</p>
                        <div className="flex-1 min-h-0">
                          <textarea
                            rows={4}
                            value={commentEditorValue}
                            onChange={(event) => setCommentEditorValue(event.target.value)}
                            placeholder={t("activeTicket.draftCommentPlaceholder")}
                            className="w-full h-full min-h-[120px] rounded-md bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none outline-none"
                          />
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setIsCommentEditorOpen(false)}>
                            {t("timeEntry.discard")}
                          </Button>
                          <Button size="sm" onClick={handleSaveDraftComment}>
                            {t("timeEntry.confirm")}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                {trimmedDraftComment ? (
                  <TruncatedDraftComment comment={trimmedDraftComment} />
                ) : (
                  <p className="text-xs text-muted-foreground/80 italic">{t("activeTicket.draftCommentEmpty")}</p>
                )}
              </div>
            </div>

            {totalSpent > 0 && (
              <div>
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
              <div className="flex justify-between items-center mt-1.5 gap-2">
                <span className="text-xs text-muted-foreground">
                  {estimated > 0 ? `${formatHoursMinutes(estimated)} ${t("activeTicket.estimateShort")}` : t("activeTicket.noEstimate")}
                </span>
                <span className={`text-xs ${estimated === 0 || isOver ? "text-destructive" : "text-tertiary"}`}>
                  {(isOver || estimated === 0) && `${t("activeTicket.overByLabel", { value: formatHoursMinutes(totalSpent - estimated) })}`}
                  {estimated > 0 && !isOver && `${t("activeTicket.remainingLabel", { value: formatHoursMinutes(remaining) })}`}
                </span>
              </div>
              </div>
            )}
          </div>
        </div>

        {/* Timer display (cols 7-10) */}
        <div className="lg:col-span-4 p-4 sm:p-6 flex flex-col items-center justify-center">
          {timer.startTime && (
            <div className="flex items-center gap-1.5 mb-3 flex-wrap justify-center">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase font-heading">
                {t("activeTicket.startLabel")}
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
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>{t("activeTicket.resetTooltip")}</TooltipContent>
              </Tooltip>
              <PopoverContent side="top" align="center" className="w-auto p-3">
                <p className="text-sm font-medium mb-3">{t("activeTicket.resetConfirmTitle")}</p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleResetWithConfirm}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t("timeEntry.confirm")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                    {t("timeEntry.discard")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent>
                {timer.isRunning && !timer.isPaused
                  ? t("activeTicket.pauseTooltip")
                  : timer.isPaused
                    ? t("activeTicket.resumeTooltip")
                    : t("activeTicket.startTooltip")}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-error-bg/80 hover:bg-error-bg text-error-text"
                  onClick={onStop ?? timer.stop}
                  disabled={!timer.isRunning && !timer.isPaused}
                >
                  <Square className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("activeTicket.stopTooltip")}</TooltipContent>
            </Tooltip>
          </div>

          {onManualEntry && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={onManualEntry}
            >
              {t("activeTicket.manualEntry")}
            </Button>
          )}
        </div>

        {/* Totals panel (cols 11-12) */}
        <div className="lg:col-span-2 bg-surface-low p-3 sm:p-4 flex flex-row lg:flex-col justify-center gap-3 border-t lg:border-t-0 lg:border-l border-border">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase font-heading">
              {t("activeTicket.totals.redmine")}
            </span>
            <p className="text-lg sm:text-xl font-semibold font-heading text-foreground tabular-nums mt-1">
              {formatHoursMinutes(totalSpent)}
            </p>
          </div>

          <div className="w-px self-stretch bg-border lg:w-full lg:h-px" />

          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase font-heading">
              {t("activeTicket.totals.today")}
            </span>
            <p className="text-lg sm:text-xl font-semibold font-heading text-tertiary tabular-nums mt-1">
              {formatHoursMinutes(todayTotalHours)}
            </p>
          </div>
        </div>
      </div>

      <Dialog open={isSwitchTicketOpen} onOpenChange={handleSwitchDialogOpenChange}>
        <DialogContent className="bg-card border-border sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("activeTicket.switchTicketTitle")}</DialogTitle>
            <DialogDescription>{t("activeTicket.switchTicketDescription")}</DialogDescription>
          </DialogHeader>
          <div className="pt-1">
            <SearchBar onIssueSelected={handleSwitchTicketSelected} />
          </div>
        </DialogContent>
      </Dialog>

      {canChangeLoggedTicket && (
        <Dialog open={isBillingIssueDialogOpen} onOpenChange={handleBillingIssueDialogOpenChange}>
          <DialogContent className="bg-card border-border sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("activeTicket.logOnIssueTitle")}</DialogTitle>
              <DialogDescription>{t("activeTicket.logOnIssueDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-1">
              <SearchBar onIssueSelected={handleBillingIssueSelected} />
              {onBillingIssueChange && billingIssue && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => onBillingIssueChange?.(null)}>
                    {t("activeTicket.logOnUseActive")}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
