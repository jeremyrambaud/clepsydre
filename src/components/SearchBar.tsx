import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2, AlertCircle } from "lucide-react";
import { useIssueStore } from "@/store";
import { searchIssues } from "@/lib/redmine";
import { SearchResultItem } from "./SearchResultItem";
import type { RedmineIssue } from "@/types";

const DEBOUNCE_MS = 350;

export function SearchBar() {
  const { searchQuery, setSearchQuery, setSelectedIssue } = useIssueStore();
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<RedmineIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchRedmine(value);
    }, DEBOUNCE_MS);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSelect(issue: RedmineIssue) {
    setSelectedIssue(issue);
    setSearchQuery("");
    setResults([]);
    setIsOpen(false);
  }

  const showDropdown = isOpen && (isLoading || error || results.length > 0 || searchQuery.trim().length > 0);

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
          placeholder="Search tickets by ID, project, or title..."
          value={searchQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => { if (searchQuery.trim()) setIsOpen(true); }}
          className="w-full h-12 pl-12 pr-4 rounded-xl bg-surface-high border border-border text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-colors"
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-surface-container border border-border shadow-xl overflow-hidden z-40 max-h-80 overflow-y-auto">
          {isLoading && results.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching Redmine...
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
              No tickets found for "{searchQuery}"
            </div>
          )}

          {results.map((issue) => (
            <SearchResultItem key={issue.id} issue={issue} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
