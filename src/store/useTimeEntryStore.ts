import { create } from "zustand";
import type { RedmineTimeEntry } from "../types";

interface TimeEntryState {
  entries: RedmineTimeEntry[];
  currentEntry: RedmineTimeEntry | null;
  setEntries: (entries: RedmineTimeEntry[]) => void;
  addEntry: (entry: RedmineTimeEntry) => void;
  setCurrentEntry: (entry: RedmineTimeEntry | null) => void;
  clearEntries: () => void;
}

export const useTimeEntryStore = create<TimeEntryState>((set) => ({
  entries: [],
  currentEntry: null,

  setEntries: (entries) => set({ entries }),

  addEntry: (entry) =>
    set((state) => ({ entries: [...state.entries, entry] })),

  setCurrentEntry: (entry) => set({ currentEntry: entry }),

  clearEntries: () => set({ entries: [], currentEntry: null }),
}));
