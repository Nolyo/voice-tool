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
    /** When true, leading and trailing silence are stripped before transcription. */
    trim_silence: boolean;

    // Transcription
    transcription_provider: "OpenAI" | "Google" | "Local" | "Groq" | "LexenaCloud";
    local_model_size: "tiny" | "base" | "small" | "medium" | "large-v1" | "large-v2" | "large-v3" | "large-v3-turbo" | "large-v3-turbo-q5_0";
    groq_model: "whisper-large-v3-turbo" | "whisper-large-v3";
    keep_model_in_memory: boolean | null;
    language: string;
    smart_formatting: boolean;

    // Translation
    translate_mode: boolean;

    // API Keys
    openai_api_key: string;
    google_api_key: string;
    groq_api_key: string;

    // Text
    insertion_mode: "cursor" | "clipboard" | "none";

    // System
    recordings_keep_last: number;
    history_keep_last: number;
    start_minimized_on_boot: boolean;
    main_window_state: string;
    main_window_geometry: string;
    auto_check_updates: boolean;
    update_channel: "stable" | "beta";
    /** When true, the Logs tab appears in the dashboard sidebar (power-user only). */
    developer_mode: boolean;

    // Shortcuts & Recording Modes
    record_hotkey: string;
    open_window_hotkey: string;
    cancel_hotkey: string;
    /** Only active while recording. Empty = disabled. Toggles post_process_enabled. */
    post_process_toggle_hotkey: string;
    ptt_hotkey: string;
    record_mode: "toggle" | "ptt";

    // Interface
    ui_language: "fr" | "en";
    theme: "light" | "dark";

    // Mini Window
    /**
     * When true and the mini-window is large enough (extended breakpoint),
     * the last transcription preview is rendered below the visualizer.
     * Acts as an opt-out: if false, the preview row is never shown regardless of size.
     */
    show_transcription_in_mini_window: boolean;
    mini_visualizer_mode: "bars" | "waveform";
    /** Format "WIDTHxHEIGHT+X+Y". Empty string → auto-position via work_area. */
    mini_window_geometry: string;
    /** Ring-buffer capacity for the waveform visualizer (number of audio-level samples). */
    mini_window_waveform_samples: number;

    // Vocabulary
    snippets: Array<{ trigger: string; replacement: string }>;
    dictionary: string[];
    whisper_initial_prompt: string;

    // Post-process (AI reformatting after transcription)
    post_process_enabled: boolean;
    post_process_provider: "OpenAI" | "Groq";
    post_process_mode:
      | "auto"
      | "list"
      | "email"
      | "formal"
      | "casual"
      | "summary"
      | "grammar"
      | "custom";
    post_process_custom_prompt: string;
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
    trim_silence: true,

    // Transcription
    transcription_provider: "Local",
    local_model_size: "base", // Recommended for old hardware
    groq_model: "whisper-large-v3-turbo",
    keep_model_in_memory: null, // null = auto (GPU: keep, CPU: unload after 2min)
    language: "fr-FR",
    smart_formatting: true,

    // Translation
    translate_mode: false,

    // API Keys
    openai_api_key: "",
    google_api_key: "",
    groq_api_key: "",

    // Text
    insertion_mode: "cursor",

    // System
    recordings_keep_last: 50,
    history_keep_last: 500,
    start_minimized_on_boot: true,
    main_window_state: "maximized",
    main_window_geometry: "1000x600+0+0",
    auto_check_updates: true,
    update_channel: "stable",
    developer_mode: false,

    // Shortcuts & Recording Modes
    record_hotkey: "Ctrl+F11",
    open_window_hotkey: "Ctrl+Alt+O",
    cancel_hotkey: "Escape",
    post_process_toggle_hotkey: "",
    ptt_hotkey: "Ctrl+F12",
    record_mode: "toggle",

    // Interface
    ui_language: "fr",
    theme: "dark",

    // Mini Window
    show_transcription_in_mini_window: true,
    mini_visualizer_mode: "waveform",
    mini_window_geometry: "",
    mini_window_waveform_samples: 200,

    // Vocabulary
    snippets: [{ 
      trigger: "mon adresse mail", 
      replacement: "exemple@email.com" 
    }, { 
      trigger: "lien Github", 
      replacement: "https://github.com/exemple" 
    }],
    dictionary: ["Ollama"],
    whisper_initial_prompt: "",

    // Post-process
    post_process_enabled: false,
    post_process_provider: "OpenAI",
    post_process_mode: "auto",
    post_process_custom_prompt: "",
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
