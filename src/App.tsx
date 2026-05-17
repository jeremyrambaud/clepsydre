import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart } from "@tauri-apps/plugin-autostart";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { TimerView } from "@/components/TimerView";
import { SettingsView } from "@/components/SettingsView";
import { UpdateDialog } from "@/components/UpdateDialog";
import { useTimer } from "@/hooks/useTimer";
import { useSettingsStore, useUpdaterStore } from "@/store";

type View = "timer" | "analytics" | "history" | "settings";

function formatClockTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function App() {
  const [currentView, setCurrentView] = useState<View>("timer");
  const timer = useTimer();
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);
  const minimizeToTray = useSettingsStore((s) => s.settings.minimize_to_tray);
  const launchAtStartup = useSettingsStore((s) => s.settings.launch_at_startup);
  const checkIntervalMinutes = useSettingsStore((s) => s.settings.check_interval_minutes);
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url);
  const apiKey = useSettingsStore((s) => s.settings.api_key);
  const syncActivities = useSettingsStore((s) => s.syncActivities);
  const isSyncing = useSettingsStore((s) => s.isSyncing);
  const lastSyncedAt = useSettingsStore((s) => s.lastSyncedAt);
  const settingsLoaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  useEffect(() => {
    const label = timer.isRunning ? formatClockTimer(timer.elapsedSeconds) : null;
    void invoke("set_tray_timer_label", { label }).catch(() => {});
  }, [timer.elapsedSeconds, timer.isRunning]);

  useEffect(() => {
    void invoke("set_minimize_to_tray", { enabled: minimizeToTray }).catch(() => {});
  }, [minimizeToTray]);

  useEffect(() => {
    if (!settingsLoaded) return;
    const syncAutostart = async () => {
      try {
        if (launchAtStartup) {
          await enableAutostart();
        } else {
          await disableAutostart();
        }
      } catch {
        // no-op: keep app usable even if OS autostart registration fails
      }
    };
    void syncAutostart();
  }, [launchAtStartup, settingsLoaded]);

  const checkForUpdates = useUpdaterStore((s) => s.checkForUpdates);
  const updateCheckedRef = useRef(false);

  useEffect(() => {
    if (!settingsLoaded || updateCheckedRef.current) return;
    updateCheckedRef.current = true;
    void checkForUpdates();
  }, [settingsLoaded, checkForUpdates]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (!redmineUrl || !apiKey) return;

    const thresholdMs = Math.max(1, checkIntervalMinutes) * 60_000;

    const maybeSync = () => {
      if (isSyncing) return;
      const lastSyncMs = lastSyncedAt?.getTime() ?? 0;
      const isStale = !lastSyncMs || Date.now() - lastSyncMs >= thresholdMs;
      if (isStale) {
        void syncActivities();
      }
    };

    maybeSync();
    const interval = window.setInterval(maybeSync, 30_000);
    return () => window.clearInterval(interval);
  }, [
    apiKey,
    checkIntervalMinutes,
    isSyncing,
    lastSyncedAt,
    redmineUrl,
    settingsLoaded,
    syncActivities,
  ]);

  return (
    <TooltipProvider>
      <AppLayout currentView={currentView} onNavigate={setCurrentView} timer={timer}>
        {currentView === "timer" && <TimerView timer={timer} />}
        {currentView === "settings" && <SettingsView />}
        {currentView === "analytics" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Analytics — Coming soon
          </div>
        )}
        {currentView === "history" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            History — Coming soon
          </div>
        )}
      </AppLayout>
      <UpdateDialog />
      <Toaster position="bottom-right" theme="dark" />
    </TooltipProvider>
  );
}

export default App;
