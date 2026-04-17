import { useEffect, useState } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import i18n from "@/i18n";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";

export type WindowStatus =
  | "idle"
  | "recording"
  | "processing"
  | "success"
  | "error";

export type VisualizerMode = "bars" | "waveform";

/**
 * State machine for the floating mini window.
 *
 * Reads the relevant mini-window settings once from the Tauri store and then
 * listens for `mini-visualizer-mode-changed` to switch the visualizer live.
 * Audio level, recording state and transcription lifecycle events come from
 * the Rust backend and the main window's recording workflow.
 *
 * The mini hides itself after success (1.5 s) or error (4 s) via
 * `close_mini_window` invoke.
 */
export function useMiniWindowState() {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState<WindowStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [translateMode, setTranslateMode] = useState(false);
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>(
    DEFAULT_SETTINGS.settings.mini_visualizer_mode,
  );
  const [waveformCapacity, setWaveformCapacity] = useState(
    DEFAULT_SETTINGS.settings.mini_window_waveform_samples,
  );
  const [showTranscriptPreview, setShowTranscriptPreview] = useState(
    DEFAULT_SETTINGS.settings.show_transcription_in_mini_window,
  );
  const [lastTranscript, setLastTranscript] = useState("");
  const [language, setLanguage] = useState<string | undefined>(undefined);

  // Recording timer
  useEffect(() => {
    let interval: number | null = null;

    if (isRecording) {
      setRecordingTime(0);
      interval = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }

    return () => {
      if (interval !== null) clearInterval(interval);
    };
  }, [isRecording]);

  // Toggle translate mode via Rust command
  const handleToggleTranslateMode = async () => {
    try {
      await invoke("set_translate_mode", { enabled: !translateMode });
    } catch (e) {
      console.error("Failed to toggle translate mode:", e);
    }
  };

  // All Tauri event listeners + initial settings read
  useEffect(() => {
    let unlistenAudioFn: (() => void) | null = null;
    let unlistenRecordingFn: (() => void) | null = null;
    let unlistenTranscriptionStartFn: (() => void) | null = null;
    let unlistenTranscriptionSuccessFn: (() => void) | null = null;
    let unlistenTranscriptionErrorFn: (() => void) | null = null;
    let unlistenTranslateModeChangedFn: (() => void) | null = null;
    let unlistenLanguageChangedFn: (() => void) | null = null;
    let unlistenVisualizerModeChangedFn: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        // Load settings from the profile-scoped Tauri store (same store the
        // main window writes to). Used for initial mini-window-specific state.
        try {
          const storePath = await invoke<string>(
            "get_active_profile_settings_path",
          );
          const store = await Store.load(storePath);
          const saved = await store.get<AppSettings>("settings");
          const s = saved?.settings;
          if (s) {
            setTranslateMode(Boolean(s.translate_mode));
            if (s.mini_visualizer_mode) setVisualizerMode(s.mini_visualizer_mode);
            if (typeof s.mini_window_waveform_samples === "number") {
              setWaveformCapacity(s.mini_window_waveform_samples);
            }
            if (typeof s.show_transcription_in_mini_window === "boolean") {
              setShowTranscriptPreview(s.show_transcription_in_mini_window);
            }
            if (s.language) setLanguage(s.language);
          }
        } catch (e) {
          console.log("Mini window: could not load settings from store", e);
        }

        unlistenTranslateModeChangedFn = await listen<boolean>(
          "translate-mode-changed",
          (event) => {
            setTranslateMode(event.payload);
          },
        );

        // Sync i18n language with main window
        unlistenLanguageChangedFn = await listen<string>(
          "language-changed",
          (event) => {
            i18n.changeLanguage(event.payload);
          },
        );

        unlistenVisualizerModeChangedFn = await listen<VisualizerMode>(
          "mini-visualizer-mode-changed",
          (event) => {
            if (event.payload === "bars" || event.payload === "waveform") {
              setVisualizerMode(event.payload);
            }
          },
        );

        unlistenAudioFn = await listen<number>("audio-level", (event) => {
          setAudioLevel(event.payload);
        });

        unlistenRecordingFn = await listen<boolean>(
          "recording-state",
          async (event) => {
            const recording = event.payload;
            setIsRecording(recording);
            if (recording) {
              setStatus("recording");
              setErrorMessage("");
              setLastTranscript("");
            }
          },
        );

        unlistenTranscriptionStartFn = await listen(
          "transcription-start",
          async () => {
            setStatus("processing");
          },
        );

        unlistenTranscriptionSuccessFn = await listen<{ text: string }>(
          "transcription-success",
          async (event) => {
            setStatus("success");
            if (event.payload?.text) {
              setLastTranscript(event.payload.text);
            }
            setTimeout(async () => {
              setStatus("idle");
              try {
                await invoke("close_mini_window");
              } catch (e) {
                console.error("Failed to hide mini window:", e);
              }
            }, 1500);
          },
        );

        unlistenTranscriptionErrorFn = await listen<{ error: string }>(
          "transcription-error",
          async (event) => {
            setStatus("error");
            setErrorMessage(event.payload.error);
            setTimeout(async () => {
              setStatus("idle");
              try {
                await invoke("close_mini_window");
              } catch (e) {
                console.error("Failed to hide mini window:", e);
              }
            }, 4000);
          },
        );

        await emit("mini-window-ready", {});
      } catch (e) {
        console.error("Failed to setup listeners:", e);
      }
    };

    setupListeners();

    return () => {
      if (unlistenAudioFn) unlistenAudioFn();
      if (unlistenRecordingFn) unlistenRecordingFn();
      if (unlistenTranscriptionStartFn) unlistenTranscriptionStartFn();
      if (unlistenTranscriptionSuccessFn) unlistenTranscriptionSuccessFn();
      if (unlistenTranscriptionErrorFn) unlistenTranscriptionErrorFn();
      if (unlistenTranslateModeChangedFn) unlistenTranslateModeChangedFn();
      if (unlistenLanguageChangedFn) unlistenLanguageChangedFn();
      if (unlistenVisualizerModeChangedFn) unlistenVisualizerModeChangedFn();
    };
  }, []);

  return {
    audioLevel,
    isRecording,
    recordingTime,
    status,
    errorMessage,
    translateMode,
    handleToggleTranslateMode,
    visualizerMode,
    waveformCapacity,
    showTranscriptPreview,
    lastTranscript,
    language,
  };
}
