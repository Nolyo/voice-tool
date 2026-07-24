import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { CloudUserNoteRow, LocalNoteMeta } from "./types";
import { mapNoteToCloud } from "./mapping";
import { mergeNoteLWW } from "./merge";
import { enqueue } from "./queue";
import { isSyncActive } from "./sync-gate";
import { isNoteSyncable } from "./note-size";
import { shouldPushNote } from "./note-push-gate";

/**
 * Notes store wrapper — sub-épique 03 sync-notes.
 *
 * Notes are stored on disk by Rust (`profiles/<id>/notes/<note-id>/{note.json,content.html}`)
 * so this module is NOT backed by a Tauri Store like `snippets-store`. Instead it wraps
 * the Tauri commands defined in `src-tauri/src/notes.rs`:
 *   - read helpers passthrough → `list_notes`, `read_note`
 *   - `*Synced` mutators → invoke the matching command then enqueue a sync op
 *   - `applyRemoteNote` → LWW merge + `import_note_for_backup`
 *
 * Convention note: `snippets-store` does NOT enqueue (SyncContext does it via
 * `notifySnippetUpserted` / `notifySnippetDeleted`). The Task 16 plan explicitly
 * asks for inline enqueue inside these wrappers because the call sites (Notes UI)
 * are far more numerous than for snippets, so consolidating local write + queue
 * push at the store layer avoids leaking sync concerns into every component.
 *
 * Enqueue failures must NEVER propagate: the local write is the source of truth,
 * sync is best-effort. We log and swallow.
 */

/**
 * Enqueue a note-upsert, but ONLY when the push gate allows it (shouldPushNote: not local-only, not empty, within the cloud size cap).
 *
 * An oversized note (> 3 MB UTF-8) cannot be synced: the Edge validates the
 * whole push body atomically, so a single oversized note makes the entire batch
 * fail server-side ("invalid body"), silently blocking every other op. We must
 * never let one into the queue — it stays local-only. The editor surfaces a
 * `NoteSizeWarning`; here we just skip and warn. Returns true when enqueued.
 *
 * NEVER throws — queue failures are swallowed (local write is the truth).
 */
async function enqueueNoteUpsertIfSyncable(
  meta: LocalNoteMeta,
  content: string,
  context: string
): Promise<boolean> {
  try {
    if (!isSyncActive()) return false;
    if (!shouldPushNote(meta, content)) {
      console.warn(
        `[notes-store] note ${meta.id} skipped (local-only, empty, or over size cap) on ${context}`
      );
      return false;
    }
    await enqueue({ kind: "note-upsert", note: mapNoteToCloud(meta, content) });
    return true;
  } catch (e) {
    console.warn(`[notes-store] enqueue failed for ${context}`, e);
    return false;
  }
}

export async function listNotes(): Promise<LocalNoteMeta[]> {
  return invoke<LocalNoteMeta[]>("list_notes");
}

/**
 * Count the active notes whose content exceeds the cloud hard cap. Used by
 * SyncContext to surface "N note(s) too large to sync" in the UI. Reads every
 * note's content, so call sparingly (activation + once per session on mount).
 */
export async function scanOversizedNoteCount(): Promise<number> {
  const metas = await invoke<LocalNoteMeta[]>("list_notes");
  let count = 0;
  for (const m of metas) {
    if (m.deletedAt) continue;
    if (m.localOnly) continue; // local-only notes are not sync candidates
    try {
      const { content } = await readNote(m.id);
      if (!isNoteSyncable(content)) count++;
    } catch {
      // Unreadable note — ignore for the count.
    }
  }
  return count;
}

export async function readNote(
  id: string
): Promise<{ meta: LocalNoteMeta; content: string }> {
  return invoke<{ meta: LocalNoteMeta; content: string }>("read_note", { id });
}

export async function createNoteSynced(
  folderId: string | null
): Promise<LocalNoteMeta> {
  // A newly-created note has empty content, and empty notes are never pushed
  // (shouldPushNote): the first non-empty update enqueues the initial upsert.
  // sync-push does upserts, so nothing depends on a create-time op.
  return invoke<LocalNoteMeta>("create_note", { folderId });
}

export async function updateNoteSynced(
  id: string,
  content: string,
  title: string
): Promise<LocalNoteMeta> {
  const meta = await invoke<LocalNoteMeta>("update_note", { id, content, title });
  await enqueueNoteUpsertIfSyncable(meta, content, "update");
  return meta;
}

