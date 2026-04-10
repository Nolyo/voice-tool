"use client";

import { Download, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useUpdaterContext } from "@/contexts/UpdaterContext";

interface UpdateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewDetails: () => void;
}

export function UpdateModal({ open, onOpenChange, onViewDetails }: UpdateModalProps) {
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
  const formattedDate = updateInfo.date
    ? new Date(updateInfo.date).toLocaleDateString('fr-FR', {
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
            Nouvelle mise à jour disponible
          </DialogTitle>
          <DialogDescription className="text-left">
            La version <span className="font-semibold text-foreground">{updateInfo.version}</span> est prête à être installée.
            {formattedDate && (
              <span className="block mt-1 text-xs text-muted-foreground">
                Publiée le {formattedDate}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {updateInfo.body && (
          <div className="max-h-[200px] overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Notes de version
            </p>
            <div className="text-sm text-foreground whitespace-pre-wrap">
              {updateInfo.body.split('\n').slice(0, 10).join('\n')}
              {updateInfo.body.split('\n').length > 10 && (
                <span className="block mt-2 text-xs text-muted-foreground italic">
                  ... Voir les détails complets dans les paramètres
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
            Voir les détails
          </Button>
          <Button
            onClick={handleInstall}
            disabled={isDownloading}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? "Téléchargement..." : "Installer maintenant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
