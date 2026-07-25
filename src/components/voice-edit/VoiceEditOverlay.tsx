import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Loader2, Mic, Sparkles } from "lucide-react";
import {
  getDefaultVoiceEditActions,
  SELECTION_CHAR_CAP,
  type VoiceEditAction,
} from "@/lib/voice-edit/actions";
import {
  nextVoiceEditState,
  type VoiceEditState,
} from "./voice-edit-machine";
import { VoiceEditPalette } from "./VoiceEditPalette";
import "./voice-edit.css";

interface OpenPayload {
  text: string;
  sourceWindow: number;
  hadSelection: boolean;
  truncated: boolean;
}

interface StatePayload {
  state: VoiceEditState;
  result?: string;
  error?: string;
  /** Palette actions resolved by the main window (user-customised ones). */
  actions?: VoiceEditAction[];
}

/**
 * Passive display for the Voice Edit flow.
 *
 * Everything that needs settings, auth or the cloud session lives in the main
 * window (`useVoiceEdit`): this window only captures keystrokes, renders the
 * current state, and asks Rust to replace the text when the user confirms.
 * Mounting the auth/cloud providers a second time here is the class of bug the
 * detached-notes design explicitly rejected.
 */
export function VoiceEditOverlay() {
  const { t } = useTranslation();
  const [state, setState] = useState<VoiceEditState>("listening");
  const [selection, setSelection] = useState<OpenPayload | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [actions, setActions] = useState<VoiceEditAction[]>(() =>
    getDefaultVoiceEditActions(),
  );
  // Read inside event handlers registered once — a stale closure here would
  // send the replace request with the previous invocation's window handle.
  const selectionRef = useRef<OpenPayload | null>(null);
  selectionRef.current = selection;
  const stateRef = useRef<VoiceEditState>(state);
  stateRef.current = state;

  // Transparent background for the frameless window, plus the `vt-app` design
  // scope. `.vt-app` sets an opaque background of its own, so it has to be
  // overridden explicitly or the overlay renders as a solid rectangle.
  useEffect(() => {
    const rootEl = document.documentElement;
    const bodyEl = document.body;
    bodyEl.classList.add("vt-app", "voice-edit-body");
    rootEl.style.backgroundColor = "transparent";
    bodyEl.style.backgroundColor = "transparent";
    return () => {
      bodyEl.classList.remove("vt-app", "voice-edit-body");
      rootEl.style.removeProperty("background-color");
      bodyEl.style.removeProperty("background-color");
    };
  }, []);

  const close = useCallback(() => {
    void emit("voice-edit-close");
    void invoke("stop_voice_edit_instruction", { abort: true }).catch(() => {});
    void invoke("hide_voice_edit_overlay").catch(() => {});
    setState("listening");
    setResult("");
    setError("");
    setCopied(false);
  }, []);

  const runAction = useCallback(
    (index: number) => {
      const current = selectionRef.current;
      if (!current) return;
      // The mic loses the race: drop the audio rather than transcribing an
      // instruction the user replaced with a keystroke.
      void invoke("stop_voice_edit_instruction", { abort: true }).catch(() => {});
      setState((s) => nextVoiceEditState(s, { type: "palette-key" }));
      void emit("voice-edit-run", {
        actionIndex: index,
        text: current.text,
        sourceWindow: current.sourceWindow,
      });
    },
    [],
  );

  const retry = useCallback(() => {
    const current = selectionRef.current;
    if (!current) return;
    setState((s) => nextVoiceEditState(s, { type: "retry" }));
    void emit("voice-edit-retry", {
      text: current.text,
      sourceWindow: current.sourceWindow,
    });
  }, []);

  const copy = useCallback(async () => {
    if (!result) return;
    try {
      await writeText(result);
      setCopied(true);
    } catch {
      // Copy is a convenience; the text stays visible either way.
    }
  }, [result]);

  const replace = useCallback(async () => {
    const current = selectionRef.current;
    if (!current || !result) return;
    // Put the result on the clipboard first: if the injection is refused by a
    // read-only target, the user still has the text.
    try {
      await writeText(result);
    } catch {
      // Non-fatal.
    }
    try {
      await invoke("replace_selection", {
        text: result,
        sourceWindow: current.sourceWindow,
        mode: "cursor",
      });
      close();
    } catch (e) {
      const message = String(e);
      setError(
        message.includes("focus_failed")
          ? t("voiceEdit.errors.focusFailed")
          : t("voiceEdit.errors.replaceFailed"),
      );
    }
  }, [result, close, t]);

  useEffect(() => {
    const unlistenOpen = listen<OpenPayload>("voice-edit-open", (event) => {
      setSelection(event.payload);
      setState("listening");
      setResult("");
      setError("");
      setCopied(false);
    });

    const unlistenState = listen<StatePayload>("voice-edit-state", (event) => {
      const payload = event.payload;
      if (payload.actions?.length) setActions(payload.actions);
      if (payload.result !== undefined) setResult(payload.result);
      if (payload.error !== undefined) setError(payload.error);
      setState(payload.state);
    });

    return () => {
      void unlistenOpen.then((f) => f());
      void unlistenState.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (stateRef.current !== "listening") return;
      if (event.key >= "1" && event.key <= "9") {
        event.preventDefault();
        runAction(Number(event.key));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, runAction]);

  const busy = state === "transcribing" || state === "processing";

  return (
    <div className="voice-edit" role="dialog" aria-label={t("voiceEdit.overlay.title")}>
      <header className="voice-edit__header">
        <Sparkles className="voice-edit__glyph" aria-hidden="true" />
        <span className="voice-edit__title">{t("voiceEdit.overlay.title")}</span>
        <span className="voice-edit__hint">{t("voiceEdit.overlay.closeHint")}</span>
      </header>

      {selection && !selection.hadSelection && state === "listening" && (
        <p className="voice-edit__note">{t("voiceEdit.overlay.noSelection")}</p>
      )}

      {selection?.hadSelection && (
        <p className="voice-edit__selection" title={selection.text}>
          <span className="voice-edit__selection-label">
            {t("voiceEdit.overlay.selectionLabel")}
          </span>
          {selection.text.slice(0, 140)}
          {selection.text.length > 140 ? "…" : ""}
        </p>
      )}

      {selection?.truncated && (
        <p className="voice-edit__warning">
          {t("voiceEdit.overlay.truncated", { count: SELECTION_CHAR_CAP })}
        </p>
      )}

      {state === "listening" && (
        <>
          <p className="voice-edit__status">
            <Mic className="voice-edit__glyph" aria-hidden="true" />
            {t("voiceEdit.overlay.listening")}
          </p>
          <VoiceEditPalette actions={actions} onPick={runAction} />
        </>
      )}

      {busy && (
        <p className="voice-edit__status">
          <Loader2 className="voice-edit__glyph voice-edit__glyph--spin" aria-hidden="true" />
          {state === "transcribing"
            ? t("voiceEdit.overlay.transcribing")
            : t("voiceEdit.overlay.processing")}
        </p>
      )}

      {state === "upsell" && (
        <div className="voice-edit__upsell">
          <p className="voice-edit__upsell-title">{t("voiceEdit.upsell.title")}</p>
          <p>{t("voiceEdit.upsell.body")}</p>
        </div>
      )}

      {state === "result" && (
        <div className="voice-edit__result">
          <p className="voice-edit__result-text">{result}</p>
        </div>
      )}

      {error && <p className="voice-edit__error">{error}</p>}

      {(state === "result" || state === "error") && (
        <footer className="voice-edit__actions">
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={t("voiceEdit.overlay.copyAria")}
            disabled={!result}
          >
            {copied ? t("voiceEdit.overlay.copied") : t("voiceEdit.overlay.copy")}
          </button>
          <button
            type="button"
            onClick={() => void replace()}
            aria-label={t("voiceEdit.overlay.replaceAria")}
            disabled={!result}
          >
            {t("voiceEdit.overlay.replace")}
          </button>
          <button
            type="button"
            onClick={retry}
            aria-label={t("voiceEdit.overlay.retryAria")}
          >
            {t("voiceEdit.overlay.retry")}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label={t("voiceEdit.overlay.closeAria")}
          >
            {t("voiceEdit.overlay.close")}
          </button>
        </footer>
      )}
    </div>
  );
}
