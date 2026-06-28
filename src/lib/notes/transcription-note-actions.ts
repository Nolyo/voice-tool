/**
 * Orchestration for "transcription → note": create a brand-new note from a
 * transcription, or append a transcription to an existing note.
 *
 * Routes every write through the `*Synced` notes-store wrappers so the change
 * enqueues a cloud upsert when sync is active (and is safely skipped when the
 * note is over the 1 MB cap — see notes-store). The pure HTML construction
 * lives in transcription-to-note.ts and is unit-tested there; this module only
 * wires it to the Tauri-backed store, so it stays intentionally thin.
 */
import type { LocalNoteMeta } from "@/lib/sync/types";
import {
  createNoteSynced,
  readNote,
  updateNoteSynced,
} from "@/lib/sync/notes-store";
import { isNoteSyncable } from "@/lib/sync/note-size";
import { deriveTitle } from "@/hooks/useNotes";
import {
  transcriptionToHtml,
  appendTranscriptionToHtml,
} from "./transcription-to-note";

/**
 * Thrown by {@link appendTranscriptionToNote} when the resulting note would
 * exceed the 1 MB per-note sync hard cap. The note is left untouched; the
 * caller surfaces a localized message.
 */
export class NoteTooLargeError extends Error {
  constructor() {
    super("note would exceed the 1 MB per-note sync cap");
    this.name = "NoteTooLargeError";
  }
}

/**
 * Create a new note seeded with `text`. The title is derived from the first
 * line, matching how titles are computed everywhere else in the app. Returns
 * the persisted note meta.
 */
export async function createNoteFromTranscription(
  text: string,
): Promise<LocalNoteMeta> {
  const html = transcriptionToHtml(text);
  const title = deriveTitle(html);
  const meta = await createNoteSynced(null);
  return updateNoteSynced(meta.id, html, title);
}

/**
 * Append `text` to the note `noteId` as new paragraph(s). The note's title is
 * preserved (appending at the end never changes the first line). Throws
 * {@link NoteTooLargeError} when the append would push the note past the 1 MB
 * sync cap — in that case the note is left unchanged.
 */
export async function appendTranscriptionToNote(
  noteId: string,
  text: string,
): Promise<LocalNoteMeta> {
  const { meta, content } = await readNote(noteId);
  const next = appendTranscriptionToHtml(content, text);
  if (!isNoteSyncable(next)) {
    throw new NoteTooLargeError();
  }
  return updateNoteSynced(noteId, next, meta.title);
}
