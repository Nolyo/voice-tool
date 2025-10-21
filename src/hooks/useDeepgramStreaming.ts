import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSettings } from "./useSettings";

interface TranscriptionEvent {
  text: string;
  confidence?: number;
}

interface DeepgramError {
  code: string;
  message: string;
}

export function useDeepgramStreaming() {
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();

  useEffect(() => {
    let unlistenInterim: UnlistenFn | null = null;
    let unlistenFinal: UnlistenFn | null = null;
    let unlistenConnected: UnlistenFn | null = null;
    let unlistenDisconnected: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;

    const setupListeners = async () => {
      try {
        // Listen for interim transcriptions (partial results)
        unlistenInterim = await listen<TranscriptionEvent>(
          "transcription-interim",
          (event) => {
            setInterimText(event.payload.text);
          }
        );

        // Listen for final transcriptions (confirmed results)
        unlistenFinal = await listen<TranscriptionEvent>(
          "transcription-final",
          (event) => {
            // Append to final text
            setFinalText((prev) => {
              const newText = event.payload.text;
              return prev ? `${prev} ${newText}` : newText;
            });
            // Clear interim text
            setInterimText("");
          }
        );

        // Listen for connection status
        unlistenConnected = await listen("deepgram-connected", () => {
          setIsConnected(true);
          setError(null);
        });

        unlistenDisconnected = await listen("deepgram-disconnected", () => {
          setIsConnected(false);
        });

        // Listen for errors
        unlistenError = await listen<DeepgramError>("deepgram-error", (event) => {
          setError(event.payload.message);
          setIsConnected(false);
          console.error("Deepgram error:", event.payload);
        });
      } catch (e) {
        console.error("Failed to setup Deepgram listeners:", e);
      }
    };

    setupListeners();

    return () => {
      // Cleanup listeners
      if (unlistenInterim) unlistenInterim();
      if (unlistenFinal) unlistenFinal();
      if (unlistenConnected) unlistenConnected();
      if (unlistenDisconnected) unlistenDisconnected();
      if (unlistenError) unlistenError();
    };
  }, []);

  const startStreaming = useCallback(async () => {
    try {
      setError(null);
      setFinalText("");
      setInterimText("");

      // Extract language code (e.g., "fr-FR" -> "fr")
      const languageCode = settings.language.substring(0, 2).toLowerCase();

      await invoke("start_deepgram_streaming", {
        apiKey: settings.deepgram_api_key,
        language: languageCode,
      });

      console.log("Deepgram streaming started");
    } catch (e) {
      const errorMsg = `Failed to start Deepgram: ${e}`;
      setError(errorMsg);
      console.error(errorMsg);
      throw e;
    }
  }, [settings.deepgram_api_key, settings.language]);

  const stopStreaming = useCallback(async () => {
    try {
      await invoke("stop_deepgram_streaming");
      setIsConnected(false);
      console.log("Deepgram streaming stopped");
    } catch (e) {
      console.error("Failed to stop Deepgram:", e);
    }
  }, []);

  const sendAudioChunk = useCallback(
    async (audioChunk: number[]) => {
      if (!isConnected) {
        return;
      }

      try {
        await invoke("send_audio_to_deepgram", { audioChunk });
      } catch (e) {
        console.error("Failed to send audio to Deepgram:", e);
        setError(`Failed to send audio: ${e}`);
      }
    },
    [isConnected]
  );

  const clearTranscription = useCallback(() => {
    setFinalText("");
    setInterimText("");
  }, []);

  return {
    interimText,
    finalText,
    isConnected,
    error,
    startStreaming,
    stopStreaming,
    sendAudioChunk,
    clearTranscription,
  };
}
