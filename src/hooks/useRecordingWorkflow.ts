import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@/lib/settings";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import type {
  RecordingResult,
  TranscriptionInvokeResult,
} from "@/lib/types";

type AddTranscription = (
  text: string,
  provider?: "whisper",
  audioPath?: string,
  apiCost?: number,
) => Promise<Transcription>;

interface UseRecordingWorkflowOptions {
  settings: AppSettings["settings"];
  addTranscription: AddTranscription;
  /** Called with the new Transcription after a successful run so the caller can select it. */
  onTranscriptionAdded: (transcription: Transcription) => void;
}

/**
 * Owns the full recording → transcription → auto-paste pipeline:
 *
 * - `isRecording` / `isTranscribing` states
 * - Listens on `recording-state`, `recording-cancelled`, `audio-captured`
 *   (audio-captured is how the keyboard-shortcut hotkey feeds samples back
 *   to the renderer)
 * - Plays start/stop sounds on every recording transition; plays success on
 *   every completed transcription
 * - Applies snippet substitution, writes the result to the history, and
 *   handles the three insertion modes (cursor / clipboard+paste / nothing)
 * - Exposes `handleToggleRecording` for the UI button
 *
 * The hook uses a ref trampoline for `transcribeAudio` so the long-lived
 * `audio-captured` listener always reaches the latest closure (settings
 * change frequently, and we do not want a stale callback).
 */
export function useRecordingWorkflow({
  settings,
  addTranscription,
  onTranscriptionAdded,
}: UseRecordingWorkflowOptions) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const previousRecordingRef = useRef(isRecording);

  const { playStart, playStop, playSuccess } = useSoundEffects(
    settings.enable_sounds,
  );

  const handleTranscriptionFinal = useCallback(
    async (
      text: string,
      provider: "whisper",
      audioPath?: string,
      apiCost?: number,
    ) => {
      const trimmed = text?.trim();
      if (!trimmed) {
        return null;
      }

      let finalText = trimmed;
      const snippetMatch = settings.snippets?.find(
        (s) => s.trigger.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (snippetMatch) {
        finalText = snippetMatch.replacement;
      }

      const newEntry = await addTranscription(
        finalText,
        provider,
        audioPath,
        apiCost,
      );
      onTranscriptionAdded(newEntry);
      playSuccess();

      if (settings.insertion_mode === "cursor") {
        await invoke("type_text_at_cursor", { text: finalText });
      } else if (settings.insertion_mode === "clipboard") {
        const { writeText } = await import(
          "@tauri-apps/plugin-clipboard-manager"
        );
        await writeText(finalText);
        await invoke("paste_text_to_active_window", { text: finalText });
      }

      return newEntry;
    },
    [
      addTranscription,
      onTranscriptionAdded,
      playSuccess,
      settings.insertion_mode,
      settings.snippets,
    ],
  );

  const transcribeAudio = useCallback(
    async (audioData: number[], sampleRate: number) => {
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
            dictionary: (settings.dictionary ?? []).join(", "),
            initialPrompt: settings.whisper_initial_prompt ?? "",
            translate: settings.translate_mode,
            keepModelInMemory: settings.keep_model_in_memory,
          },
        );

        console.log("Transcription:", result.text);

        const durationSeconds = audioData.length / sampleRate;
        const durationMinutes = durationSeconds / 60;
        const apiCost =
          settings.transcription_provider === "Local"
            ? 0
            : durationMinutes * 0.006;

        await handleTranscriptionFinal(
          result.text,
          "whisper",
          result.audioPath,
          apiCost,
        );

        await emit("transcription-success", { text: result.text });
        await invoke("log_separator");
      } catch (error) {
        console.error("Transcription error:", error);
        await emit("transcription-error", { error: String(error) });
        alert(tRef.current('errors.transcriptionError', { error }));
        await invoke("log_separator");
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings, handleTranscriptionFinal],
  );

  // Ref trampoline so the long-lived audio-captured listener always reaches
  // the latest closure (settings change, but the listener is registered once).
  const transcribeAudioRef = useRef(transcribeAudio);
  useEffect(() => {
    transcribeAudioRef.current = transcribeAudio;
  }, [transcribeAudio]);

  // audio-captured listener — global-shortcut path feeds us samples here
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
        }>("audio-captured", async (event) => {
          console.log(
            "Audio captured from keyboard shortcut",
            `(RMS: ${event.payload.avgRms.toFixed(4)}, silent: ${event.payload.isSilent})`,
          );

          if (event.payload.isSilent) {
            console.log("Empty recording detected, transcription cancelled");
            toast.info(tRef.current('errors.noSound'), {
              description: tRef.current('errors.noSoundDesc'),
            });
            await emit("transcription-error", { error: tRef.current('errors.soundTooLow') });
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

  // recording-state listener — mirrors Rust state into React
  useEffect(() => {
    const unlisten = listen<boolean>("recording-state", (event) => {
      setIsRecording(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // recording-cancelled toast
  useEffect(() => {
    const unlisten = listen("recording-cancelled", () => {
      toast.info(tRef.current('errors.recordingCancelled'));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Start / stop sounds on every recording transition
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

  const handleToggleRecording = useCallback(async () => {
    try {
      if (isRecording) {
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

        if (result.is_silent) {
          console.log("Empty recording detected, transcription cancelled");
          toast.info(tRef.current('errors.noSound'), {
            description: tRef.current('errors.noSoundDesc'),
          });
          await emit("transcription-error", { error: tRef.current('errors.soundTooLow') });
          return;
        }

        if (result.audio_data.length > 0) {
          await transcribeAudio(result.audio_data, result.sample_rate);
        }
      } else {
        await invoke("start_recording", {
          deviceIndex: settings.input_device_index,
        });
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Recording error:", error);
      alert(tRef.current('errors.recordingError', { error }));
      setIsRecording(false);
      await emit("transcription-error", { error: String(error) });
    }
  }, [
    isRecording,
    settings.silence_threshold,
    settings.input_device_index,
    transcribeAudio,
  ]);

  return {
    isRecording,
    isTranscribing,
    handleToggleRecording,
  };
}
