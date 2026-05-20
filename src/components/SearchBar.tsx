import { useState, useRef, useEffect, useCallback, useId } from "react";
import { useTranslation } from "react-i18next";
import { Search, Loader2, AlertCircle } from "lucide-react";
import { useIssueStore } from "@/store";
import { searchIssues } from "@/lib/redmine";
import { SearchResultItem } from "./SearchResultItem";
import type { RedmineIssue, IssueSearchResult } from "@/types";

const DEBOUNCE_MS = 350;

interface SearchBarProps {
  onManualEntry?: (issue: RedmineIssue) => void;
  onMatchedCommentSelected?: (comment: string, issueId: number) => void;
  onIssueSelected?: (issue: RedmineIssue, matchedComment?: string) => void;
}

export function SearchBar({ onManualEntry, onMatchedCommentSelected, onIssueSelected }: SearchBarProps) {
  const { t } = useTranslation();
  const { searchQuery, setSearchQuery, setSelectedIssue } = useIssueStore();
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<IssueSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  const getOptionId = useCallback((issueId: number, index: number) => {
    return `search-result-${issueId}-${index}`;
  }, []);

  const searchRedmine = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const issues = await searchIssues(query);
      setResults(issues);
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      setError(msg);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handleQueryChange(value: string) {
    setSearchQuery(value);
    setIsOpen(true);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchRedmine(value);
    }, DEBOUNCE_MS);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSelect(issue: RedmineIssue, matchedCommentFullText?: string) {
    const matchedComment = matchedCommentFullText?.trim();
    if (matchedComment) {
      onMatchedCommentSelected?.(matchedComment, issue.id);
    }

    if (onIssueSelected) {
      onIssueSelected(issue, matchedComment);
    } else {
      setSelectedIssue(issue);
    }
    setSearchQuery("");
    setResults([]);
    setActiveIndex(-1);
    setIsOpen(false);
  }

  function handleManualEntry(issue: RedmineIssue) {
    onManualEntry?.(issue);
    setSearchQuery("");
    setResults([]);
    setActiveIndex(-1);
    setIsOpen(false);
  }

  useEffect(() => {
    if (results.length === 0) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex((current) => {
      if (current < 0) return 0;
      return Math.min(current, results.length - 1);
    });
  }, [results]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0 || activeIndex >= results.length) return;
    const optionId = getOptionId(results[activeIndex].issue.id, activeIndex);
    const option = document.getElementById(optionId);
    option?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, getOptionId, isOpen, results]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp") && results.length > 0) {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex(e.key === "ArrowDown" ? 0 : results.length - 1);
      return;
    }

    if (!isOpen || results.length === 0) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < results.length) {
        e.preventDefault();
        handleSelect(results[activeIndex].issue, results[activeIndex].matchedCommentFullText);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  const showDropdown = isOpen && (isLoading || Boolean(error) || results.length > 0 || searchQuery.trim().length > 0);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        {isLoading ? (
          <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
        ) : (
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        )}
        <input
          type="text"
          placeholder={t("search.placeholder")}
          autoCorrect="off"
          value={searchQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => { if (searchQuery.trim()) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={
            showDropdown && activeIndex >= 0 && activeIndex < results.length
              ? getOptionId(results[activeIndex].issue.id, activeIndex)
              : undefined
          }
          className="w-full h-12 pl-12 pr-4 rounded-xl bg-surface-high border border-border text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-colors"
        />
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-surface-container border border-border shadow-xl overflow-hidden z-40 max-h-80 overflow-y-auto"
        >
          {isLoading && results.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("search.searching")}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isLoading && !error && results.length === 0 && searchQuery.trim().length > 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("search.noResults", { query: searchQuery })}
            </div>
          )}

          {results.map((issue, index) => (
            <SearchResultItem
              key={issue.issue.id}
              id={getOptionId(issue.issue.id, index)}
              issue={issue.issue}
              searchQuery={searchQuery}
              matchedCommentSnippet={issue.matchedCommentSnippet}
              matchedCommentFullText={issue.matchedCommentFullText}
              isActive={index === activeIndex}
              onSelect={handleSelect}
              onManualEntry={onManualEntry ? handleManualEntry : undefined}
              onHover={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
