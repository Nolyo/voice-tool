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
  originalText?: string,
  postProcessMode?: string,
  postProcessCost?: number,
) => Promise<Transcription>;

interface PostProcessBackendResult {
  text: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

interface PostProcessOutcome {
  /** Final text to use (post-processed if applied, otherwise the input). */
  text: string;
  /** Original Whisper text — set only when post-process actually modified it. */
  originalText?: string;
  /** Mode applied — same condition as `originalText`. */
  mode?: string;
  /** USD cost of the post-process LLM call — set only when post-process ran. */
  cost?: number;
}

/**
 * Returns true when post-processing would actually run for the given text and
 * settings. Extracted so callers can emit a mini-window "post-process-start"
 * event only when the UI will effectively show a post-process phase.
 */
function shouldPostProcess(
  originalText: string,
  settings: AppSettings["settings"],
): boolean {
  if (!settings.post_process_enabled) return false;
  if (!originalText.trim()) return false;

  const provider = settings.post_process_provider;
  const apiKey =
    provider === "OpenAI" ? settings.openai_api_key : settings.groq_api_key;
  if (!apiKey.trim()) return false;

  if (
    settings.post_process_mode === "custom" &&
    !settings.post_process_custom_prompt.trim()
  ) {
    return false;
  }
  return true;
}

async function maybePostProcess(
  originalText: string,
  settings: AppSettings["settings"],
  translate: (key: string, opts?: Record<string, unknown>) => string,
): Promise<PostProcessOutcome> {
  if (!settings.post_process_enabled) return { text: originalText };

  const trimmed = originalText.trim();
  if (!trimmed) return { text: originalText };

  const provider = settings.post_process_provider;
  const apiKey =
    provider === "OpenAI" ? settings.openai_api_key : settings.groq_api_key;
  if (!apiKey.trim()) {
    toast.warning(translate("postProcess.missingKey"));
    return { text: originalText };
  }

  if (
    settings.post_process_mode === "custom" &&
    !settings.post_process_custom_prompt.trim()
  ) {
    toast.warning(translate("postProcess.missingCustomPrompt"));
    return { text: originalText };
  }

  try {
    const processed = await invoke<PostProcessBackendResult>("post_process_text", {
      provider,
      apiKey,
      mode: settings.post_process_mode,
      customPrompt: settings.post_process_custom_prompt,
      text: trimmed,
    });
    const result = processed?.text?.trim();
    if (!result || result.length === 0 || result === trimmed) {
      return { text: originalText };
    }
    return {
      text: result,
      originalText: trimmed,
      mode: settings.post_process_mode,
      cost: processed.cost,
    };
  } catch (err) {
    toast.error(
      translate("postProcess.error", {
        error: typeof err === "string" ? err : String(err),
      }),
    );
    return { text: originalText };
  }
}

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
      originalText?: string,
      postProcessMode?: string,
      postProcessCost?: number,
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
        originalText,
        postProcessMode,
        postProcessCost,
      );
      onTranscriptionAdded(newEntry);
      playSuccess();

      if (settings.insertion_mode === "cursor") {
        const { readText, writeText } = await import(
          "@tauri-apps/plugin-clipboard-manager"
        );
        // Save the user's clipboard so we can restore it after our paste.
        // readText throws if the clipboard holds a non-text format (image, files);
        // accept losing that rather than corrupting the cursor insertion.
        let previousClipboard: string | null = null;
        try {
          previousClipboard = await readText();
        } catch {}
        await writeText(finalText);
        await invoke("paste_text_to_active_window", { text: finalText });
        await new Promise((r) => setTimeout(r, 200));
        if (previousClipboard !== null) {
          try {
            await writeText(previousClipboard);
          } catch {}
        }
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
        await emit("transcription-start", {
          provider: settings.transcription_provider,
        });
        const providerApiKey =
          settings.transcription_provider === "Groq"
            ? settings.groq_api_key
            : settings.openai_api_key;
        const result = await invoke<TranscriptionInvokeResult>(
          "transcribe_audio",
          {
            audioSamples: audioData,
            sampleRate: sampleRate,
            apiKey: providerApiKey,
            language: settings.language,
            keepLast: settings.recordings_keep_last,
            provider: settings.transcription_provider,
            localModelSize: settings.local_model_size,
            dictionary: (settings.dictionary ?? []).join(", "),
            initialPrompt: settings.whisper_initial_prompt ?? "",
            translate: settings.translate_mode,
            keepModelInMemory: settings.keep_model_in_memory,
            groqModel: settings.groq_model,
          },
        );

        console.log("Transcription:", result.text);

        if (shouldPostProcess(result.text, settings)) {
          await emit("post-process-start");
        }
        const processed = await maybePostProcess(result.text, settings, tRef.current);
        const finalText = processed.text;

        const durationSeconds = audioData.length / sampleRate;
        const durationMinutes = durationSeconds / 60;
        const apiCost = (() => {
          switch (settings.transcription_provider) {
            case "Local":
              return 0;
            case "Groq":
              // whisper-large-v3-turbo: $0.04/h ≈ $0.000667/min
              return durationMinutes * 0.000667;
            default:
              // OpenAI whisper-1: $0.006/min
              return durationMinutes * 0.006;
          }
        })();

        await handleTranscriptionFinal(
          finalText,
          "whisper",
          result.audioPath,
          apiCost,
          processed.originalText,
          processed.mode,
          processed.cost,
        );

        await emit("transcription-success", { text: finalText });
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
