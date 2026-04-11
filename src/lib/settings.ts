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
    silence_threshold: number;

    // Transcription
    transcription_provider: "OpenAI" | "Google" | "Local";
    local_model_size: "tiny" | "base" | "small" | "medium" | "large-v1" | "large-v2" | "large-v3" | "large-v3-turbo";
    language: string;
    smart_formatting: boolean;

    // Translation
    translate_mode: boolean;
    translate_source_lang: string;
    translate_target_lang: string;

    // API Keys
    openai_api_key: string;
    google_api_key: string;

    // Text
    insertion_mode: "cursor" | "clipboard" | "none";

    // System
    recordings_keep_last: number;
    start_minimized_on_boot: boolean;
    main_window_state: string;
    main_window_geometry: string;
    history_cards_render_limit: number;
    auto_check_updates: boolean;
    update_channel: "stable" | "beta";

    // Shortcuts & Recording Modes
    record_hotkey: string;
    open_window_hotkey: string;
    cancel_hotkey: string;
    record_modes: ("toggle" | "ptt")[];
    ptt_hotkey: string;
    record_mode: "toggle" | "ptt";

    // Interface
    hide_recording_panel: boolean;

    // Mini Window
    show_transcription_in_mini_window: boolean;

    // Vocabulary
    snippets: Array<{ trigger: string; replacement: string }>;
    dictionary: string[];
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
    silence_threshold: 0.005, // RMS threshold below which audio is considered silent (0.5%)

    // Transcription
    transcription_provider: "OpenAI",
    local_model_size: "base", // Recommended for old hardware
    language: "fr-FR",
    smart_formatting: true,

    // Translation
    translate_mode: false,
    translate_source_lang: "fr",
    translate_target_lang: "en",

    // API Keys
    openai_api_key: "",
    google_api_key: "",

    // Text
    insertion_mode: "cursor",

    // System
    recordings_keep_last: 25,
    start_minimized_on_boot: true,
    main_window_state: "normal",
    main_window_geometry: "800x600+0+0",
    history_cards_render_limit: 50,
    auto_check_updates: true,
    update_channel: "stable",

    // Shortcuts & Recording Modes
    record_hotkey: "Ctrl+F11",
    open_window_hotkey: "Ctrl+Alt+O",
    cancel_hotkey: "Escape",
    record_modes: ["toggle", "ptt"],
    ptt_hotkey: "Ctrl+F12",
    record_mode: "toggle",

    // Interface
    hide_recording_panel: false,

    // Mini Window
    show_transcription_in_mini_window: true,

    // Vocabulary
    snippets: [{ 
      trigger: "mon adresse mail", 
      replacement: "exemple@email.com" 
    }, { 
      trigger: "lien Github", 
      replacement: "https://github.com/exemple" 
    }],
    dictionary: ["Ollama"],
  },
};

/**
 * Merge partial settings with defaults
 */
export function mergeSettings(partial: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    settings: {
      ...DEFAULT_SETTINGS.settings,
      ...(partial.settings || {}),
    },
  };
}
