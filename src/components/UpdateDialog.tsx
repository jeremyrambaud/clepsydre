import { useUpdaterStore } from "@/store";
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
  const { status, availableVersion, releaseNotes, downloadProgress, error } =
    useUpdaterStore();
  const downloadAndInstall = useUpdaterStore((s) => s.downloadAndInstall);
  const restartApp = useUpdaterStore((s) => s.restartApp);
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
            {status === "available" && "Update Available"}
            {status === "downloading" && "Downloading Update..."}
            {status === "ready" && "Update Installed"}
            {status === "error" && "Update Error"}
          </DialogTitle>
          <DialogDescription>
            {status === "available" && (
              <>
                A new version <span className="font-semibold text-foreground">v{availableVersion}</span> is
                available. Would you like to download and install it?
              </>
            )}
            {status === "downloading" && "Please wait while the update is being downloaded and installed."}
            {status === "ready" && "The update has been installed. Restart the application to apply it."}
            {status === "error" && (error || "An unexpected error occurred while checking for updates.")}
          </DialogDescription>
        </DialogHeader>

        {status === "available" && releaseNotes && (
          <div className="max-h-32 overflow-y-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {releaseNotes}
          </div>
        )}

        {status === "downloading" && (
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center tabular-nums">
              {downloadProgress}%
            </p>
          </div>
        )}

        <DialogFooter>
          {status === "available" && (
            <>
              <Button variant="outline" onClick={dismiss}>
                Later
              </Button>
              <Button onClick={downloadAndInstall} className="gap-2">
                <Download className="w-4 h-4" />
                Download & Install
              </Button>
            </>
          )}

          {status === "downloading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Installing...
            </div>
          )}

          {status === "ready" && (
            <>
              <Button variant="outline" onClick={dismiss}>
                Later
              </Button>
              <Button onClick={restartApp} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Restart Now
              </Button>
            </>
          )}

          {status === "error" && (
            <Button variant="outline" onClick={dismiss}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