export async function deleteNoteSynced(id: string): Promise<void> {
  await invoke<void>("delete_note", { id });
  try {
    if (isSyncActive()) {
      await enqueue({ kind: "note-delete", id });
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for delete", e);
  }
}

/**
 * Enqueue-only push for the debounced `updateNote` path. The caller has already
 * written to disk (via `invoke("update_note", ...)`) and only wants to ship the
 * final coalesced state to the cloud after the debounce window settles.
 *
 * Used by `useNotes.updateNote` to coalesce rapid keystrokes into a single push.
 * NEVER throws — queue failures are swallowed.
 */
export async function pushNoteUpdate(
  meta: LocalNoteMeta,
  content: string
): Promise<void> {
  await enqueueNoteUpsertIfSyncable(meta, content, "debounced update");
}

// ── Debounce registry for updateNote (Task 17) ───────────────────────────────
// Lives in this module (not useNotes) so it's importable from SyncContext to
// flush on disable/logout (Task 19) without a hook → context circular dep.

const updateNoteDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce window for the disk → cloud push of a note update. Shared by the
 *  docked editor (useNotes.updateNote) and the detached-window bridge. */
export const UPDATE_NOTE_PUSH_DEBOUNCE_MS = 2_000;

/**
 * Like `scheduleNoteUpdatePush`, but reads meta + content from disk when the
 * debounce fires instead of capturing them at schedule time. Used by the main
 * window when a DETACHED window saved a note: the detached window wrote the
 * disk, the main window owns the sync queue (spec §5) and only knows the id.
 * Shares `updateNoteDebounceMap`, so cancel/flush keep working.
 */
export function scheduleNoteUpdatePushFromDisk(id: string, delayMs: number): void {
  const existing = updateNoteDebounceMap.get(id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    updateNoteDebounceMap.delete(id);
    void (async () => {
      try {
        const { meta, content } = await invoke<{
          meta: LocalNoteMeta;
          content: string;
        }>("read_note", { id });
        await pushNoteUpdate(meta, content);
      } catch (e) {
        console.warn("[notes-store] push-from-disk failed for note", id, e);
      }
    })();
  }, delayMs);
  updateNoteDebounceMap.set(id, timer);
}

/** Register / replace a debounced push for the given note id. */
export function scheduleNoteUpdatePush(
  id: string,
  meta: LocalNoteMeta,
  content: string,
  delayMs: number
): void {
  const existing = updateNoteDebounceMap.get(id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    void pushNoteUpdate(meta, content);
    updateNoteDebounceMap.delete(id);
  }, delayMs);
  updateNoteDebounceMap.set(id, timer);
}

/** Cancel the pending debounced push for this note (used by deleteNote). */
export function cancelNoteUpdatePush(id: string): void {
  const existing = updateNoteDebounceMap.get(id);
  if (existing) {
    clearTimeout(existing);
    updateNoteDebounceMap.delete(id);
  }
}

/**
 * Flush ALL pending debounced note pushes immediately. Called from SyncContext
 * on disableSync / signed-out so in-flight keystrokes survive logout.
 * Reads the freshest meta + content from disk for each pending id.
 */
export async function flushPendingNoteUpdates(): Promise<void> {
  const pending = Array.from(updateNoteDebounceMap.entries());
  updateNoteDebounceMap.clear();
  for (const [, timer] of pending) clearTimeout(timer);
  for (const [id] of pending) {
    try {
      const { meta, content } = await invoke<{ meta: LocalNoteMeta; content: string }>(
        "read_note",
        { id }
      );
      await pushNoteUpdate(meta, content);
    } catch (e) {
      console.warn("[notes-store] flush failed for note", id, e);
    }
  }
}

export async function toggleNoteFavoriteSynced(
  id: string
): Promise<LocalNoteMeta> {
  const meta = await invoke<LocalNoteMeta>("toggle_note_favorite", { id });
  try {
    if (isSyncActive()) {
      // Re-read content so the cloud row stays consistent. The favorite flag lives
      // on the meta payload, but the server upsert overwrites the whole row, so we
      // ship the latest content too.
      const { content } = await invoke<{ meta: LocalNoteMeta; content: string }>(
        "read_note",
        { id }
      );
      await enqueueNoteUpsertIfSyncable(meta, content, "toggle-favorite");
    }
  } catch (e) {
    console.warn("[notes-store] read failed for toggle-favorite", e);
  }
  return meta;
}

