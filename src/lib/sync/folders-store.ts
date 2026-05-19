import { invoke } from "@tauri-apps/api/core";
import type { CloudUserFolderRow, LocalFolderMeta } from "./types";
import { mapFolderToCloud } from "./mapping";
import { mergeFolderLWW } from "./merge";
import { enqueue } from "./queue";

/**
 * Folders store wrapper — sub-épique 03 sync-notes.
 *
 * Folders are persisted as a single `folders.json` managed by Rust
 * (`src-tauri/src/folders.rs`). This module wraps those Tauri commands and
 * enqueues sync ops on mutation, mirroring `notes-store`.
 *
 * `applyRemoteFolder` round-trips through `list_folders` + `import_folders_for_backup`
 * because the Rust command replaces the whole list. At v3.0 scale (typical
 * cardinality <100), this read-merge-write-all approach is acceptable; a
 * per-folder upsert can be added later if perf becomes an issue.
 */

export async function listFolders(): Promise<LocalFolderMeta[]> {
  return invoke<LocalFolderMeta[]>("list_folders");
}

export async function createFolderSynced(name: string): Promise<LocalFolderMeta> {
  const folder = await invoke<LocalFolderMeta>("create_folder", { name });
  try {
    await enqueue({ kind: "folder-upsert", folder: mapFolderToCloud(folder) });
  } catch (e) {
    console.warn("[folders-store] enqueue failed for create", e);
  }
  return folder;
}

export async function renameFolderSynced(
  id: string,
  name: string
): Promise<LocalFolderMeta> {
  const folder = await invoke<LocalFolderMeta>("rename_folder", { id, name });
  try {
    await enqueue({ kind: "folder-upsert", folder: mapFolderToCloud(folder) });
  } catch (e) {
    console.warn("[folders-store] enqueue failed for rename", e);
  }
  return folder;
}

export async function deleteFolderSynced(id: string): Promise<void> {
  await invoke<void>("delete_folder", { id });
  try {
    await enqueue({ kind: "folder-delete", id });
  } catch (e) {
    console.warn("[folders-store] enqueue failed for delete", e);
  }
}

/**
 * Applies a remote folder row after LWW merge.
 *
 * Reads the full local folder list, runs `mergeFolderLWW` on the matching id
 * (or null if absent), and only re-writes the list when the merge produced a
 * different reference than the local one. Append on first-seen, replace
 * in-place on update.
 *
 * Tombstone guard: if the folder is absent locally AND the remote row is a
 * tombstone (`deleted_at !== null`), this is a no-op. Mirrors the same
 * optimization in `applyRemoteNote`. Task 18.
 */
export async function applyRemoteFolder(row: CloudUserFolderRow): Promise<void> {
  const allLocal = await invoke<LocalFolderMeta[]>("list_folders");
  const local = allLocal.find((f) => f.id === row.id) ?? null;
  if (!local && row.deleted_at !== null) {
    // Nothing to delete locally — server tombstone for a folder we never had.
    return;
  }
  const merged = mergeFolderLWW(local, row);
  if (local && merged === local) {
    // Local won — skip disk write.
    return;
  }
  const next = local
    ? allLocal.map((f) => (f.id === row.id ? merged : f))
    : [...allLocal, merged];
  await invoke<void>("import_folders_for_backup", { folders: next });
}
