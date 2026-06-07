import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type { UserSettings, RedmineActivity } from "@/types";
import { fetchActivities } from "@/lib/redmine";
import { detectInitialLanguage } from "@/i18n";
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
  resetSettings: () => Promise<void>;
  syncActivities: () => Promise<void>;
  setActivities: (activities: RedmineActivity[]) => void;
}

const defaultSettings: UserSettings = {
  redmine_url: "",
  api_key: "",
  onboarding_seen: false,
  language: detectInitialLanguage(),
  default_activity_id: null,
  default_comment: "",
  auto_start_timer_on_task_select: true,
  prefill_last_comment_on_timer_start: false,
  allow_different_logged_ticket: true,
  express_entry: false,
  idle_detection_enabled: true,
  launch_at_startup: true,
  minimize_to_tray: true,
  update_channel: "stable",
  check_interval_minutes: 5,
  search_in_time_comments: false,
  idle_threshold_minutes: 15,
  daily_work_hours: 7,
  daily_work_tolerance_minutes: 60,
  workday_overrides: {},
  show_weekends_in_weekly_activity: true,
  theme: "dark",
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: { ...defaultSettings },
      activities: [],
      isSyncing: false,
      lastSyncedAt: null,
      loaded: true,

      setSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),

      saveSettings: async (partial) => {
        const newSettings = { ...get().settings, ...partial };
        set({ settings: newSettings });

        try {
          if (newSettings.api_key?.trim()) {
            await invoke("set_api_key", { apiKey: newSettings.api_key });
          } else {
            await invoke("delete_api_key");
          }
        } catch (e) {
          console.error("Failed to save API key to keyring:", e);
        }
      },

      loadCredentials: async () => {
        try {
          const apiKey = await invoke<string>("get_api_key");
          set((state) => ({
            settings: {
              ...state.settings,
              api_key: apiKey || "",
            },
          }));
        } catch {
          // noop: keep existing in-memory settings if keyring cannot be accessed
        }
      },

      resetSettings: async () => {
        try {
          await invoke("delete_api_key");
        } catch (e) {
          console.error("Failed to delete API key from keyring:", e);
        }

        set({
          settings: { ...defaultSettings },
          lastSyncedAt: null,
        });
      },

      setActivities: (activities) => set({ activities }),

      syncActivities: async () => {
        set({ isSyncing: true });
        try {
          const activities = await fetchActivities();
          const issueStore = useIssueStore.getState();
          await issueStore.loadSessions();
          await issueStore.refreshIssues();
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
    }),
    {
      name: "clepsydre-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: {
          ...state.settings,
          api_key: "",
        },
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SettingsState>;
        return {
          ...current,
          ...persistedState,
          settings: {
            ...defaultSettings,
            ...current.settings,
            ...(persistedState.settings ?? {}),
            api_key: "",
          },
        };
      },
    }
  )
);
