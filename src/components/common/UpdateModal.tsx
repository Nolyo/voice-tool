"use client";

import { useTranslation } from "react-i18next";
import { Download, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

  const locale = i18n.language === "en" ? "en-US" : "fr-FR";
  const formattedDate = updateInfo.date
    ? new Date(updateInfo.date).toLocaleDateString(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const bodyLines = updateInfo.body ? updateInfo.body.split("\n") : [];
  const bodyPreview = bodyLines.slice(0, 10).join("\n");
  const hasMoreLines = bodyLines.length > 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vt-app sm:max-w-[520px] border-0 bg-transparent p-0 shadow-none">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--vt-bg)",
            border: "1px solid var(--vt-border)",
            boxShadow: "var(--vt-shadow-elevated)",
          }}
        >
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle
                className="vt-display text-[16px] font-semibold flex items-center gap-2"
                style={{ color: "var(--vt-fg)" }}
              >
                <Download
                  className="w-4 h-4"
                  style={{ color: "var(--vt-accent)" }}
                />
                {t("updater.updateModal.title")}
              </DialogTitle>
              <DialogDescription
                className="text-[12.5px] text-left"
                style={{ color: "var(--vt-fg-3)" }}
              >
                {t("updater.updateModal.versionReady", {
                  version: updateInfo.version,
                })}
                {formattedDate && (
                  <span
                    className="block mt-1 text-[11.5px]"
                    style={{ color: "var(--vt-fg-4)" }}
                  >
                    {t("updater.updateModal.publishedOn")} {formattedDate}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
          </div>

          {updateInfo.body && (
            <div className="px-6 pb-2">
              <div
                className="rounded-xl p-3 max-h-[200px] overflow-y-auto"
                style={{
                  background: "var(--vt-panel)",
                  border: "1px solid var(--vt-border)",
                }}
              >
                <p
                  className="text-[10.5px] uppercase tracking-wide font-medium mb-2"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  {t("updater.updateModal.releaseNotes")}
                </p>
                <div
                  className="text-[12.5px] whitespace-pre-wrap"
                  style={{ color: "var(--vt-fg-2)" }}
                >
                  {bodyPreview}
                  {hasMoreLines && (
                    <span
                      className="block mt-2 text-[11px] italic"
                      style={{ color: "var(--vt-fg-3)" }}
                    >
                      {t("updater.updateModal.viewFullDetails")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 px-6 py-4">
            <button
              type="button"
              onClick={handleViewDetails}
              className="vt-btn vt-btn-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t("updater.updateModal.viewDetails")}
            </button>
            <button
              type="button"
              onClick={handleInstall}
              disabled={isDownloading}
              className="vt-btn vt-btn-sm vt-btn-primary"
            >
              <Download className="w-3.5 h-3.5" />
              {isDownloading
                ? t("updater.updateModal.downloading")
                : t("updater.updateModal.installNow")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
