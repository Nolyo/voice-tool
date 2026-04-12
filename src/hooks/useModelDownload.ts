import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@/lib/settings";

type LocalModelSize = AppSettings["settings"]["local_model_size"];
type TranscriptionProvider = AppSettings["settings"]["transcription_provider"];

/**
 * Manage local Whisper model lifecycle: check availability, download with
 * progress, delete. Mirrors the legacy inline logic from `setting-tabs.tsx`.
 */
export function useModelDownload(
  provider: TranscriptionProvider,
  modelSize: LocalModelSize,
) {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (provider !== "Local") return;
    setIsChecking(true);
    try {
      const exists = await invoke<boolean>("check_local_model_exists", {
        model: modelSize || "base",
      });
      setIsDownloaded(exists);
    } catch (e) {
      console.error("Failed to check model status:", e);
    } finally {
      setIsChecking(false);
    }
  }, [provider, modelSize]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      unlisten = await listen<number>("model-download-progress", (event) => {
        setProgress(event.payload);
      });
    };
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const download = useCallback(async () => {
    setIsDownloading(true);
    setProgress(0);
    try {
      await invoke("download_local_model", { model: modelSize });
      toast.success(t('errors.modelDownloaded', { model: modelSize }));
      setIsDownloaded(true);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error(t('errors.modelDownloadError', { error }));
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  }, [modelSize]);

  const remove = useCallback(async () => {
    try {
      await invoke("delete_local_model", { model: modelSize });
      toast.success(t('errors.modelDeleted', { model: modelSize }));
      setIsDownloaded(false);
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error(t('errors.modelDeleteError', { error }));
    }
  }, [modelSize]);

  return {
    isDownloading,
    progress,
    isDownloaded,
    isChecking,
    download,
    remove,
  };
}
