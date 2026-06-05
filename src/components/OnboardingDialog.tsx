import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { Link as LinkIcon, KeyRound, Globe, Puzzle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { validateRedmineConnection } from "@/lib/redmine";
import { useSettingsStore } from "@/store";
import type { UserSettings } from "@/types";

const NO_DEFAULT_ACTIVITY_VALUE = "__none__";
const CHROME_EXTENSION_URL = "https://chromewebstore.google.com/detail/clepsydre-companion-%E2%80%94-red/ilojdkpijdgehbjjhlbljekgeoomijhp";
const FIREFOX_EXTENSION_URL = "https://addons.mozilla.org/fr/firefox/addon/clepsydre-companion/";

type OnboardingStep = 1 | 2 | 3;

interface OnboardingDialogProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const { t } = useTranslation();
  const { setTheme } = useTheme();
  const { settings, activities, isSyncing } = useSettingsStore();
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const syncActivities = useSettingsStore((s) => s.syncActivities);

  const [step, setStep] = useState<OnboardingStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepOneConnectionError, setStepOneConnectionError] = useState<string | null>(null);
  const [draft, setDraft] = useState<UserSettings>(settings);

  useEffect(() => {
    if (!open) return;
    setDraft(useSettingsStore.getState().settings);
    setStep(1);
    setIsSubmitting(false);
    setStepOneConnectionError(null);
  }, [open]);

  const canContinueStepOne = useMemo(() => {
    return draft.redmine_url.trim().length > 0 && draft.api_key.trim().length > 0;
  }, [draft.api_key, draft.redmine_url]);

  const totalSteps = 3;

  async function handleContinueStepOne() {
    if (!canContinueStepOne || isSubmitting) return;

    setIsSubmitting(true);
    setStepOneConnectionError(null);
    try {
      await validateRedmineConnection(draft.redmine_url, draft.api_key);
      await saveSettings({
        redmine_url: draft.redmine_url.trim(),
        api_key: draft.api_key.trim(),
        onboarding_seen: true,
        language: draft.language,
        theme: draft.theme,
        launch_at_startup: draft.launch_at_startup,
        minimize_to_tray: draft.minimize_to_tray,
      });
      await syncActivities();
      setStep(2);
    } catch (err) {
      setStepOneConnectionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleContinueStepTwo() {
    setStep(3);
  }

  async function handleFinish() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await saveSettings({
        redmine_url: draft.redmine_url.trim(),
        api_key: draft.api_key.trim(),
        language: draft.language,
        theme: draft.theme,
        launch_at_startup: draft.launch_at_startup,
        minimize_to_tray: draft.minimize_to_tray,
        default_activity_id: draft.default_activity_id,
        default_comment: draft.default_comment,
        daily_work_hours: draft.daily_work_hours,
      });
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="bg-card border-border sm:max-w-2xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("onboarding.title")}</DialogTitle>
          <DialogDescription>
            {t("onboarding.stepCounter", { current: step, total: totalSteps })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((index) => (
              <div key={index} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium text-foreground">{t("onboarding.step1.title")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("onboarding.step1.description")}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                    {t("settings.redmineUrl")}
                  </Label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={draft.redmine_url}
                      onChange={(e) => {
                        if (stepOneConnectionError) setStepOneConnectionError(null);
                        setDraft({ ...draft, redmine_url: e.target.value });
                      }}
                      placeholder={t("settings.redmineUrlPlaceholder")}
                      className="bg-background border-border pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                    {t("settings.apiKey")}
                  </Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="password"
                      value={draft.api_key}
                      onChange={(e) => {
                        if (stepOneConnectionError) setStepOneConnectionError(null);
                        setDraft({ ...draft, api_key: e.target.value });
                      }}
                      placeholder={t("settings.apiKeyPlaceholder")}
                      className="bg-background border-border pl-9"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("onboarding.step1.apiKeyHint")}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                    {t("settings.language")}
                  </Label>
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

                <div className="space-y-2">
                  <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                    {t("settings.theme")}
                  </Label>
                  <Select
                    value={draft.theme}
                    onValueChange={(value) => {
                      const nextTheme = value as "light" | "dark" | "system";
                      setDraft({ ...draft, theme: nextTheme });
                      setTheme(nextTheme);
                    }}
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
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-foreground">{t("settings.launchAtStartup")}</p>
                  <Switch
                    checked={draft.launch_at_startup}
                    onCheckedChange={(checked) => setDraft({ ...draft, launch_at_startup: checked })}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-foreground">{t("settings.minimizeToTray")}</p>
                  <Switch
                    checked={draft.minimize_to_tray}
                    onCheckedChange={(checked) => setDraft({ ...draft, minimize_to_tray: checked })}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </div>

              {!canContinueStepOne && (
                <p className="text-xs text-destructive">{t("onboarding.step1.requiredError")}</p>
              )}

              {stepOneConnectionError && (
                <p className="text-xs text-destructive">{t("onboarding.step1.connectionFailed")}: {stepOneConnectionError}</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium text-foreground">{t("onboarding.step2.title")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("onboarding.step2.description")}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                  {t("settings.defaultActivity")}
                </Label>
                <Select
                  value={draft.default_activity_id === null ? NO_DEFAULT_ACTIVITY_VALUE : draft.default_activity_id.toString()}
                  onValueChange={(value) => {
                    setDraft({
                      ...draft,
                      default_activity_id: value === NO_DEFAULT_ACTIVITY_VALUE ? null : Number(value),
                    });
                  }}
                >
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder={t("settings.selectActivity")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEFAULT_ACTIVITY_VALUE}>{t("settings.noDefaultActivity")}</SelectItem>
                    {activities.map((activity) => (
                      <SelectItem key={activity.id} value={activity.id.toString()}>
                        {activity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSyncing && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("settings.syncing")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                  {t("settings.defaultComment")}
                </Label>
                <Input
                  value={draft.default_comment}
                  onChange={(e) => setDraft({ ...draft, default_comment: e.target.value })}
                  placeholder={t("settings.defaultCommentPlaceholder")}
                  className="bg-background border-border"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
                  {t("settings.dailyWorkHours")}
                </Label>
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
                      setDraft({ ...draft, daily_work_hours: Math.min(24, Math.max(1, value)) });
                    }}
                    className="bg-background border-border w-28"
                  />
                  <span className="text-xs text-muted-foreground">h</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Puzzle className="h-4 w-4 text-primary" />
                  {t("onboarding.step3.title")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("onboarding.step3.description")}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                >
                  <p className="text-sm font-medium text-foreground">{t("settings.chromeExtension")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("onboarding.step3.chromeHint")}</p>
                </a>
                <a
                  href={FIREFOX_EXTENSION_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                >
                  <p className="text-sm font-medium text-foreground">{t("settings.firefoxExtension")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("onboarding.step3.firefoxHint")}</p>
                </a>
              </div>

              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t("onboarding.step3.benefits")}</span>
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          {step === 1 && (
            <Button onClick={() => void handleContinueStepOne()} disabled={!canContinueStepOne || isSubmitting}>
              {isSubmitting ? t("onboarding.saving") : t("onboarding.continue")}
            </Button>
          )}

          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={isSubmitting}>
                {t("onboarding.back")}
              </Button>
              <Button onClick={handleContinueStepTwo} disabled={isSubmitting}>
                {t("onboarding.continue")}
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)} disabled={isSubmitting}>
                {t("onboarding.back")}
              </Button>
              <Button onClick={() => void handleFinish()} disabled={isSubmitting}>
                {isSubmitting ? t("onboarding.saving") : t("onboarding.finish")}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
