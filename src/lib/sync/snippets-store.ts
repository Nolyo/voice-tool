import { Store } from "@tauri-apps/plugin-store";
import type { LocalSnippet } from "./types";
import { createMutex } from "./_mutex";

const STORE_FILE = "sync-snippets.json";
const KEY_SNIPPETS = "snippets";
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

function newUuid(): string {
  return crypto.randomUUID();
}

export async function loadSnippets(): Promise<LocalSnippet[]> {
  const store = await getStore();
  const data = (await store.get<LocalSnippet[]>(KEY_SNIPPETS)) ?? [];
  return data;
}

export async function saveSnippets(list: LocalSnippet[]): Promise<void> {
  return withLock(async () => {
    const store = await getStore();
    await store.set(KEY_SNIPPETS, list);
    await store.save();
  });
}

export interface UpsertSnippetInput {
  id?: string;
  label: string;
  content: string;
  shortcut: string | null;
}

export async function upsertSnippet(input: UpsertSnippetInput): Promise<LocalSnippet> {
  return withLock(async () => {
    const all = await loadSnippets();
    const now = new Date().toISOString();
    const existingIdx = input.id ? all.findIndex((s) => s.id === input.id) : -1;

    let result: LocalSnippet;
    if (existingIdx >= 0) {
      result = {
        ...all[existingIdx],
        label: input.label,
        content: input.content,
        shortcut: input.shortcut,
        updated_at: now,
        deleted_at: null,
      };
      all[existingIdx] = result;
    } else {
      result = {
        id: input.id ?? newUuid(),
        label: input.label,
        content: input.content,
        shortcut: input.shortcut,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      all.push(result);
    }
    const store = await getStore();
    await store.set(KEY_SNIPPETS, all);
    await store.save();
    return result;
  });
}

export async function softDeleteSnippet(id: string): Promise<void> {
  return withLock(async () => {
    const all = await loadSnippets();
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const now = new Date().toISOString();
    all[idx] = { ...all[idx], deleted_at: now, updated_at: now };
    const store = await getStore();
    await store.set(KEY_SNIPPETS, all);
    await store.save();
  });
}

/** Applique un push depuis le cloud (réception d'un snippet merged LWW). */
export async function applyRemoteSnippet(remote: LocalSnippet): Promise<void> {
  return withLock(async () => {
    const all = await loadSnippets();
    const idx = all.findIndex((s) => s.id === remote.id);
    if (idx < 0) {
      all.push(remote);
    } else {
      const localUpdated = new Date(all[idx].updated_at).getTime();
      const remoteUpdated = new Date(remote.updated_at).getTime();
      if (remoteUpdated >= localUpdated) {
        all[idx] = remote;
      }
    }
    const store = await getStore();
    await store.set(KEY_SNIPPETS, all);
    await store.save();
  });
}

/** Import one-shot des snippets legacy `{trigger, replacement}`.
 *  Retourne true si la migration a tourné, false si déjà faite. */
export async function migrateLegacySnippetsOnce(
  legacy: Array<{ trigger: string; replacement: string }>
): Promise<boolean> {
  return withLock(async () => {
    const store = await getStore();
    const already = await store.get<boolean>(KEY_MIGRATED);
    if (already) return false;
    // Inline the upsert logic so we stay inside the same lock scope (avoid recursive lock).
    const all = await loadSnippets();
    for (const { trigger, replacement } of legacy) {
      const now = new Date().toISOString();
      all.push({
        id: newUuid(),
        label: trigger,
        content: replacement,
        shortcut: trigger,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
    }
    await store.set(KEY_SNIPPETS, all);
    await store.set(KEY_MIGRATED, true);
    await store.save();
    return true;
  });
}
