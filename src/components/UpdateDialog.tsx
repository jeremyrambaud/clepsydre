import { useUpdaterStore } from "@/store";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function UpdateDialog() {
  const { t } = useTranslation();
  const { status, availableVersion, releaseNotes, error } =
    useUpdaterStore();
  const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);
  const restartApp = useUpdaterStore((s) => s.restartApp);
  const remindOnNextLaunch = useUpdaterStore((s) => s.remindOnNextLaunch);
  const ignoreCurrentVersion = useUpdaterStore((s) => s.ignoreCurrentVersion);
  const dismiss = useUpdaterStore((s) => s.dismiss);

  const isOpen =
    status === "available" ||
    status === "downloading" ||
    status === "ready" ||
    status === "error";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent showCloseButton={status !== "downloading"}>
        <DialogHeader>
          <DialogTitle>
            {status === "available" && t("updateDialog.titleAvailable")}
            {status === "downloading" && t("updateDialog.titleDownloading")}
            {status === "ready" && t("updateDialog.titleReady")}
            {status === "error" && t("updateDialog.titleError")}
          </DialogTitle>
          <DialogDescription>
            {status === "available" && (
              t("updateDialog.availableDescription", { version: availableVersion })
            )}
            {status === "downloading" && t("updateDialog.downloadingDescription")}
            {status === "ready" && t("updateDialog.readyDescription")}
            {status === "error" && (error || t("updateDialog.genericError"))}
          </DialogDescription>
        </DialogHeader>

        {status === "available" && releaseNotes && (
          <div className="max-h-32 overflow-y-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {releaseNotes}
          </div>
        )}

        {status === "downloading" && (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {t("updateDialog.downloadingInline")}
          </div>
        )}

        <DialogFooter>
          {status === "available" && (
            <>
              <Button variant="outline" onClick={remindOnNextLaunch}>
                {t("updateDialog.remindOnNextLaunch")}
              </Button>
              <Button variant="ghost" onClick={ignoreCurrentVersion}>
                {t("updateDialog.ignoreThisVersion")}
              </Button>
              <Button onClick={downloadAndInstall} className="gap-2">
                <Download className="w-4 h-4" />
                {t("updateDialog.downloadInstall")}
              </Button>
            </>
          )}

          {status === "downloading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {t("updateDialog.installing")}
            </div>
          )}

          {status === "ready" && (
            <>
              <Button variant="outline" onClick={dismiss}>
                {t("updateDialog.later")}
              </Button>
              <Button onClick={restartApp} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                {t("updateDialog.restartNow")}
              </Button>
            </>
          )}

          {status === "error" && (
            <Button variant="outline" onClick={dismiss}>
              {t("updateDialog.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
