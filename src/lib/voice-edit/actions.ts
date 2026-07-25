import i18n from "@/i18n";

/**
 * A palette entry: what the user sees, and the system prompt sent to the
 * managed AI worker when they pick it.
 *
 * `systemPrompt` is empty for `translate` only: that prompt depends on the
 * user's primary/secondary language settings, so it is built at call time by
 * `buildTranslatePrompt`.
 */
export interface VoiceEditAction {
  id: string;
  label: string;
  systemPrompt: string;
}

/**
 * Upper bound on what we ship to the LLM. Mirrors `SELECTION_CHAR_CAP` in
 * `src-tauri/src/commands/selection.rs` — keep both in sync.
 */
export const SELECTION_CHAR_CAP = 15_000;

/**
 * Built on every call rather than frozen at import time, so switching the UI
 * language updates the palette without a reload.
 */
export function getDefaultVoiceEditActions(): VoiceEditAction[] {
  const t = i18n.t;
  return [
    {
      id: "translate",
      label: t("voiceEdit.actions.translate"),
      systemPrompt: "",
    },
    {
      id: "fix",
      label: t("voiceEdit.actions.fix"),
      systemPrompt: t("voiceEdit.actions.fixPrompt"),
    },
    {
      id: "rephrase",
      label: t("voiceEdit.actions.rephrase"),
      systemPrompt: t("voiceEdit.actions.rephrasePrompt"),
    },
    {
      id: "summarize",
      label: t("voiceEdit.actions.summarize"),
      systemPrompt: t("voiceEdit.actions.summarizePrompt"),
    },
  ];
}

/**
 * Resolve a palette keystroke to its action. `index` is 1-based: it is the
 * digit the user pressed, and `0` is not a palette key.
 */
export function resolveActionByIndex(
  actions: VoiceEditAction[],
  index: number,
): VoiceEditAction | null {
  if (!Number.isInteger(index) || index < 1 || index > actions.length) {
    return null;
  }
  return actions[index - 1];
}

/**
 * Cap the selection before it reaches the LLM.
 *
 * Iterates code points rather than slicing by `.length`: a raw slice would cut
 * a surrogate pair (emoji, some CJK) in half and emit a lone surrogate.
 */
export function truncateSelection(
  text: string,
  max: number = SELECTION_CHAR_CAP,
): { text: string; truncated: boolean } {
  const chars = Array.from(text);
  if (chars.length <= max) {
    return { text, truncated: false };
  }
  return { text: chars.slice(0, max).join(""), truncated: true };
}
