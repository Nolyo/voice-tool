import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import i18n from "@/i18n";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";
import { applyTheme, type Theme } from "@/lib/theme";

/**
 * Imperative bootstrap shared by secondary windows (mini visualizer and
 * detached note windows): reads the active-profile settings store once to
 * apply the theme, then keeps theme and i18n language in sync with the main
 * window via the existing `theme-changed` / `language-changed` broadcasts.
 *
 * Returns the loaded settings snapshot (or null when unreadable) so callers
 * can pick window-specific values, and an `unlisten` cleanup.
 */
export async function bootstrapSecondaryWindow(): Promise<{
  settings: AppSettings["settings"] | null;
  unlisten: () => void;
}> {
  let settings: AppSettings["settings"] | null = null;
  try {
    const storePath = await invoke<string>("get_active_profile_settings_path");
    const store = await Store.load(storePath);
    const saved = await store.get<AppSettings>("settings");
    settings = saved?.settings ?? null;
  } catch (e) {
    console.log("[window-bootstrap] could not load settings from store", e);
  }

  const theme =
    settings?.theme === "light" || settings?.theme === "dark"
      ? settings.theme
      : DEFAULT_SETTINGS.settings.theme;
  applyTheme(theme);

  const unlistenTheme = await listen<Theme>("theme-changed", (event) => {
    if (event.payload === "light" || event.payload === "dark") {
      applyTheme(event.payload);
    }
  });
  const unlistenLanguage = await listen<string>("language-changed", (event) => {
    i18n.changeLanguage(event.payload);
  });

  return {
    settings,
    unlisten: () => {
      unlistenTheme();
      unlistenLanguage();
    },
  };
}
