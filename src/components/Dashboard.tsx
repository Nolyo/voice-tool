"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { DashboardHeader } from "./dashboard-header";
import { RecordingCard } from "./recording-card";
import { TranscriptionList } from "./transcription-list";
import { TranscriptionDetails } from "./transcription-details";
import { TranscriptionLive } from "./transcription-live";
import { useSettings } from "@/hooks/useSettings";
import { useDeepgramStreaming } from "@/hooks/useDeepgramStreaming";
import {
  useTranscriptionHistory,
  type Transcription,
} from "@/hooks/useTranscriptionHistory";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { useUpdaterContext } from "@/contexts/UpdaterContext";

type TranscriptionInvokeResult = {
  text: string;
  audioPath: string;
};

type RecordingResult = {
  audio_data: number[];
  sample_rate: number;
  avg_rms: number;
  is_silent: boolean;
};

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedTranscription, setSelectedTranscription] =
    useState<Transcription | null>(null);
  const [activeTab, setActiveTab] = useState<string>("historique");
  const { settings } = useSettings();
  const { updateAvailable } = useUpdaterContext();
  const { playStart, playStop, playSuccess } = useSoundEffects(
    settings.enable_sounds,
  );
  const deepgram = useDeepgramStreaming();
  const { completedTranscript, clearCompletedTranscript } = deepgram;
  const deepgramRef = useRef(deepgram);
  const {
    transcriptions,
    addTranscription,
    deleteTranscription,
    clearHistory,
  } = useTranscriptionHistory();
  const previousRecordingRef = useRef(isRecording);

  // Keep deepgram ref updated
  useEffect(() => {
    deepgramRef.current = deepgram;
  }, [deepgram]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDelete = async (id: string) => {
    // If deleting the selected transcription, deselect it
    if (selectedTranscription?.id === id) {
      setSelectedTranscription(null);
    }
    await deleteTranscription(id);
  };

  const handleClearAll = async () => {
    setSelectedTranscription(null);
    await clearHistory();
  };

  const handleTranscriptionFinal = useCallback(
    async (
      text: string,
      provider: "whisper" | "deepgram",
      audioPath?: string,
      apiCost?: number,
    ) => {
      const trimmed = text?.trim();
      if (!trimmed) {
        return null;
      }

      const newEntry = await addTranscription(
        trimmed,
        provider,
        audioPath,
        apiCost,
      );
      setSelectedTranscription(newEntry);
      playSuccess();

      if (settings.paste_at_cursor) {
        const { writeText } = await import(
          "@tauri-apps/plugin-clipboard-manager"
        );
        await writeText(trimmed);
        await invoke("paste_text_to_active_window", { text: trimmed });
      }

      return newEntry;
    },
    [addTranscription, playSuccess, settings.paste_at_cursor],
  );

  const handleTranscriptionFinalRef = useRef(handleTranscriptionFinal);

  useEffect(() => {
    handleTranscriptionFinalRef.current = handleTranscriptionFinal;
  }, [handleTranscriptionFinal]);

  useEffect(() => {
    if (settings.transcription_provider !== "Deepgram") {
      return;
    }

    if (!completedTranscript) {
      return;
    }

    const trimmed = completedTranscript.text.trim();
    clearCompletedTranscript();

    let isCancelled = false;

    const processTranscript = async () => {
      try {
        if (trimmed) {
          await handleTranscriptionFinalRef.current?.(trimmed, "deepgram");
        }
      } catch (error) {
        console.error("Failed to finalize Deepgram transcription:", error);
      } finally {
        if (!isCancelled) {
          try {
            await invoke("log_separator");
          } catch (logError) {
            console.error("Failed to log separator:", logError);
          }
        }
      }
    };

    processTranscript();

    return () => {
      isCancelled = true;
    };
  }, [
    completedTranscript,
    clearCompletedTranscript,
    settings.transcription_provider,
  ]);

  // Function to transcribe audio (used by both button and keyboard shortcuts)
  const transcribeAudio = useCallback(
    async (audioData: number[], sampleRate: number) => {
      // Skip if using Deepgram streaming - transcription already done in real-time
      if (settings.transcription_provider === "Deepgram") {
        console.log(
          "Skipping post-transcription (Deepgram streaming already handled it)",
        );
        return;
      }

      setIsTranscribing(true);
      try {
        await emit("transcription-start");
        const result = await invoke<TranscriptionInvokeResult>(
          "transcribe_audio",
          {
            audioSamples: audioData,
            sampleRate: sampleRate,
            apiKey: settings.openai_api_key,
            language: settings.language,
            keepLast: settings.recordings_keep_last,
            provider: settings.transcription_provider,
            localModelSize: settings.local_model_size,
          },
        );

        console.log("Transcription:", result.text);

        // Calculate API cost (Whisper API: $0.006 per minute)
        const durationSeconds = audioData.length / sampleRate;
        const durationMinutes = durationSeconds / 60;
        const apiCost = durationMinutes * 0.006;

        await handleTranscriptionFinal(
          result.text,
          "whisper",
          result.audioPath,
          apiCost,
        );

        await emit("transcription-success", { text: result.text });

        // Log separator to mark end of transcription process
        await invoke("log_separator");
      } catch (error) {
        console.error("Transcription error:", error);
        await emit("transcription-error", { error: String(error) });
        alert(`Erreur de transcription: ${error}`);
        // Log separator even on error
        await invoke("log_separator");
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings, handleTranscriptionFinal],
  );

  // Keep latest transcription callback without re-subscribing window listeners
  const transcribeAudioRef = useRef(transcribeAudio);

  useEffect(() => {
    transcribeAudioRef.current = transcribeAudio;
  }, [transcribeAudio]);

  // Listen for audio captured from keyboard shortcuts
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setupListener = async () => {
      try {
        const listener = await listen<{
          samples: number[];
          sampleRate: number;
          avgRms: number;
          isSilent: boolean;
        }>("audio-captured", (event) => {
          console.log(
            "Audio captured from keyboard shortcut",
            `(RMS: ${event.payload.avgRms.toFixed(4)}, silent: ${event.payload.isSilent})`,
          );

          // Check if recording is silent
          if (event.payload.isSilent) {
            console.log("Enregistrement vide détecté, transcription annulée");
            toast.info("Aucun son détecté dans l'enregistrement", {
              description:
                "Le niveau sonore est trop faible pour être transcrit",
            });
            return;
          }

          const callback = transcribeAudioRef.current;
          if (callback) {
            callback(event.payload.samples, event.payload.sampleRate);
          }
        });

        if (disposed) {
          listener();
        } else {
          unlisten = listener;
        }
      } catch (error) {
        console.error("Failed to register audio-captured listener:", error);
      }
    };

    setupListener();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>("recording-state", (event) => {
      setIsRecording(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for shortcut-triggered recording events to manage Deepgram
  useEffect(() => {
    let unlistenRecordingState: UnlistenFn | null = null;
    let previousState = false;

    const setupListeners = async () => {
      // Listen to recording-state changes (emitted by both UI button and shortcuts)
      unlistenRecordingState = await listen<boolean>(
        "recording-state",
        async (event) => {
          const isRecording = event.payload;

          // Only trigger on state change
          if (isRecording === previousState) {
            return;
          }
          previousState = isRecording;

          if (settings.transcription_provider === "Deepgram") {
            if (isRecording) {
              try {
                await deepgramRef.current.startStreaming();
              } catch (error) {
                console.error("Failed to start Deepgram:", error);
              }
            } else {
              await deepgramRef.current.stopStreaming();
            }
          }
        },
      );
    };

    setupListeners();

    return () => {
      if (unlistenRecordingState) unlistenRecordingState();
    };
  }, [settings.transcription_provider]); // Removed 'deepgram' to prevent re-subscribing

  useEffect(() => {
    const previous = previousRecordingRef.current;
    if (previous !== isRecording) {
      if (isRecording) {
        playStart();
      } else {
        playStop();
      }
    }
    previousRecordingRef.current = isRecording;
  }, [isRecording, playStart, playStop]);

  useEffect(() => {
    if (!transcriptions.length) {
      if (selectedTranscription !== null) {
        setSelectedTranscription(null);
      }
      return;
    }

    if (!selectedTranscription) {
      setSelectedTranscription(transcriptions[0]);
      return;
    }

    const stillExists = transcriptions.some(
      (item) => item.id === selectedTranscription.id,
    );

    if (!stillExists) {
      setSelectedTranscription(transcriptions[0]);
    }
  }, [transcriptions, selectedTranscription]);

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        // Stop recording with silence detection
        const result = await invoke<RecordingResult>("stop_recording", {
          silenceThreshold: settings.silence_threshold,
        });

        console.log(
          "Audio data captured:",
          result.audio_data.length,
          "samples at",
          result.sample_rate,
          "Hz",
          `(RMS: ${result.avg_rms.toFixed(4)}, silent: ${result.is_silent})`,
        );
        setIsRecording(false);

        // Deepgram will be stopped by the "recording-state" event listener
        // No need to stop it manually here

        // Check if recording is silent
        if (result.is_silent) {
          console.log("Enregistrement vide détecté, transcription annulée");
          toast.info("Aucun son détecté dans l'enregistrement", {
            description: "Le niveau sonore est trop faible pour être transcrit",
          });
          return;
        }

        // Transcribe audio (only if not using Deepgram streaming)
        if (
          result.audio_data.length > 0 &&
          settings.transcription_provider !== "Deepgram"
        ) {
          await transcribeAudio(result.audio_data, result.sample_rate);
        }
      } else {
        // Start recording with selected device from settings
        await invoke("start_recording", {
          deviceIndex: settings.input_device_index,
        });
        setIsRecording(true);

        // Deepgram will be started by the "recording-state" event listener
        // No need to start it manually here
      }
    } catch (error) {
      console.error("Recording error:", error);
      alert(`Erreur d'enregistrement: ${error}`);
      setIsRecording(false);
    }
  };

  const handleUpdateClick = () => {
    setActiveTab("mises-a-jour");
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        updateAvailable={updateAvailable}
        onUpdateClick={handleUpdateClick}
      />

      <div className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* First row: Recording and Details side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecordingCard
              isRecording={isRecording}
              isTranscribing={isTranscribing}
              onToggleRecording={handleToggleRecording}
            />
            <TranscriptionDetails
              transcription={selectedTranscription}
              onCopy={handleCopy}
            />
          </div>

          {/* Live transcription (Deepgram streaming) - shown only when provider is Deepgram */}
          {settings.transcription_provider === "Deepgram" && (
            <TranscriptionLive />
          )}

          {/* Second row: Transcription list full width */}
          <TranscriptionList
            transcriptions={transcriptions}
            selectedId={selectedTranscription?.id}
            onSelectTranscription={setSelectedTranscription}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onClearAll={handleClearAll}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      </div>
    </div>
  );
}
