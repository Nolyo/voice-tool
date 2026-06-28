import { invoke } from "@tauri-apps/api/core";

/**
 * Paste `text` at the active window's cursor via clipboard + Ctrl+V, restoring
 * the user's previous clipboard afterwards.
 *
 * Shared by the transcription auto-insert (cursor mode) and the
 * re-paste-last-transcription hotkey, so both behave identically.
 *
 * readText() throws when the clipboard holds a non-text format (image, files);
 * we accept losing that rather than corrupting the cursor insertion.
 */
export async function pasteTextPreservingClipboard(text: string): Promise<void> {
  const { readText, writeText } = await import(
    "@tauri-apps/plugin-clipboard-manager"
  );

  let previousClipboard: string | null = null;
  try {
    previousClipboard = await readText();
  } catch {}

  await writeText(text);
  await invoke("paste_text_to_active_window", { text });
  await new Promise((r) => setTimeout(r, 200));

  if (previousClipboard !== null) {
    try {
      await writeText(previousClipboard);
    } catch {}
  }
}
