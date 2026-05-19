import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { Link, Eye, EyeOff, RefreshCw, Zap, MessageSquare, MonitorCog, Timer, Download, CheckCircle2, AlertCircle, RotateCcw, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore, useUpdaterStore } from "@/store";

const NO_DEFAULT_ACTIVITY_VALUE = "__none__";

export function SettingsView() {
  const { t } = useTranslation();
  const { settings, activities, syncActivities, isSyncing, lastSyncedAt } =
    useSettingsStore();
  const [now, setNow] = useState(Date.now());
  const [appVersion, setAppVersion] = useState<string>("");

  const [showApiKey, setShowApiKey] = useState(false);
  const [draft, setDraft] = useState(settings);
  const hasDefaultActivity = draft.default_activity_id !== null;

  const { status, availableVersion, error } = useUpdaterStore();
  const checkForUpdates = useUpdaterStore((s) => s.checkForUpdates);
  const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);
  const restartApp = useUpdaterStore((s) => s.restartApp);

  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);

  useEffect(() => {
    void loadCredentials().then(() => {
      setDraft(useSettingsStore.getState().settings);
    });
  }, [loadCredentials]);

  useEffect(() => {
    if (draft.default_activity_id !== null || !draft.express_entry) return;
    setDraft((current) => ({
      ...current,
      express_entry: false,
    }));
  }, [draft.default_activity_id, draft.express_entry]);

  function handleSave() {
    saveSettings(draft);
  }

  function handleDiscard() {
    setDraft(settings);
  }

  const syncAgo = lastSyncedAt
    ? t("settings.minutesAgo", { minutes: Math.round((now - lastSyncedAt.getTime()) / 60000) })
    : t("settings.never");

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 md:pb-28">
      {/* Connection Card */}
      <section className="rounded-xl bg-card border border-border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-6">
          <Link className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold font-heading text-foreground">
            {t("settings.connection")}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
              {t("settings.redmineUrl")}
            </label>
            <Input
              placeholder={t("settings.redmineUrlPlaceholder")}
              value={draft.redmine_url}
              onChange={(e) => setDraft({ ...draft, redmine_url: e.target.value })}
              className="bg-muted border-border focus:border-primary focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
              {t("settings.apiKey")}
            </label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                placeholder={t("settings.apiKeyPlaceholder")}
                value={draft.api_key}
                onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
                className="bg-muted border-border pr-10 focus:border-primary focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 space-y-2">
          <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
            {t("settings.autoSyncInterval")}
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              type="number"
              min={1}
              max={120}
              value={draft.check_interval_minutes}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isNaN(value)) return;
                setDraft({
                  ...draft,
                  check_interval_minutes: Math.min(120, Math.max(1, value)),
                });
              }}
              className="bg-background border-border w-24"
            />
            <span className="text-xs text-muted-foreground">{t("settings.minutes")}</span>
          </div>
        </div>

        <div className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {t("settings.lastSuccessfulSync")} <span className="text-foreground">{syncAgo}</span>
          </span>
          <Button
            variant="secondary"
            onClick={syncActivities}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? t("settings.syncing") : t("settings.syncProjectsNow")}
          </Button>
        </div>
      </section>

      {/* Bento Grid: Automation + System */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Automation Card (3/5) */}
        <section className="xl:col-span-3 rounded-xl bg-card border border-border p-4 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold font-heading text-foreground">
              {t("settings.automation")}
            </h3>
          </div>

          {/* Express Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <Timer className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">{t("settings.expressMode")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.expressModeHint")}</p>
              </div>
            </div>
            <Switch
              checked={draft.express_entry}
              onCheckedChange={(checked) => {
                if (checked && !hasDefaultActivity) return;
                setDraft({ ...draft, express_entry: checked });
              }}
              disabled={!hasDefaultActivity}
              className="data-[state=checked]:bg-primary"
            />
          </div>
          {!hasDefaultActivity && (
            <p className="-mt-2 text-xs text-muted-foreground/80">
              {t("settings.expressModeRequiresDefaultActivity")}
            </p>
          )}

          {/* Default Activity */}
          <div className="space-y-2">
            <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
              {t("settings.defaultActivity")}
            </label>
            <Select
              value={draft.default_activity_id === null ? NO_DEFAULT_ACTIVITY_VALUE : draft.default_activity_id.toString()}
              onValueChange={(v) => {
                const nextDefaultActivityId = v === NO_DEFAULT_ACTIVITY_VALUE ? null : Number(v);
                setDraft({
                  ...draft,
                  default_activity_id: nextDefaultActivityId,
                  express_entry: nextDefaultActivityId === null ? false : draft.express_entry,
                });
              }}
            >
              <SelectTrigger className={`bg-muted border-border ${draft.default_activity_id === null ? "text-muted-foreground/70" : "text-foreground"}`}>
                <SelectValue placeholder={t("settings.selectActivity")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DEFAULT_ACTIVITY_VALUE}>{t("settings.noDefaultActivity")}</SelectItem>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id.toString()}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Default Comment */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                {t("settings.defaultComment")}
              </label>
            </div>
            <textarea
              rows={3}
              placeholder={t("settings.defaultCommentPlaceholder")}
              value={draft.default_comment}
              onChange={(e) => setDraft({ ...draft, default_comment: e.target.value })}
              className="w-full rounded-md bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none outline-none"
            />
          </div>
        </section>

        {/* System Card (2/5) */}
        <section className="xl:col-span-2 rounded-xl bg-card border border-border p-4 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <MonitorCog className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold font-heading text-foreground">
              {t("settings.system")}
            </h3>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                {t("settings.language")}
              </label>
            </div>
            <Select
              value={draft.language}
              onValueChange={(value) =>
                setDraft({ ...draft, language: value as "en" | "fr" })
              }
            >
              <SelectTrigger className="bg-muted border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("settings.languageEnglish")}</SelectItem>
                <SelectItem value="fr">{t("settings.languageFrench")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Idle Detection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div>
                <p className="text-sm font-medium text-foreground">{t("settings.idleDetection")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.idleDetectionHint")}</p>
              </div>
              <Switch
                checked={draft.idle_detection_enabled}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, idle_detection_enabled: checked })
                }
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
              {t("settings.idleThreshold")}
            </label>
            <div className="flex items-center gap-4">
              <Slider
                value={[draft.idle_threshold_minutes]}
                min={1}
                max={60}
                step={1}
                onValueChange={([v]) => setDraft({ ...draft, idle_threshold_minutes: v })}
                className="flex-1"
                disabled={!draft.idle_detection_enabled}
              />
              <span className="text-sm font-semibold text-primary tabular-nums min-w-[50px] text-right">
                {draft.idle_threshold_minutes} min
              </span>
            </div>
          </div>

          {/* Launch at startup */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Checkbox
              id="launch-startup"
              checked={draft.launch_at_startup}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, launch_at_startup: checked === true })
              }
            />
            <label htmlFor="launch-startup" className="text-sm text-foreground cursor-pointer">
              {t("settings.launchAtStartup")}
            </label>
          </div>

          {/* Minimize to tray */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Checkbox
              id="minimize-tray"
              checked={draft.minimize_to_tray}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, minimize_to_tray: checked === true })
              }
            />
            <label htmlFor="minimize-tray" className="text-sm text-foreground cursor-pointer">
              {t("settings.minimizeToTray")}
            </label>
          </div>

        </section>
      </div>

      {/* About & Updates */}
      <section className="rounded-xl bg-card border border-border p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold font-heading text-foreground">
            {t("settings.aboutAndUpdates")}
          </h3>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              Clepsydre{" "}
              <span className="font-mono text-muted-foreground">v{appVersion || "..."}</span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{t("settings.updateChannel")}</span>
              <Select
                value={draft.update_channel}
                onValueChange={(value) =>
                  setDraft({ ...draft, update_channel: value as "stable" | "beta" })
                }
              >
                <SelectTrigger className="h-7 w-[130px] bg-muted border-border text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">{t("settings.stable")}</SelectItem>
                  <SelectItem value="beta">{t("settings.beta")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {status === "checking" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {t("settings.checkingUpdates")}
              </p>
            )}
            {status === "up-to-date" && (
              <p className="text-xs text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                {t("settings.upToDate")}
              </p>
            )}
            {status === "available" && (
              <p className="text-xs text-primary flex items-center gap-1.5">
                <Download className="w-3 h-3" />
                {t("settings.versionAvailable", { version: availableVersion })}
              </p>
            )}
            {status === "downloading" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {t("settings.downloadingInstalling")}
              </p>
            )}
            {status === "ready" && (
              <p className="text-xs text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                {t("settings.updateReadyRestart")}
              </p>
            )}
            {status === "error" && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                {error || t("settings.updateCheckFailed")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(status === "idle" || status === "up-to-date" || status === "error") && (
              <Button
                variant="secondary"
                onClick={() => checkForUpdates(draft.update_channel)}
                className="gap-2 w-full sm:w-auto"
              >
                <RefreshCw className="w-4 h-4" />
                {t("settings.checkForUpdates")}
              </Button>
            )}
            {status === "available" && (
              <Button onClick={downloadAndInstall} className="gap-2 w-full sm:w-auto">
                <Download className="w-4 h-4" />
                {t("settings.downloadInstall")}
              </Button>
            )}
            {status === "ready" && (
              <Button onClick={restartApp} className="gap-2 w-full sm:w-auto">
                <RotateCcw className="w-4 h-4" />
                {t("settings.restartNow")}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Floating actions always visible */}
      <div className="fixed inset-x-4 bottom-20 md:bottom-6 md:left-[284px] md:right-6 z-40 pointer-events-none">
        <div className="mx-auto max-w-5xl pointer-events-auto rounded-xl border border-border bg-background/95 backdrop-blur-sm px-3 py-3 shadow-lg">
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <Button variant="outline" onClick={handleDiscard} disabled={!hasChanges} className="w-full sm:w-auto">
              {t("settings.discardChanges")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges}
              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
            >
              {t("settings.saveConfiguration")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
