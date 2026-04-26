import { Store } from "@tauri-apps/plugin-store";
import type { LocalDictionary } from "./types";
import { createMutex } from "./_mutex";

const STORE_FILE = "sync-dictionary.json";
const KEY_DATA = "dictionary";
const KEY_MIGRATED = "legacy_migrated";

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

export async function loadDictionary(): Promise<LocalDictionary> {
  const store = await getStore();
  const data = await store.get<LocalDictionary>(KEY_DATA);
  if (!data) return { words: [], tombstones: [], updated_at: new Date(0).toISOString() };
  return data;
}

async function saveDictionary(d: LocalDictionary): Promise<void> {
  const store = await getStore();
  await store.set(KEY_DATA, d);
  await store.save();
}

export async function addWord(word: string): Promise<void> {
  return withLock(async () => {
    const w = word.trim();
    if (!w) return;
    const d = await loadDictionary();
    if (d.words.includes(w)) return;
    d.words = [...d.words, w];
    d.tombstones = d.tombstones.filter((t) => t !== w);
    d.updated_at = new Date().toISOString();
    await saveDictionary(d);
  });
}

export async function removeWord(word: string): Promise<void> {
  return withLock(async () => {
    const w = word.trim();
    if (!w) return;
    const d = await loadDictionary();
    const hadIt = d.words.includes(w);
    d.words = d.words.filter((x) => x !== w);
    if (hadIt && !d.tombstones.includes(w)) {
      d.tombstones = [...d.tombstones, w];
    }
    d.updated_at = new Date().toISOString();
    await saveDictionary(d);
  });
}

/** Vide et retourne la liste des tombstones à pousser au cloud. */
export async function drainTombstones(): Promise<string[]> {
  return withLock(async () => {
    const d = await loadDictionary();
    const tombs = d.tombstones;
    d.tombstones = [];
    await saveDictionary(d);
    return tombs;
  });
}

export interface RemoteWordEvent {
  word: string;
  deleted: boolean;
  updated_at: string;
}

export async function applyRemoteWord(ev: RemoteWordEvent): Promise<void> {
  return withLock(async () => {
    const d = await loadDictionary();
    if (ev.deleted) {
      d.words = d.words.filter((w) => w !== ev.word);
      d.tombstones = d.tombstones.filter((w) => w !== ev.word);
    } else {
      if (!d.words.includes(ev.word)) d.words = [...d.words, ev.word];
      d.tombstones = d.tombstones.filter((w) => w !== ev.word);
    }
    await saveDictionary(d);
  });
}

export async function migrateLegacyDictionaryOnce(legacy: string[]): Promise<boolean> {
  return withLock(async () => {
    const store = await getStore();
    const already = await store.get<boolean>(KEY_MIGRATED);
    if (already) return false;
    const d = await loadDictionary();
    const merged = Array.from(new Set([...d.words, ...legacy.map((w) => w.trim()).filter(Boolean)]));
    d.words = merged;
    d.updated_at = new Date().toISOString();
    await saveDictionary(d);
    await store.set(KEY_MIGRATED, true);
    await store.save();
    return true;
  });
}
