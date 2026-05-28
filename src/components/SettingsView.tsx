import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import {
  Link,
  Eye,
  EyeOff,
  User,
  RefreshCw,
  Zap,
  MonitorCog,
  Palette,
  Timer,
  Download,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsStore, useUpdaterStore } from "@/store";

const NO_DEFAULT_ACTIVITY_VALUE = "__none__";
const GITHUB_REPO_URL = "https://github.com/jeremyrambaud/clepsydre";
const GITHUB_ISSUES_URL = "https://github.com/jeremyrambaud/clepsydre/issues";
const CHROME_EXTENSION_URL = "https://chromewebstore.google.com/detail/clepsydre-companion-%E2%80%94-red/ilojdkpijdgehbjjhlbljekgeoomijhp";
const FIREFOX_EXTENSION_URL = "https://addons.mozilla.org/fr/firefox/addon/clepsydre-companion/";
const LINKEDIN_URL = "https://www.linkedin.com/in/jeremy-rambaud/";
const AUTHOR_NAME = "Jérémy Rambaud";

type SettingsTab = "connection" | "tracking" | "system";

function SettingRow({
  title,
  hint,
  control,
  icon,
  disabled = false,
}: {
  title: string;
  hint?: string;
  control: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-60" : ""}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            {icon}
            <span className="truncate">{title}</span>
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
    </div>
  );
}

