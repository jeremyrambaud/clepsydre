import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TimerReturn } from "./useTimer";
import { useIssueStore, useSettingsStore } from "@/store";
import { fetchIssue } from "@/lib/redmine";

interface IntegrationRequest {
  action: string;
  issueId: number | null;
  requestId: string;
}

interface IntegrationResponse {
  requestId: string;
  action: string;
  ok: boolean;
  error?: string;
  state?: {
    status: string;
    issueId: number | null;
    issueSubject: string | null;
    elapsedSeconds: number;
    startTimeMs?: number | null;
    redmineUrl: string | null;
  };
  switchRequired?: boolean;
  currentIssueId?: number;
  currentIssueSubject?: string;
}

interface UseIntegrationBridgeOptions {
  timer: TimerReturn;
  onSwitchRequest: (pendingIssueId: number) => void;
  onStopRequest: () => void;
}

export function useIntegrationBridge({
  timer,
  onSwitchRequest,
  onStopRequest,
}: UseIntegrationBridgeOptions) {
  const selectedIssue = useIssueStore((s) => s.selectedIssue);
  const redmineUrl = useSettingsStore((s) => s.settings.redmine_url || null);
  const timerRef = useRef(timer);
  timerRef.current = timer;

  const syncTimerState = useCallback(() => {
    const t = timerRef.current;
    const status = !t.isRunning ? "idle" : t.isPaused ? "paused" : "running";

    void invoke("update_timer_state", {
      status,
      issueId: selectedIssue?.id ?? null,
      issueSubject: selectedIssue?.subject ?? null,
      elapsedSeconds: t.elapsedSeconds,
      startTimeMs: t.startTime ? t.startTime.getTime() : null,
      redmineUrl,
    }).catch(() => {});
  }, [redmineUrl, selectedIssue]);

  useEffect(() => {
    syncTimerState();
  }, [
    timer.startTime,
    timer.isRunning,
    timer.isPaused,
    timer.elapsedSeconds,
    selectedIssue,
    redmineUrl,
    syncTimerState,
  ]);

  const respond = useCallback(
    (response: IntegrationResponse) => {
      void invoke("integration_respond", { response }).catch(() => {});
    },
    []
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<IntegrationRequest>("integration-request", async (event) => {
      const { action, issueId, requestId } = event.payload;
      const t = timerRef.current;
      const selectedIssue = useIssueStore.getState().selectedIssue;

      if (action === "getTimerState") {
        const status = !t.isRunning
          ? "idle"
          : t.isPaused
            ? "paused"
            : "running";
        const redmineUrl = useSettingsStore.getState().settings.redmine_url || null;
        respond({
          requestId,
          action,
          ok: true,
          state: {
            status,
            issueId: selectedIssue?.id ?? null,
            issueSubject: selectedIssue?.subject ?? null,
            elapsedSeconds: t.elapsedSeconds,
            redmineUrl,
          },
        });
        return;
      }

      if (action === "startIssue") {
        if (issueId == null) {
          respond({
            requestId,
            action,
            ok: false,
            error: "issueId is required",
          });
          return;
        }

        const { redmine_url, api_key } = useSettingsStore.getState().settings;
        if (!redmine_url || !api_key) {
          respond({
            requestId,
            action,
            ok: false,
            error: "Redmine credentials not configured",
          });
          return;
        }

        if (t.isRunning && selectedIssue && selectedIssue.id !== issueId) {
          void invoke("show_main_window").catch(() => {});
          onSwitchRequest(issueId);
          respond({
            requestId,
            action,
            ok: true,
            switchRequired: true,
            currentIssueId: selectedIssue.id,
            currentIssueSubject: selectedIssue.subject,
          });
          return;
        }

        try {
          const issue = await fetchIssue(issueId);
          useIssueStore.getState().setSelectedIssue(issue);
          if (!t.isRunning) {
            t.start();
          }
          respond({ requestId, action, ok: true });
        } catch (err) {
          respond({
            requestId,
            action,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (action === "stopCurrent") {
        if (!t.isRunning) {
          respond({
            requestId,
            action,
            ok: false,
            error: "No timer is running",
          });
          return;
        }
        void invoke("show_main_window").catch(() => {});
        onStopRequest();
        respond({ requestId, action, ok: true });
        return;
      }

      respond({
        requestId,
        action,
        ok: false,
        error: `Unknown action: ${action}`,
      });
    })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, [onSwitchRequest, onStopRequest, respond]);
}
