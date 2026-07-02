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
    transcription_provider: "Local" | "LexenaCloud";
    local_model_size: "tiny" | "base" | "small" | "medium" | "large-v1" | "large-v2" | "large-v3" | "large-v3-turbo" | "large-v3-turbo-q5_0";
    keep_model_in_memory: boolean | null;
    language: string;
    smart_formatting: boolean;
    /**
     * Live sentence-by-sentence transcription while recording. Cloud-only:
     * only effective when the provider is LexenaCloud and the user is
     * cloud-eligible (CloudContext pushes the combined flag to Rust).
     */
    streaming_mode: boolean;

    // Translation
    translate_mode: boolean;

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
    /** Re-pastes the last inserted transcription at the cursor. Empty = disabled. */
    repaste_hotkey: string;
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

    // Post-process (AI reformatting after transcription, cloud-only)
    post_process_enabled: boolean;

    // Onboarding
    onboarding_completed: boolean;
    /** True for exactly one fresh wizard completion → triggers the guided tour once. */
    tour_pending: boolean;
  };
}

/**
 * The only officially-supported local Whisper model. Every other value in the
 * `local_model_size` union is a deprecated legacy model, kept in the type solely
 * so the settings migration banner can name a previously-installed model and so
 * the cloud sync mapping can validate older snapshots. New installs and all
 * fallbacks must point here — never to a legacy size like "base".
 */
export const OFFICIAL_LOCAL_MODEL = "large-v3-turbo" as const;

/** Human-readable download size label for {@link OFFICIAL_LOCAL_MODEL}. */
export const OFFICIAL_LOCAL_MODEL_SIZE_LABEL = "1.6 GB";

// Detect default UI language from the OS / browser locale at module load.
// English is the default — only French OS locales get FR out of the box.
// Keep this in sync with the detection in src/i18n.ts.
const defaultUiLanguage: "fr" | "en" =
  typeof navigator !== "undefined" && navigator.language?.startsWith("fr")
    ? "fr"
    : "en";

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
    local_model_size: OFFICIAL_LOCAL_MODEL, // Only officially-supported model
    keep_model_in_memory: null, // null = auto (GPU: keep, CPU: unload after 2min)
    language: "fr-FR",
    smart_formatting: true,
    streaming_mode: false,

    // Translation
    translate_mode: false,

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
    repaste_hotkey: "Ctrl+F10",
    ptt_hotkey: "Ctrl+F12",
    record_mode: "toggle",

    // Interface
    ui_language: defaultUiLanguage,
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

    // Onboarding
    onboarding_completed: false,
    tour_pending: false,
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
