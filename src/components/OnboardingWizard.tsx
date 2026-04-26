import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  Cloud,
  Download,
  HardDrive,
  Info,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
type Step = "choice" | "local" | "api";

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

function recommendModel(info: SystemInfo): ModelSize | "api" {
  if (info.has_discrete_gpu) return "large-v3-turbo";
  if (info.total_ram_gb < 6) return "api";
  if (info.total_ram_gb < 12) return "large-v3-turbo-q5_0";
  return "large-v3-turbo";
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const [step, setStep] = useState<Step>("choice");

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
  const [recommendedModel, setRecommendedModel] = useState<ModelSize | "api" | null>(null);

  const [selectedModel, setSelectedModel] = useState<ModelSize>(
    settings.local_model_size || "small",
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState(settings.openai_api_key || "");
  const [apiSaving, setApiSaving] = useState(false);

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

  const chooseLocal = useCallback(async () => {
    await updateSetting("transcription_provider", "Local");
    setStep("local");
  }, [updateSetting]);

  const chooseApi = useCallback(async () => {
    await updateSetting("transcription_provider", "OpenAI");
    setStep("api");
  }, [updateSetting]);

  const runDetection = useCallback(async () => {
    setIsDetecting(true);
    setDetectionFailed(false);
    try {
      const info = await invoke<SystemInfo>("get_system_info");
      setSysInfo(info);
      const reco = recommendModel(info);
      setRecommendedModel(reco);
      if (reco !== "api") {
        setSelectedModel(reco);
      }
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

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    setApiSaving(true);
    try {
      await updateSetting("openai_api_key", apiKey.trim());
      onComplete();
    } finally {
      setApiSaving(false);
    }
  }, [apiKey, updateSetting, onComplete]);

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="dark fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="dark fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-6 border bg-background p-8 text-foreground shadow-lg sm:rounded-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {step === "choice" && (
            <ChoiceStep onLocal={chooseLocal} onApi={chooseApi} />
          )}
          {step === "local" && (
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
              onBack={() => setStep("choice")}
              onSwitchToApi={() => setStep("api")}
            />
          )}
          {step === "api" && (
            <ApiStep
              apiKey={apiKey}
              onChangeApiKey={setApiKey}
              onSave={handleSaveApiKey}
              isSaving={apiSaving}
              onBack={() => setStep("choice")}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ChoiceStep({
  onLocal,
  onApi,
}: {
  onLocal: () => void;
  onApi: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
          <Sparkles className="h-6 w-6 text-violet-500" />
        </div>
        <DialogPrimitive.Title className="text-xl font-semibold">
          {t("onboarding.welcomeTitle")}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="text-sm text-muted-foreground">
          {t("onboarding.welcomeSubtitle")}
        </DialogPrimitive.Description>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onLocal}
          className={cn(
            "group flex flex-col gap-2 rounded-lg border-2 border-border bg-card p-5 text-left transition-all cursor-pointer",
            "hover:border-violet-500/60 hover:bg-violet-500/5 focus:outline-none focus:ring-2 focus:ring-violet-500/40",
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-500/10 text-violet-500">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">{t("onboarding.choiceLocalTitle")}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("onboarding.choiceLocalDesc")}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onApi}
          className={cn(
            "group flex flex-col gap-2 rounded-lg border-2 border-border bg-card p-5 text-left transition-all cursor-pointer",
            "hover:border-sky-500/60 hover:bg-sky-500/5 focus:outline-none focus:ring-2 focus:ring-sky-500/40",
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-500/10 text-sky-500">
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">{t("onboarding.choiceApiTitle")}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("onboarding.choiceApiDesc")}
            </p>
          </div>
        </button>
      </div>
    </>
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
  onSwitchToApi,
}: {
  modelOptions: ModelOption[];
  sysInfo: SystemInfo | null;
  isDetecting: boolean;
  detectionFailed: boolean;
  recommendedModel: ModelSize | "api" | null;
  selectedModel: ModelSize;
  onSelectModel: (m: ModelSize) => void;
  onDetect: () => void;
  onDownload: () => void;
  isDownloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  onBack: () => void;
  onSwitchToApi: () => void;
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
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
            disabled={isDownloading}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogPrimitive.Title className="text-xl font-semibold">
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
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
            {t("onboarding.detectionFailed")}
          </div>
        )}

        {sysInfo && (
          <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-violet-500 shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-foreground">
                  {t("onboarding.systemInfoRam", {
                    ram: sysInfo.total_ram_gb.toFixed(1),
                  })}
                  {gpuSuffix}
                </div>
                {recommendedModel === "api" ? (
                  <p className="mt-1 text-muted-foreground">
                    {t("onboarding.recommendApi")}
                  </p>
                ) : reco ? (
                  <p className="mt-1 text-muted-foreground">
                    {t("onboarding.recommendationLabel")} :{" "}
                    <strong>{reco.label}</strong> ({reco.size}).
                  </p>
                ) : null}
              </div>
            </div>
            {recommendedModel === "api" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSwitchToApi}
                className="w-full"
              >
                {t("onboarding.switchToApi")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
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

function ApiStep({
  apiKey,
  onChangeApiKey,
  onSave,
  isSaving,
  onBack,
}: {
  apiKey: string;
  onChangeApiKey: (v: string) => void;
  onSave: () => void;
  isSaving: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
            disabled={isSaving}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogPrimitive.Title className="text-xl font-semibold">
            {t("onboarding.apiTitle")}
          </DialogPrimitive.Title>
        </div>
        <DialogPrimitive.Description className="text-sm text-muted-foreground">
          {t("onboarding.apiSubtitleBefore")}{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-sky-500 underline"
          >
            platform.openai.com
          </a>
          .
        </DialogPrimitive.Description>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("onboarding.apiKeyLabel")}
        </label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => onChangeApiKey(e.target.value)}
          placeholder="sk-..."
          disabled={isSaving}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
          }}
        />
      </div>

      <Button
        type="button"
        onClick={onSave}
        disabled={!apiKey.trim() || isSaving}
        className="w-full"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("onboarding.saving")}
          </>
        ) : (
          t("onboarding.save")
        )}
      </Button>
    </>
  );
}
