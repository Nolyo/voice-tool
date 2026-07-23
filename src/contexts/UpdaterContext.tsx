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
import {
  PERIODIC_TICK_MS,
  shouldCheckNow,
} from "@/lib/updater/periodic-check";

interface UpdaterContextType {
  updateAvailable: boolean;
  updateInfo: UpdateInfo | null;
  checkForUpdates: () => Promise<UpdateInfo | null>;
  downloadAndInstall: () => Promise<void>;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: { downloaded: number; total: number | null; percentage: number } | null;
  error: string | null;
  updaterAvailable: boolean | null;
  checkUpdaterAvailability: () => Promise<boolean>;
  showUpdateModal: boolean;
  setShowUpdateModal: (show: boolean) => void;
}

const UpdaterContext = createContext<UpdaterContextType | undefined>(undefined);

// Dev-only mock: set VITE_MOCK_UPDATE_AVAILABLE=true in .env.local to force
// the "update available" UI without a real release. Tree-shaken in prod.
const MOCK_UPDATE =
  import.meta.env.DEV &&
  import.meta.env.VITE_MOCK_UPDATE_AVAILABLE === "true";

const MOCK_UPDATE_INFO: UpdateInfo = {
  version: "99.0.0-mock",
  date: new Date().toISOString(),
  body:
    "## Mocked release notes\n" +
    "- This is a fake update used to preview the sidebar banner and modal.\n" +
    "- Set VITE_MOCK_UPDATE_AVAILABLE=false (or remove the var) to disable.\n" +
    "- Clicking 'Install now' will be a no-op in this mode.",
  available: true,
};

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useUpdater();
  const { settings, isLoaded } = useSettings();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const hasCheckedOnStartup = useRef(false);
  const updaterRef = useRef(updater);
  const lastCheckTimeRef = useRef<number | null>(null);

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
      lastCheckTimeRef.current = Date.now();
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

  // Periodic re-check: the app can stay open for days (PC sleep, tray), so a
  // startup-only check misses releases. A short tick comparing timestamps is
  // robust to sleep/wake — a 1h setInterval would drift after suspend.
  useEffect(() => {
    if (!isLoaded || !settings.auto_check_updates) {
      return;
    }

    const interval = setInterval(async () => {
      const updaterNow = updaterRef.current;
      const due = shouldCheckNow(
        {
          lastCheckTime: lastCheckTimeRef.current,
          updateAvailable,
          isChecking: updaterNow.isChecking,
          isDownloading: updaterNow.isDownloading,
        },
        Date.now(),
      );
      if (!due) {
        return;
      }

      console.log("UpdaterContext: Running periodic update check...");
      lastCheckTimeRef.current = Date.now();
      try {
        const info = await updaterNow.checkForUpdates();
        if (info?.available) {
          console.log(
            "UpdaterContext: Periodic check found update:",
            info.version,
          );
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.error("UpdaterContext: Periodic update check failed:", error);
      }
    }, PERIODIC_TICK_MS);

    return () => clearInterval(interval);
  }, [isLoaded, settings.auto_check_updates, updateAvailable]);

  // Update the updateAvailable state when updater.updateInfo changes
  useEffect(() => {
    setUpdateAvailable(updater.updateInfo?.available ?? false);
  }, [updater.updateInfo]);

  const checkForUpdates = useCallback(async () => {
    lastCheckTimeRef.current = Date.now();
    const info = await updater.checkForUpdates();
    setUpdateAvailable(info?.available ?? false);
    return info;
  }, [updater]);

  const effectiveUpdateAvailable = MOCK_UPDATE ? true : updateAvailable;
  const effectiveUpdateInfo = MOCK_UPDATE
    ? MOCK_UPDATE_INFO
    : updater.updateInfo;
  const effectiveDownloadAndInstall = MOCK_UPDATE
    ? async () => {
        console.warn(
          "[UpdaterContext] Mock mode — downloadAndInstall is a no-op.",
        );
      }
    : updater.downloadAndInstall;

  return (
    <UpdaterContext.Provider
      value={{
        updateAvailable: effectiveUpdateAvailable,
        updateInfo: effectiveUpdateInfo,
        checkForUpdates,
        downloadAndInstall: effectiveDownloadAndInstall,
        isChecking: updater.isChecking,
        isDownloading: updater.isDownloading,
        downloadProgress: updater.downloadProgress,
        error: updater.error,
        updaterAvailable: updater.updaterAvailable,
        checkUpdaterAvailability: updater.checkUpdaterAvailability,
        showUpdateModal,
        setShowUpdateModal,
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
