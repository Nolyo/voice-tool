import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  ArrowLeft,
  Cpu,
  Download,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/hooks/useSettings";
import {
  OFFICIAL_LOCAL_MODEL as TURBO_MODEL,
  OFFICIAL_LOCAL_MODEL_SIZE_LABEL as TURBO_SIZE_LABEL,
} from "@/lib/settings";
import type { SystemInfo } from "@/lib/system-eligibility";

export function OnboardingWizard({
  systemInfo,
  isEligible,
  onComplete,
  onBack,
}: {
  systemInfo: SystemInfo | null;
  isEligible: boolean;
  onComplete: () => void;
  /**
   * Optional escape hatch. When set, a back arrow is rendered so the user can
   * return to the cloud-vs-local choice — used by `WelcomeScreen`.
   */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<number>("model-download-progress", (event) => {
      setDownloadProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (settings.transcription_provider !== "Local") {
      void updateSetting("transcription_provider", "Local");
    }
    if (settings.local_model_size !== TURBO_MODEL) {
      void updateSetting("local_model_size", TURBO_MODEL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadError(null);
    try {
      await updateSetting("local_model_size", TURBO_MODEL);
      await invoke("download_local_model", { model: TURBO_MODEL });
      onComplete();
    } catch (e) {
      console.error("Download failed:", e);
      setDownloadError(String(e));
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  }, [updateSetting, onComplete]);

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-onboarding-overlay
          className="vt-app fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="vt-app fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-6 border bg-background p-8 text-foreground shadow-lg sm:rounded-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={isDownloading}
                  aria-label={t("onboarding.backToChoice")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <DialogPrimitive.Title className="vt-display text-xl font-semibold">
                {t("onboarding.localRecommendedTitle")}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {t("onboarding.localRecommendedSubtitle")}
            </DialogPrimitive.Description>
          </div>

          {!isEligible && (
            <div
              className="rounded-md border p-4 space-y-2"
              style={{
                borderColor: "oklch(from var(--vt-warn) l c h / 0.4)",
                background: "oklch(from var(--vt-warn) l c h / 0.08)",
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="h-4 w-4 mt-0.5 shrink-0"
                  style={{ color: "var(--vt-warn)" }}
                />
                <div className="text-sm" style={{ color: "var(--vt-fg)" }}>
                  <div className="font-medium">
                    {t("onboarding.forcedLocalWarningTitle")}
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {t("onboarding.forcedLocalWarningBody")}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div
            className="rounded-md border p-4 space-y-3"
            style={{
              borderColor: "oklch(from var(--vt-violet) l c h / 0.3)",
              background: "oklch(from var(--vt-violet) l c h / 0.05)",
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--vt-violet)" }}
              />
              <div className="flex-1">
                <div className="font-medium text-foreground">
                  {t("onboarding.modelTurboName")}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("onboarding.modelTurboDescription", {
                    size: TURBO_SIZE_LABEL,
                  })}
                </p>
              </div>
            </div>
            {systemInfo && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/40 pt-2">
                <Cpu className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {systemInfo.has_discrete_gpu && systemInfo.gpu_name
                    ? t("onboarding.detectedGpuNamed", {
                        name: systemInfo.gpu_name,
                        ram: systemInfo.total_ram_gb.toFixed(1),
                      })
                    : systemInfo.has_discrete_gpu
                      ? t("onboarding.detectedGpu", {
                          ram: systemInfo.total_ram_gb.toFixed(1),
                        })
                      : t("onboarding.detectedNoGpu", {
                          ram: systemInfo.total_ram_gb.toFixed(1),
                        })}
                </span>
              </div>
            )}
          </div>

          {isDownloading && (
            <div className="space-y-1.5">
              <Progress value={downloadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {t("onboarding.downloadProgress", {
                  percent: Math.round(downloadProgress),
                })}
              </p>
            </div>
          )}

          {downloadError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive vt-anim-fade-up">
              {t("onboarding.downloadErrorPrefix")} : {downloadError}
            </div>
          )}

          <Button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("onboarding.downloading")}
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                {t("onboarding.downloadButtonWithSize", {
                  size: TURBO_SIZE_LABEL,
                })}
              </>
            )}
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
