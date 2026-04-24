import { Store } from "@tauri-apps/plugin-store";
import type { SyncOperation, SyncQueueEntry } from "./types";

const STORE_FILE = "sync-queue.json";
const KEY_QUEUE = "queue";

let storePromise: Promise<Awaited<ReturnType<typeof Store.load>>> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE);
  }
  return storePromise;
}

export function __resetForTests() {
  storePromise = null;
}

async function loadQueue(): Promise<SyncQueueEntry[]> {
  const store = await getStore();
  const q = await store.get<SyncQueueEntry[]>(KEY_QUEUE);
  return q ?? [];
}

async function saveQueue(q: SyncQueueEntry[]): Promise<void> {
  const store = await getStore();
  await store.set(KEY_QUEUE, q);
  await store.save();
}

export async function enqueue(op: SyncOperation): Promise<SyncQueueEntry> {
  const q = await loadQueue();
  const entry: SyncQueueEntry = {
    id: crypto.randomUUID(),
    operation: op,
    enqueued_at: new Date().toISOString(),
    retry_count: 0,
    last_error: null,
  };
  q.push(entry);
  await saveQueue(q);
  return entry;
}

export async function peekAll(): Promise<SyncQueueEntry[]> {
  return loadQueue();
}

export async function peekHead(): Promise<SyncQueueEntry | null> {
  const q = await loadQueue();
  return q[0] ?? null;
}

export async function dequeue(): Promise<SyncQueueEntry | null> {
  const q = await loadQueue();
  if (q.length === 0) return null;
  const head = q.shift()!;
  await saveQueue(q);
  return head;
}

export async function markRetry(id: string, error: string): Promise<void> {
  const q = await loadQueue();
  const idx = q.findIndex((e) => e.id === id);
  if (idx < 0) return;
  q[idx] = { ...q[idx], retry_count: q[idx].retry_count + 1, last_error: error };
  await saveQueue(q);
}

export async function size(): Promise<number> {
  const q = await loadQueue();
  return q.length;
}

export async function clear(): Promise<void> {
  await saveQueue([]);
}

/** Retourne le délai d'attente avant prochain retry en ms selon retry_count.
 * Backoff : 1s → 5s → 30s → 2min → 5min cap. */
export function backoffMs(retryCount: number): number {
  const table = [1_000, 5_000, 30_000, 120_000, 300_000];
  return table[Math.min(retryCount, table.length - 1)];
}
