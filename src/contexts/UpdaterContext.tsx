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
  error: string | null;
}

const UpdaterContext = createContext<UpdaterContextType | undefined>(undefined);

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useUpdater();
  const { settings } = useSettings();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const hasCheckedOnStartup = useRef(false);

  // Check for updates on startup (with delay)
  useEffect(() => {
    if (hasCheckedOnStartup.current || !settings.auto_check_updates) {
      return;
    }

    hasCheckedOnStartup.current = true;

    // Wait 10 seconds after startup to avoid interfering with app initialization
    const timer = setTimeout(async () => {
      console.log("Checking for updates on startup...");
      try {
        const info = await updater.checkForUpdates();
        if (info?.available) {
          console.log("Update available:", info.version);
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.error("Failed to check for updates on startup:", error);
      }
    }, 10000); // 10 seconds

    return () => clearTimeout(timer);
  }, [settings.auto_check_updates, updater]);

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
