import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import { AppSettings, DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings";
import { changeLanguage } from "@/i18n";

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
          const merged = mergeSettings(savedSettings);

          // Migrate old paste_at_cursor boolean to new insertion_mode enum
          const raw = savedSettings as unknown as Record<string, unknown>;
          const rawSettings = (raw.settings ?? {}) as Record<string, unknown>;
          if ("paste_at_cursor" in rawSettings && !("insertion_mode" in rawSettings)) {
            merged.settings.insertion_mode = rawSettings.paste_at_cursor ? "cursor" : "none";
            delete (merged.settings as Record<string, unknown>).paste_at_cursor;
            // Persist migrated settings back to store
            await storeInstance.set("settings", merged);
            await storeInstance.save();
          }

          setSettings(merged);

          // Sync i18n language with stored setting
          if (merged.settings.ui_language) {
            await changeLanguage(merged.settings.ui_language);
            // Update tray labels on startup
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("update_tray_labels", {
                showLabel: merged.settings.ui_language === "en" ? "Show" : "Afficher",
                quitLabel: merged.settings.ui_language === "en" ? "Quit" : "Quitter",
              });
            } catch {}
          }
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
    try {
      const storeInstance = await getStore();
      const current = await storeInstance.get<AppSettings>("settings");
      const base = current ? mergeSettings(current) : settings;

      const newSettings: AppSettings = {
        ...base,
        settings: {
          ...base.settings,
          [key]: value,
        },
      };

      setSettings(newSettings);

      // Sync i18n language when ui_language changes
      if (key === "ui_language" && typeof value === "string") {
        await changeLanguage(value);
        // Notify mini window to sync its i18n instance
        try { await emit("language-changed", value); } catch {}
        // Update tray menu labels to match new language
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("update_tray_labels", {
            showLabel: value === "en" ? "Show" : "Afficher",
            quitLabel: value === "en" ? "Quit" : "Quitter",
          });
        } catch {}
      }

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
    try {
      const storeInstance = await getStore();
      const current = await storeInstance.get<AppSettings>("settings");
      const base = current ? mergeSettings(current) : settings;

      const newSettings: AppSettings = {
        ...base,
        settings: {
          ...base.settings,
          ...updates,
        },
      };

      setSettings(newSettings);
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
