import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { marked } from "marked";
import TurndownService from "turndown";
import { useAiProcess } from "@/hooks/useAiProcess";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
// Images are usually inline base64 in this app; shipping them to the AI would
// blow past the token budget for no useful reason. Strip them from the
// Markdown payload — the user can re-insert manually if needed.
turndown.addRule("strip-images", {
  filter: "img",
  replacement: () => "",
});

function editorToMarkdown(editor: Editor, from?: number, to?: number): string {
  const hasRange = from !== undefined && to !== undefined && from !== to;
  let html: string;
  if (hasRange) {
    const slice = editor.state.doc.slice(from, to);
    const serializer = DOMSerializer.fromSchema(editor.schema);
    const fragment = serializer.serializeFragment(slice.content);
    const container = document.createElement("div");
    container.appendChild(fragment);
    html = container.innerHTML;
  } else {
    html = editor.getHTML();
  }
  return turndown.turndown(html);
}

// AI responses are Markdown-shaped (headings, bullets, line breaks). We
// convert to HTML so TipTap preserves the structure instead of flattening
// everything into a single paragraph.
function aiTextToHtml(text: string): string {
  return marked.parse(text, { gfm: true, breaks: true, async: false }) as string;
}

/**
 * Thin wrapper over `useAiProcess` that plugs it into the TipTap editor:
 *
 * - `processSelection` serializes the current selection (or the full
 *   document) to Markdown, stashes it for the preview, and calls the
 *   underlying AI command.
 * - `accept` parses the Markdown AI result back into HTML and writes it to
 *   the editor — replacing the selection if there was one, or resetting the
 *   whole document otherwise.
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
      const markdown = editorToMarkdown(editor, from, to);
      setOriginalText(markdown);
      processText(markdown, systemPrompt, apiKey);
    },
    [editor, processText, apiKey],
  );

  const accept = useCallback(() => {
    if (!editor) return;
    const text = rawAccept();
    const html = aiTextToHtml(text);
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    if (hasSelection) {
      editor.chain().focus().deleteSelection().insertContent(html).run();
    } else {
      editor.commands.setContent(html);
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
