import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useUpdater, type UpdateInfo } from "@/hooks/useUpdater";
import { useSettings } from "@/hooks/useSettings";

interface UpdaterContextType {
  updateAvailable: boolean;
  updateInfo: UpdateInfo | null;
  checkForUpdates: () => Promise<UpdateInfo | null>;
  downloadAndInstall: () => Promise<void>;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: { downloaded: number; total: number | null; percentage: number } | null;
  error: string | null;
}

const UpdaterContext = createContext<UpdaterContextType | undefined>(undefined);

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useUpdater();
  const { settings, isLoaded } = useSettings();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const hasCheckedOnStartup = useRef(false);
  const updaterRef = useRef(updater);

  // Keep updater ref up to date
  useEffect(() => {
    updaterRef.current = updater;
  }, [updater]);

  // Check for updates on startup (with delay)
  useEffect(() => {
    // Wait for settings to be loaded before checking
    if (!isLoaded) {
      console.log("UpdaterContext: Waiting for settings to load...");
      return;
    }

    if (hasCheckedOnStartup.current) {
      console.log("UpdaterContext: Already checked for updates on startup");
      return;
    }

    if (!settings.auto_check_updates) {
      console.log("UpdaterContext: Auto-check updates is disabled");
      return;
    }

    hasCheckedOnStartup.current = true;
    console.log("UpdaterContext: Scheduling update check in 10 seconds...");

    // Wait 10 seconds after startup to avoid interfering with app initialization
    const timer = setTimeout(async () => {
      console.log("UpdaterContext: Checking for updates on startup...");
      try {
        const info = await updaterRef.current.checkForUpdates();
        console.log("UpdaterContext: Check result:", info);
        if (info?.available) {
          console.log("UpdaterContext: Update available:", info.version);
          setUpdateAvailable(true);
        } else {
          console.log("UpdaterContext: No update available");
        }
      } catch (error) {
        console.error("UpdaterContext: Failed to check for updates on startup:", error);
      }
    }, 10000); // 10 seconds

    return () => {
      console.log("UpdaterContext: Clearing update check timer");
      clearTimeout(timer);
    };
  }, [isLoaded, settings.auto_check_updates]);

  // Update the updateAvailable state when updater.updateInfo changes
  useEffect(() => {
    setUpdateAvailable(updater.updateInfo?.available ?? false);
  }, [updater.updateInfo]);

  const checkForUpdates = useCallback(async () => {
    const info = await updater.checkForUpdates();
    setUpdateAvailable(info?.available ?? false);
    return info;
  }, [updater]);

  return (
    <UpdaterContext.Provider
      value={{
        updateAvailable,
        updateInfo: updater.updateInfo,
        checkForUpdates,
        downloadAndInstall: updater.downloadAndInstall,
        isChecking: updater.isChecking,
        isDownloading: updater.isDownloading,
        downloadProgress: updater.downloadProgress,
        error: updater.error,
      }}
    >
      {children}
    </UpdaterContext.Provider>
  );
}

export function useUpdaterContext() {
  const context = useContext(UpdaterContext);
  if (context === undefined) {
    throw new Error("useUpdaterContext must be used within UpdaterProvider");
  }
  return context;
}
