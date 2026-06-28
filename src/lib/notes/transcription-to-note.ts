/**
 * Pure helpers that turn a plain-text transcription into note HTML.
 *
 * Notes are stored as TipTap-compatible HTML (`content_html`), while a
 * transcription is plain text (often a single line). These helpers wrap the
 * text into paragraph markup and escape every HTML-significant character so a
 * dictated string can never inject markup into a note.
 *
 * Deliberately free of React / Tauri imports so the conversion logic stays
 * unit-testable in isolation (see transcription-to-note.test.ts). The Tauri-
 * backed orchestration (create / append against the notes store) lives in
 * transcription-note-actions.ts.
 */

/** Escape the three HTML-significant characters for safe embedding in note HTML. */
export function escapeNoteHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert a plain transcription into paragraph HTML: each non-empty line
 * becomes its own `<p>`, blank lines are dropped, and each line is trimmed.
 * An empty / whitespace-only input yields a single empty paragraph so the
 * resulting note is never malformed.
 */
export function transcriptionToHtml(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "<p></p>";
  return lines.map((line) => `<p>${escapeNoteHtml(line)}</p>`).join("");
}

/**
 * Append a transcription to an existing note's HTML as new paragraph(s).
 * When the note is empty (or whitespace only), returns just the transcription
 * markup so the note never starts with a stray empty paragraph.
 */
export function appendTranscriptionToHtml(existing: string, text: string): string {
  const addition = transcriptionToHtml(text);
  const base = (existing ?? "").trim();
  return base.length > 0 ? `${base}${addition}` : addition;
}
