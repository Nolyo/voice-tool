import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Loader2, Mic, Sparkles } from "lucide-react";
import { bootstrapSecondaryWindow } from "@/lib/window-bootstrap";
import {
  getDefaultVoiceEditActions,
  SELECTION_CHAR_CAP,
  truncateSelection,
} from "@/lib/voice-edit/actions";
import {
  nextVoiceEditState,
  type VoiceEditEvent,
  type VoiceEditState,
} from "./voice-edit-machine";
import { VoiceEditPalette } from "./VoiceEditPalette";
import "./voice-edit.css";

/** How much of the selection is echoed back in the overlay header. */
const PREVIEW_CHAR_CAP = 140;

interface OpenPayload {
  text: string;
  sourceWindow: number;
  hadSelection: boolean;
  truncated: boolean;
}

interface StatePayload {
  event: VoiceEditEvent;
  result?: string;
  error?: string;
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
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<VoiceEditState>("listening");
  const [selection, setSelection] = useState<OpenPayload | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // Rebuilt when the UI language changes: `bootstrapSecondaryWindow` forwards
  // the main window's `language-changed` broadcast into this webview's i18n.
  const actions = useMemo(
    () => getDefaultVoiceEditActions(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language],
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

  // Same bootstrap as the mini and detached-note windows: without it this
  // webview never gets the `dark` class (the default theme) and never follows
  // theme or language changes made in the main window.
  useEffect(() => {
    let dispose: (() => void) | null = null;
    let disposed = false;
    void bootstrapSecondaryWindow().then(({ unlisten }) => {
      if (disposed) unlisten();
      else dispose = unlisten;
    });
    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);

  /**
   * Single entry point for state changes.
   *
   * Everything goes through the machine — including the events pushed by the
   * main window — so the transitions it forbids (a late instruction rewinding a
   * running request, a resolution landing after an error) stay forbidden here
   * too. The error message is cleared by the same rule: it survives exactly as
   * long as the machine stays in `error`.
   */
  const applyEvent = useCallback(
    (event: VoiceEditEvent, extra?: { result?: string; error?: string }) => {
      const next = nextVoiceEditState(stateRef.current, event);
      stateRef.current = next;
      setState(next);

      if (next === "error") {
        if (extra?.error) setError(extra.error);
      } else {
        setError("");
      }
      if (next === "result" && extra?.result !== undefined) {
        setResult(extra.result);
        setCopied(false);
      }
    },
    [],
  );

  const close = useCallback(() => {
    void emit("voice-edit-close");
    // A no-op on the Rust side unless a Voice Edit capture actually owns the
    // microphone, so this cannot cut short a dictation started meanwhile.
    void invoke("stop_voice_edit_instruction", { abort: true }).catch(() => {});
    void invoke("hide_voice_edit_overlay").catch(() => {});
    applyEvent({ type: "close" });
    setResult("");
    setCopied(false);
  }, [applyEvent]);

  const runAction = useCallback(
    (index: number) => {
      const current = selectionRef.current;
      if (!current) return;
      // The mic loses the race: drop the audio rather than transcribing an
      // instruction the user replaced with a keystroke.
      void invoke("stop_voice_edit_instruction", { abort: true }).catch(() => {});
      applyEvent({ type: "palette-key" });
      void emit("voice-edit-run", {
        actionIndex: index,
        text: current.text,
        sourceWindow: current.sourceWindow,
      });
    },
    [applyEvent],
  );

  const retry = useCallback(() => {
    const current = selectionRef.current;
    if (!current) return;
    applyEvent({ type: "retry" });
    void emit("voice-edit-retry", {
      text: current.text,
      sourceWindow: current.sourceWindow,
    });
  }, [applyEvent]);

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
      stateRef.current = "listening";
      setState("listening");
      setResult("");
      setError("");
      setCopied(false);
    });

    const unlistenState = listen<StatePayload>("voice-edit-state", (event) => {
      const { event: machineEvent, result, error } = event.payload;
      applyEvent(machineEvent, { result, error });
    });

    return () => {
      void unlistenOpen.then((f) => f());
      void unlistenState.then((f) => f());
    };
  }, [applyEvent]);

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
  // Code-point aware: a raw `.slice` would cut a surrogate pair in half and
  // render a lone U+FFFD at the end of the preview.
  const preview = useMemo(
    () => truncateSelection(selection?.text ?? "", PREVIEW_CHAR_CAP),
    [selection?.text],
  );

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
          {preview.text}
          {preview.truncated ? "…" : ""}
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
