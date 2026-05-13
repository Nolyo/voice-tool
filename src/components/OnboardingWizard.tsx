import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  Download,
  Info,
  Loader2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import type { AppSettings } from "@/lib/settings";

type ModelSize = AppSettings["settings"]["local_model_size"];

interface SystemInfo {
  total_ram_gb: number;
  has_discrete_gpu: boolean;
  gpu_name: string | null;
}

interface ModelOption {
  value: ModelSize;
  label: string;
  size: string;
}

function recommendModel(info: SystemInfo): ModelSize {
  if (info.has_discrete_gpu) return "large-v3-turbo";
  if (info.total_ram_gb < 6) return "tiny";
  if (info.total_ram_gb < 12) return "large-v3-turbo-q5_0";
  return "large-v3-turbo";
}

export function OnboardingWizard({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  /**
   * Optional escape hatch. When set, the local step shows a back arrow that
   * calls this — used by `WelcomeScreen` to let the user return to the
   * cloud-vs-local choice.
   */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const modelOptions = useMemo<ModelOption[]>(
    () => [
      { value: "tiny", label: "Tiny", size: "39 MB" },
      { value: "base", label: "Base", size: "74 MB" },
      { value: "small", label: "Small", size: "244 MB" },
      { value: "medium", label: "Medium", size: "1.5 GB" },
      { value: "large-v1", label: "Large v1", size: "2.9 GB" },
      { value: "large-v2", label: "Large v2", size: "2.9 GB" },
      { value: "large-v3", label: "Large v3", size: "2.9 GB" },
      {
        value: "large-v3-turbo-q5_0",
        label: `Large v3 Turbo ${t("onboarding.modelQuantizedSuffix")}`,
        size: "547 MB",
      },
      { value: "large-v3-turbo", label: "Large v3 Turbo", size: "1.6 GB" },
    ],
    [t],
  );

  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [recommendedModel, setRecommendedModel] = useState<ModelSize | null>(null);

  const [selectedModel, setSelectedModel] = useState<ModelSize>(
    settings.local_model_size || "small",
  );
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

  // Default the wizard to the Local provider since this is the only branch
  // that lands here (cloud goes through WelcomeScreen → Auth).
  useEffect(() => {
    if (settings.transcription_provider !== "Local") {
      void updateSetting("transcription_provider", "Local");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDetection = useCallback(async () => {
    setIsDetecting(true);
    setDetectionFailed(false);
    try {
      const info = await invoke<SystemInfo>("get_system_info");
      setSysInfo(info);
      const reco = recommendModel(info);
      setRecommendedModel(reco);
      setSelectedModel(reco);
    } catch (e) {
      console.error("System detection failed:", e);
      setDetectionFailed(true);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadError(null);
    try {
      await updateSetting("local_model_size", selectedModel);
      await invoke("download_local_model", { model: selectedModel });
      onComplete();
    } catch (e) {
      console.error("Download failed:", e);
      setDownloadError(String(e));
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  }, [selectedModel, updateSetting, onComplete]);

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="vt-app fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="vt-app fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-6 border bg-background p-8 text-foreground shadow-lg sm:rounded-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <LocalStep
            modelOptions={modelOptions}
            sysInfo={sysInfo}
            isDetecting={isDetecting}
            detectionFailed={detectionFailed}
            recommendedModel={recommendedModel}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            onDetect={runDetection}
            onDownload={handleDownload}
            isDownloading={isDownloading}
            downloadProgress={downloadProgress}
            downloadError={downloadError}
            onBack={onBack}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LocalStep({
  modelOptions,
  sysInfo,
  isDetecting,
  detectionFailed,
  recommendedModel,
  selectedModel,
  onSelectModel,
  onDetect,
  onDownload,
  isDownloading,
  downloadProgress,
  downloadError,
  onBack,
}: {
  modelOptions: ModelOption[];
  sysInfo: SystemInfo | null;
  isDetecting: boolean;
  detectionFailed: boolean;
  recommendedModel: ModelSize | null;
  selectedModel: ModelSize;
  onSelectModel: (m: ModelSize) => void;
  onDetect: () => void;
  onDownload: () => void;
  isDownloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  /** When undefined, no back arrow is rendered. */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const reco = modelOptions.find((m) => m.value === recommendedModel);
  const gpuSuffix =
    sysInfo?.has_discrete_gpu && sysInfo.gpu_name
      ? ` · ${t("onboarding.gpuDetectedNamed", { name: sysInfo.gpu_name })}`
      : sysInfo?.has_discrete_gpu
        ? ` · ${t("onboarding.gpuDetected")}`
        : sysInfo
          ? ` · ${t("onboarding.noGpu")}`
          : "";

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground"
              disabled={isDownloading}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <DialogPrimitive.Title className="vt-display text-xl font-semibold">
            {t("onboarding.localTitle")}
          </DialogPrimitive.Title>
        </div>
        <DialogPrimitive.Description className="text-sm text-muted-foreground">
          {t("onboarding.localSubtitle")}
        </DialogPrimitive.Description>
      </div>

      <div className="space-y-3">
        {!sysInfo && !detectionFailed && (
          <Button
            type="button"
            onClick={onDetect}
            disabled={isDetecting}
            className="w-full"
            variant="outline"
          >
            {isDetecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("onboarding.analyzing")}
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                {t("onboarding.detectButton")}
              </>
            )}
          </Button>
        )}

        {detectionFailed && (
          <div
            className="rounded-md border p-3 text-sm"
            style={{
              borderColor: "oklch(from var(--vt-warn) l c h / 0.3)",
              background: "oklch(from var(--vt-warn) l c h / 0.05)",
              color: "var(--vt-warn)",
            }}
          >
            {t("onboarding.detectionFailed")}
          </div>
        )}

        {sysInfo && (
          <div
            className="rounded-md border p-4 space-y-2"
            style={{
              borderColor: "oklch(from var(--vt-violet) l c h / 0.3)",
              background: "oklch(from var(--vt-violet) l c h / 0.05)",
            }}
          >
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-vt-violet shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-foreground">
                  {t("onboarding.systemInfoRam", {
                    ram: sysInfo.total_ram_gb.toFixed(1),
                  })}
                  {gpuSuffix}
                </div>
                {reco ? (
                  <p className="mt-1 text-muted-foreground">
                    {t("onboarding.recommendationLabel")} :{" "}
                    <strong>{reco.label}</strong> ({reco.size}).
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="vt-eyebrow">
          {t("onboarding.modelToDownload")}
        </label>
        <Select
          value={selectedModel}
          onValueChange={(v) => onSelectModel(v as ModelSize)}
          disabled={isDownloading}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="dark">
            {modelOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label} ({m.size})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">{t("onboarding.tipLabel")} :</strong>{" "}
        {t("onboarding.tipBody")}
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
        onClick={onDownload}
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
            {t("onboarding.downloadButton")}
          </>
        )}
      </Button>
    </>
  );
}
