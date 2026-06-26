import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Tauri core invoke
const storeData: Record<string, unknown> = {};
const invokeMock = vi.fn(async (cmd: string) => {
  if (cmd === "get_active_profile_dictionary_path") return "profiles/default/sync-dictionary.json";
  throw new Error(`unexpected invoke ${cmd}`);
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string) => invokeMock(cmd) }));

// Mock the Tauri store plugin
vi.mock("@tauri-apps/plugin-store", () => {
  return {
    Store: {
      load: async (path: string) => {
        // record the resolved path for assertion
        storeData.__path = path;
        return {
          get: async (k: string) => storeData[k] ?? null,
          set: async (k: string, v: unknown) => {
            storeData[k] = v;
          },
          save: async () => {},
        };
      },
    },
  };
});

import {
  loadDictionary,
  addWord,
  removeWord,
  drainTombstones,
  applyRemoteWord,
  migrateLegacyDictionaryOnce,
  __resetForTests,
} from "./dictionary-store";

describe("dictionary-store", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    invokeMock.mockClear();
    __resetForTests();
  });

  it("loads the per-profile dictionary store path", async () => {
    await loadDictionary();
    expect(invokeMock).toHaveBeenCalledWith("get_active_profile_dictionary_path");
    expect(storeData.__path).toBe("profiles/default/sync-dictionary.json");
  });

  it("starts empty", async () => {
    const d = await loadDictionary();
    expect(d.words).toEqual([]);
    expect(d.tombstones).toEqual([]);
  });

  it("addWord is idempotent", async () => {
    await addWord("tauri");
    await addWord("tauri");
    const d = await loadDictionary();
    expect(d.words).toEqual(["tauri"]);
  });

  it("removeWord moves to tombstones", async () => {
    await addWord("tauri");
    await removeWord("tauri");
    const d = await loadDictionary();
    expect(d.words).toEqual([]);
    expect(d.tombstones).toEqual(["tauri"]);
  });

  it("drainTombstones empties the list", async () => {
    await addWord("a");
    await removeWord("a");
    const t = await drainTombstones();
    expect(t).toEqual(["a"]);
    const d = await loadDictionary();
    expect(d.tombstones).toEqual([]);
  });

  it("applyRemoteWord with deleted_at removes locally + tombstones", async () => {
    await addWord("cloudword");
    await applyRemoteWord({ word: "cloudword", deleted: true, updated_at: new Date().toISOString() });
    const d = await loadDictionary();
    expect(d.words).toEqual([]);
  });

  it("applyRemoteWord with new word adds it", async () => {
    await applyRemoteWord({ word: "fromcloud", deleted: false, updated_at: new Date().toISOString() });
    const d = await loadDictionary();
    expect(d.words).toContain("fromcloud");
  });

  it("migrateLegacyDictionaryOnce imports then is idempotent", async () => {
    const ran1 = await migrateLegacyDictionaryOnce(["tauri", "supabase"]);
    expect(ran1).toBe(true);
    const d = await loadDictionary();
    expect(d.words.sort()).toEqual(["supabase", "tauri"]);
    const ran2 = await migrateLegacyDictionaryOnce(["x"]);
    expect(ran2).toBe(false);
    const d2 = await loadDictionary();
    expect(d2.words).not.toContain("x");
  });

  it("concurrent addWord calls are not lost (mutex)", async () => {
    const words = ["a", "b", "c", "d", "e", "f", "g", "h"];
    await Promise.all(words.map((w) => addWord(w)));
    const d = await loadDictionary();
    expect(d.words.sort()).toEqual([...words].sort());
  });
});
