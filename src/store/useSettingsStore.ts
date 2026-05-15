import { create } from "zustand";
import type { UserSettings } from "../types";

interface SettingsState {
  settings: UserSettings;
  setSettings: (settings: Partial<UserSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: UserSettings = {
  redmine_url: "",
  check_interval_minutes: 5,
  idle_threshold_minutes: 10,
  theme: "system",
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...defaultSettings },

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),

  resetSettings: () =>
    set({ settings: { ...defaultSettings } }),
}));
