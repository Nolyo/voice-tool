import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface UpdateInfo {
  version: string;
  date: string | null;
  body: string | null;
  available: boolean;
}

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
  percentage: number;
}

export function useUpdater() {
  const [isChecking, setIsChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updaterAvailable, setUpdaterAvailable] = useState<boolean | null>(null);

  /**
   * Check if updater is available (not in dev or portable mode)
   */
  const checkUpdaterAvailability = useCallback(async () => {
    try {
      const available = await invoke<boolean>("is_updater_available");
      setUpdaterAvailable(available);
      return available;
    } catch (err) {
      console.error("Failed to check updater availability:", err);
      setUpdaterAvailable(false);
      return false;
    }
  }, []);

  /**
   * Check for available updates
   */
  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      // First check if updater is available
      const available = await checkUpdaterAvailability();
      if (!available) {
        setError("Mise à jour non disponible en mode développement ou portable");
        return null;
      }

      const info = await invoke<UpdateInfo>("check_for_updates");
      setUpdateInfo(info);
      return info;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error("Failed to check for updates:", errorMessage);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [checkUpdaterAvailability]);

  /**
   * Download and install the update
   */
  const downloadAndInstall = useCallback(async () => {
    setIsDownloading(true);
    setDownloadProgress(null);
    setError(null);

    // Listen for progress events
    let unlisten: UnlistenFn | null = null;

    try {
      unlisten = await listen<DownloadProgress>(
        "update-download-progress",
        (event) => {
          setDownloadProgress(event.payload);
        }
      );

      // Start download and installation
      // Note: This will exit the app when installation begins
      await invoke("download_and_install_update");

      // This line should never be reached as the app exits
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error("Failed to download/install update:", errorMessage);
      setIsDownloading(false);
      setDownloadProgress(null);
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  }, []);

  /**
   * Reset the updater state
   */
  const reset = useCallback(() => {
    setUpdateInfo(null);
    setError(null);
    setDownloadProgress(null);
    setIsDownloading(false);
  }, []);

  return {
    // State
    isChecking,
    updateInfo,
    isDownloading,
    downloadProgress,
    error,
    updaterAvailable,

    // Actions
    checkForUpdates,
    downloadAndInstall,
    checkUpdaterAvailability,
    reset,
  };
}
