import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateChannel = "stable" | "beta";

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "up-to-date";

interface UpdaterState {
  status: UpdateStatus;
  availableVersion: string | null;
  releaseNotes: string | null;
  downloadProgress: number;
  error: string | null;
  hasPendingUpdate: boolean;

  channel: UpdateChannel;
  ignoredVersion: string | null;
  snoozedVersionThisSession: string | null;

  checkForUpdates: (
    channel?: UpdateChannel,
    options?: { forcePrompt?: boolean; silent?: boolean }
  ) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
  remindOnNextLaunch: () => void;
  ignoreCurrentVersion: () => void;
  dismiss: () => void;
}

interface UpdateMetadata {
  version: string;
  notes?: string | null;
}

export const useUpdaterStore = create<UpdaterState>()(
  persist(
    (set, get) => ({
      status: "idle",
      channel: "stable",
      availableVersion: null,
      releaseNotes: null,
      downloadProgress: 0,
      error: null,
      hasPendingUpdate: false,
      ignoredVersion: null,
      snoozedVersionThisSession: null,

      checkForUpdates: async (channel, options) => {
        if (get().status === "checking" || get().status === "downloading") return;
        const requestedChannel = channel ?? get().channel;
        const forcePrompt = options?.forcePrompt ?? false;
        const silent = options?.silent ?? false;

        if (!silent) {
          set({
            status: "checking",
            channel: requestedChannel,
            error: null,
            availableVersion: null,
            releaseNotes: null,
            downloadProgress: 0,
            hasPendingUpdate: false,
          });
        } else {
          set({ channel: requestedChannel, error: null });
        }

        try {
          const update = await invoke<UpdateMetadata | null>("check_for_updates", {
            channel: requestedChannel,
          });

          if (update) {
            if (update.version === get().ignoredVersion) {
              if (!silent) {
                set({ status: "up-to-date", hasPendingUpdate: false });
              }
              return;
            }

            const isSnoozedForSession = get().snoozedVersionThisSession === update.version;
            if (isSnoozedForSession && !forcePrompt) {
              if (!silent) {
                set({ status: "up-to-date", hasPendingUpdate: false });
              }
              return;
            }

            set({
              status: "available",
              availableVersion: update.version,
              releaseNotes: update.notes ?? null,
              hasPendingUpdate: true,
            });
          } else if (!silent) {
            set({ status: "up-to-date" });
          }
        } catch (e) {
          if (silent) {
            return;
          }
          set({
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },

      downloadAndInstall: async () => {
        const { hasPendingUpdate } = get();
        if (!hasPendingUpdate) return;

        set({ status: "downloading", downloadProgress: 0, error: null });

        try {
          await invoke("install_pending_update");
          set({ status: "ready", downloadProgress: 100, hasPendingUpdate: false });
        } catch (e) {
          set({
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },

      restartApp: async () => {
        try {
          await invoke("set_minimize_to_tray", { enabled: false });
        } catch {
          // no-op: fallback to relaunch even if tray behavior sync fails
        }
        await relaunch();
      },

      remindOnNextLaunch: () => {
        const version = get().availableVersion;
        set({
          snoozedVersionThisSession: version,
          status: "idle",
          error: null,
          availableVersion: null,
          releaseNotes: null,
          downloadProgress: 0,
          hasPendingUpdate: false,
        });
      },

      ignoreCurrentVersion: () => {
        const version = get().availableVersion;
        if (!version) return;
        set({
          ignoredVersion: version,
          status: "idle",
          error: null,
          availableVersion: null,
          releaseNotes: null,
          downloadProgress: 0,
          hasPendingUpdate: false,
        });
      },

      dismiss: () => {
        set({
          status: "idle",
          error: null,
          availableVersion: null,
          releaseNotes: null,
          downloadProgress: 0,
          hasPendingUpdate: false,
        });
      },
    }),
    {
      name: "clepsydre-updater",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        ignoredVersion: state.ignoredVersion,
      }),
    }
  )
);
