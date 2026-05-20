import { useUpdaterStore } from "@/store";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
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

  const releaseTag = availableVersion
    ? availableVersion.startsWith("v")
      ? availableVersion
      : `v${availableVersion}`
    : null;
  const releaseUrl = releaseTag
    ? `https://github.com/jeremyrambaud/clepsydre/releases/tag/${encodeURIComponent(releaseTag)}`
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent showCloseButton={status !== "downloading"} className="sm:max-w-md">
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
          <div className="max-h-32 overflow-y-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground break-words whitespace-pre-wrap">
            {releaseNotes}
          </div>
        )}

        {status === "available" && releaseUrl && (
          <p className="text-xs text-muted-foreground">
            <a
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 underline underline-offset-3 hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("updateDialog.viewRelease")}
            </a>
          </p>
        )}

        {status === "downloading" && (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {t("updateDialog.downloadingInline")}
          </div>
        )}

        <DialogFooter className="sm:flex-wrap">
          {status === "available" && (
            <>
              <Button variant="outline" onClick={remindOnNextLaunch} className="w-full sm:w-auto">
                {t("updateDialog.remindOnNextLaunch")}
              </Button>
              <Button variant="ghost" onClick={ignoreCurrentVersion} className="w-full sm:w-auto">
                {t("updateDialog.ignoreThisVersion")}
              </Button>
              <Button onClick={downloadAndInstall} className="w-full gap-2 sm:w-auto">
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
              <Button variant="outline" onClick={dismiss} className="w-full sm:w-auto">
                {t("updateDialog.later")}
              </Button>
              <Button onClick={restartApp} className="w-full gap-2 sm:w-auto">
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
