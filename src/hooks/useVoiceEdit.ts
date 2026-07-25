import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { emit, listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { notesAssistCloud, transcribeCloud } from "@/lib/cloud/api";
import { CloudApiError } from "@/lib/cloud/errors";
import { useCloud } from "@/hooks/useCloud";
import { useSettings } from "@/hooks/useSettings";
import {
  getDefaultVoiceEditActions,
  resolveActionByIndex,
} from "@/lib/voice-edit/actions";
import {
  buildInstructionPrompt,
  buildTranslatePrompt,
} from "@/lib/voice-edit/prompts";
import {
  nextVoiceEditState,
  type VoiceEditEvent,
  type VoiceEditState,
} from "@/components/voice-edit/voice-edit-machine";

interface RunPayload {
  actionIndex: number;
  text: string;
  sourceWindow: number;
}

interface InstructionPayload {
  samples: number[];
  sampleRate: number;
}

interface OpenPayload {
  text: string;
  sourceWindow: number;
  hadSelection: boolean;
  truncated: boolean;
}

/** Reasons Rust can refuse to open the overlay, from `voice-edit-blocked`. */
type BlockedReason = "recording_in_progress" | "mic_unavailable";

/**
 * Drives the Voice Edit overlay from the main window.
 *
 * The overlay is a separate webview with no auth, settings or cloud context of
 * its own, so everything that needs them happens here and the result is pushed
 * back over Tauri events. Mounting a second set of providers in the overlay is
 * the failure mode the detached-notes design rejected (duplicated sync queues).
 *
 * Mounted once, from the Dashboard.
 */
export function useVoiceEdit() {
  const { t } = useTranslation();
  const { isCloudEligible } = useCloud();
  const { settings } = useSettings();

  // Event listeners are registered once; reading live values through refs
  // avoids re-subscribing on every settings or eligibility change.
  const eligibleRef = useRef(isCloudEligible);
  eligibleRef.current = isCloudEligible;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const tRef = useRef(t);
  tRef.current = t;

  /** Selection captured by Rust for the current invocation. */
  const selectionRef = useRef<OpenPayload | null>(null);
  /** System prompt of the last run, replayed by Retry. */
  const lastPromptRef = useRef<string | null>(null);

  /**
   * Mirror of the overlay's state machine.
   *
   * The overlay applies `palette-key` and `retry` locally the instant the user
   * presses them, so this side has to track the same transitions to know when
   * an in-flight instruction has been superseded — otherwise a palette key
   * pressed mid-sentence bills a transcription *and* two LLM calls.
   */
  const stateRef = useRef<VoiceEditState>("listening");

  /**
   * Read the mirrored state. A function rather than a direct `stateRef.current`
   * read so TypeScript does not carry a narrowing across the `await`s in the
   * instruction handler, where `advance` mutates the ref in between.
   */
  const currentState = useCallback((): VoiceEditState => stateRef.current, []);

  /** Apply a transition locally and mirror it to the overlay. */
  const advance = useCallback(
    (event: VoiceEditEvent, extra?: { result?: string; error?: string }) => {
      stateRef.current = nextVoiceEditState(stateRef.current, event);
      void emit("voice-edit-state", { event, ...extra });
    },
    [],
  );

  /**
   * Apply a transition the overlay already made on its own. Mirroring it back
   * would be a no-op, so it stays local.
   */
  const track = useCallback((event: VoiceEditEvent) => {
    stateRef.current = nextVoiceEditState(stateRef.current, event);
  }, []);

  const getJwt = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const describeError = useCallback((e: unknown): string => {
    const translate = tRef.current;
    if (e instanceof CloudApiError) {
      if (e.isQuotaIssue()) return translate("cloud:errors.quota_exhausted");
      if (e.isAuthIssue()) return translate("cloud:errors.auth_expired");
      if (e.isProviderUnavailable())
        return translate("cloud:errors.provider_unavailable");
      return e.message || translate("voiceEdit.errors.generic");
    }
    return translate("voiceEdit.errors.generic");
  }, []);

  const runPrompt = useCallback(
    async (systemPrompt: string, userText: string) => {
      lastPromptRef.current = systemPrompt;
      // `transcribed` is the transition into "processing" from either origin:
      // the overlay already moved there on a palette key or a retry, where the
      // machine treats this as a no-op.
      advance({ type: "transcribed" });
      try {
        const jwt = await getJwt();
        if (!jwt) {
          advance({ type: "ineligible" });
          return;
        }
        const response = await notesAssistCloud({
          systemPrompt,
          userText,
          jwt,
          idempotencyKey: crypto.randomUUID(),
        });
        advance({ type: "resolved" }, { result: response.text });
      } catch (e) {
        advance({ type: "failed" }, { error: describeError(e) });
      }
    },
    [advance, describeError, getJwt],
  );

  /**
   * Resolve the system prompt for a palette entry. `translate` is special: its
   * prompt depends on the two configured languages, so it is built here rather
   * than stored.
   */
  const promptForAction = useCallback((actionIndex: number): string | null => {
    const actions = getDefaultVoiceEditActions();
    const action = resolveActionByIndex(actions, actionIndex);
    if (!action) return null;
    if (action.id === "translate") {
      const current = settingsRef.current;
      return buildTranslatePrompt(
        languageName(current.voice_edit_primary_lang),
        languageName(current.voice_edit_secondary_lang),
      );
    }
    return action.systemPrompt;
  }, []);

  useEffect(() => {
    // Rust captures the selection *before* showing the overlay and broadcasts
    // it here too: without this, the dictated-instruction path would have no
    // text to work on and would ship an empty document to the LLM.
    const unlistenOpen = listen<OpenPayload>("voice-edit-open", (event) => {
      selectionRef.current = event.payload;
      lastPromptRef.current = null;
      stateRef.current = "listening";
    });

    const unlistenBlocked = listen<BlockedReason>(
      "voice-edit-blocked",
      (event) => {
        if (event.payload === "recording_in_progress") {
          // The overlay was never shown, so the feedback has to happen here.
          toast.error(tRef.current("voiceEdit.errors.recordingInProgress"));
          return;
        }
        advance(
          { type: "failed" },
          { error: tRef.current("voiceEdit.errors.micUnavailable") },
        );
      },
    );

    const unlistenRun = listen<RunPayload>("voice-edit-run", (event) => {
      // Mirrors the transition the overlay already applied, so a later
      // instruction knows it lost the race.
      track({ type: "palette-key" });
      if (!eligibleRef.current) {
        advance({ type: "ineligible" });
        return;
      }
      const prompt = promptForAction(event.payload.actionIndex);
      if (!prompt) {
        // The overlay is already showing "Working…"; leaving it there would
        // hang forever on a keystroke that resolves to nothing.
        advance(
          { type: "failed" },
          { error: tRef.current("voiceEdit.errors.generic") },
        );
        return;
      }
      void runPrompt(prompt, event.payload.text);
    });

    const unlistenInstruction = listen<InstructionPayload>(
      "voice-edit-instruction",
      async (event) => {
        // A palette key pressed mid-sentence already moved the overlay on; the
        // audio that was in flight is stale. Dropping it here is what keeps the
        // race from billing a transcription plus a second LLM call.
        if (currentState() !== "listening") {
          return;
        }
        if (!eligibleRef.current) {
          advance({ type: "ineligible" });
          return;
        }
        const { samples, sampleRate } = event.payload;
        if (!samples.length) {
          advance(
            { type: "failed" },
            { error: tRef.current("voiceEdit.errors.emptyInstruction") },
          );
          return;
        }

        advance({ type: "instruction-captured" });
        try {
          const jwt = await getJwt();
          if (!jwt) {
            advance({ type: "ineligible" });
            return;
          }
          // Always transcribed through the cloud, even when the user picked the
          // local provider: Voice Edit already requires cloud eligibility for
          // the LLM step, and routing a 2-second instruction through local
          // Whisper would load the model and write a stray WAV into the
          // recordings folder for nothing.
          const transcription = await transcribeCloud({
            samples: Int16Array.from(samples),
            sampleRate,
            language: settingsRef.current.language,
            jwt,
            idempotencyKey: crypto.randomUUID(),
          });
          const instruction = transcription.text.trim();
          if (!instruction) {
            advance(
              { type: "failed" },
              { error: tRef.current("voiceEdit.errors.emptyInstruction") },
            );
            return;
          }
          // A palette key can still have landed while the upload was in flight.
          if (currentState() !== "transcribing") {
            return;
          }
          await runPrompt(
            buildInstructionPrompt(instruction),
            selectionRef.current?.text ?? "",
          );
        } catch (e) {
          advance(
            { type: "failed" },
            {
              error:
                e instanceof CloudApiError
                  ? describeError(e)
                  : tRef.current("voiceEdit.errors.transcriptionFailed"),
            },
          );
        }
      },
    );

    const unlistenRetry = listen<{ text: string }>(
      "voice-edit-retry",
      (event) => {
        const systemPrompt = lastPromptRef.current;
        if (!systemPrompt) {
          advance(
            { type: "failed" },
            { error: tRef.current("voiceEdit.errors.generic") },
          );
          return;
        }
        track({ type: "retry" });
        void runPrompt(
          systemPrompt,
          event.payload.text ?? selectionRef.current?.text ?? "",
        );
      },
    );

    const unlistenTimeout = listen("voice-edit-instruction-timeout", () => {
      advance(
        { type: "failed" },
        { error: tRef.current("voiceEdit.errors.emptyInstruction") },
      );
    });

    const unlistenClose = listen("voice-edit-close", () => {
      selectionRef.current = null;
      lastPromptRef.current = null;
      stateRef.current = "listening";
    });

    return () => {
      void unlistenOpen.then((f) => f());
      void unlistenBlocked.then((f) => f());
      void unlistenRun.then((f) => f());
      void unlistenInstruction.then((f) => f());
      void unlistenRetry.then((f) => f());
      void unlistenTimeout.then((f) => f());
      void unlistenClose.then((f) => f());
    };
  }, [
    advance,
    currentState,
    describeError,
    getJwt,
    promptForAction,
    runPrompt,
    track,
  ]);
}

/**
 * Turn a language code into an English display name for the prompt ("fr" →
 * "French"). Models follow language names more reliably than ISO codes inside
 * a natural-language instruction.
 */
function languageName(code: string): string {
  if (!code) return code;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
