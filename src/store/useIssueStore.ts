import { create } from "zustand";
import { fetchIssue, fetchRecentTimeEntries } from "@/lib/redmine";
import type { RedmineIssue, WorkSession } from "@/types";

const PAGE_SIZE = 10;

interface IssueState {
  issues: RedmineIssue[];
  recentSessions: WorkSession[];
  selectedIssue: RedmineIssue | null;
  searchQuery: string;
  isLoadingSessions: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalCount: number;
  setIssues: (issues: RedmineIssue[]) => void;
  setSelectedIssue: (issue: RedmineIssue | null) => void;
  addSession: (session: WorkSession) => void;
  updateSession: (sessionId: string, updates: Partial<WorkSession>) => void;
  removeSession: (sessionId: string) => void;
  setSearchQuery: (query: string) => void;
  refreshIssues: () => Promise<void>;
  loadSessions: () => Promise<void>;
  loadMoreSessions: () => Promise<void>;
}

export const useIssueStore = create<IssueState>((set, get) => ({
  issues: [],
  recentSessions: [],
  selectedIssue: null,
  searchQuery: "",
  isLoadingSessions: false,
  isLoadingMore: false,
  hasMore: false,
  totalCount: 0,

  setIssues: (issues) => set({ issues }),

  setSelectedIssue: (issue) => set({ selectedIssue: issue }),

  addSession: (session) =>
    set((state) => {
      const filtered = session.redmineEntryId
        ? state.recentSessions.filter((s) => s.redmineEntryId !== session.redmineEntryId)
        : state.recentSessions;
      return { recentSessions: [session, ...filtered] };
    }),

  updateSession: (sessionId, updates) =>
    set((state) => ({
      recentSessions: state.recentSessions.map((s) =>
        s.id === sessionId ? { ...s, ...updates } : s
      ),
    })),

  removeSession: (sessionId) =>
    set((state) => ({
      recentSessions: state.recentSessions.filter((s) => s.id !== sessionId),
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  refreshIssues: async () => {
    const { selectedIssue, recentSessions } = get();

    const idsToRefresh = new Set<number>();
    if (selectedIssue) idsToRefresh.add(selectedIssue.id);
    recentSessions.forEach((s) => idsToRefresh.add(s.issue.id));

    if (idsToRefresh.size === 0) return;

    const refreshed = await Promise.allSettled(
      [...idsToRefresh].map((id) => fetchIssue(id))
    );

    const updatedMap = new Map<number, RedmineIssue>();
    refreshed.forEach((result) => {
      if (result.status === "fulfilled") {
        updatedMap.set(result.value.id, result.value);
      }
    });

    if (updatedMap.size === 0) return;

    set((state) => ({
      selectedIssue:
        state.selectedIssue && updatedMap.has(state.selectedIssue.id)
          ? updatedMap.get(state.selectedIssue.id)!
          : state.selectedIssue,
      recentSessions: state.recentSessions.map((s) =>
        updatedMap.has(s.issue.id)
          ? { ...s, issue: updatedMap.get(s.issue.id)! }
          : s
      ),
    }));
  },

  loadSessions: async () => {
    set({ isLoadingSessions: true });
    try {
      const { sessions, totalCount } = await fetchRecentTimeEntries(0, PAGE_SIZE);
      set((state) => {
        const localOnly = state.recentSessions.filter((s) => !s.redmineEntryId);
        return {
          recentSessions: [...localOnly, ...sessions],
          isLoadingSessions: false,
          totalCount,
          hasMore: sessions.length < totalCount,
        };
      });
    } catch {
      set({ isLoadingSessions: false });
    }
  },

  loadMoreSessions: async () => {
    const { isLoadingMore, recentSessions } = get();
    if (isLoadingMore) return;

    const redmineSessions = recentSessions.filter((s) => s.redmineEntryId);
    const offset = redmineSessions.length;

    set({ isLoadingMore: true });
    try {
      const { sessions, totalCount } = await fetchRecentTimeEntries(offset, PAGE_SIZE);
      set((state) => {
        const existingIds = new Set(state.recentSessions.map((s) => s.id));
        const newSessions = sessions.filter((s) => !existingIds.has(s.id));
        const allRedmine = [
          ...state.recentSessions.filter((s) => s.redmineEntryId),
          ...newSessions,
        ];
        const localOnly = state.recentSessions.filter((s) => !s.redmineEntryId);
        return {
          recentSessions: [...localOnly, ...allRedmine],
          isLoadingMore: false,
          totalCount,
          hasMore: allRedmine.length < totalCount,
        };
      });
    } catch {
      set({ isLoadingMore: false });
    }
  },
}));
