import { describe, it, expect, beforeEach, vi } from "vitest";

const storeData: Record<string, unknown> = {};
vi.mock("@tauri-apps/plugin-store", () => {
  return {
    Store: {
      load: async () => ({
        get: async (k: string) => storeData[k] ?? null,
        set: async (k: string, v: unknown) => {
          storeData[k] = v;
        },
        save: async () => {},
      }),
    },
  };
});

import {
  enqueue,
  peekAll,
  dequeue,
  dequeueById,
  markRetry,
  size,
  clear,
  peekReadyHead,
  moveToDeadLetter,
  getDeadLetters,
  removeDeadLetter,
  MAX_RETRIES_BEFORE_DLQ,
  __resetForTests,
} from "./queue";
import type { SyncOperation } from "./types";

const OP: SyncOperation = { kind: "dictionary-upsert", word: "hello" };

describe("sync queue", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    __resetForTests();
  });

  it("starts empty", async () => {
    expect(await size()).toBe(0);
  });

  it("enqueue adds entries FIFO", async () => {
    await enqueue(OP);
    await enqueue({ kind: "dictionary-delete", word: "bye" });
    const all = await peekAll();
    expect(all).toHaveLength(2);
    expect(all[0].operation.kind).toBe("dictionary-upsert");
    expect(all[1].operation.kind).toBe("dictionary-delete");
  });

  it("dequeue removes head FIFO", async () => {
    await enqueue(OP);
    await enqueue({ kind: "dictionary-delete", word: "bye" });
    const first = await dequeue();
    expect(first?.operation.kind).toBe("dictionary-upsert");
    expect(await size()).toBe(1);
  });

  it("markRetry increments retry_count and stores error", async () => {
    await enqueue(OP);
    const all = await peekAll();
    await markRetry(all[0].id, "network timeout");
    const after = await peekAll();
    expect(after[0].retry_count).toBe(1);
    expect(after[0].last_error).toBe("network timeout");
  });

  it("clear empties queue", async () => {
    await enqueue(OP);
    await clear();
    expect(await size()).toBe(0);
  });
});

describe("dequeueById", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    __resetForTests();
  });

  it("retire uniquement l'entrée matchant l'id, préserve l'ordre des autres", async () => {
    const e1 = await enqueue({ kind: "dictionary-upsert", word: "alpha" });
    const e2 = await enqueue({ kind: "dictionary-upsert", word: "beta" });
    const e3 = await enqueue({ kind: "dictionary-upsert", word: "gamma" });

    const removed = await dequeueById(e2.id);
    expect(removed?.id).toBe(e2.id);

    const remaining = await peekAll();
    expect(remaining.map((e) => e.id)).toEqual([e1.id, e3.id]);
  });

  it("retourne null si l'id n'existe plus", async () => {
    const removed = await dequeueById("non-existent");
    expect(removed).toBeNull();
  });
});

describe("backoff respect", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    __resetForTests();
  });

  it("peekReadyHead retourne null si la head a un next_retry_at futur", async () => {
    const e = await enqueue({ kind: "dictionary-upsert", word: "x" });
    await markRetry(e.id, "boom"); // next_retry_at = now + 1s
    const ready = await peekReadyHead();
    expect(ready).toBeNull();
  });

  it("peekReadyHead retourne la head si next_retry_at est passé", async () => {
    const e = await enqueue({ kind: "dictionary-upsert", word: "x" });
    await markRetry(e.id, "boom");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 60_000));
    const ready = await peekReadyHead();
    expect(ready?.id).toBe(e.id);
    vi.useRealTimers();
  });

  it("peekReadyHead retourne la head si next_retry_at est null (jamais retry)", async () => {
    const e = await enqueue({ kind: "dictionary-upsert", word: "x" });
    const ready = await peekReadyHead();
    expect(ready?.id).toBe(e.id);
  });
});

describe("dead letter queue", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    __resetForTests();
  });

  it("moveToDeadLetter retire de la queue et ajoute au DLQ", async () => {
    const e = await enqueue({ kind: "snippet-delete", id: "snip-1" });
    await moveToDeadLetter(e.id, "permanent failure");
    expect((await peekAll()).length).toBe(0);
    const dlq = await getDeadLetters();
    expect(dlq.length).toBe(1);
    expect(dlq[0].id).toBe(e.id);
    expect(dlq[0].last_error).toBe("permanent failure");
  });

  it("removeDeadLetter retire l'entrée du DLQ", async () => {
    const e = await enqueue({ kind: "snippet-delete", id: "snip-1" });
    await moveToDeadLetter(e.id, "boom");
    expect((await getDeadLetters()).length).toBe(1);
    await removeDeadLetter(e.id);
    expect((await getDeadLetters()).length).toBe(0);
  });

  it("MAX_RETRIES_BEFORE_DLQ est exporté", () => {
    expect(typeof MAX_RETRIES_BEFORE_DLQ).toBe("number");
    expect(MAX_RETRIES_BEFORE_DLQ).toBeGreaterThan(0);
  });
});

describe("markRetry sets next_retry_at", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    __resetForTests();
  });

  it("populate next_retry_at avec le backoff après markRetry", async () => {
    const e = await enqueue({ kind: "dictionary-upsert", word: "x" });
    const before = Date.now();
    await markRetry(e.id, "boom");
    const all = await peekAll();
    expect(all[0].next_retry_at).not.toBeNull();
    const next = new Date(all[0].next_retry_at as string).getTime();
    expect(next).toBeGreaterThanOrEqual(before);
  });
});
