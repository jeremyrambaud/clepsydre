import { useState, useCallback, useEffect } from "react";
import { SearchBar } from "./SearchBar";
import { ActiveTicketSection } from "./ActiveTicketSection";
import { RecentTickets } from "./RecentTickets";
import { TimeEntryModal } from "./TimeEntryModal";
import { useTimer } from "@/hooks/useTimer";
import { useIssueStore, useSettingsStore } from "@/store";
import { logTimeEntry } from "@/lib/redmine";
import { toast } from "sonner";
import type { WorkSession } from "@/types";

interface TimerViewProps {
  timer: ReturnType<typeof useTimer>;
}

function formatTimeDisplay(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

export function TimerView({ timer }: TimerViewProps) {
  const { setSelectedIssue, addSession, selectedIssue } = useIssueStore();
  const settings = useSettingsStore((s) => s.settings);
  const loadSessions = useIssueStore((s) => s.loadSessions);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [stoppedSeconds, setStoppedSeconds] = useState(0);
  const [editingSession, setEditingSession] = useState<WorkSession | null>(null);

  function handleSelectFromSession(session: WorkSession) {
    setSelectedIssue(session.issue);
  }

  function buildSession(
    hours: number,
    activityId: number,
    comments: string,
    spentOn: string,
    entryId: number
  ): WorkSession {
    const now = new Date();
    const started = timer.startTime ?? new Date(now.getTime() - hours * 3600000);
    return {
      id: crypto.randomUUID(),
      issue: selectedIssue!,
      hours,
      activityId,
      comments,
      spentOn,
      startedAt: formatHHMM(started),
      stoppedAt: formatHHMM(now),
      redmineEntryId: entryId,
      createdAt: now.toISOString(),
    };
  }

  const handleStop = useCallback(async () => {
    const seconds = timer.elapsedSeconds;
    if (seconds === 0 || !selectedIssue) {
      timer.stop();
      return;
    }

    if (settings.express_entry) {
      timer.stop();
      const hours = Math.round((seconds / 3600) * 100) / 100;
      const spentOn = new Date().toISOString().split("T")[0];
      try {
        const entryId = await logTimeEntry({
          issueId: selectedIssue.id,
          hours,
          activityId: settings.default_activity_id ?? 0,
          comments: settings.default_comment,
          spentOn,
        });
        addSession(buildSession(hours, settings.default_activity_id ?? 0, settings.default_comment, spentOn, entryId));
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
      setStoppedSeconds(seconds);
      timer.stop();
      setCreateModalOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, selectedIssue, settings, addSession]);

  function handleCreateSaved(entryId: number, hours: number, activityId: number, comments: string, spentOn: string, startedAt: string, stoppedAt: string) {
    if (selectedIssue) {
      const session = buildSession(hours, activityId, comments, spentOn, entryId);
      session.startedAt = startedAt;
      session.stoppedAt = stoppedAt;
      addSession(session);
    }
    setCreateModalOpen(false);
    timer.reset();
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

      {selectedIssue && (
        <TimeEntryModal
          mode="create"
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSaved={handleCreateSaved}
          issue={selectedIssue}
          elapsedSeconds={stoppedSeconds}
          startedAt={timer.startTime ? formatHHMM(timer.startTime) : formatHHMM(new Date())}
          stoppedAt={formatHHMM(new Date())}
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
    </div>
  );
}
