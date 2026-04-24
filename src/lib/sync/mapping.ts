import type { AppSettings } from "@/lib/settings";
import type { CloudSettingsData } from "./types";

export function extractCloudSettings(s: AppSettings["settings"]): CloudSettingsData {
  return {
    ui: {
      theme: s.theme,
      language: s.ui_language,
    },
    hotkeys: {
      toggle: s.record_hotkey,
      push_to_talk: s.ptt_hotkey,
      open_window: s.open_window_hotkey,
    },
    features: {
      auto_paste: s.insertion_mode,
      sound_effects: s.enable_sounds,
    },
    transcription: {
      provider: s.transcription_provider,
      local_model: s.local_model_size,
    },
  };
}

export function applyCloudSettings(
  local: AppSettings["settings"],
  cloud: CloudSettingsData
): AppSettings["settings"] {
  return {
    ...local,
    theme: cloud.ui.theme,
    ui_language: cloud.ui.language,
    record_hotkey: cloud.hotkeys.toggle,
    ptt_hotkey: cloud.hotkeys.push_to_talk,
    open_window_hotkey: cloud.hotkeys.open_window,
    insertion_mode: cloud.features.auto_paste,
    enable_sounds: cloud.features.sound_effects,
    transcription_provider: cloud.transcription.provider,
    local_model_size: cloud.transcription.local_model as AppSettings["settings"]["local_model_size"],
  };
}

// Retourne true si au moins une clé syncable diffère entre deux snapshots AppSettings.
export function syncableSettingsChanged(
  a: AppSettings["settings"],
  b: AppSettings["settings"]
): boolean {
  const ca = extractCloudSettings(a);
  const cb = extractCloudSettings(b);
  return JSON.stringify(ca) !== JSON.stringify(cb);
}
