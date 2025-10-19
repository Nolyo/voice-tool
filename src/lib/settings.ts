/**
 * Application settings structure matching the Python version
 */
export interface AppSettings {
  version: string;
  created: string;
  settings: {
    // Audio
    enable_sounds: boolean;
    enable_history_audio_preview: boolean;
    input_device_index: number | null;

    // Transcription
    transcription_provider: "OpenAI" | "Deepgram" | "Google";
    language: string;
    smart_formatting: boolean;

    // API Keys
    openai_api_key: string;
    deepgram_api_key: string;
    google_api_key: string;

    // Text
    paste_at_cursor: boolean;

    // System
    recordings_keep_last: number;
    start_minimized_on_boot: boolean;
    main_window_state: string;
    main_window_geometry: string;
    history_cards_render_limit: number;

    // Shortcuts & Recording Modes
    record_hotkey: string;
    open_window_hotkey: string;
    record_modes: ("toggle" | "ptt")[];
    ptt_hotkey: string;
    record_mode: "toggle" | "ptt";
  };
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: "1.0",
  created: new Date().toISOString().replace("T", " ").substring(0, 19),
  settings: {
    // Audio
    enable_sounds: true,
    enable_history_audio_preview: true,
    input_device_index: null,

    // Transcription
    transcription_provider: "OpenAI",
    language: "fr-FR",
    smart_formatting: true,

    // API Keys
    openai_api_key: "",
    deepgram_api_key: "",
    google_api_key: "",

    // Text
    paste_at_cursor: true,

    // System
    recordings_keep_last: 25,
    start_minimized_on_boot: true,
    main_window_state: "normal",
    main_window_geometry: "800x600+0+0",
    history_cards_render_limit: 50,

    // Shortcuts & Recording Modes
    record_hotkey: "Ctrl+F11",
    open_window_hotkey: "Ctrl+Alt+O",
    record_modes: ["toggle", "ptt"],
    ptt_hotkey: "Ctrl+F12",
    record_mode: "toggle",
  },
};

/**
 * Merge partial settings with defaults
 */
export function mergeSettings(
  partial: Partial<AppSettings>
): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    settings: {
      ...DEFAULT_SETTINGS.settings,
      ...(partial.settings || {}),
    },
  };
}
