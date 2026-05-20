import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clock3 } from "lucide-react";
import type { RedmineIssue } from "@/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const COMPACT_RESULT_WIDTH_PX = 620;

interface SearchResultItemProps {
  id: string;
  issue: RedmineIssue;
  searchQuery?: string;
  matchedCommentSnippet?: string;
  matchedCommentFullText?: string;
  isActive?: boolean;
  showProgress?: boolean;
  onSelect: (issue: RedmineIssue, matchedCommentFullText?: string) => void;
  onManualEntry?: (issue: RedmineIssue) => void;
  onHover?: () => void;
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHighlightTerms(searchQuery?: string): string[] {
  if (!searchQuery) return [];

  const normalized = searchQuery.trim().replace(/^#/, "");
  if (!normalized) return [];

  return Array.from(new Set(normalized.split(/\s+/).filter(Boolean)))
    .sort((a, b) => b.length - a.length);
}

function renderHighlightedText(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;

  const regex = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(regex);
  const lowerTerms = new Set(terms.map((term) => term.toLowerCase()));

  return parts.map((part, index) => {
    if (!part) return null;

    if (lowerTerms.has(part.toLowerCase())) {
      return (
        <span key={`${part}-${index}`} className="rounded-sm bg-primary/20 text-foreground px-0.5">
          {part}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function TruncatedText({
  text,
  searchQuery,
  tooltipText,
  className,
  tooltipClassName,
}: {
  text: string;
  searchQuery?: string;
  tooltipText?: string;
  className?: string;
  tooltipClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const highlightTerms = getHighlightTerms(searchQuery);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  useEffect(() => {
    check();
    const observer = new ResizeObserver(check);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [check, text]);

  const truncatedNode = (
    <span ref={ref} className={`block max-w-full truncate ${className ?? ""}`}>
      {renderHighlightedText(text, highlightTerms)}
    </span>
  );

  const shouldShowTooltip = isTruncated || (tooltipText != null && tooltipText !== text);

  if (!shouldShowTooltip) return truncatedNode;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{truncatedNode}</TooltipTrigger>
      <TooltipContent className={tooltipClassName ?? "max-w-sm break-words"}>{tooltipText ?? text}</TooltipContent>
    </Tooltip>
  );
}

export function SearchResultItem({
  id,
  issue,
  searchQuery,
  matchedCommentSnippet,
  matchedCommentFullText,
  isActive = false,
  showProgress = true,
  onSelect,
  onManualEntry,
  onHover,
}: SearchResultItemProps) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  const highlightTerms = useMemo(() => getHighlightTerms(searchQuery), [searchQuery]);

  const checkCompact = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setIsCompact(el.clientWidth < COMPACT_RESULT_WIDTH_PX);
  }, []);

  useEffect(() => {
    checkCompact();
    const observer = new ResizeObserver(checkCompact);
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, [checkCompact]);

  const estimated = issue.estimated_hours ?? 0;
  const spent = issue.spent_hours ?? 0;
  const isOver = estimated > 0 && spent > estimated;
  const estimatedPct = isOver
    ? (estimated / spent) * 100
    : (estimated > 0 ? Math.min((spent / estimated) * 100, 100) : 0);
  const overPct = isOver ? ((spent - estimated) / spent) * 100 : 0;

  return (
    <div
      ref={rowRef}
      id={id}
      role="option"
      aria-selected={isActive}
      className={`w-full flex gap-3 px-4 py-3 transition-colors text-left cursor-pointer ${isCompact ? "items-start" : "items-center"} ${isActive ? "bg-surface-high" : "hover:bg-surface-high"}`}
      onClick={() => onSelect(issue, matchedCommentFullText)}
      onMouseEnter={onHover}
    >
      <div className={`flex min-w-0 flex-1 overflow-hidden ${isCompact ? "flex-col gap-1" : "flex-row items-center gap-3"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
            #{renderHighlightedText(String(issue.id), highlightTerms)}
          </span>

          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide bg-surface-highest px-2 py-0.5 rounded truncate max-w-[180px]">
            {renderHighlightedText(issue.project.name, highlightTerms)}
          </span>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <TruncatedText text={issue.subject} searchQuery={searchQuery} className="text-sm text-foreground" />
          {matchedCommentSnippet && (
            <TruncatedText
              text={matchedCommentSnippet}
              searchQuery={searchQuery}
              tooltipText={matchedCommentFullText}
              className="mt-1 text-xs text-muted-foreground"
              tooltipClassName="max-w-md break-words whitespace-pre-wrap"
            />
          )}
        </div>
      </div>

      {showProgress && !isCompact && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 h-1.5 rounded-full bg-surface-highest overflow-hidden flex">
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
                className="h-full rounded-full bg-tertiary transition-all duration-500"
                style={{ width: `${estimatedPct}%` }}
              />
            )}
          </div>
          <span className={`text-xs tabular-nums whitespace-nowrap ${estimated === 0 || isOver ? "text-destructive" : "text-muted-foreground"}`}>
            {formatHoursMinutes(spent)} / {estimated > 0 ? formatHoursMinutes(estimated) : t("searchResult.noEstimateShort")}
          </span>
        </div>
      )}

      {onManualEntry && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-highest"
              onClick={(event) => {
                event.stopPropagation();
                onManualEntry(issue);
              }}
            >
              <Clock3 className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("searchResult.manualEntry")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
