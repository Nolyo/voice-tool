import type { LocalNoteMeta } from "./types";
import { isNoteSyncable } from "./note-size";

/**
 * Single push-gate predicate for notes — the ONE place that decides whether a
 * note may be enqueued/pushed to the cloud (spec 2026-07-12, PR 3). Consumed
 * by both `notes-store` (per-mutation enqueue) and `SyncContext.fullPush`
 * (initial scan) so the two paths can never disagree.
 *
 * A note is NOT pushed when:
 * - `deletedAt` is set: a tombstoned note must never be re-upserted — the
 *   server upsert forces `deleted_at: null` and would resurrect it cloud-side
 *   after the `note-delete` op (tail race: detached-window flush racing a
 *   delete);
 * - `localOnly` is set: the user explicitly opted this note out of sync;
 * - its content is empty (fresh `create_note` output — the first non-empty
 *   update pushes the initial upsert; sync-push does upserts, so no
 *   create-op dependency);
 * - it exceeds the per-note size cap (see `note-size.ts` — an oversized note
 *   would poison the whole push batch server-side).
 */
export function shouldPushNote(
  meta: Pick<LocalNoteMeta, "localOnly" | "deletedAt">,
  content: string
): boolean {
  if (meta.deletedAt) return false;
  if (meta.localOnly) return false;
  if (content.trim() === "") return false;
  return isNoteSyncable(content);
}
