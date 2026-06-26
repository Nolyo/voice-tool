/**
 * Per-note hard cap shared by the whole sync path.
 *
 * Source of truth: the sync-push Edge Function rejects a note whose
 * `content_html` exceeds 1 MB (Zod `max(1_048_576)` on code units) AND the DB
 * enforces `octet_length(content_html) <= 1_048_576` on bytes. Because the Zod
 * check counts UTF-16 code units while the DB counts UTF-8 bytes, the only
 * measure that guarantees BOTH pass is the UTF-8 byte length — so that's what
 * we gate on client-side.
 *
 * Keep this constant aligned with `supabase/functions/sync-push/schema.ts`.
 */
export const NOTE_SIZE_LIMIT_BYTES = 1_048_576;

/** UTF-8 byte length of a note's HTML — matches the DB `octet_length()` check. */
export function noteContentBytes(content: string): number {
  return new TextEncoder().encode(content).length;
}

/**
 * True when a note's content fits the cloud hard cap and can be synced.
 *
 * A note that returns false stays local-only: pushing it would make the WHOLE
 * batch body fail server-side validation (the Edge validates the request body
 * atomically), silently blocking every other op in the same push. Callers must
 * therefore skip oversized notes rather than enqueue/push them.
 */
export function isNoteSyncable(content: string): boolean {
  return noteContentBytes(content) <= NOTE_SIZE_LIMIT_BYTES;
}
