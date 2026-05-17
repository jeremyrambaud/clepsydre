import { create } from "zustand";
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
  checkForUpdates: (channel?: UpdateChannel) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
  dismiss: () => void;
}

interface UpdateMetadata {
  version: string;
  notes?: string | null;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: "idle",
  channel: "stable",
  availableVersion: null,
  releaseNotes: null,
  downloadProgress: 0,
  error: null,
  hasPendingUpdate: false,

  checkForUpdates: async (channel) => {
    if (get().status === "checking" || get().status === "downloading") return;
    const requestedChannel = channel ?? get().channel;

    set({
      status: "checking",
      channel: requestedChannel,
      error: null,
      availableVersion: null,
      releaseNotes: null,
      downloadProgress: 0,
      hasPendingUpdate: false,
    });

    try {
      const update = await invoke<UpdateMetadata | null>("check_for_updates", {
        channel: requestedChannel,
      });

      if (update) {
        set({
          status: "available",
          availableVersion: update.version,
          releaseNotes: update.notes ?? null,
          hasPendingUpdate: true,
        });
      } else {
        set({ status: "up-to-date" });
      }
    } catch (e) {
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
    await relaunch();
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
}));
