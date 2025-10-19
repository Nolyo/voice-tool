import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { AppSettings, DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings";

let store: Store | null = null;

/**
 * Initialize the store singleton
 */
async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load("settings.json");
  }
  return store;
}

interface SettingsContextType {
  settings: AppSettings["settings"];
  isLoaded: boolean;
  updateSetting: <K extends keyof AppSettings["settings"]>(
    key: K,
    value: AppSettings["settings"][K]
  ) => Promise<void>;
  updateSettings: (updates: Partial<AppSettings["settings"]>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

/**
 * Provider component for application settings
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const storeInstance = await getStore();
        const savedSettings = await storeInstance.get<AppSettings>("settings");

        if (savedSettings) {
          setSettings(mergeSettings(savedSettings));
        } else {
          // First time: save default settings
          await storeInstance.set("settings", DEFAULT_SETTINGS);
          await storeInstance.save();
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setIsLoaded(true);
      }
    }

    loadSettings();
  }, []);

  /**
   * Update a specific setting value
   */
  const updateSetting = async <K extends keyof AppSettings["settings"]>(
    key: K,
    value: AppSettings["settings"][K]
  ) => {
    const newSettings: AppSettings = {
      ...settings,
      settings: {
        ...settings.settings,
        [key]: value,
      },
    };

    setSettings(newSettings);

    try {
      const storeInstance = await getStore();
      await storeInstance.set("settings", newSettings);
      await storeInstance.save();
    } catch (error) {
      console.error("Failed to save setting:", error);
    }
  };

  /**
   * Update multiple settings at once
   */
  const updateSettings = async (
    updates: Partial<AppSettings["settings"]>
  ) => {
    const newSettings: AppSettings = {
      ...settings,
      settings: {
        ...settings.settings,
        ...updates,
      },
    };

    setSettings(newSettings);

    try {
      const storeInstance = await getStore();
      await storeInstance.set("settings", newSettings);
      await storeInstance.save();
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  /**
   * Reset all settings to defaults
   */
  const resetSettings = async () => {
    const newSettings = {
      ...DEFAULT_SETTINGS,
      created: new Date().toISOString().replace("T", " ").substring(0, 19),
    };

    setSettings(newSettings);

    try {
      const storeInstance = await getStore();
      await storeInstance.set("settings", newSettings);
      await storeInstance.save();
    } catch (error) {
      console.error("Failed to reset settings:", error);
    }
  };

  const value: SettingsContextType = {
    settings: settings.settings,
    isLoaded,
    updateSetting,
    updateSettings,
    resetSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access settings from context
 */
export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettingsContext must be used within a SettingsProvider");
  }
  return context;
}
