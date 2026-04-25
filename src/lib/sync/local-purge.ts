import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";

const STORES = [
  "sync-snippets.json",
  "sync-dictionary.json",
  "sync-queue.json",
  "sync-meta.json",
] as const;

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
