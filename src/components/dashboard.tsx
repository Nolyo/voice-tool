"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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

type TranscriptionInvokeResult = {
  text: string;
  audioPath: string;
};

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedTranscription, setSelectedTranscription] =
    useState<Transcription | null>(null);
  const { settings } = useSettings();
  const { playStart, playStop, playSuccess } = useSoundEffects(
    settings.enable_sounds
  );
  const deepgram = useDeepgramStreaming();
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

  // Function to transcribe audio (used by both button and keyboard shortcuts)
  const transcribeAudio = useCallback(
    async (audioData: number[], sampleRate: number) => {
      // Skip if using Deepgram streaming - transcription already done in real-time
      if (settings.transcription_provider === "Deepgram") {
        console.log("Skipping post-transcription (Deepgram streaming already handled it)");
        return;
      }

      setIsTranscribing(true);
      try {
        const result = await invoke<TranscriptionInvokeResult>(
          "transcribe_audio",
          {
            audioSamples: audioData,
            sampleRate: sampleRate,
            apiKey: settings.openai_api_key,
            language: settings.language,
            keepLast: settings.recordings_keep_last,
          }
        );

        console.log("Transcription:", result.text);

        // Calculate API cost (Whisper API: $0.006 per minute)
        const durationSeconds = audioData.length / sampleRate;
        const durationMinutes = durationSeconds / 60;
        const apiCost = durationMinutes * 0.006;

        // Add to history
        if (result.text && result.text.trim()) {
          const newEntry = await addTranscription(
            result.text,
            "whisper",
            result.audioPath,
            apiCost
          );
          setSelectedTranscription(newEntry);
          playSuccess();
        }

        // Copy to clipboard and paste if enabled
        if (settings.paste_at_cursor && result.text) {
          // Use clipboard plugin to write text
          const { writeText } = await import(
            "@tauri-apps/plugin-clipboard-manager"
          );
          await writeText(result.text);

          // Simulate Ctrl+V
          await invoke("paste_text_to_active_window", { text: result.text });
        }

        // Log separator to mark end of transcription process
        await invoke("log_separator");
      } catch (error) {
        console.error("Transcription error:", error);
        alert(`Erreur de transcription: ${error}`);
        // Log separator even on error
        await invoke("log_separator");
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings, addTranscription, playSuccess]
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
        }>("audio-captured", (event) => {
          console.log("Audio captured from keyboard shortcut");
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
      unlistenRecordingState = await listen<boolean>("recording-state", async (event) => {
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
      });
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
      (item) => item.id === selectedTranscription.id
    );

    if (!stillExists) {
      setSelectedTranscription(transcriptions[0]);
    }
  }, [transcriptions, selectedTranscription]);

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        // Stop recording
        const [audioData, sampleRate] = await invoke<[number[], number]>(
          "stop_recording"
        );
        console.log(
          "Audio data captured:",
          audioData.length,
          "samples at",
          sampleRate,
          "Hz"
        );
        setIsRecording(false);

        // Deepgram will be stopped by the "recording-state" event listener
        // No need to stop it manually here

        // Transcribe audio (only if not using Deepgram streaming)
        if (audioData.length > 0 && settings.transcription_provider !== "Deepgram") {
          await transcribeAudio(audioData, sampleRate);
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

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
          {settings.transcription_provider === "Deepgram" && <TranscriptionLive />}

          {/* Second row: Transcription list full width */}
          <TranscriptionList
            transcriptions={transcriptions}
            selectedId={selectedTranscription?.id}
            onSelectTranscription={setSelectedTranscription}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onClearAll={handleClearAll}
          />
        </div>
      </div>
    </div>
  );
}
