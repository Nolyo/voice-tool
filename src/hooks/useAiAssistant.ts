import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useAiProcess } from "@/hooks/useAiProcess";

/**
 * Thin wrapper over `useAiProcess` that plugs it into the TipTap editor:
 *
 * - `processSelection` reads the current selection (or the full document if
 *   nothing is selected), stashes it for later display in the preview UI,
 *   and calls the underlying AI command.
 * - `accept` writes the AI result back into the editor — replacing the
 *   selection if there was one, or resetting the whole document otherwise.
 * - Auto-dismisses the error state after 5 s so the banner disappears by
 *   itself.
 */
export function useAiAssistant(editor: Editor | null, apiKey: string) {
  const {
    state,
    result,
    error,
    processText,
    accept: rawAccept,
    dismiss,
  } = useAiProcess();
  const [originalText, setOriginalText] = useState("");

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (state !== "error") return;
    const timer = setTimeout(() => dismiss(), 5000);
    return () => clearTimeout(timer);
  }, [state, dismiss]);

  const processSelection = useCallback(
    (systemPrompt: string) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;
      const text = hasSelection
        ? editor.state.doc.textBetween(from, to)
        : editor.getText();
      setOriginalText(text);
      processText(text, systemPrompt, apiKey);
    },
    [editor, processText, apiKey],
  );

  const accept = useCallback(() => {
    if (!editor) return;
    const text = rawAccept();
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    if (hasSelection) {
      editor.chain().focus().deleteSelection().insertContent(text).run();
    } else {
      editor.commands.setContent(`<p>${text}</p>`);
    }
  }, [editor, rawAccept]);

  return {
    state,
    result,
    error,
    originalText,
    processSelection,
    accept,
    dismiss,
  };
}
