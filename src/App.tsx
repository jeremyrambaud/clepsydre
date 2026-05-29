import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart } from "@tauri-apps/plugin-autostart";
import { useTheme } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { TimerView } from "@/components/TimerView";
import { AnalyticsView } from "@/components/AnalyticsView";
import { HistoryView } from "@/components/HistoryView";
import { SettingsView } from "@/components/SettingsView";
import { UpdateDialog } from "@/components/UpdateDialog";
import { SwitchTimerDialog } from "@/components/SwitchTimerDialog";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { useTimer } from "@/hooks/useTimer";
import { useIntegrationBridge } from "@/hooks/useIntegrationBridge";
import { useSettingsStore, useUpdaterStore, useIssueStore } from "@/store";
import { detectSystemLanguage, getPersistedLanguage } from "@/i18n";

type View = "timer" | "analytics" | "history" | "settings";

function App() {
  const { i18n } = useTranslation();
  const [currentView, setCurrentView] = useState<View>("timer");
  const [pendingSwitchIssueId, setPendingSwitchIssueId] = useState<number | null>(null);
  const [pendingSwitchLoggedIssueId, setPendingSwitchLoggedIssueId] = useState<number | null>(null);
  const [pendingSwitchOpenBillingIssueDialog, setPendingSwitchOpenBillingIssueDialog] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeViewRefreshToken, setActiveViewRefreshToken] = useState(0);
  const timer = useTimer();
  const selectedIssue = useIssueStore((s) => s.selectedIssue);
  const minimizeToTray = useSettingsStore((s) => s.settings.minimize_to_tray);
  const launchAtStartup = useSettingsStore((s) => s.settings.launch_at_startup);
  const checkIntervalMinutes = useSettingsStore((s) => s.settings.check_interval_minutes);
  const updateChannel = useSettingsStore((s) => s.settings.update_channel);
  const language = useSettingsStore((s) => s.settings.language);
  const theme = useSettingsStore((s) => s.settings.theme);
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url);
  const apiKey = useSettingsStore((s) => s.settings.api_key);
  const syncActivities = useSettingsStore((s) => s.syncActivities);
  const isSyncing = useSettingsStore((s) => s.isSyncing);
  const lastSyncedAt = useSettingsStore((s) => s.lastSyncedAt);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);
  const { setTheme } = useTheme();
  const systemLanguageSyncRef = useRef(false);

  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;

    void loadCredentials().finally(() => {
      if (!cancelled) {
        setCredentialsLoaded(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadCredentials, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded || !credentialsLoaded) return;

    const noRedmineDomain = redmineUrl.trim().length === 0;
    const noApiKey = apiKey.trim().length === 0;
    const shouldOpenOnboarding = noRedmineDomain || noApiKey;

    if (shouldOpenOnboarding) {
      setOnboardingOpen(true);
    }
  }, [apiKey, credentialsLoaded, redmineUrl, settingsLoaded]);

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

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [i18n, language]);

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  useEffect(() => {
    if (!settingsLoaded) return;

    void checkForUpdates(updateChannel, { silent: true });

    const interval = window.setInterval(() => {
      const channel = useSettingsStore.getState().settings.update_channel;
      void checkForUpdates(channel, { silent: true });
    }, 60 * 60 * 1000);

    return () => window.clearInterval(interval);
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

  const handleSwitchRequest = useCallback((
    issueId: number,
    loggedIssueId?: number | null,
    openBillingIssueDialog?: boolean,
  ) => {
    setPendingSwitchIssueId(issueId);
    setPendingSwitchLoggedIssueId(loggedIssueId ?? null);
    setPendingSwitchOpenBillingIssueDialog(openBillingIssueDialog === true);
    setCurrentView("timer");
  }, []);

  const [externalStopRequested, setExternalStopRequested] = useState(false);

  const handleStopRequest = useCallback(() => {
    setExternalStopRequested(true);
    setCurrentView("timer");
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingOpen(false);
    setActiveViewRefreshToken((token) => token + 1);
  }, []);

  useIntegrationBridge({ timer, onSwitchRequest: handleSwitchRequest, onStopRequest: handleStopRequest });

  return (
    <TooltipProvider>
      <AppLayout currentView={currentView} onNavigate={setCurrentView} timer={timer}>
        {currentView === "timer" && (
          <TimerView
            key={`timer-${activeViewRefreshToken}`}
            timer={timer}
            pendingSwitchIssueId={pendingSwitchIssueId}
            pendingSwitchLoggedIssueId={pendingSwitchLoggedIssueId}
            pendingSwitchOpenBillingIssueDialog={pendingSwitchOpenBillingIssueDialog}
            onPendingSwitchHandled={() => {
              setPendingSwitchIssueId(null);
              setPendingSwitchLoggedIssueId(null);
              setPendingSwitchOpenBillingIssueDialog(false);
            }}
            externalStopRequested={externalStopRequested}
            onExternalStopHandled={() => setExternalStopRequested(false)}
          />
        )}
        {currentView === "settings" && <SettingsView key={`settings-${activeViewRefreshToken}`} />}
        {currentView === "analytics" && (
          <AnalyticsView
            key={`analytics-${activeViewRefreshToken}`}
            onCreateEntry={() => setCurrentView("timer")}
            onOpenDetails={() => setCurrentView("history")}
          />
        )}
        {currentView === "history" && (
          <HistoryView
            key={`history-${activeViewRefreshToken}`}
            onStartIssue={(issueId) => handleSwitchRequest(issueId)}
          />
        )}
      </AppLayout>
      <SwitchTimerDialog
        open={pendingSwitchIssueId !== null && currentView !== "timer"}
        pendingIssueId={pendingSwitchIssueId}
        currentIssue={selectedIssue}
        onConfirm={() => setCurrentView("timer")}
        onCancel={() => setPendingSwitchIssueId(null)}
      />
      <OnboardingDialog open={onboardingOpen} onComplete={handleOnboardingComplete} />
      <UpdateDialog />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

export default App;
