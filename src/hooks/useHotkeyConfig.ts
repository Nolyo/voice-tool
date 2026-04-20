import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/hooks/useSettings";
import { useTranslation } from "react-i18next";

export type HotkeyKey =
  | "record_hotkey"
  | "ptt_hotkey"
  | "open_window_hotkey"
  | "cancel_hotkey"
  | "post_process_toggle_hotkey";

/**
 * Persist a hotkey change: normalizes the shortcut, calls the Rust
 * `update_hotkeys` command with the full set (so the backend re-registers
 * global shortcuts atomically), then saves the updated key in settings.
 */
export function useHotkeyConfig() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const handleHotkeyChange = useCallback(
    async (key: HotkeyKey, shortcut: string) => {
      const normalized = shortcut
        .split("+")
        .map((token) => token.trim())
        .filter(Boolean)
        .join("+");

      // Allow empty string for optional hotkeys (post_process_toggle_hotkey).
      const allowEmpty = key === "post_process_toggle_hotkey";
      if (!normalized && !allowEmpty) throw new Error(t('errors.hotkeyEmpty'));

      const currentValue = settings[key];
      if (
        currentValue &&
        currentValue.toLowerCase() === normalized.toLowerCase()
      ) {
        return;
      }

      await invoke("update_hotkeys", {
        recordHotkey:
          key === "record_hotkey" ? normalized : settings.record_hotkey,
        pttHotkey: key === "ptt_hotkey" ? normalized : settings.ptt_hotkey,
        openWindowHotkey:
          key === "open_window_hotkey"
            ? normalized
            : settings.open_window_hotkey,
        cancelHotkey:
          key === "cancel_hotkey" ? normalized : settings.cancel_hotkey,
        postProcessToggleHotkey:
          key === "post_process_toggle_hotkey"
            ? normalized
            : settings.post_process_toggle_hotkey,
      });

      await updateSetting(key, normalized);
    },
    [settings, updateSetting],
  );

  return { handleHotkeyChange };
}
