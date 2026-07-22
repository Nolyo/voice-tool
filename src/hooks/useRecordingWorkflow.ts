import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@/lib/settings";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import {
  loadSnippets,
  migrateLegacySnippetsOnce,
} from "@/lib/sync/snippets-store";
import {
  loadDictionary,
  migrateLegacyDictionaryOnce,
} from "@/lib/sync/dictionary-store";
import type { LocalSnippet } from "@/lib/sync/types";
import type {
  RecordingResult,
  TranscriptionInvokeResult,
} from "@/lib/types";
import { useCloud } from "@/hooks/useCloud";
import { useStreamingSession } from "@/hooks/useStreamingSession";
import { supabase } from "@/lib/supabase";
import { transcribeCloud, postProcessCloud } from "@/lib/cloud/api";
import { CloudApiError } from "@/lib/cloud/errors";
import { isOnboardingActive } from "@/components/onboarding/demoState";
import { pasteTextPreservingClipboard } from "@/lib/paste";
import { flog } from "@/lib/flog";

type AddTranscription = (
  text: string,
  provider?: "whisper",
  audioPath?: string,
  apiCost?: number,
  originalText?: string,
  postProcessMode?: string,
  postProcessCost?: number,
  duration?: number,
  transcriptionProvider?: string,
  isStreaming?: boolean,
) => Promise<Transcription>;

interface PostProcessOutcome {
  /** Final text to use (post-processed if applied, otherwise the input). */
  text: string;
  /** Original Whisper text — set only when post-process actually modified it. */
  originalText?: string;
  /** USD cost of the post-process LLM call — set only when post-process ran. */
  cost?: number;
}

/**
 * Returns true when post-processing would actually run. Post-process is now
 * cloud-only (Phase A retired BYOK keys), so the call requires a JWT.
 */
function shouldPostProcess(
  originalText: string,
  settings: AppSettings["settings"],
  postProcessAvailable: boolean,
): boolean {
  if (!settings.post_process_enabled) return false;
  if (!originalText.trim()) return false;
  if (!postProcessAvailable) return false;
  return true;
}

async function maybePostProcessCloud(
  originalText: string,
  settings: AppSettings["settings"],
  jwt: string,
  translate: (key: string, opts?: Record<string, unknown>) => string,
): Promise<PostProcessOutcome> {
  if (!settings.post_process_enabled) return { text: originalText };

  const trimmed = originalText.trim();
  if (!trimmed) return { text: originalText };

  try {
    const customInstructions =
      settings.post_process_custom_instructions?.trim() ?? "";
    const result = await postProcessCloud({
      task: "auto",
      text: trimmed,
      jwt,
      ...(customInstructions ? { customInstructions } : {}),
    });
    const cleaned = result.text?.trim();
    if (!cleaned || cleaned === trimmed) {
      return { text: originalText };
    }
    return {
      text: cleaned,
      originalText: trimmed,
      // Cloud post-process is billed in tokens against the user's plan / trial,
      // not in USD against their API key — no apiCost passthrough.
      cost: 0,
    };
  } catch (err) {
    if (err instanceof CloudApiError) {
      const key = err.isQuotaIssue()
        ? "errors.quota_exhausted"
        : err.isAuthIssue()
          ? "errors.auth_expired"
          : err.isProviderUnavailable()
            ? "errors.provider_unavailable"
            : null;
      if (key) {
        toast.error(translate(`cloud:${key}`));
      } else {
        toast.error(
          translate("postProcess.error", { error: err.message }),
        );
      }
    } else {
      toast.error(
        translate("postProcess.error", {
          error: typeof err === "string" ? err : String(err),
        }),
      );
    }
    return { text: originalText };
  }
}

