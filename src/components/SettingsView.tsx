import { useEffect, useState } from "react";
import { Link, Eye, EyeOff, RefreshCw, Zap, MessageSquare, MonitorCog, Timer } from "lucide-react";
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
import { useSettingsStore } from "@/store";

export function SettingsView() {
  const { settings, activities, syncActivities, isSyncing, lastSyncedAt } =
    useSettingsStore();
  const [now, setNow] = useState(Date.now());

  const [showApiKey, setShowApiKey] = useState(false);
  const [draft, setDraft] = useState(settings);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  const saveSettings = useSettingsStore((s) => s.saveSettings);

  function handleSave() {
    saveSettings(draft);
  }

  function handleDiscard() {
    setDraft(settings);
  }

  const syncAgo = lastSyncedAt
    ? `${Math.round((now - lastSyncedAt.getTime()) / 60000)} minutes ago`
    : "Never";

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Connection Card */}
      <section className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 mb-6">
          <Link className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold font-heading text-foreground">
            Connection
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
              Redmine Domain URL
            </label>
            <Input
              placeholder="https://redmine.example.com"
              value={draft.redmine_url}
              onChange={(e) => setDraft({ ...draft, redmine_url: e.target.value })}
              className="bg-muted border-border focus:border-primary focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
              API Key
            </label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                placeholder="Enter your API key"
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
            Auto Sync Interval
          </label>
          <div className="flex items-center gap-3">
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
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        </div>

        <div className="border-t border-border pt-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Last successful sync: <span className="text-foreground">{syncAgo}</span>
          </span>
          <Button
            variant="secondary"
            onClick={syncActivities}
            disabled={isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Projects Now"}
          </Button>
        </div>
      </section>

      {/* Bento Grid: Automation + System */}
      <div className="grid grid-cols-5 gap-4">
        {/* Automation Card (3/5) */}
        <section className="col-span-3 rounded-xl bg-card border border-border p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold font-heading text-foreground">
              Automation
            </h3>
          </div>

          {/* Express Mode */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
            <div className="flex items-center gap-3">
              <Timer className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Express Mode</p>
                <p className="text-xs text-muted-foreground">Auto-log on stop without confirmation</p>
              </div>
            </div>
            <Switch
              checked={draft.express_entry}
              onCheckedChange={(checked) => setDraft({ ...draft, express_entry: checked })}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          {/* Default Activity */}
          <div className="space-y-2">
            <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase font-heading">
              Default Activity
            </label>
            <Select
              value={draft.default_activity_id?.toString() ?? ""}
              onValueChange={(v) => setDraft({ ...draft, default_activity_id: Number(v) })}
            >
              <SelectTrigger className="bg-muted border-border">
                <SelectValue placeholder="Select an activity" />
              </SelectTrigger>
              <SelectContent>
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
                Default Comment
              </label>
            </div>
            <textarea
              rows={3}
              placeholder="Optional default comment for time entries..."
              value={draft.default_comment}
              onChange={(e) => setDraft({ ...draft, default_comment: e.target.value })}
              className="w-full rounded-md bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none outline-none"
            />
          </div>
        </section>

        {/* System Card (2/5) */}
        <section className="col-span-2 rounded-xl bg-card border border-border p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <MonitorCog className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold font-heading text-foreground">
              System
            </h3>
          </div>

          {/* Idle Detection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div>
                <p className="text-sm font-medium text-foreground">Idle Detection</p>
                <p className="text-xs text-muted-foreground">Prompt when activity resumes after long idle time</p>
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
              Idle Detection Threshold
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
              Launch at startup
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
              Minimize to tray
            </label>
          </div>

        </section>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={handleDiscard} disabled={!hasChanges}>
          Discard Changes
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
