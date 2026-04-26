import { dequeueById, markRetry } from "./queue";
import type { SyncQueueEntry } from "./types";

export interface BatchResult {
  index: number;
  ok: boolean;
  error?: string;
}

export async function applyBatchResults(
  batch: SyncQueueEntry[],
  results: BatchResult[]
): Promise<{ failedCount: number }> {
  let failedCount = 0;
  for (let i = 0; i < batch.length; i++) {
    const r = results.find((x) => x.index === i);
    const entry = batch[i];
    if (r?.ok) {
      await dequeueById(entry.id);
    } else {
      await markRetry(entry.id, r?.error ?? "unknown");
      failedCount++;
    }
  }
  return { failedCount };
}
