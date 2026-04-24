import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";

export interface BackupMeta {
  filename: string;
  created_at: string;
  size_bytes: number;
}

export interface BackupPayload {
  version: 1;
  created_at: string;
  tauri_stores: Record<string, unknown>;
}

const STORES_TO_SNAPSHOT = [
  "settings.json",
  "sync-snippets.json",
  "sync-dictionary.json",
];

/** Capture les Tauri Stores listés + sérialise en JSON pour écriture locale. */
async function snapshotStores(): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  for (const file of STORES_TO_SNAPSHOT) {
    try {
      const s = await Store.load(file);
      const entries = await s.entries();
      snapshot[file] = Object.fromEntries(entries);
    } catch (e) {
      console.warn(`[backup] cannot snapshot ${file}:`, e);
      snapshot[file] = null;
    }
  }
  return snapshot;
}

/** Crée un backup local. Retourne le filename (ex. `pre-sync_2026-04-24_143012.json`). */
export async function createLocalBackup(): Promise<string> {
  const payload: BackupPayload = {
    version: 1,
    created_at: new Date().toISOString(),
    tauri_stores: await snapshotStores(),
  };
  return invoke<string>("write_local_backup", { payloadJson: JSON.stringify(payload) });
}

export async function listLocalBackups(): Promise<BackupMeta[]> {
  return invoke<BackupMeta[]>("list_local_backups");
}

export async function readLocalBackup(filename: string): Promise<BackupPayload> {
  const raw = await invoke<string>("read_local_backup", { filename });
  return JSON.parse(raw) as BackupPayload;
}

export async function deleteLocalBackup(filename: string): Promise<void> {
  await invoke("delete_local_backup", { filename });
}

/** Restaure : écrase chaque Tauri Store par la version du backup. */
export async function restoreLocalBackup(filename: string): Promise<void> {
  const payload = await readLocalBackup(filename);
  for (const [file, content] of Object.entries(payload.tauri_stores)) {
    if (!content || typeof content !== "object") continue;
    const store = await Store.load(file);
    // Clear + rewrite atomic best-effort
    const currentKeys = await store.keys();
    for (const k of currentKeys) {
      await store.delete(k);
    }
    for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
      await store.set(k, v);
    }
    await store.save();
  }
}