export function SettingsView() {
  const { t } = useTranslation();
  const { settings, activities, syncActivities, isSyncing, lastSyncedAt } = useSettingsStore();

  const [now, setNow] = useState(Date.now());
  const [appVersion, setAppVersion] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("connection");
  const [draft, setDraft] = useState(settings);

  const hasDefaultActivity = draft.default_activity_id !== null;
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  const { status, availableVersion, error } = useUpdaterStore();
  const checkForUpdates = useUpdaterStore((s) => s.checkForUpdates);
  const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);
  const restartApp = useUpdaterStore((s) => s.restartApp);

  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const loadCredentials = useSettingsStore((s) => s.loadCredentials);

  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  function handleSave() {
    saveSettings(draft);
  }

  function handleDiscard() {
    setDraft(settings);
  }

  const syncAgo = lastSyncedAt
    ? t("settings.minutesAgo", { minutes: Math.round((now - lastSyncedAt.getTime()) / 60000) })
    : t("settings.never");

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 md:pb-28">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)}>
        <TabsList className="flex h-auto w-full flex-nowrap gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2">
          <TabsTrigger value="connection" className="h-9 shrink-0 gap-2 px-3">
            <Link className="h-4 w-4 text-primary" />
            <span>{t("settings.connection")}</span>
          </TabsTrigger>
          <TabsTrigger value="tracking" className="h-9 shrink-0 gap-2 px-3">
            <Timer className="h-4 w-4 text-primary" />
            <span>{t("settings.timeTracking")}</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="h-9 shrink-0 gap-2 px-3">
            <Palette className="h-4 w-4 text-primary" />
            <span>{t("settings.application")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="mt-0 space-y-4">
          <section className="rounded-xl bg-card border border-border p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-6">
              <Link className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold font-heading text-foreground">{t("settings.connection")}</h3>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                  {t("settings.redmineUrl")}
                </label>
                <Input
                  placeholder={t("settings.redmineUrlPlaceholder")}
                  value={draft.redmine_url}
                  onChange={(e) => setDraft({ ...draft, redmine_url: e.target.value })}
                  className="bg-background border-border focus:border-primary focus:ring-primary/20"
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
                    className="bg-background border-border pr-10 focus:border-primary focus:ring-primary/20"
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
          </section>

          <section className="rounded-xl bg-card border border-border p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-6">
              <RefreshCw className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold font-heading text-foreground">{t("settings.autoSyncInterval")}</h3>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("settings.lastSuccessfulSync")}</p>
                  <p className="text-xs text-muted-foreground">{syncAgo}</p>
                </div>

                <div className="flex items-center gap-2">
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
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t("settings.minutes")}</span>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  onClick={syncActivities}
                  disabled={isSyncing}
                  className="gap-2 w-full sm:w-auto"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? t("settings.syncing") : t("settings.syncProjectsNow")}
                </Button>
              </div>
            </div>
          </section>

        </TabsContent>

        <TabsContent value="tracking" className="mt-0 space-y-4">
          <section className="rounded-xl bg-card border border-border p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-6">
              <Zap className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold font-heading text-foreground">{t("settings.entryPreferences")}</h3>
            </div>

            <div className="divide-y divide-border">
              <div className="py-4 first:pt-0">
                <div className={`rounded-lg border border-border bg-muted/40 px-3 py-3 sm:px-4 ${!hasDefaultActivity ? "opacity-80" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Timer className="w-4 h-4 text-primary" />
                        <span className="truncate">{t("settings.expressMode")}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("settings.expressModeHint")}</p>
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
                    <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {t("settings.expressModeRequiresDefaultActivity")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="py-4">
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
                    <SelectTrigger className={`bg-background border-border ${draft.default_activity_id === null ? "text-muted-foreground/70" : "text-foreground"}`}>
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
              </div>

              <div className="py-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                    {t("settings.defaultComment")}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={t("settings.defaultCommentPlaceholder")}
                    value={draft.default_comment}
                    onChange={(e) => setDraft({ ...draft, default_comment: e.target.value })}
                    className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none outline-none"
                  />
                </div>
              </div>

              <div className="py-4">
                <SettingRow
                  title={t("settings.prefillLastComment")}
                  hint={t("settings.prefillLastCommentHint")}
                  control={(
                    <Switch
                      checked={draft.prefill_last_comment_on_timer_start}
                      onCheckedChange={(checked) =>
                        setDraft({ ...draft, prefill_last_comment_on_timer_start: checked })
                      }
                      className="data-[state=checked]:bg-primary"
                    />
                  )}
                />
              </div>

              <div className="py-4 last:pb-0">
                <SettingRow
                  title={t("settings.searchInTimeComments")}
                  hint={t("settings.searchInTimeCommentsHint")}
                  control={(
                    <Switch
                      checked={draft.search_in_time_comments}
                      onCheckedChange={(checked) => setDraft({ ...draft, search_in_time_comments: checked })}
                      className="data-[state=checked]:bg-primary"
                    />
                  )}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-card border border-border p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-6">
              <MonitorCog className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold font-heading text-foreground">{t("settings.system")}</h3>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t("settings.idleDetection")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("settings.idleDetectionHint")}</p>
                  </div>
                  <Switch
                    checked={draft.idle_detection_enabled}
                    onCheckedChange={(checked) => setDraft({ ...draft, idle_detection_enabled: checked })}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                {draft.idle_detection_enabled && (
                  <div className="mt-3 border-t border-border pt-3">
                    <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                      {t("settings.idleThreshold")}
                    </label>
                    <div className="mt-2 flex items-center gap-4">
                      <Slider
                        value={[draft.idle_threshold_minutes]}
                        min={1}
                        max={60}
                        step={1}
                        onValueChange={([v]) => setDraft({ ...draft, idle_threshold_minutes: v })}
                        className="flex-1"
                      />
                      <span className="text-sm font-semibold text-primary tabular-nums min-w-12.5 text-right">
                        {draft.idle_threshold_minutes} min
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                      {t("settings.dailyWorkHours")}
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        step={0.5}
                        value={draft.daily_work_hours}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (Number.isNaN(value)) return;
                          setDraft({
                            ...draft,
                            daily_work_hours: Math.min(24, Math.max(1, value)),
                          });
                        }}
                        className="bg-background border-border w-24"
                      />
                      <span className="text-xs text-muted-foreground">h</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("settings.dailyWorkHoursHint")}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                      {t("settings.dailyWorkTolerance")}
                    </label>
                    <div className="mt-2 flex items-center gap-4">
                      <Slider
                        value={[draft.daily_work_tolerance_minutes]}
                        min={0}
                        max={180}
                        step={15}
                        onValueChange={([v]) => setDraft({ ...draft, daily_work_tolerance_minutes: v })}
                        className="flex-1"
                      />
                      <span className="text-sm font-semibold text-primary tabular-nums min-w-14 text-right">
                        ±{draft.daily_work_tolerance_minutes} min
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("settings.dailyWorkToleranceHint")}</p>
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <SettingRow
                    title={t("settings.showWeekendsInWeeklyActivity")}
                    hint={t("settings.showWeekendsInWeeklyActivityHint")}
                    control={(
                      <Switch
                        checked={draft.show_weekends_in_weekly_activity}
                        onCheckedChange={(checked) => setDraft({ ...draft, show_weekends_in_weekly_activity: checked })}
                        className="data-[state=checked]:bg-primary"
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="system" className="mt-0 space-y-4">
          <section className="rounded-xl bg-card border border-border p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-6">
              <Palette className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold font-heading text-foreground">{t("settings.application")}</h3>
            </div>

            <div className="divide-y divide-border">
              <div className="py-4 first:pt-0">
                <div className="space-y-2">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                    {t("settings.language")}
                  </label>
                  <Select
                    value={draft.language}
                    onValueChange={(value) => setDraft({ ...draft, language: value as "en" | "fr" })}
                  >
                    <SelectTrigger className="bg-background border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t("settings.languageEnglish")}</SelectItem>
                      <SelectItem value="fr">{t("settings.languageFrench")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="py-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                    {t("settings.theme")}
                  </label>
                  <Select
                    value={draft.theme}
                    onValueChange={(value) => setDraft({ ...draft, theme: value as "light" | "dark" | "system" })}
                  >
                    <SelectTrigger className="bg-background border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">{t("settings.themeSystem")}</SelectItem>
                      <SelectItem value="dark">{t("settings.themeDark")}</SelectItem>
                      <SelectItem value="light">{t("settings.themeLight")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t("settings.themeHint")}</p>
                </div>
              </div>

              <div className="py-4">
                <SettingRow
                  title={t("settings.launchAtStartup")}
                  control={(
                    <Switch
                      checked={draft.launch_at_startup}
                      onCheckedChange={(checked) => setDraft({ ...draft, launch_at_startup: checked })}
                      className="data-[state=checked]:bg-primary"
                    />
                  )}
                />
              </div>

              <div className="py-4 last:pb-0">
                <SettingRow
                  title={t("settings.minimizeToTray")}
                  control={(
                    <Switch
                      checked={draft.minimize_to_tray}
                      onCheckedChange={(checked) => setDraft({ ...draft, minimize_to_tray: checked })}
                      className="data-[state=checked]:bg-primary"
                    />
                  )}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-card border border-border p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-6">
              <Download className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold font-heading text-foreground">{t("settings.aboutAndUpdates")}</h3>
            </div>

            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
              <div className="space-y-4">
                <div className="border-b border-border pb-4 mb-4">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading mb-2">
                    {t("settings.companionExtensions")}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">{t("settings.companionExtensionsHint")}</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
                      <a href={CHROME_EXTENSION_URL} target="_blank" rel="noreferrer">
                        <Link className="w-4 h-4" />
                        {t("settings.chromeExtension")}
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
                      <a href={FIREFOX_EXTENSION_URL} target="_blank" rel="noreferrer">
                        <Link className="w-4 h-4" />
                        {t("settings.firefoxExtension")}
                      </a>
                    </Button>
                  </div>
                </div>

                <p className="text-md text-foreground font-bold">
                  Clepsydre <span className="font-mono text-muted-foreground">v{appVersion || "..."}</span>
                </p>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t("settings.updateChannel")}</span>
                  <Select
                    value={draft.update_channel}
                    onValueChange={(value) => setDraft({ ...draft, update_channel: value as "stable" | "beta" })}
                  >
                    <SelectTrigger className="h-8 w-35 bg-background border-border text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stable">{t("settings.stable")}</SelectItem>
                      <SelectItem value="beta">{t("settings.beta")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0">
                  {status === "checking" && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {t("settings.checkingUpdates")}
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
                  {status === "up-to-date" && (
                    <p className="text-xs text-emerald-500 flex items-center gap-1.5 mr-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {t("settings.upToDate")}
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => checkForUpdates(draft.update_channel, { forcePrompt: true })}
                    disabled={status === "checking" || status === "downloading"}
                    className="gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${status === "checking" ? "animate-spin" : ""}`} />
                    {t("settings.checkForUpdates")}
                  </Button>
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

              <div className="rounded-lg border border-border bg-muted/40 p-3 sm:p-4 space-y-4">
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading mb-2">
                    {t("settings.githubRepository")}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="border-r border-border pr-4">
                      <span className="font-medium">{AUTHOR_NAME}</span>
                    </span>
                    <Button asChild variant="ghost" size="icon">
                      <a
                        href={LINKEDIN_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="LinkedIn"
                        title="LinkedIn"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
                          <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.1c.5-.9 1.8-1.9 3.7-1.9 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V9Z" />
                        </svg>
                      </a>
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button asChild variant="outline" className="gap-2">
                      <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                        <Link className="w-4 h-4" />
                        {t("settings.openGithubRepo")}
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading mb-2">
                    {t("settings.reportBugs")}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">{t("settings.reportBugsHint")}</p>
                  <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
                    <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">
                      <AlertCircle className="w-4 h-4" />
                      {t("settings.openGithubIssues")}
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <div className="fixed inset-x-4 bottom-20 md:bottom-6 md:left-71 md:right-6 z-40 pointer-events-none">
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
