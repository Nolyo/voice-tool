"use client";

import { useTranslation } from "react-i18next";
import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdaterContext } from "@/contexts/UpdaterContext";

interface UpdateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewDetails: () => void;
}

export function UpdateModal({ open, onOpenChange, onViewDetails }: UpdateModalProps) {
  const { t, i18n } = useTranslation();
  const { updateInfo, downloadAndInstall, isDownloading } = useUpdaterContext();

  if (!updateInfo?.available) {
    return null;
  }

  const handleInstall = async () => {
    try {
      await downloadAndInstall();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to start download:", error);
    }
  };

  const handleViewDetails = () => {
    onOpenChange(false);
    onViewDetails();
  };

  // Format date if available
  const locale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const formattedDate = updateInfo.date
    ? new Date(updateInfo.date).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            {t('updater.updateModal.title')}
          </DialogTitle>
          <DialogDescription className="text-left">
            {t('updater.updateModal.versionReady', { version: updateInfo.version })}
            {formattedDate && (
              <span className="block mt-1 text-xs text-muted-foreground">
                {t('updater.updateModal.publishedOn')} {formattedDate}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {updateInfo.body && (
          <div className="max-h-[200px] overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {t('updater.updateModal.releaseNotes')}
            </p>
            <div className="text-sm text-foreground whitespace-pre-wrap">
              {updateInfo.body.split('\n').slice(0, 10).join('\n')}
              {updateInfo.body.split('\n').length > 10 && (
                <span className="block mt-2 text-xs text-muted-foreground italic">
                  {t('updater.updateModal.viewFullDetails')}
                </span>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleViewDetails}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            {t('updater.updateModal.viewDetails')}
          </Button>
          <Button
            onClick={handleInstall}
            disabled={isDownloading}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? t('updater.updateModal.downloading') : t('updater.updateModal.installNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
