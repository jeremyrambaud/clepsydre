import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { RedmineIssue } from "@/types";

interface SwitchTimerDialogProps {
  open: boolean;
  pendingIssueId: number | null;
  currentIssue: RedmineIssue | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SwitchTimerDialog({
  open,
  pendingIssueId,
  currentIssue,
  onConfirm,
  onCancel,
}: SwitchTimerDialogProps) {
  if (!currentIssue || pendingIssueId === null) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Timer already running</DialogTitle>
          <DialogDescription>
            A timer is currently running on ticket{" "}
            <strong>#{currentIssue.id}</strong> — {currentIssue.subject}.
            <br />
            <br />
            Do you want to stop it and start tracking{" "}
            <strong>#{pendingIssueId}</strong>?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-row gap-2">
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="flex-1">
            Stop current & switch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
