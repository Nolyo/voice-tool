import { useEffect, useState } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import i18n from "@/i18n";

export type WindowStatus =
  | "idle"
  | "recording"
  | "processing"
  | "success"
  | "error";

/**
 * State machine for the floating mini window.
 *
 * Owns:
 * - `audioLevel` (0..1) from the `audio-level` Tauri event
 * - `isRecording` from `recording-state`
 * - `status` driven by recording-state / transcription-start / -success / -error
 * - `recordingTime` auto-incrementing timer while recording
 * - `translateMode` from localStorage + `translate-mode-changed` event
 * - `errorMessage` set on transcription-error
 *
 * The mini window hides itself after success (1.5 s) or error (4 s) via
 * `close_mini_window` invoke.
 */
export function useMiniWindowState() {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState<WindowStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [translateMode, setTranslateMode] = useState(false);

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

  // All Tauri event listeners + initial translate-mode read
  useEffect(() => {
    let unlistenAudioFn: (() => void) | null = null;
    let unlistenRecordingFn: (() => void) | null = null;
    let unlistenTranscriptionStartFn: (() => void) | null = null;
    let unlistenTranscriptionSuccessFn: (() => void) | null = null;
    let unlistenTranscriptionErrorFn: (() => void) | null = null;
    let unlistenTranslateModeChangedFn: (() => void) | null = null;
    let unlistenLanguageChangedFn: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        // Load translate mode from settings stored in localStorage
        const settingsJson = localStorage.getItem("settings");
        if (settingsJson) {
          try {
            const settings = JSON.parse(settingsJson);
            setTranslateMode(settings?.settings?.translate_mode ?? false);
          } catch {
            console.log("Could not parse settings from localStorage");
          }
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
          async () => {
            setStatus("success");
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
  };
}
