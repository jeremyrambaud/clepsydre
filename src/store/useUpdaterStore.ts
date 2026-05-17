import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

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
  pendingUpdate: Update | null;

  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: "idle",
  availableVersion: null,
  releaseNotes: null,
  downloadProgress: 0,
  error: null,
  pendingUpdate: null,

  checkForUpdates: async () => {
    if (get().status === "checking" || get().status === "downloading") return;

    set({
      status: "checking",
      error: null,
      availableVersion: null,
      releaseNotes: null,
      downloadProgress: 0,
      pendingUpdate: null,
    });

    try {
      const update = await check();

      if (update) {
        set({
          status: "available",
          availableVersion: update.version,
          releaseNotes: update.body ?? null,
          pendingUpdate: update,
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
    const { pendingUpdate } = get();
    if (!pendingUpdate) return;

    set({ status: "downloading", downloadProgress: 0, error: null });

    try {
      let contentLength = 0;
      let downloaded = 0;

      await pendingUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              set({ downloadProgress: Math.round((downloaded / contentLength) * 100) });
            }
            break;
          case "Finished":
            set({ downloadProgress: 100 });
            break;
        }
      });

      set({ status: "ready" });
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
      pendingUpdate: null,
    });
  },
}));
