import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  if (!currentIssue || pendingIssueId === null) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("switchTimer.title")}</DialogTitle>
          <DialogDescription>
            {t("switchTimer.description", {
              currentIssueId: currentIssue.id,
              currentSubject: currentIssue.subject,
            })}
            <br />
            <br />
            {t("switchTimer.question", { pendingIssueId })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-row gap-2">
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            {t("switchTimer.cancel")}
          </Button>
          <Button onClick={onConfirm} className="flex-1">
            {t("switchTimer.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
