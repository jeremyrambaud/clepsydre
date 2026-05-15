import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { UserSettings, RedmineActivity } from "@/types";
import { fetchActivities } from "@/lib/redmine";
import { useIssueStore } from "./useIssueStore";
import { mockActivities } from "@/lib/mockData";

interface SettingsState {
  settings: UserSettings;
  activities: RedmineActivity[];
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  loaded: boolean;
  setSettings: (settings: Partial<UserSettings>) => void;
  saveSettings: (settings: Partial<UserSettings>) => Promise<void>;
  loadCredentials: () => Promise<void>;
  resetSettings: () => void;
  syncActivities: () => Promise<void>;
  setActivities: (activities: RedmineActivity[]) => void;
}

const defaultSettings: UserSettings = {
  redmine_url: "",
  api_key: "",
  default_activity_id: null,
  default_comment: "",
  express_entry: false,
  launch_at_startup: false,
  minimize_to_tray: false,
  check_interval_minutes: 5,
  idle_threshold_minutes: 15,
  theme: "dark",
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },
  activities: [],
  isSyncing: false,
  lastSyncedAt: null,
  loaded: false,

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),

  saveSettings: async (partial) => {
    const newSettings = { ...get().settings, ...partial };
    set({ settings: newSettings });

    try {
      await invoke("set_api_credentials", {
        url: newSettings.redmine_url,
        apiKey: newSettings.api_key,
      });
    } catch (e) {
      console.error("Failed to save credentials to keyring:", e);
    }
  },

  loadCredentials: async () => {
    try {
      const [url, apiKey] = await invoke<[string, string]>("get_api_credentials");
      set((state) => ({
        settings: {
          ...state.settings,
          redmine_url: url || "",
          api_key: apiKey || "",
        },
        loaded: true,
      }));
    } catch {
      set({ loaded: true });
    }
  },

  resetSettings: () => set({ settings: { ...defaultSettings } }),

  setActivities: (activities) => set({ activities }),

  syncActivities: async () => {
    set({ isSyncing: true });
    try {
      const [activities] = await Promise.all([
        fetchActivities(),
        useIssueStore.getState().loadSessions(),
      ]);
      set({
        activities,
        isSyncing: false,
        lastSyncedAt: new Date(),
      });
    } catch {
      set({
        activities: mockActivities,
        isSyncing: false,
      });
    }
  },
}));
