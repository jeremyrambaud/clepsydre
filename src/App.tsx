import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart } from "@tauri-apps/plugin-autostart";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { TimerView } from "@/components/TimerView";
import { SettingsView } from "@/components/SettingsView";
import { UpdateDialog } from "@/components/UpdateDialog";
import { SwitchTimerDialog } from "@/components/SwitchTimerDialog";
import { useTimer } from "@/hooks/useTimer";
import { useIntegrationBridge } from "@/hooks/useIntegrationBridge";
import { useSettingsStore, useUpdaterStore, useIssueStore } from "@/store";
import { detectSystemLanguage, getPersistedLanguage } from "@/i18n";

type View = "timer" | "analytics" | "history" | "settings";

function App() {
  const { t, i18n } = useTranslation();
  const [currentView, setCurrentView] = useState<View>("timer");
  const [pendingSwitchIssueId, setPendingSwitchIssueId] = useState<number | null>(null);
  const timer = useTimer();
  const selectedIssue = useIssueStore((s) => s.selectedIssue);
  const minimizeToTray = useSettingsStore((s) => s.settings.minimize_to_tray);
  const launchAtStartup = useSettingsStore((s) => s.settings.launch_at_startup);
  const checkIntervalMinutes = useSettingsStore((s) => s.settings.check_interval_minutes);
  const updateChannel = useSettingsStore((s) => s.settings.update_channel);
  const language = useSettingsStore((s) => s.settings.language);
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url);
  const apiKey = useSettingsStore((s) => s.settings.api_key);
  const syncActivities = useSettingsStore((s) => s.syncActivities);
  const isSyncing = useSettingsStore((s) => s.isSyncing);
  const lastSyncedAt = useSettingsStore((s) => s.lastSyncedAt);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const systemLanguageSyncRef = useRef(false);

  useEffect(() => {
    if (!settingsLoaded || systemLanguageSyncRef.current) return;
    systemLanguageSyncRef.current = true;
    if (getPersistedLanguage()) return;

    void detectSystemLanguage().then((language) => {
      const currentLanguage = useSettingsStore.getState().settings.language;
      if (currentLanguage !== language) {
        setSettings({ language });
      }
    });
  }, [setSettings, settingsLoaded]);

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
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [i18n, language]);

  useEffect(() => {
    if (!settingsLoaded || updateCheckedRef.current) return;
    updateCheckedRef.current = true;
    void checkForUpdates(updateChannel);
  }, [settingsLoaded, checkForUpdates, updateChannel]);

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

  const handleSwitchRequest = useCallback((issueId: number) => {
    setPendingSwitchIssueId(issueId);
    setCurrentView("timer");
  }, []);

  const [externalStopRequested, setExternalStopRequested] = useState(false);

  const handleStopRequest = useCallback(() => {
    setExternalStopRequested(true);
    setCurrentView("timer");
  }, []);

  useIntegrationBridge({ timer, onSwitchRequest: handleSwitchRequest, onStopRequest: handleStopRequest });

  return (
    <TooltipProvider>
      <AppLayout currentView={currentView} onNavigate={setCurrentView} timer={timer}>
        {currentView === "timer" && (
          <TimerView
            timer={timer}
            pendingSwitchIssueId={pendingSwitchIssueId}
            onPendingSwitchHandled={() => setPendingSwitchIssueId(null)}
            externalStopRequested={externalStopRequested}
            onExternalStopHandled={() => setExternalStopRequested(false)}
          />
        )}
        {currentView === "settings" && <SettingsView />}
        {currentView === "analytics" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            {t("app.analyticsComingSoon")}
          </div>
        )}
        {currentView === "history" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            {t("app.historyComingSoon")}
          </div>
        )}
      </AppLayout>
      <SwitchTimerDialog
        open={pendingSwitchIssueId !== null && currentView !== "timer"}
        pendingIssueId={pendingSwitchIssueId}
        currentIssue={selectedIssue}
        onConfirm={() => setCurrentView("timer")}
        onCancel={() => setPendingSwitchIssueId(null)}
      />
      <UpdateDialog />
      <Toaster position="bottom-right" theme="dark" />
    </TooltipProvider>
  );
}

export default App;
