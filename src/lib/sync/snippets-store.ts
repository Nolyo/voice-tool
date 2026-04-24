import { Store } from "@tauri-apps/plugin-store";
import type { LocalSnippet } from "./types";

const STORE_FILE = "sync-snippets.json";
const KEY_SNIPPETS = "snippets";
const KEY_MIGRATED = "legacy_migrated";

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

function newUuid(): string {
  return crypto.randomUUID();
}

export async function loadSnippets(): Promise<LocalSnippet[]> {
  const store = await getStore();
  const data = (await store.get<LocalSnippet[]>(KEY_SNIPPETS)) ?? [];
  return data;
}

export async function saveSnippets(list: LocalSnippet[]): Promise<void> {
  const store = await getStore();
  await store.set(KEY_SNIPPETS, list);
  await store.save();
}

export interface UpsertSnippetInput {
  id?: string;
  label: string;
  content: string;
  shortcut: string | null;
}

export async function upsertSnippet(input: UpsertSnippetInput): Promise<LocalSnippet> {
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
  await saveSnippets(all);
  return result;
}

export async function softDeleteSnippet(id: string): Promise<void> {
  const all = await loadSnippets();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const now = new Date().toISOString();
  all[idx] = { ...all[idx], deleted_at: now, updated_at: now };
  await saveSnippets(all);
}

/** Applique un push depuis le cloud (réception d'un snippet merged LWW). */
export async function applyRemoteSnippet(remote: LocalSnippet): Promise<void> {
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
  await saveSnippets(all);
}

/** Import one-shot des snippets legacy `{trigger, replacement}`.
 *  Retourne true si la migration a tourné, false si déjà faite. */
export async function migrateLegacySnippetsOnce(
  legacy: Array<{ trigger: string; replacement: string }>
): Promise<boolean> {
  const store = await getStore();
  const already = await store.get<boolean>(KEY_MIGRATED);
  if (already) return false;
  for (const { trigger, replacement } of legacy) {
    await upsertSnippet({ label: trigger, content: replacement, shortcut: trigger });
  }
  await store.set(KEY_MIGRATED, true);
  await store.save();
  return true;
}
