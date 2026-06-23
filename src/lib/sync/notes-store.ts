import { invoke } from "@tauri-apps/api/core";
import type { CloudUserNoteRow, LocalNoteMeta } from "./types";
import { mapNoteToCloud } from "./mapping";
import { mergeNoteLWW } from "./merge";
import { enqueue } from "./queue";
import { isSyncActive } from "./sync-gate";

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

export async function listNotes(): Promise<LocalNoteMeta[]> {
  return invoke<LocalNoteMeta[]>("list_notes");
}

export async function readNote(
  id: string
): Promise<{ meta: LocalNoteMeta; content: string }> {
  return invoke<{ meta: LocalNoteMeta; content: string }>("read_note", { id });
}

export async function createNoteSynced(
  folderId: string | null
): Promise<LocalNoteMeta> {
  const meta = await invoke<LocalNoteMeta>("create_note", { folderId });
  try {
    if (isSyncActive()) {
      // A newly-created note has empty content.
      await enqueue({ kind: "note-upsert", note: mapNoteToCloud(meta, "") });
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for create", e);
  }
  return meta;
}

export async function updateNoteSynced(
  id: string,
  content: string,
  title: string
): Promise<LocalNoteMeta> {
  const meta = await invoke<LocalNoteMeta>("update_note", { id, content, title });
  try {
    if (isSyncActive()) {
      await enqueue({ kind: "note-upsert", note: mapNoteToCloud(meta, content) });
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for update", e);
  }
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
  try {
    if (isSyncActive()) {
      await enqueue({ kind: "note-upsert", note: mapNoteToCloud(meta, content) });
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for debounced update", e);
  }
}

// ── Debounce registry for updateNote (Task 17) ───────────────────────────────
// Lives in this module (not useNotes) so it's importable from SyncContext to
// flush on disable/logout (Task 19) without a hook → context circular dep.

const updateNoteDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();

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
      await enqueue({ kind: "note-upsert", note: mapNoteToCloud(meta, content) });
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for toggle-favorite", e);
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
      await enqueue({ kind: "note-upsert", note: mapNoteToCloud(meta, content) });
    }
  } catch (e) {
    console.warn("[notes-store] enqueue failed for move-to-folder", e);
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
}
