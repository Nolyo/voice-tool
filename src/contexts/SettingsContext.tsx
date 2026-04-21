import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { AppSettings, DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings";
import { changeLanguage } from "@/i18n";
import { applyTheme } from "@/lib/theme";

let store: Store | null = null;

/**
 * Initialize the store singleton, resolved to the active profile's path.
 */
async function getStore(): Promise<Store> {
  if (!store) {
    const storePath = await invoke<string>("get_active_profile_settings_path");
    store = await Store.load(storePath);
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
  // Always-fresh mirror so cross-window listeners read the latest value.
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
          let migrated = false;
          if ("paste_at_cursor" in rawSettings && !("insertion_mode" in rawSettings)) {
            merged.settings.insertion_mode = rawSettings.paste_at_cursor ? "cursor" : "none";
            delete (merged.settings as Record<string, unknown>).paste_at_cursor;
            migrated = true;
          }
          // Migrate translate_toggle_hotkey → post_process_toggle_hotkey (the slot
          // was repurposed to control post-processing instead of translation).
          if ("translate_toggle_hotkey" in rawSettings) {
            const oldValue = rawSettings.translate_toggle_hotkey;
            if (
              typeof oldValue === "string" &&
              oldValue.trim() &&
              !merged.settings.post_process_toggle_hotkey
            ) {
              merged.settings.post_process_toggle_hotkey = oldValue;
            }
            delete (merged.settings as Record<string, unknown>).translate_toggle_hotkey;
            migrated = true;
          }
          if (migrated) {
            await storeInstance.set("settings", merged);
            await storeInstance.save();
          }

          setSettings(merged);

          // Apply the stored theme immediately so the UI matches persisted state.
          applyTheme(merged.settings.theme);

          // Broadcast current translate_mode so the mini window stays in sync
          // on startup (it may have loaded before we wrote defaults).
          try { await emit("translate-mode-changed", merged.settings.translate_mode); } catch {}
          try { await emit("transcription-provider-changed", merged.settings.transcription_provider); } catch {}

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
          applyTheme(DEFAULT_SETTINGS.settings.theme);
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

  // Sync translate_mode when the mini window toggles it via the Rust command.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<boolean>("translate-mode-changed", (event) => {
      setSettings((prev) => {
        if (prev.settings.translate_mode === event.payload) return prev;
        return {
          ...prev,
          settings: { ...prev.settings, translate_mode: event.payload },
        };
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Same sync for post_process_enabled toggled from the mini window.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<boolean>("post-process-enabled-changed", (event) => {
      setSettings((prev) => {
        if (prev.settings.post_process_enabled === event.payload) return prev;
        return {
          ...prev,
          settings: { ...prev.settings, post_process_enabled: event.payload },
        };
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // When the mini window reports ready, push the current settings so its UI
  // matches the stored state even if it mounted before the store was populated.
  //
  // Read fresh from the store here rather than settingsRef: `mini-window-ready`
  // can arrive before loadSettings() completes, in which case settingsRef still
  // holds DEFAULT_SETTINGS and the broadcast would overwrite the mini's own
  // (correctly loaded) state with defaults — e.g. post_process_enabled flipping
  // silently to false.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("mini-window-ready", async () => {
      let s = settingsRef.current.settings;
      try {
        const storeInstance = await getStore();
        const saved = await storeInstance.get<AppSettings>("settings");
        if (saved) {
          s = mergeSettings(saved).settings;
        }
      } catch {}

      try {
        await emit("translate-mode-changed", s.translate_mode);
        await emit("post-process-enabled-changed", s.post_process_enabled);
        await emit("mini-visualizer-mode-changed", s.mini_visualizer_mode);
        await emit("theme-changed", s.theme);
        await emit("transcription-provider-changed", s.transcription_provider);
      } catch {}
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
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

      // Notify the mini window when the visualizer mode changes so it can switch live
      if (key === "mini_visualizer_mode") {
        try { await emit("mini-visualizer-mode-changed", value); } catch {}
      }

      // Keep the mini window in sync when translate_mode is toggled from settings
      if (key === "translate_mode") {
        try { await emit("translate-mode-changed", value); } catch {}
      }

      // Same sync for post_process_enabled toggled from the settings dialog
      if (key === "post_process_enabled") {
        try { await emit("post-process-enabled-changed", value); } catch {}
      }

      // Notify the mini window when the transcription provider changes so it
      // can update provider-dependent UI (processing label, translate button).
      if (key === "transcription_provider") {
        try { await emit("transcription-provider-changed", value); } catch {}
      }

      // Apply theme change live and broadcast to the mini window
      if (key === "theme" && (value === "light" || value === "dark")) {
        applyTheme(value);
        try { await emit("theme-changed", value); } catch {}
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
