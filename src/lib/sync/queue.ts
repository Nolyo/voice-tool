import { Store } from "@tauri-apps/plugin-store";
import type { SyncOperation, SyncQueueEntry } from "./types";
import { createMutex } from "./_mutex";

const STORE_FILE = "sync-queue.json";
const KEY_QUEUE = "queue";
const KEY_DLQ = "dead-letters";

export const MAX_RETRIES_BEFORE_DLQ = 5;

let storePromise: Promise<Awaited<ReturnType<typeof Store.load>>> | null = null;
const withLock = createMutex();

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
  return withLock(async () => {
    const q = await loadQueue();
    const entry: SyncQueueEntry = {
      id: crypto.randomUUID(),
      operation: op,
      enqueued_at: new Date().toISOString(),
      retry_count: 0,
      last_error: null,
      next_retry_at: null,
    };
    q.push(entry);
    await saveQueue(q);
    return entry;
  });
}

export async function peekAll(): Promise<SyncQueueEntry[]> {
  return loadQueue();
}

export async function peekHead(): Promise<SyncQueueEntry | null> {
  const q = await loadQueue();
  return q[0] ?? null;
}

export async function peekReadyHead(): Promise<SyncQueueEntry | null> {
  const q = await loadQueue();
  const head = q[0];
  if (!head) return null;
  if (head.next_retry_at && new Date(head.next_retry_at).getTime() > Date.now()) {
    return null;
  }
  return head;
}

export async function dequeue(): Promise<SyncQueueEntry | null> {
  return withLock(async () => {
    const q = await loadQueue();
    if (q.length === 0) return null;
    const head = q.shift()!;
    await saveQueue(q);
    return head;
  });
}

export async function dequeueById(id: string): Promise<SyncQueueEntry | null> {
  return withLock(async () => {
    const q = await loadQueue();
    const idx = q.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const [removed] = q.splice(idx, 1);
    await saveQueue(q);
    return removed;
  });
}

export async function markRetry(id: string, error: string): Promise<void> {
  return withLock(async () => {
    const q = await loadQueue();
    const idx = q.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const newCount = q[idx].retry_count + 1;
    const next = new Date(Date.now() + backoffMs(newCount - 1)).toISOString();
    q[idx] = {
      ...q[idx],
      retry_count: newCount,
      last_error: error,
      next_retry_at: next,
    };
    await saveQueue(q);
  });
}

export async function size(): Promise<number> {
  const q = await loadQueue();
  return q.length;
}

export async function clear(): Promise<void> {
  return withLock(async () => {
    await saveQueue([]);
  });
}

/** Retourne le délai d'attente avant prochain retry en ms selon retry_count.
 * Backoff : 1s → 5s → 30s → 2min → 5min cap. */
export function backoffMs(retryCount: number): number {
  const table = [1_000, 5_000, 30_000, 120_000, 300_000];
  return table[Math.min(retryCount, table.length - 1)];
}

// === Dead-Letter Queue ===

async function loadDlq(): Promise<SyncQueueEntry[]> {
  const store = await getStore();
  const d = await store.get<SyncQueueEntry[]>(KEY_DLQ);
  return d ?? [];
}

async function saveDlq(d: SyncQueueEntry[]): Promise<void> {
  const store = await getStore();
  await store.set(KEY_DLQ, d);
  await store.save();
}

export async function moveToDeadLetter(id: string, error: string): Promise<void> {
  return withLock(async () => {
    const q = await loadQueue();
    const idx = q.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const [entry] = q.splice(idx, 1);
    const dlq = await loadDlq();
    dlq.push({ ...entry, last_error: error });
    await saveQueue(q);
    await saveDlq(dlq);
  });
}

export async function getDeadLetters(): Promise<SyncQueueEntry[]> {
  return loadDlq();
}

export async function removeDeadLetter(id: string): Promise<void> {
  return withLock(async () => {
    const dlq = await loadDlq();
    await saveDlq(dlq.filter((e) => e.id !== id));
  });
}
