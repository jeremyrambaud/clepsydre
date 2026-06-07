import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { UserAttentionType, getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { SearchBar } from "./SearchBar";
import { ActiveTicketSection } from "@/components/ActiveTicketSection";
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
import { logTimeEntry, fetchIssue, fetchLatestIssueComment, persistEntryTimesForCurrentDomain, deleteTimeEntry } from "@/lib/redmine";
import { toast } from "sonner";
import type { RedmineIssue, WorkSession } from "@/types";

interface TimerViewProps {
  timer: ReturnType<typeof useTimer>;
  pendingSwitchIssueId?: number | null;
  pendingSwitchLoggedIssueId?: number | null;
  pendingSwitchOpenBillingIssueDialog?: boolean;
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

const AUTO_CONTEXT_COMMENT_PREFIX_REGEX = /^#\d+\s-\s.+$/;

function stripAutoContextCommentPrefix(comment: string): string {
  const normalized = comment.replace(/\r\n/g, "\n");
  const [firstLine = "", ...restLines] = normalized.split("\n");

  if (!AUTO_CONTEXT_COMMENT_PREFIX_REGEX.test(firstLine.trim())) {
    return normalized;
  }

  return restLines.join("\n").replace(/^\n+/, "");
}

function buildCommentWithContextPrefix(
  comment: string,
  contextIssue: RedmineIssue | null,
  loggingIssue: RedmineIssue | null,
): string {
  const baseComment = stripAutoContextCommentPrefix(comment).trim();

  if (!contextIssue || !loggingIssue || loggingIssue.id === contextIssue.id) {
    return baseComment;
  }

  const contextPrefix = `#${contextIssue.id} - ${contextIssue.subject}`;
  return baseComment ? `${contextPrefix}\n${baseComment}` : contextPrefix;
}

export function TimerView({
  timer,
  pendingSwitchIssueId,
  pendingSwitchLoggedIssueId,
  pendingSwitchOpenBillingIssueDialog = false,
  onPendingSwitchHandled,
  externalStopRequested,
  onExternalStopHandled,
}: TimerViewProps) {
  const { t } = useTranslation();
  const { setSelectedIssue, addSession, selectedIssue } = useIssueStore();
  const recentSessions = useIssueStore((s) => s.recentSessions);
  const settings = useSettingsStore((s) => s.settings);
  const allowDifferentLoggedTicket = settings.allow_different_logged_ticket;
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
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualIssue, setManualIssue] = useState(selectedIssue);
  const [manualLoggedIssue, setManualLoggedIssue] = useState<RedmineIssue | null>(selectedIssue);
  const [manualAnchorTime, setManualAnchorTime] = useState<Date>(new Date());
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatingSession, setDuplicatingSession] = useState<WorkSession | null>(null);
  const [deleteEntryModalOpen, setDeleteEntryModalOpen] = useState(false);
  const [deletingSession, setDeletingSession] = useState<WorkSession | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [openBillingIssueDialogRequestToken, setOpenBillingIssueDialogRequestToken] = useState(0);
  const [activeCommentDraft, setActiveCommentDraft] = useState("");
  const [loggingIssueOverride, setLoggingIssueOverride] = useState<RedmineIssue | null>(null);
  const draftCommentRequestRef = useRef(0);
  const skipNextIssuePrefillRef = useRef(false);
  const pendingSwitchIssueRef = useRef<RedmineIssue | null>(null);
  const pendingSwitchCommentRef = useRef("");
  const [idleDecisionSeconds, setIdleDecisionSeconds] = useState<number | null>(null);
  const idleStartedAtMsRef = useRef<number | null>(null);
  const keepRunningAfterCreateSaveRef = useRef(false);
  const clearIssueAfterCreateFlowRef = useRef(false);
  const pendingSwitchIssueIdRef = useRef<number | null>(null);
  const [stoppedIssue, setStoppedIssue] = useState(selectedIssue);
  const [stoppedLoggedIssue, setStoppedLoggedIssue] = useState<RedmineIssue | null>(selectedIssue);
  const idleDialogOpen = idleDecisionSeconds !== null;

  const clearActiveIssue = useCallback(() => {
    setSelectedIssue(null);
    setLoggingIssueOverride(null);
    setStoppedIssue(null);
    setStoppedLoggedIssue(null);
    setActiveCommentDraft("");
    timer.reset();
  }, [setSelectedIssue, timer]);

  const applyDraftCommentForIssue = useCallback(async (issueId: number | null, fallbackComment = "") => {
    draftCommentRequestRef.current += 1;
    const requestId = draftCommentRequestRef.current;

    if (!issueId) {
      setActiveCommentDraft("");
      return;
    }

    if (!settings.prefill_last_comment_on_timer_start) {
      setActiveCommentDraft("");
      return;
    }

    try {
      const latestComment = await fetchLatestIssueComment(issueId);
      if (requestId !== draftCommentRequestRef.current) return;
      setActiveCommentDraft((latestComment ?? fallbackComment).trim());
    } catch {
      if (requestId !== draftCommentRequestRef.current) return;
      setActiveCommentDraft(fallbackComment.trim());
    }
  }, [settings.prefill_last_comment_on_timer_start]);

  useEffect(() => {
    if (skipNextIssuePrefillRef.current) {
      skipNextIssuePrefillRef.current = false;
      return;
    }
    void applyDraftCommentForIssue(selectedIssue?.id ?? null);
  }, [applyDraftCommentForIssue, selectedIssue?.id]);

  useEffect(() => {
    setActiveCommentDraft((currentDraft) => {
      const nextDraft = buildCommentWithContextPrefix(
        currentDraft,
        selectedIssue,
        loggingIssueOverride ?? selectedIssue,
      );

      return nextDraft === currentDraft ? currentDraft : nextDraft;
    });
  }, [loggingIssueOverride, selectedIssue]);

  useEffect(() => {
    if (allowDifferentLoggedTicket) return;
    setLoggingIssueOverride(null);
  }, [allowDifferentLoggedTicket]);

  const getLastImputationTargetForIssue = useCallback((issueId: number): RedmineIssue | null => {
    const previousEntry = recentSessions.find(
      (session) => session.issue.id === issueId && session.loggedIssue?.id != null && session.loggedIssue.id !== issueId
    );

    return previousEntry?.loggedIssue ?? null;
  }, [recentSessions]);

  const handlePendingIssueSwitch = useCallback(() => {
    const nextIssue = pendingSwitchIssueRef.current;
    if (!nextIssue) return false;

    pendingSwitchIssueRef.current = null;
    const pendingComment = pendingSwitchCommentRef.current;
    pendingSwitchCommentRef.current = "";

    // Cancel in-flight comment fetches before switching context.
    draftCommentRequestRef.current += 1;

    if (pendingComment) {
      setActiveCommentDraft(pendingComment);
      skipNextIssuePrefillRef.current = true;
    } else if (settings.prefill_last_comment_on_timer_start) {
      void applyDraftCommentForIssue(nextIssue.id);
    } else {
      setActiveCommentDraft("");
    }

    setSelectedIssue(nextIssue);
    setLoggingIssueOverride(
      allowDifferentLoggedTicket ? getLastImputationTargetForIssue(nextIssue.id) : null
    );
    if (settings.auto_start_timer_on_task_select) {
      timer.start();
    } else {
      timer.reset();
    }
    return true;
  }, [allowDifferentLoggedTicket, applyDraftCommentForIssue, getLastImputationTargetForIssue, setSelectedIssue, settings.auto_start_timer_on_task_select, settings.prefill_last_comment_on_timer_start, timer]);

  function handleSelectFromSession(session: WorkSession) {
    const issueChanged = selectedIssue?.id !== session.issue.id;

    if (timer.isRunning && selectedIssue && issueChanged) {
      pendingSwitchIssueRef.current = session.issue;
      pendingSwitchCommentRef.current = session.comments.trim();
      void finalizeStopFlow(undefined, {
        keepRunningAfterCreateSave: false,
        forceCreateModal: true,
      });
      return;
    }

    if (settings.prefill_last_comment_on_timer_start) {
      // Cancel in-flight fetches and trust the clicked timeline entry comment.
      draftCommentRequestRef.current += 1;
      setActiveCommentDraft(session.comments.trim());

      if (issueChanged) {
        skipNextIssuePrefillRef.current = true;
      }
    }

    if (issueChanged) {
      setSelectedIssue(session.issue);
      setLoggingIssueOverride(
        allowDifferentLoggedTicket ? getLastImputationTargetForIssue(session.issue.id) : null
      );
    }

    if (!settings.auto_start_timer_on_task_select) {
      if (issueChanged && !timer.isRunning) {
        timer.reset();
      }
      return;
    }

    if (!timer.isRunning) {
      timer.start();
      return;
    }

    if (timer.isPaused) {
      timer.resume();
    }
  }

  function buildSession(
    issue: RedmineIssue,
    loggedIssue: RedmineIssue,
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
      issue,
      loggedIssue,
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
    options?: { keepRunningAfterCreateSave?: boolean; stoppedAtOverride?: Date; forceCreateModal?: boolean }
  ) => {
    const contextIssue = selectedIssue;
    const issueForLogging = allowDifferentLoggedTicket
      ? (loggingIssueOverride ?? selectedIssue)
      : selectedIssue;
    const seconds = Math.max(0, Math.floor(secondsOverride ?? timer.elapsedSeconds));
    if (seconds === 0 || !issueForLogging || !contextIssue) {
      timer.stop();
      return;
    }

    setStoppedIssue(contextIssue);
    setStoppedLoggedIssue(issueForLogging);

    const stoppedAt = options?.stoppedAtOverride ?? new Date();
    const startedAt = timer.startTime ?? new Date(stoppedAt.getTime() - seconds * 1000);

    if (settings.express_entry && !options?.forceCreateModal) {
      timer.stop();
      const hours = Math.round((seconds / 3600) * 100) / 100;
      const spentOn = stoppedAt.toISOString().split("T")[0];
      const draftCommentWithContext = buildCommentWithContextPrefix(activeCommentDraft, contextIssue, issueForLogging);
      const defaultCommentWithContext = buildCommentWithContextPrefix(settings.default_comment, contextIssue, issueForLogging);
      const commentToLog = draftCommentWithContext.trim() || defaultCommentWithContext.trim();
      try {
        const entryId = await logTimeEntry({
          issueId: issueForLogging.id,
          hours,
          activityId: settings.default_activity_id ?? 0,
          comments: commentToLog,
          spentOn,
        });
        await persistEntryTimesForCurrentDomain(entryId, formatHHMM(startedAt), formatHHMM(stoppedAt), {
          issue: contextIssue,
          loggedIssue: issueForLogging,
        });
        addSession(
          buildSession(
            contextIssue,
            issueForLogging,
            hours,
            settings.default_activity_id ?? 0,
            commentToLog,
            spentOn,
            entryId,
            startedAt,
            stoppedAt
          )
        );
        toast.success(t("timerView.timeLoggedSuccess"), {
          description: t("timerView.loggedDescription", {
            duration: formatTimeDisplay(seconds),
            issueId: issueForLogging.id,
          }),
        });
      } catch (err) {
        toast.error(t("timerView.failedLogTime"), {
          description: err instanceof Error ? err.message : String(err),
        });
      }
      void applyDraftCommentForIssue(issueForLogging.id, commentToLog);
      timer.reset();
    } else {
      keepRunningAfterCreateSaveRef.current = options?.keepRunningAfterCreateSave ?? false;
      setStoppedStartTime(startedAt);
      setStoppedAtTime(stoppedAt);
      setStoppedSeconds(seconds);
      timer.stop();
      setCreateModalOpen(true);
    }
  }, [activeCommentDraft, addSession, allowDifferentLoggedTicket, applyDraftCommentForIssue, loggingIssueOverride, selectedIssue, settings, timer]);

  const handleStop = useCallback(async () => {
    keepRunningAfterCreateSaveRef.current = false;
    await finalizeStopFlow();
  }, [finalizeStopFlow]);

  const handleResetActiveTicket = useCallback(() => {
    timer.reset();
    if (!settings.prefill_last_comment_on_timer_start) {
      setActiveCommentDraft("");
    }
  }, [settings.prefill_last_comment_on_timer_start, timer]);

  const handleClearActiveIssue = useCallback(async () => {
    if (!selectedIssue) return;

    if (timer.isRunning || timer.isPaused) {
      clearIssueAfterCreateFlowRef.current = true;
      const shouldClearImmediately = settings.express_entry || timer.elapsedSeconds <= 0;
      await finalizeStopFlow(undefined, { keepRunningAfterCreateSave: false });
      if (shouldClearImmediately) {
        clearIssueAfterCreateFlowRef.current = false;
        clearActiveIssue();
      }
      return;
    }

    clearActiveIssue();
  }, [clearActiveIssue, finalizeStopFlow, selectedIssue, settings.express_entry, timer.elapsedSeconds, timer.isPaused, timer.isRunning]);

  const handleOpenManualEntry = useCallback(() => {
    if (!selectedIssue) return;
    const issueForManual = allowDifferentLoggedTicket
      ? (loggingIssueOverride ?? selectedIssue)
      : selectedIssue;
    const now = new Date();
    setManualIssue(selectedIssue);
    setManualLoggedIssue(issueForManual);
    setManualAnchorTime(now);
    setManualModalOpen(true);
  }, [allowDifferentLoggedTicket, loggingIssueOverride, selectedIssue]);

  const handleOpenManualEntryForIssue = useCallback((issue: RedmineIssue) => {
    const now = new Date();
    setManualIssue(issue);
    setManualLoggedIssue(
      allowDifferentLoggedTicket
        ? (getLastImputationTargetForIssue(issue.id) ?? issue)
        : issue
    );
    setManualAnchorTime(now);
    setManualModalOpen(true);
  }, [allowDifferentLoggedTicket, getLastImputationTargetForIssue]);

  useEffect(() => {
    if (pendingSwitchIssueId == null) return;
    const issueId = pendingSwitchIssueId;
    pendingSwitchIssueIdRef.current = null;
    onPendingSwitchHandled?.();

    const doSwitch = async () => {
      const isSameIssue = selectedIssue?.id === issueId;
      const shouldStartTimerAfterSwitch =
        !timer.isRunning || timer.isPaused || (selectedIssue != null && !isSameIssue);

      if (timer.isRunning && selectedIssue && !isSameIssue) {
        await finalizeStopFlow(undefined, { keepRunningAfterCreateSave: false });
      }

      try {
        const issue =
          isSameIssue && selectedIssue
            ? selectedIssue
            : await fetchIssue(issueId);

        if (!isSameIssue || !selectedIssue) {
          setSelectedIssue(issue);
        }

        let nextBillingIssue: RedmineIssue | null = null;
        if (
          allowDifferentLoggedTicket &&
          pendingSwitchLoggedIssueId != null &&
          pendingSwitchLoggedIssueId !== issue.id
        ) {
          try {
            nextBillingIssue = await fetchIssue(pendingSwitchLoggedIssueId);
          } catch (billingIssueError) {
            console.error("Failed to load billing issue override:", billingIssueError);
          }
        }

        if (allowDifferentLoggedTicket && !nextBillingIssue) {
          nextBillingIssue = getLastImputationTargetForIssue(issue.id);
        }

        setLoggingIssueOverride(
          allowDifferentLoggedTicket && nextBillingIssue && nextBillingIssue.id !== issue.id
            ? nextBillingIssue
            : null
        );

        if (shouldStartTimerAfterSwitch) {
          timer.start();
        }

        if (allowDifferentLoggedTicket && pendingSwitchOpenBillingIssueDialog) {
          setOpenBillingIssueDialogRequestToken((token) => token + 1);
        }
      } catch (err) {
        toast.error(t("timerView.failedStartNewTicket"), {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    };
    void doSwitch();
  }, [
    allowDifferentLoggedTicket,
    finalizeStopFlow,
    getLastImputationTargetForIssue,
    onPendingSwitchHandled,
    pendingSwitchIssueId,
    pendingSwitchLoggedIssueId,
    pendingSwitchOpenBillingIssueDialog,
    selectedIssue,
    t,
    timer,
  ]);

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
      !idleDialogOpen &&
      !createModalOpen &&
      !editModalOpen &&
      !manualModalOpen;

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
    manualModalOpen,
    idleDialogOpen,
    selectedIssue,
    settings.idle_detection_enabled,
    settings.idle_threshold_minutes,
    timer.isPaused,
    timer.isRunning,
  ]);

  useEffect(() => {
    let unlistenReached: (() => void) | undefined;

    void listen<{ idle_seconds: number }>("idle-threshold-reached", async (event) => {
      if (!settings.idle_detection_enabled) return;
      if (createModalOpen || editModalOpen || manualModalOpen) return;
      if (!timer.isRunning || timer.isPaused || !selectedIssue) return;
      if (idleStartedAtMsRef.current !== null) return;

      await bringAppToFront();
      const nextIdleSeconds = event.payload?.idle_seconds ?? settings.idle_threshold_minutes * 60;
      idleStartedAtMsRef.current = Date.now() - nextIdleSeconds * 1000;
      setIdleDecisionSeconds(nextIdleSeconds);
    }).then((cleanup) => {
      unlistenReached = cleanup;
    }).catch((error) => {
      console.error("Failed to subscribe to idle threshold reached event:", error);
    });

    return () => {
      if (unlistenReached) unlistenReached();
    };
  }, [
    bringAppToFront,
    createModalOpen,
    editModalOpen,
    manualModalOpen,
    selectedIssue,
    settings.idle_detection_enabled,
    settings.idle_threshold_minutes,
    timer.isPaused,
    timer.isRunning,
  ]);

  useEffect(() => {
    if (idleDecisionSeconds === null) {
      idleStartedAtMsRef.current = null;
    }
  }, [idleDecisionSeconds]);

  useEffect(() => {
    if (idleDecisionSeconds === null) return;

    const interval = window.setInterval(() => {
      if (idleStartedAtMsRef.current === null) return;
      const liveIdleSeconds = Math.max(0, Math.floor((Date.now() - idleStartedAtMsRef.current) / 1000));
      setIdleDecisionSeconds(liveIdleSeconds);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [idleDecisionSeconds]);

  const handleIdleKeepAll = useCallback(() => {
    idleStartedAtMsRef.current = null;
    setIdleDecisionSeconds(null);
  }, []);

  const handleIdleSubtractAndStop = useCallback(
    async (restart: boolean) => {
      if (idleDecisionSeconds === null) return;

      const referenceMs = Date.now();
      const idleStartMs = idleStartedAtMsRef.current ?? Math.max(0, referenceMs - idleDecisionSeconds * 1000);
      const stopAt = new Date(idleStartMs);

      const adjustedSeconds = timer.startTime
        ? Math.max(0, Math.floor((idleStartMs - timer.startTime.getTime()) / 1000))
        : Math.max(0, timer.elapsedSeconds - idleDecisionSeconds);

      idleStartedAtMsRef.current = null;
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

  function handleCreateSaved(issue: RedmineIssue, loggedIssue: RedmineIssue, entryId: number, hours: number, activityId: number, comments: string, spentOn: string, startedAt: string, stoppedAt: string) {
    if (issue) {
      const session = buildSession(
        issue,
        loggedIssue,
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
    setStoppedLoggedIssue(null);

    if (clearIssueAfterCreateFlowRef.current) {
      clearIssueAfterCreateFlowRef.current = false;
      clearActiveIssue();
      return;
    }

    if (handlePendingIssueSwitch()) {
      return;
    }

    void applyDraftCommentForIssue(issue.id, comments);

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

  function handleEditSaved(updates: Pick<WorkSession, "issue" | "loggedIssue" | "hours" | "activityId" | "comments" | "spentOn" | "startedAt" | "stoppedAt">) {
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

  function handleManualSaved(issue: RedmineIssue, loggedIssue: RedmineIssue, entryId: number, hours: number, activityId: number, comments: string, spentOn: string, startedAt: string, stoppedAt: string) {
    if (issue) {
      const session = buildSession(
        issue,
        loggedIssue,
        hours,
        activityId,
        comments,
        spentOn,
        entryId,
        manualAnchorTime,
        manualAnchorTime
      );
      session.startedAt = startedAt;
      session.stoppedAt = stoppedAt;
      addSession(session);
      useIssueStore.getState().refreshIssues();
    }

    setManualModalOpen(false);
    setManualIssue(null);
    setManualLoggedIssue(null);
  }

  function handleDuplicateSession(session: WorkSession) {
    setDuplicatingSession(session);
    setDuplicateModalOpen(true);
  }

  function handleDuplicateSaved(issue: RedmineIssue, loggedIssue: RedmineIssue, entryId: number, hours: number, activityId: number, comments: string, spentOn: string, startedAt: string, stoppedAt: string) {
    const session = buildSession(
      issue,
      loggedIssue,
      hours,
      activityId,
      comments,
      spentOn,
      entryId,
      new Date(),
      new Date()
    );
    session.startedAt = startedAt;
    session.stoppedAt = stoppedAt;
    addSession(session);
    useIssueStore.getState().refreshIssues();

    setDuplicateModalOpen(false);
    setDuplicatingSession(null);
  }

  function handleRequestDeleteSession(session: WorkSession) {
    if (!session.redmineEntryId) return;
    setDeletingSession(session);
    setDeleteEntryModalOpen(true);
  }

  const handleConfirmDeleteSession = useCallback(async () => {
    if (!deletingSession?.redmineEntryId) return;

    setIsDeletingSession(true);
    try {
      await deleteTimeEntry(deletingSession.redmineEntryId);
      useIssueStore.getState().removeSession(deletingSession.id);
      toast.success(t("timeEntry.deleteSuccess"));
    } catch (err) {
      toast.error(t("timeEntry.deleteFailed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDeletingSession(false);
      setDeleteEntryModalOpen(false);
      setDeletingSession(null);
    }
  }, [deletingSession, t]);

  const handleSelectIssueFromSearch = useCallback((issue: RedmineIssue, matchedComment?: string) => {
    const issueChanged = selectedIssue?.id !== issue.id;
    const nextComment = matchedComment?.trim() ?? "";

    if (timer.isRunning && selectedIssue && issueChanged) {
      pendingSwitchIssueRef.current = issue;
      pendingSwitchCommentRef.current = nextComment;
      void finalizeStopFlow(undefined, {
        keepRunningAfterCreateSave: false,
        forceCreateModal: true,
      });
      return;
    }

    if (nextComment) {
      draftCommentRequestRef.current += 1;
      setActiveCommentDraft(nextComment);
      if (issueChanged) {
        skipNextIssuePrefillRef.current = true;
      }
    }

    if (issueChanged) {
      setSelectedIssue(issue);
      setLoggingIssueOverride(
        allowDifferentLoggedTicket ? getLastImputationTargetForIssue(issue.id) : null
      );
    }

    if (!settings.auto_start_timer_on_task_select) {
      if (issueChanged && !timer.isRunning) {
        timer.reset();
      }
      return;
    }

    if (!timer.isRunning) {
      timer.start();
      return;
    }

    if (timer.isPaused) {
      timer.resume();
    }
  }, [allowDifferentLoggedTicket, finalizeStopFlow, getLastImputationTargetForIssue, selectedIssue, setSelectedIssue, settings.auto_start_timer_on_task_select, timer]);

  const handleSwitchActiveTicketKeepElapsed = useCallback((issue: RedmineIssue) => {
    if (selectedIssue?.id === issue.id) return;

    // Keep the current draft exactly as-is when switching via the active-ticket bar.
    skipNextIssuePrefillRef.current = true;

    setSelectedIssue(issue);
    setLoggingIssueOverride(
      allowDifferentLoggedTicket ? getLastImputationTargetForIssue(issue.id) : null
    );
  }, [allowDifferentLoggedTicket, getLastImputationTargetForIssue, selectedIssue?.id, setSelectedIssue]);

  const handleSetLoggingIssue = useCallback((issue: RedmineIssue | null) => {
    if (!allowDifferentLoggedTicket) {
      setLoggingIssueOverride(null);
      return;
    }

    if (!selectedIssue) {
      setLoggingIssueOverride(null);
      return;
    }

    if (!issue || issue.id === selectedIssue.id) {
      setLoggingIssueOverride(null);
      return;
    }

    setLoggingIssueOverride(issue);
  }, [allowDifferentLoggedTicket, selectedIssue]);

  const activeTimelineSession = useMemo<WorkSession | null>(() => {
    if (!selectedIssue || !timer.isRunning) return null;

    const now = new Date();
    const start = timer.startTime ?? new Date(now.getTime() - timer.elapsedSeconds * 1000);

    return {
      id: `__active__${selectedIssue.id}_${start.getTime()}`,
      issue: selectedIssue,
      loggedIssue: allowDifferentLoggedTicket
        ? (loggingIssueOverride ?? selectedIssue)
        : selectedIssue,
      hours: timer.elapsedSeconds / 3600,
      activityId: settings.default_activity_id ?? 0,
      comments: activeCommentDraft,
      spentOn: now.toISOString().split("T")[0],
      startedAt: formatHHMM(start),
      stoppedAt: formatHHMM(now),
      createdAt: now.toISOString(),
    };
  }, [activeCommentDraft, allowDifferentLoggedTicket, loggingIssueOverride, selectedIssue, settings.default_activity_id, timer.elapsedSeconds, timer.isRunning, timer.startTime]);

  return (
    <div className="flex flex-col max-w-6xl mx-auto lg:h-full lg:min-h-0">
      <div className="shrink-0 space-y-6 pb-4">
        <SearchBar
          onManualEntry={handleOpenManualEntryForIssue}
          onIssueSelected={handleSelectIssueFromSearch}
        />
        <ActiveTicketSection
          timer={timer}
          onReset={handleResetActiveTicket}
          onStop={handleStop}
          onClearIssue={() => { void handleClearActiveIssue(); }}
          onSwitchIssue={handleSwitchActiveTicketKeepElapsed}
          billingIssue={allowDifferentLoggedTicket ? loggingIssueOverride : null}
          onBillingIssueChange={allowDifferentLoggedTicket ? handleSetLoggingIssue : undefined}
          openBillingIssueDialogRequestToken={openBillingIssueDialogRequestToken}
          onManualEntry={handleOpenManualEntry}
          commentDraft={activeCommentDraft}
          onCommentDraftChange={setActiveCommentDraft}
        />
      </div>
      <div className="pt-2 lg:flex-1 lg:min-h-0">
        <RecentTickets
          activeTimelineSession={activeTimelineSession}
          onSelectSession={handleSelectFromSession}
          onEditSession={handleEditSession}
          onDuplicateSession={handleDuplicateSession}
          onDeleteSession={handleRequestDeleteSession}
        />
      </div>

      {stoppedIssue && (
        <TimeEntryModal
          mode="create"
          open={createModalOpen}
          onClose={() => {
            keepRunningAfterCreateSaveRef.current = false;
            setCreateModalOpen(false);
            setStoppedLoggedIssue(null);
            const issueId = stoppedIssue?.id ?? useIssueStore.getState().selectedIssue?.id ?? null;

            if (clearIssueAfterCreateFlowRef.current) {
              clearIssueAfterCreateFlowRef.current = false;
              setSelectedIssue(null);
              setLoggingIssueOverride(null);
              setStoppedIssue(null);
              setStoppedLoggedIssue(null);
              setActiveCommentDraft("");
              return;
            }

            if (handlePendingIssueSwitch()) {
              return;
            }

            if (!timer.isRunning) {
              timer.reset();
            }

            if (settings.prefill_last_comment_on_timer_start) {
              return;
            }

            void applyDraftCommentForIssue(issueId);
          }}
          onSaved={handleCreateSaved}
          issue={stoppedIssue}
          loggingIssue={stoppedLoggedIssue ?? stoppedIssue}
          elapsedSeconds={stoppedSeconds}
          startedAt={formatHHMM(stoppedStartTime ?? new Date())}
          stoppedAt={formatHHMM(stoppedAtTime ?? new Date())}
          initialComment={activeCommentDraft.trim() || undefined}
          onDraftCommentChange={setActiveCommentDraft}
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

      {manualIssue && (
        <TimeEntryModal
          mode="create"
          open={manualModalOpen}
          onClose={() => {
            setManualModalOpen(false);
            setManualIssue(null);
            setManualLoggedIssue(null);
          }}
          onSaved={handleManualSaved}
          issue={manualIssue}
          loggingIssue={manualLoggedIssue ?? manualIssue}
          elapsedSeconds={0}
          startedAt={formatHHMM(manualAnchorTime)}
          stoppedAt={formatHHMM(manualAnchorTime)}
        />
      )}

      {duplicatingSession && (
        <TimeEntryModal
          mode="create"
          intent="duplicate"
          open={duplicateModalOpen}
          onClose={() => {
            setDuplicateModalOpen(false);
            setDuplicatingSession(null);
          }}
          onSaved={handleDuplicateSaved}
          issue={duplicatingSession.issue}
          loggingIssue={duplicatingSession.loggedIssue ?? duplicatingSession.issue}
          initialSpentOn={duplicatingSession.spentOn}
          initialActivityId={duplicatingSession.activityId}
          elapsedSeconds={Math.round(duplicatingSession.hours * 3600)}
          startedAt={duplicatingSession.startedAt}
          stoppedAt={duplicatingSession.stoppedAt}
          initialComment={duplicatingSession.comments}
        />
      )}

      <Dialog open={deleteEntryModalOpen} onOpenChange={(open) => {
        if (!isDeletingSession) {
          setDeleteEntryModalOpen(open);
          if (!open) {
            setDeletingSession(null);
          }
        }
      }}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("timeEntry.deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("timeEntry.deleteConfirmDescription", {
              issueId: deletingSession?.issue.id ?? "",
              start: deletingSession?.startedAt ?? "--:--",
              end: deletingSession?.stoppedAt ?? "--:--",
            })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => {
              setDeleteEntryModalOpen(false);
              setDeletingSession(null);
            }} disabled={isDeletingSession}>
              {t("timeEntry.discard")}
            </Button>
            <Button variant="destructive" onClick={() => { void handleConfirmDeleteSession(); }} disabled={isDeletingSession}>
              {isDeletingSession ? t("timeEntry.saving") : t("timeEntry.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={idleDecisionSeconds !== null} onOpenChange={(open) => {
        if (!open) {
          idleStartedAtMsRef.current = null;
          setIdleDecisionSeconds(null);
        }
      }}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("timerView.idleTitle")}</DialogTitle>
            <DialogDescription>
              {t("timerView.idleDescription", {
                duration: formatIdleDuration(idleDecisionSeconds ?? 0),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button type="button" variant="secondary" className="w-full" onClick={handleIdleKeepAll}>
              {t("timerView.idleContinueWithoutChanges")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => { void handleIdleSubtractAndStop(false); }}
            >
              {t("timerView.idleSubtractAndStop")}
            </Button>
            <Button
              type="button"
              className="w-full"
              onClick={() => { void handleIdleSubtractAndStop(true); }}
            >
              {t("timerView.idleSubtractAndContinue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