interface UseRecordingWorkflowOptions {
  settings: AppSettings["settings"];
  addTranscription: AddTranscription;
  /** Called with the new Transcription after a successful run so the caller can select it. */
  onTranscriptionAdded: (transcription: Transcription) => void;
  /** Text of the most recent history entry, used to seed the re-paste buffer
   *  so the hotkey works right after launch (before any new transcription). */
  latestHistoryText?: string;
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
  latestHistoryText,
}: UseRecordingWorkflowOptions) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const { mode: cloudMode, hasCloudSelected, isCloudEligible } = useCloud();
  const cloudModeRef = useRef(cloudMode);
  const hasCloudSelectedRef = useRef(hasCloudSelected);
  const isCloudEligibleRef = useRef(isCloudEligible);
  useEffect(() => { cloudModeRef.current = cloudMode; }, [cloudMode]);
  useEffect(() => { hasCloudSelectedRef.current = hasCloudSelected; }, [hasCloudSelected]);
  useEffect(() => { isCloudEligibleRef.current = isCloudEligible; }, [isCloudEligible]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const previousRecordingRef = useRef(isRecording);

  // Buffer of the last text we inserted, re-pasted by the repaste hotkey.
  const lastInsertedTextRef = useRef<string>("");

  // Seed from the latest history entry on mount (and once history finishes
  // loading) so the hotkey works after a restart. Never overwrite a value set
  // by an actual insertion this session.
  useEffect(() => {
    if (!lastInsertedTextRef.current && latestHistoryText) {
      lastInsertedTextRef.current = latestHistoryText;
    }
  }, [latestHistoryText]);

  const { playStart, playStop, playSuccess } = useSoundEffects(
    settings.enable_sounds,
  );

  // Vocabulary (snippets + dictionary) sourced from the sync stores — VocabularySection
  // migrated away from settings.snippets / settings.dictionary in Task 18 (v3 sub-epic 02).
  // We keep a fresh snapshot here so snippet matching + Whisper dictionary hints see
  // edits made in the Settings UI.
  const [syncSnippets, setSyncSnippets] = useState<LocalSnippet[]>([]);
  const [syncDictionary, setSyncDictionary] = useState<string[]>([]);
  const syncSnippetsRef = useRef<LocalSnippet[]>([]);
  const syncDictionaryRef = useRef<string[]>([]);
  useEffect(() => {
    syncSnippetsRef.current = syncSnippets;
  }, [syncSnippets]);
  useEffect(() => {
    syncDictionaryRef.current = syncDictionary;
  }, [syncDictionary]);

  const refreshVocab = useCallback(async () => {
    const [snips, dict] = await Promise.all([loadSnippets(), loadDictionary()]);
    setSyncSnippets(snips.filter((s) => s.deleted_at === null));
    setSyncDictionary(dict.words);
  }, []);

  // Legacy migration + initial load. The migrations are idempotent (they no-op after
  // the first successful run), so running them from here is safe even before the user
  // enables sync — and it's what keeps users who never enable sync from losing their
  // snippets/dictionary once VocabularySection stopped reading the legacy fields.
  const legacySnippets = settings.snippets;
  const legacyDictionary = settings.dictionary;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateLegacySnippetsOnce(legacySnippets ?? []);
        await migrateLegacyDictionaryOnce(legacyDictionary ?? []);
        if (!cancelled) await refreshVocab();
      } catch (e) {
        console.warn("[recording vocab migration failed]", e);
        if (cancelled) return;
        // Fallback: expose legacy data directly so the feature keeps working even
        // if the Tauri Store is momentarily unavailable.
        setSyncSnippets(
          (legacySnippets ?? []).map((p, i) => ({
            id: `legacy-${i}`,
            label: p.trigger,
            content: p.replacement,
            shortcut: p.trigger,
            created_at: "1970-01-01T00:00:00Z",
            updated_at: "1970-01-01T00:00:00Z",
            deleted_at: null,
          })),
        );
        setSyncDictionary(legacyDictionary ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshVocab, legacySnippets, legacyDictionary]);

  const handleTranscriptionFinal = useCallback(
    async (
      text: string,
      provider: "whisper",
      audioPath?: string,
      apiCost?: number,
      originalText?: string,
      postProcessMode?: string,
      postProcessCost?: number,
      duration?: number,
      transcriptionProvider?: string,
      isStreaming?: boolean,
    ) => {
      const trimmed = text?.trim();
      if (!trimmed) {
        return null;
      }

      let finalText = trimmed;
      const snippetMatch = syncSnippetsRef.current.find((s) => {
        const trigger = (s.shortcut ?? s.label ?? "").trim().toLowerCase();
        return trigger.length > 0 && trigger === trimmed.toLowerCase();
      });
      if (snippetMatch) {
        finalText = snippetMatch.content;
      }

      const newEntry = await addTranscription(
        finalText,
        provider,
        audioPath,
        apiCost,
        originalText,
        postProcessMode,
        postProcessCost,
        duration,
        transcriptionProvider,
        isStreaming,
      );
      onTranscriptionAdded(newEntry);
      playSuccess();

      // Remember what we just produced so the repaste hotkey can re-insert it,
      // even in "none" mode (the user opted out of auto-paste but may still
      // want to re-paste explicitly).
      lastInsertedTextRef.current = finalText;

      if (settings.insertion_mode === "cursor") {
        await pasteTextPreservingClipboard(finalText);
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
    ],
  );

  // ─── Streaming mode (cloud-only) ──────────────────────────────────────────
  // The Rust segmenter ships chunks while the user talks; useStreamingSession
  // uploads them and hands us the assembled text here. Finalization reuses the
  // exact same pipeline as batch: post-process → snippets → history → paste.
  const onStreamingFinalize = useCallback(
    async (text: string, billedSeconds: number, chunksFailed: number) => {
      setIsTranscribing(true);
      try {
        // Same vocab refresh as the batch path so the snippet match in
        // handleTranscriptionFinal sees fresh Settings edits.
        try {
          await refreshVocab();
        } catch (e) {
          console.warn("[streaming vocab refresh failed]", e);
        }

        let postProcessJwt: string | undefined;
        if (settings.post_process_enabled) {
          const { data } = await supabase.auth.getSession();
          postProcessJwt = data.session?.access_token;
        }
        const canPostProcess = Boolean(postProcessJwt);
        if (shouldPostProcess(text, settings, canPostProcess)) {
          await emit("post-process-start");
        }
        const processed: PostProcessOutcome = canPostProcess
          ? await maybePostProcessCloud(text, settings, postProcessJwt!, tRef.current)
          : { text };

        await handleTranscriptionFinal(
          processed.text,
          "whisper",
          "", // streaming audio is never written to disk (cloud path parity)
          0,
          processed.originalText,
          undefined,
          processed.cost,
          billedSeconds,
          "Cloud",
          true,
        );

        if (chunksFailed > 0) {
          toast.warning(tRef.current("streaming.partialLoss"));
        }
        await emit("transcription-success", { text: processed.text });
        await invoke("log_separator");
      } catch (error) {
        console.error("Streaming finalization error:", error);
        await emit("transcription-error", { error: String(error) });
        await invoke("log_separator");
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings, handleTranscriptionFinal, refreshVocab],
  );

  const onStreamingEmpty = useCallback(() => {
    toast.info(tRef.current("errors.noSound"), {
      description: tRef.current("errors.noSoundDesc"),
    });
    void emit("transcription-error", {
      error: tRef.current("errors.soundTooLow"),
    });
  }, []);

  const { liveTranscript, isStreamingSession, isStreamingSessionRef } =
    useStreamingSession({
      settings,
      onFinalize: onStreamingFinalize,
      onEmpty: onStreamingEmpty,
    });

  const transcribeAudio = useCallback(
    async (audioData: number[], sampleRate: number) => {
      setIsTranscribing(true);
      try {
        // Refresh vocab before transcription so edits made in the Settings UI
        // (snippets / dictionary) are reflected in this run's Whisper hint and
        // post-transcription snippet match.
        try {
          await refreshVocab();
        } catch (e) {
          console.warn("[recording vocab refresh failed]", e);
        }

        // Hard-stop when the user picked LexenaCloud but isn't actually able
        // to use it. We refuse silently falling back to local — the local
        // path doesn't know what to do with provider="LexenaCloud" and would
        // either crash or use a wrong key.
        if (hasCloudSelectedRef.current && cloudModeRef.current !== "cloud") {
          const { data } = await supabase.auth.getSession();
          const hasSession = Boolean(data.session?.access_token);
          const key = !hasSession
            ? "errors.signin_required"
            : "errors.not_eligible";
          toast.error(tRef.current(`cloud:${key}`));
          await emit("transcription-error", { error: tRef.current(`cloud:${key}`) });
          return;
        }

        const useCloudPath = cloudModeRef.current === "cloud";
        let cloudJwt: string | undefined;
        if (useCloudPath) {
          const { data } = await supabase.auth.getSession();
          cloudJwt = data.session?.access_token;
        }
        const effectiveProviderLabel = useCloudPath && cloudJwt
          ? "Cloud"
          : settings.transcription_provider;

        await emit("transcription-start", {
          provider: effectiveProviderLabel,
        });

        let result: TranscriptionInvokeResult;
        let cloudUsedSeconds: number | null = null;

        if (useCloudPath && cloudJwt) {
          try {
            const cloud = await transcribeCloud({
              samples: Int16Array.from(audioData),
              sampleRate: sampleRate,
              language: settings.language,
              jwt: cloudJwt,
              idempotencyKey: crypto.randomUUID(),
            });
            result = { text: cloud.text, audioPath: "" };
            cloudUsedSeconds = cloud.duration_ms / 1000;
          } catch (err) {
            if (err instanceof CloudApiError) {
              const key = err.isQuotaIssue()
                ? "errors.quota_exhausted"
                : err.isAuthIssue()
                  ? "errors.auth_expired"
                  : err.isProviderUnavailable()
                    ? "errors.provider_unavailable"
                    : null;
              if (key) {
                toast.error(tRef.current(`cloud:${key}`));
              } else {
                // Generic fallback for statuses without a dedicated i18n key
                // (e.g. 400 bad_request, 413, 415). Outer catch will skip the
                // alert because we already surfaced this to the user.
                toast.error(
                  tRef.current("errors.transcriptionError", { error: err.message }),
                );
              }
            }
            throw err;
          }
        } else {
          result = await invoke<TranscriptionInvokeResult>(
            "transcribe_audio",
            {
              audioSamples: audioData,
              sampleRate: sampleRate,
              language: settings.language,
              keepLast: settings.recordings_keep_last,
              localModelSize: settings.local_model_size,
              dictionary: syncDictionaryRef.current.join(", "),
              initialPrompt: settings.whisper_initial_prompt ?? "",
              translate: settings.translate_mode,
              keepModelInMemory: settings.keep_model_in_memory,
              trimSilence: settings.trim_silence,
            },
          );
        }

        // Post-process is cloud-only (Phase A retired BYOK). It can run in
        // hybrid mode: transcription Local + post-process via cloud JWT, when
        // the user is signed in and eligible.
        let postProcessJwt: string | undefined = useCloudPath ? cloudJwt : undefined;
        if (
          settings.post_process_enabled &&
          !postProcessJwt &&
          isCloudEligibleRef.current
        ) {
          const { data } = await supabase.auth.getSession();
          postProcessJwt = data.session?.access_token;
        }
        const canPostProcess = Boolean(postProcessJwt);
        if (shouldPostProcess(result.text, settings, canPostProcess)) {
          await emit("post-process-start");
        }
        const processed: PostProcessOutcome = canPostProcess
          ? await maybePostProcessCloud(
              result.text,
              settings,
              postProcessJwt!,
              tRef.current,
            )
          : { text: result.text };
        const finalText = processed.text;

        const durationSeconds = cloudUsedSeconds ?? audioData.length / sampleRate;
        // Local transcription is free; cloud cost is billed server-side on the worker.
        const apiCost = 0;

        await handleTranscriptionFinal(
          finalText,
          "whisper",
          result.audioPath,
          apiCost,
          processed.originalText,
          undefined,
          processed.cost,
          durationSeconds,
          effectiveProviderLabel,
        );

        await emit("transcription-success", { text: finalText });
        await invoke("log_separator");
      } catch (error) {
        console.error("Transcription error:", error);
        await emit("transcription-error", { error: String(error) });
        // CloudApiError was already toasted by the cloud branch above; the
        // alert below is for genuine local-path bugs / unhandled failures.
        if (!(error instanceof CloudApiError)) {
          alert(tRef.current('errors.transcriptionError', { error }));
        }
        await invoke("log_separator");
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings, handleTranscriptionFinal, refreshVocab],
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
          // Onboarding modal is open: TryItStep has its own path for the
          // demo. Pressing the hotkey before signup would otherwise route
          // through local transcription with no model installed.
          if (isOnboardingActive()) {
            console.log("Audio captured during onboarding — routed to demo handler");
            return;
          }

          // Streaming session: chunks were already shipped and transcribed;
          // Rust skips this emit when streaming was active, this guard is
          // defensive only.
          if (isStreamingSessionRef.current) {
            return;
          }

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
        // Capture the flag BEFORE stopping: the Rust stop path triggers the
        // streaming session-end event, which may reset the ref before the
        // invoke below resolves.
        const wasStreamingSession = isStreamingSessionRef.current;

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

        if (wasStreamingSession) {
          // Chunks were transcribed live; the streaming-session-end handler
          // finalizes (or reports the empty session). Nothing to do here.
          return;
        }

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
        // Refuse capture before recording when LexenaCloud is selected but the
        // user isn't eligible — otherwise they speak for 20s only to get a
        // generic post-capture error. Mirrors the Rust-side gate in
        // start_recording_shortcut for the hotkey path.
        if (hasCloudSelectedRef.current && cloudModeRef.current !== "cloud") {
          const { data } = await supabase.auth.getSession();
          const hasSession = Boolean(data.session?.access_token);
          const key = !hasSession
            ? "errors.signin_required"
            : "errors.not_eligible";
          toast.error(tRef.current(`cloud:${key}`));
          await emit("transcription-error", {
            error: tRef.current(`cloud:${key}`),
          });
          return;
        }
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

  // Listener for the Rust-side cloud gate: when a hotkey press is refused
  // (LexenaCloud selected + ineligible), Rust emits `cloud-gate-blocked` and
  // we surface the same i18n toast the UI button would show.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setup = async () => {
      try {
        const handle = await listen("cloud-gate-blocked", async () => {
          const { data } = await supabase.auth.getSession();
          const hasSession = Boolean(data.session?.access_token);
          const key = !hasSession
            ? "errors.signin_required"
            : "errors.not_eligible";
          toast.error(tRef.current(`cloud:${key}`));
          await emit("transcription-error", {
            error: tRef.current(`cloud:${key}`),
          });
        });
        if (disposed) handle();
        else unlisten = handle;
      } catch (err) {
        console.error("Failed to register cloud-gate-blocked listener:", err);
      }
    };
    setup();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, []);

  // Re-paste the last inserted transcription. Always uses the
  // clipboard-preserving paste regardless of insertion_mode — it's an explicit
  // user action, so it must paste even when auto-insert is "none".
  const doRepaste = useCallback(async () => {
    const text = lastInsertedTextRef.current;
    if (!text) {
      flog("[repaste] no last transcription available", "info");
      return;
    }
    try {
      await pasteTextPreservingClipboard(text);
      playSuccess();
    } catch (err) {
      flog(`[repaste] failed: ${String(err)}`, "error");
    }
  }, [playSuccess]);

  // Ref trampoline so the long-lived listener always reaches the latest closure
  // (playSuccess changes when enable_sounds toggles).
  const doRepasteRef = useRef(doRepaste);
  useEffect(() => {
    doRepasteRef.current = doRepaste;
  }, [doRepaste]);

  // repaste-last-transcription listener — Rust emits this on the repaste hotkey.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setup = async () => {
      try {
        const handle = await listen("repaste-last-transcription", () => {
          void doRepasteRef.current();
        });
        if (disposed) handle();
        else unlisten = handle;
      } catch (err) {
        console.error("Failed to register repaste listener:", err);
      }
    };
    setup();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, []);

  return {
    isRecording,
    isTranscribing,
    handleToggleRecording,
    liveTranscript,
    isStreamingSession,
  };
}
