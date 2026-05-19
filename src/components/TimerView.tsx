import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { UserAttentionType, getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { SearchBar } from "./SearchBar";
import { ActiveTicketSection } from "./ActiveTicketSection";
import { RecentTickets } from "./RecentTickets";
import { TimeEntryModal } from "./TimeEntryModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTimer } from "@/hooks/useTimer";
import { useIssueStore, useSettingsStore } from "@/store";
import { logTimeEntry, fetchIssue } from "@/lib/redmine";
import { toast } from "sonner";
import type { WorkSession } from "@/types";

interface TimerViewProps {
  timer: ReturnType<typeof useTimer>;
  pendingSwitchIssueId?: number | null;
  onPendingSwitchHandled?: () => void;
  externalStopRequested?: boolean;
  onExternalStopHandled?: () => void;
}

function formatTimeDisplay(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function formatIdleDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function TimerView({ timer, pendingSwitchIssueId, onPendingSwitchHandled, externalStopRequested, onExternalStopHandled }: TimerViewProps) {
  const { setSelectedIssue, addSession, selectedIssue } = useIssueStore();
  const settings = useSettingsStore((s) => s.settings);
  const loadSessions = useIssueStore((s) => s.loadSessions);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [stoppedSeconds, setStoppedSeconds] = useState(0);
  const [stoppedStartTime, setStoppedStartTime] = useState<Date | null>(null);
  const [stoppedAtTime, setStoppedAtTime] = useState<Date | null>(null);
  const [editingSession, setEditingSession] = useState<WorkSession | null>(null);
  const [idleDecisionSeconds, setIdleDecisionSeconds] = useState<number | null>(null);
  const idleDecisionAnchorMsRef = useRef<number | null>(null);
  const idleResumeAtMsRef = useRef<number | null>(null);
  const keepRunningAfterCreateSaveRef = useRef(false);
  const pendingSwitchIssueIdRef = useRef<number | null>(null);
  const [stoppedIssue, setStoppedIssue] = useState(selectedIssue);

  function handleSelectFromSession(session: WorkSession) {
    setSelectedIssue(session.issue);
  }

  function buildSession(
    issue: typeof selectedIssue,
    hours: number,
    activityId: number,
    comments: string,
    spentOn: string,
    entryId: number,
    startedAt: Date,
    stoppedAt: Date
  ): WorkSession {
    return {
      id: crypto.randomUUID(),
      issue: issue!,
      hours,
      activityId,
      comments,
      spentOn,
      startedAt: formatHHMM(startedAt),
      stoppedAt: formatHHMM(stoppedAt),
      redmineEntryId: entryId,
      createdAt: stoppedAt.toISOString(),
    };
  }

  const finalizeStopFlow = useCallback(async (
    secondsOverride?: number,
    options?: { keepRunningAfterCreateSave?: boolean; stoppedAtOverride?: Date }
  ) => {
    const seconds = Math.max(0, Math.floor(secondsOverride ?? timer.elapsedSeconds));
    if (seconds === 0 || !selectedIssue) {
      timer.stop();
      return;
    }

    setStoppedIssue(selectedIssue);

    const stoppedAt = options?.stoppedAtOverride ?? new Date();
    const startedAt = timer.startTime ?? new Date(stoppedAt.getTime() - seconds * 1000);

    if (settings.express_entry) {
      timer.stop();
      const hours = Math.round((seconds / 3600) * 100) / 100;
      const spentOn = stoppedAt.toISOString().split("T")[0];
      try {
        const entryId = await logTimeEntry({
          issueId: selectedIssue.id,
          hours,
          activityId: settings.default_activity_id ?? 0,
          comments: settings.default_comment,
          spentOn,
        });
        addSession(
          buildSession(
            selectedIssue,
            hours,
            settings.default_activity_id ?? 0,
            settings.default_comment,
            spentOn,
            entryId,
            startedAt,
            stoppedAt
          )
        );
        toast.success("Time logged successfully", {
          description: `${formatTimeDisplay(seconds)} on #${selectedIssue.id}`,
        });
      } catch (err) {
        toast.error("Failed to log time", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
      timer.reset();
    } else {
      keepRunningAfterCreateSaveRef.current = options?.keepRunningAfterCreateSave ?? false;
      setStoppedStartTime(startedAt);
      setStoppedAtTime(stoppedAt);
      setStoppedSeconds(seconds);
      timer.stop();
      setCreateModalOpen(true);
    }
  }, [addSession, selectedIssue, settings, timer]);

  const handleStop = useCallback(async () => {
    keepRunningAfterCreateSaveRef.current = false;
    await finalizeStopFlow();
  }, [finalizeStopFlow]);

  useEffect(() => {
    if (pendingSwitchIssueId == null) return;
    const issueId = pendingSwitchIssueId;
    pendingSwitchIssueIdRef.current = null;
    onPendingSwitchHandled?.();

    const doSwitch = async () => {
      if (timer.isRunning && selectedIssue) {
        await finalizeStopFlow(undefined, { keepRunningAfterCreateSave: false });
      }
      try {
        const issue = await fetchIssue(issueId);
        setSelectedIssue(issue);
        timer.start();
      } catch (err) {
        toast.error("Failed to start new ticket", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    };
    void doSwitch();
  }, [pendingSwitchIssueId]);

  useEffect(() => {
    if (!externalStopRequested) return;
    onExternalStopHandled?.();
    if (timer.isRunning && selectedIssue) {
      void finalizeStopFlow();
    }
  }, [externalStopRequested]);

  const bringAppToFront = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.unminimize();
      await appWindow.show();
      await appWindow.setAlwaysOnTop(true);
      await appWindow.setFocus();
      await appWindow.requestUserAttention(UserAttentionType.Critical);

      window.setTimeout(() => {
        void appWindow.setAlwaysOnTop(false);
      }, 1500);
    } catch (error) {
      console.error("Failed to focus app window after idle:", error);
    }
  }, []);

  useEffect(() => {
    const trackingActive =
      settings.idle_detection_enabled &&
      timer.isRunning &&
      !timer.isPaused &&
      !!selectedIssue &&
      !createModalOpen &&
      !editModalOpen;

    void invoke("set_idle_monitor_config", {
      enabled: settings.idle_detection_enabled,
      thresholdMinutes: settings.idle_threshold_minutes,
      trackingActive,
    }).catch((error) => {
      console.error("Failed to update idle monitor config:", error);
    });
  }, [
    createModalOpen,
    editModalOpen,
    idleDecisionSeconds,
    selectedIssue,
    settings.idle_detection_enabled,
    settings.idle_threshold_minutes,
    timer.isPaused,
    timer.isRunning,
  ]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<{ idle_seconds: number }>("idle-resume-threshold-exceeded", async (event) => {
      if (!settings.idle_detection_enabled) return;
      if (createModalOpen || editModalOpen) return;
      if (!timer.isRunning || timer.isPaused || !selectedIssue) return;

      idleResumeAtMsRef.current = Date.now();
      await bringAppToFront();
      const nextIdleSeconds = event.payload?.idle_seconds ?? settings.idle_threshold_minutes * 60;
      if (idleDecisionAnchorMsRef.current === null) {
        idleDecisionAnchorMsRef.current = Date.now() - nextIdleSeconds * 1000;
      }
      const anchoredIdleSeconds = Math.max(
        nextIdleSeconds,
        Math.floor((Date.now() - idleDecisionAnchorMsRef.current) / 1000)
      );
      setIdleDecisionSeconds(anchoredIdleSeconds);
    }).then((cleanup) => {
      unlisten = cleanup;
    }).catch((error) => {
      console.error("Failed to subscribe to idle monitor event:", error);
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [
    bringAppToFront,
    createModalOpen,
    editModalOpen,
    selectedIssue,
    settings.idle_detection_enabled,
    settings.idle_threshold_minutes,
    timer.isPaused,
    timer.isRunning,
  ]);

  useEffect(() => {
    if (idleDecisionSeconds === null) {
      idleDecisionAnchorMsRef.current = null;
      idleResumeAtMsRef.current = null;
    }
  }, [idleDecisionSeconds]);

  const handleIdleKeepAll = useCallback(() => {
    idleDecisionAnchorMsRef.current = null;
    idleResumeAtMsRef.current = null;
    setIdleDecisionSeconds(null);
  }, []);

  const handleIdleSubtractAndStop = useCallback(
    async (restart: boolean) => {
      if (idleDecisionSeconds === null) return;

      const resumeAtMs = idleResumeAtMsRef.current;
      const referenceMs = resumeAtMs ?? Date.now();
      const stopAtMs = Math.max(0, referenceMs - idleDecisionSeconds * 1000);
      const stopAt = new Date(stopAtMs);

      const adjustedSeconds = timer.startTime
        ? Math.max(0, Math.floor((stopAtMs - timer.startTime.getTime()) / 1000))
        : Math.max(0, timer.elapsedSeconds - idleDecisionSeconds);

      idleDecisionAnchorMsRef.current = null;
      idleResumeAtMsRef.current = null;
      setIdleDecisionSeconds(null);
      await finalizeStopFlow(adjustedSeconds, {
        keepRunningAfterCreateSave: restart && !settings.express_entry,
        stoppedAtOverride: stopAt,
      });

      if (restart && selectedIssue) {
        timer.start();
        timer.setStartTime(new Date(referenceMs));
      }
    },
    [finalizeStopFlow, idleDecisionSeconds, selectedIssue, settings.express_entry, timer]
  );

  function handleCreateSaved(entryId: number, hours: number, activityId: number, comments: string, spentOn: string, startedAt: string, stoppedAt: string) {
    if (stoppedIssue) {
      const session = buildSession(
        stoppedIssue,
        hours,
        activityId,
        comments,
        spentOn,
        entryId,
        stoppedStartTime ?? new Date(),
        stoppedAtTime ?? new Date()
      );
      session.startedAt = startedAt;
      session.stoppedAt = stoppedAt;
      addSession(session);
    }
    setCreateModalOpen(false);

    if (keepRunningAfterCreateSaveRef.current) {
      keepRunningAfterCreateSaveRef.current = false;
      return;
    }
    if (!timer.isRunning) {
      timer.reset();
    }
  }

  function handleEditSession(session: WorkSession) {
    setEditingSession(session);
    setEditModalOpen(true);
  }

  function handleEditSaved(updates: Pick<WorkSession, "hours" | "activityId" | "comments" | "spentOn" | "startedAt" | "stoppedAt">) {
    if (editingSession) {
      useIssueStore.getState().updateSession(editingSession.id, updates);
    }
    setEditModalOpen(false);
    setEditingSession(null);
    useIssueStore.getState().refreshIssues();
  }

  function handleDeleted(sessionId: string) {
    useIssueStore.getState().removeSession(sessionId);
    setEditModalOpen(false);
    setEditingSession(null);
  }

  return (
    <div className="flex flex-col max-w-6xl mx-auto h-full min-h-0">
      <div className="shrink-0 space-y-6 pb-4">
        <SearchBar />
        <ActiveTicketSection timer={timer} onStop={handleStop} />
      </div>
      <div className="flex-1 min-h-0 pt-2">
        <RecentTickets
          onSelectSession={handleSelectFromSession}
          onEditSession={handleEditSession}
        />
      </div>

      {stoppedIssue && (
        <TimeEntryModal
          mode="create"
          open={createModalOpen}
          onClose={() => {
            keepRunningAfterCreateSaveRef.current = false;
            setCreateModalOpen(false);
            if (!timer.isRunning) {
              timer.reset();
            }
          }}
          onSaved={handleCreateSaved}
          issue={stoppedIssue}
          elapsedSeconds={stoppedSeconds}
          startedAt={formatHHMM(stoppedStartTime ?? new Date())}
          stoppedAt={formatHHMM(stoppedAtTime ?? new Date())}
        />
      )}

      {editingSession && (
        <TimeEntryModal
          mode="edit"
          open={editModalOpen}
          onClose={() => { setEditModalOpen(false); setEditingSession(null); }}
          onSaved={handleEditSaved}
          onDeleted={handleDeleted}
          issue={editingSession.issue}
          session={editingSession}
        />
      )}

      <Dialog open={idleDecisionSeconds !== null} onOpenChange={(open) => {
        if (!open) {
          idleDecisionAnchorMsRef.current = null;
          idleResumeAtMsRef.current = null;
          setIdleDecisionSeconds(null);
        }
      }}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inactivity detected</DialogTitle>
            <DialogDescription>
              You were inactive for {formatIdleDuration(idleDecisionSeconds ?? 0)}. Choose how to handle this period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button type="button" variant="secondary" className="w-full" onClick={handleIdleKeepAll}>
              Continue without changes
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => { void handleIdleSubtractAndStop(false); }}
            >
              Subtract idle time and stop
            </Button>
            <Button
              type="button"
              className="w-full"
              onClick={() => { void handleIdleSubtractAndStop(true); }}
            >
              Subtract and continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
