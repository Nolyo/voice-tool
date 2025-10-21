import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSettings } from "./useSettings";

interface TranscriptionEvent {
  text: string;
  confidence?: number;
  speech_final?: boolean;
}

interface DeepgramError {
  code: string;
  message: string;
}

function appendUtterance(existing: string, addition: string) {
  const trimmedAddition = addition.trim();
  if (!trimmedAddition) {
    return existing;
  }

  if (!existing) {
    return trimmedAddition;
  }

  const trimmedExisting = existing.trimEnd();
  const maxOverlap = Math.min(trimmedExisting.length, trimmedAddition.length);
  let overlap = maxOverlap;

  while (overlap > 0) {
    if (trimmedExisting.endsWith(trimmedAddition.slice(0, overlap))) {
      break;
    }
    overlap -= 1;
  }

  const newPortion = trimmedAddition.slice(overlap).trimStart();
  if (!newPortion) {
    return trimmedExisting;
  }

  const needsSpace = !/\s$/.test(trimmedExisting);
  return `${trimmedExisting}${needsSpace ? " " : ""}${newPortion}`;
}

export function useDeepgramStreaming() {
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [currentUtterance, setCurrentUtterance] = useState(""); // Current utterance being built
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUtteranceRef = useRef(currentUtterance);
  const { settings } = useSettings();

  useEffect(() => {
    currentUtteranceRef.current = currentUtterance;
  }, [currentUtterance]);

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
            const newText = event.payload.text;
            const isSpeechFinal = event.payload.speech_final || false;

            if (isSpeechFinal) {
              const currentUtteranceSnapshot = currentUtteranceRef.current;
              const textToAdd =
                newText.length >= currentUtteranceSnapshot.length
                  ? newText
                  : currentUtteranceSnapshot;

              if (textToAdd) {
                setFinalText((prev) => appendUtterance(prev, textToAdd));
              }

              // Clear current utterance for next speech
              setCurrentUtterance("");
              currentUtteranceRef.current = "";
            } else {
              // is_final but not speech_final: update current utterance
              // Only keep the longest version (Deepgram sends incremental updates)
              const currentSnapshot = currentUtteranceRef.current;
              if (newText.length > currentSnapshot.length) {
                setCurrentUtterance(newText);
                currentUtteranceRef.current = newText;
              }
            }

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
      setCurrentUtterance("");
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
    setCurrentUtterance("");
    setInterimText("");
  }, []);

  return {
    interimText,
    finalText,
    currentUtterance,
    isConnected,
    error,
    startStreaming,
    stopStreaming,
    sendAudioChunk,
    clearTranscription,
  };
}
