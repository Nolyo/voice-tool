import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";

const STORES = [
  "sync-snippets.json",
  "sync-dictionary.json",
  "sync-queue.json",
  "sync-meta.json",
] as const;

/**
 * Wipes all cloud-derived caches on disk: sync stores (snippets, dictionary,
 * queue, meta) and local backup dumps. Local-only data (transcriptions,
 * recordings, hardware-bound settings) is intentionally preserved.
 *
 * Errors are silently swallowed by design: this is a best-effort cleanup
 * that runs after the authoritative server-side tombstone has been
 * committed. A failed local cleanup must not block the deletion flow.
 */
export async function purgeLocalCloudData(): Promise<void> {
  for (const file of STORES) {
    try {
      const store = await Store.load(file);
      await store.clear();
      await store.save();
    } catch {
      // store may not exist yet — not an error
    }
  }
  await invoke<number>("delete_all_local_backups").catch(() => 0);
}