export async function moveNoteToFolderSynced(
  noteId: string,
  folderId: string | null
): Promise<LocalNoteMeta> {
  const meta = await invoke<LocalNoteMeta>("move_note_to_folder", {
    noteId,
    folderId,
  });
  try {
    if (isSyncActive()) {
      const { content } = await invoke<{ meta: LocalNoteMeta; content: string }>(
        "read_note",
        { id: noteId }
      );
      await enqueueNoteUpsertIfSyncable(meta, content, "move-to-folder");
    }
  } catch (e) {
    console.warn("[notes-store] read failed for move-to-folder", e);
  }
  return meta;
}

/**
 * Toggle the per-note "local only" flag and reconcile the cloud state.
 *
 * - synced → local (`localOnly: true`): the note must disappear from the
 *   cloud (and from other devices at their next pull), so we enqueue a
 *   `note-delete` tombstone. The local copy stays intact — `applyRemoteNote`
 *   ignores cloud rows for local-only notes, so the tombstone can never
 *   destroy this device's copy. Any pending debounced upsert is cancelled
 *   FIRST: it would otherwise fire after the delete and resurrect the note.
 * - local → synced (`localOnly: false`): re-push the full note (sync-push
 *   upserts force `deleted_at: null` server-side, clearing the tombstone).
 *
 * Enqueue failures are swallowed (local write is the source of truth).
 */
export async function setNoteLocalOnlySynced(
  id: string,
  localOnly: boolean
): Promise<LocalNoteMeta> {
  const meta = await invoke<LocalNoteMeta>("set_note_local_only", {
    id,
    localOnly,
  });
  try {
    if (isSyncActive()) {
      if (localOnly) {
        cancelNoteUpdatePush(id);
        await enqueue({ kind: "note-delete", id });
      } else {
        const { content } = await readNote(id);
        await enqueueNoteUpsertIfSyncable(meta, content, "make-synced");
      }
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for set-local-only", e);
  }
  return meta;
}

/**
 * Applies a remote note row to the local filesystem after LWW merge.
 *
 * Reads the local note (if any), runs `mergeNoteLWW`, and writes via
 * `import_note_for_backup` only when remote wins. When local wins,
 * `mergeNoteLWW` returns the same `meta` reference as the local input — we
 * detect that via `===` and short-circuit to avoid a redundant disk write.
 *
 * Tombstone guard: if the note doesn't exist locally AND the remote row is a
 * tombstone (`deleted_at !== null`), this is a no-op. Without the guard we'd
 * materialize an empty tombstoned note dir on disk just for the post-pull
 * purge step to immediately delete it — pure churn. Task 18.
 */
export async function applyRemoteNote(row: CloudUserNoteRow): Promise<void> {
  let local: { meta: LocalNoteMeta; content: string } | null = null;
  try {
    local = await invoke<{ meta: LocalNoteMeta; content: string }>("read_note", {
      id: row.id,
    });
  } catch {
    // Note not found locally — fine, will adopt remote.
    local = null;
  }
  if (local?.meta.localOnly) {
    // A local-only note ignores its cloud counterpart entirely. In particular,
    // the tombstone created by the synced → local toggle comes back on this
    // device's next pull with a fresh server-stamped updated_at — it would win
    // LWW and soft-delete the local copy without this guard.
    return;
  }
  if (!local && row.deleted_at !== null) {
    // Nothing to delete locally — server tombstone for a note we never had.
    return;
  }
  const merged = mergeNoteLWW(local?.meta ?? null, local?.content ?? null, row);
  if (local && merged.meta === local.meta) {
    // Local won — skip disk write.
    return;
  }
  await invoke<void>("import_note_for_backup", {
    meta: merged.meta,
    content: merged.content,
  });

  // Tell open editors (detached note windows today, docked editor in a
  // follow-up) that this note changed on disk behind their back.
  try {
    await emit("note-remote-updated", {
      id: merged.meta.id,
      updatedAt: merged.meta.updatedAt,
    });
  } catch (e) {
    console.warn("[notes-store] emit note-remote-updated failed", e);
  }
}
