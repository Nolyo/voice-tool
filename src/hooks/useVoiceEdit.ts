import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { emit, listen } from "@tauri-apps/api/event";
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
import type { VoiceEditState } from "@/components/voice-edit/voice-edit-machine";

interface RunPayload {
  actionIndex: number;
  text: string;
  sourceWindow: number;
}

interface InstructionPayload {
  samples: number[];
  sampleRate: number;
}

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

  /** Text captured for the current invocation, and the prompt to replay on retry. */
  const sessionRef = useRef<{ text: string; systemPrompt: string } | null>(null);

  const pushState = useCallback(
    (state: VoiceEditState, extra?: { result?: string; error?: string }) => {
      void emit("voice-edit-state", { state, ...extra });
    },
    [],
  );

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
      sessionRef.current = { text: userText, systemPrompt };
      pushState("processing");
      try {
        const jwt = await getJwt();
        if (!jwt) {
          pushState("upsell");
          return;
        }
        const response = await notesAssistCloud({
          systemPrompt,
          userText,
          jwt,
          idempotencyKey: crypto.randomUUID(),
        });
        pushState("result", { result: response.text });
      } catch (e) {
        pushState("error", { error: describeError(e) });
      }
    },
    [describeError, getJwt, pushState],
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
    const unlistenRun = listen<RunPayload>("voice-edit-run", (event) => {
      if (!eligibleRef.current) {
        pushState("upsell");
        return;
      }
      const prompt = promptForAction(event.payload.actionIndex);
      if (!prompt) return;
      void runPrompt(prompt, event.payload.text);
    });

    const unlistenInstruction = listen<InstructionPayload>(
      "voice-edit-instruction",
      async (event) => {
        if (!eligibleRef.current) {
          pushState("upsell");
          return;
        }
        const { samples, sampleRate } = event.payload;
        if (!samples.length) {
          pushState("error", {
            error: tRef.current("voiceEdit.errors.emptyInstruction"),
          });
          return;
        }

        pushState("transcribing");
        try {
          const jwt = await getJwt();
          if (!jwt) {
            pushState("upsell");
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
            pushState("error", {
              error: tRef.current("voiceEdit.errors.emptyInstruction"),
            });
            return;
          }
          const pending = sessionRef.current;
          await runPrompt(
            buildInstructionPrompt(instruction),
            pending?.text ?? "",
          );
        } catch (e) {
          pushState("error", { error: describeError(e) });
        }
      },
    );

    const unlistenRetry = listen<{ text: string }>(
      "voice-edit-retry",
      (event) => {
        const pending = sessionRef.current;
        if (!pending) return;
        void runPrompt(pending.systemPrompt, event.payload.text ?? pending.text);
      },
    );

    const unlistenTimeout = listen("voice-edit-instruction-timeout", () => {
      pushState("error", {
        error: tRef.current("voiceEdit.errors.emptyInstruction"),
      });
    });

    const unlistenClose = listen("voice-edit-close", () => {
      sessionRef.current = null;
    });

    return () => {
      void unlistenRun.then((f) => f());
      void unlistenInstruction.then((f) => f());
      void unlistenRetry.then((f) => f());
      void unlistenTimeout.then((f) => f());
      void unlistenClose.then((f) => f());
    };
  }, [describeError, getJwt, promptForAction, pushState, runPrompt]);
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
