import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { transcribeCloud } from "@/lib/cloud/api";
import {
  StreamingUploadSession,
  type FatalReason,
  type StreamingChunkPayload,
} from "@/lib/streaming/session";
import { flog } from "@/lib/flog";

interface StreamingSessionStartedPayload {
  sessionId: number;
  sampleRate: number;
}

interface StreamingSessionEndPayload {
  sessionId: number;
  totalChunks: number;
}

interface UseStreamingSessionOptions {
  settings: AppSettings["settings"];
  /** Final assembled text enters the regular finalization pipeline. */
  onFinalize: (
    text: string,
    billedSeconds: number,
    chunksFailed: number,
  ) => Promise<void>;
  /** Session ended with zero speech chunks (the user said nothing). */
  onEmpty: () => void;
}

/**
 * Frontend orchestrator for a Rust streaming session.
 *
 * Listens to the `streaming-*` events emitted by the Rust segmenter worker,
 * uploads each chunk through the existing cloud client (sequential queue,
 * see `StreamingUploadSession`), broadcasts the assembled text live via the
 * `streaming-transcript` event (consumed by the mini window), and hands the
 * final text to the caller when the session ends.
 *
 * A fatal upload error (quota exhausted, auth expired, repeated network
 * failures) aborts the session and stops the recording — keeping the mic
 * open would only capture audio nobody can transcribe.
 */
export function useStreamingSession({
  settings,
  onFinalize,
  onEmpty,
}: UseStreamingSessionOptions) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [liveTranscript, setLiveTranscript] = useState("");
  const [isStreamingSession, setIsStreamingSession] = useState(false);
  const isStreamingSessionRef = useRef(false);

  const sessionRef = useRef<StreamingUploadSession | null>(null);
  const sessionIdRef = useRef<number>(-1);

  // Ref trampolines so the long-lived listeners always see fresh values.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const onFinalizeRef = useRef(onFinalize);
  useEffect(() => {
    onFinalizeRef.current = onFinalize;
  }, [onFinalize]);
  const onEmptyRef = useRef(onEmpty);
  useEffect(() => {
    onEmptyRef.current = onEmpty;
  }, [onEmpty]);

  const handleFatal = useCallback(async (reason: FatalReason, error: unknown) => {
    flog(`[streaming] fatal (${reason}): ${String(error)}`, "error");
    const translate = tRef.current;
    const message =
      reason === "quota"
        ? translate("cloud:errors.quota_exhausted")
        : reason === "auth"
          ? translate("cloud:errors.auth_expired")
          : translate("errors.transcriptionError", { error: String(error) });
    toast.error(message);
    await emit("transcription-error", { error: message });
    // Stop the mic: nothing can be transcribed anymore. The stop path closes
    // the Rust session, whose end event resolves the aborted upload session.
    try {
      await invoke("stop_recording", {
        silenceThreshold: settingsRef.current.silence_threshold,
      });
    } catch {
      // Already stopped (or stopping) — nothing else to do.
    }
  }, []);
  const handleFatalRef = useRef(handleFatal);
  useEffect(() => {
    handleFatalRef.current = handleFatal;
  }, [handleFatal]);

  useEffect(() => {
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const listeners = await Promise.all([
        listen<StreamingSessionStartedPayload>(
          "streaming-session-started",
          (event) => {
            const { sessionId } = event.payload;
            // A new uuid per session keeps idempotency keys unique across
            // app restarts (Rust session ids restart from 1).
            const sessionUuid = crypto.randomUUID();
            sessionIdRef.current = sessionId;
            sessionRef.current = new StreamingUploadSession({
              sessionId,
              language: settingsRef.current.language,
              getJwt: async () => {
                const { data } = await supabase.auth.getSession();
                return data.session?.access_token;
              },
              transport: async (chunk, jwt, language) => {
                const result = await transcribeCloud({
                  samples: Int16Array.from(chunk.samples),
                  sampleRate: chunk.sampleRate,
                  language,
                  jwt,
                  idempotencyKey: `${sessionUuid}-${chunk.chunkIndex}`,
                });
                return { text: result.text, duration_ms: result.duration_ms };
              },
              onTranscript: (assembledText) => {
                setLiveTranscript(assembledText);
                void emit("streaming-transcript", {
                  sessionId,
                  text: assembledText,
                });
              },
              onFatal: (reason, error) => {
                void handleFatalRef.current(reason, error);
              },
            });
            setLiveTranscript("");
            setIsStreamingSession(true);
            isStreamingSessionRef.current = true;
          },
        ),

        listen<StreamingChunkPayload>("streaming-chunk", (event) => {
          if (event.payload.sessionId !== sessionIdRef.current) return;
          sessionRef.current?.enqueue(event.payload);
        }),

        listen<StreamingSessionEndPayload>(
          "streaming-session-end",
          async (event) => {
            if (event.payload.sessionId !== sessionIdRef.current) return;
            const session = sessionRef.current;
            sessionRef.current = null;
            if (!session) return;

            const { totalChunks } = event.payload;
            // Skip the processing state when the session already died on a
            // fatal error — transcription-error was emitted there, and
            // re-emitting transcription-start would leave the mini window
            // stuck on "processing".
            if (totalChunks > 0 && session.active) {
              await emit("transcription-start", { provider: "Cloud" });
            }
            const outcome = await session.finish();

            setIsStreamingSession(false);
            isStreamingSessionRef.current = false;
            setLiveTranscript("");

            if (outcome.aborted) return; // fatal path already surfaced it
            if (totalChunks === 0) {
              onEmptyRef.current();
              return;
            }
            if (outcome.chunksOk === 0) {
              const message = tRef.current("streaming.allChunksFailed");
              toast.error(message);
              await emit("transcription-error", { error: message });
              return;
            }
            await onFinalizeRef.current(
              outcome.text,
              outcome.billedMs / 1000,
              outcome.chunksFailed,
            );
          },
        ),

        listen<{ sessionId: number }>("streaming-session-cancelled", (event) => {
          if (event.payload.sessionId !== sessionIdRef.current) return;
          sessionRef.current?.abort();
          sessionRef.current = null;
          setIsStreamingSession(false);
          isStreamingSessionRef.current = false;
          setLiveTranscript("");
        }),
      ]);

      if (disposed) {
        listeners.forEach((fn) => fn());
      } else {
        unlisteners.push(...listeners);
      }
    };

    void setup().catch((error) => {
      console.error("Failed to register streaming listeners:", error);
    });

    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  return { liveTranscript, isStreamingSession, isStreamingSessionRef };
}
