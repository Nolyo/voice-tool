import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Tauri core invoke
const storeData: Record<string, unknown> = {};
const invokeMock = vi.fn(async (cmd: string) => {
  if (cmd === "get_active_profile_snippets_path") return "profiles/default/sync-snippets.json";
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
  loadSnippets,
  upsertSnippet,
  softDeleteSnippet,
  migrateLegacySnippetsOnce,
  __resetForTests,
} from "./snippets-store";

describe("snippets-store", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    invokeMock.mockClear();
    __resetForTests();
  });

  it("loads the per-profile snippets store path", async () => {
    await loadSnippets();
    expect(invokeMock).toHaveBeenCalledWith("get_active_profile_snippets_path");
    expect(storeData.__path).toBe("profiles/default/sync-snippets.json");
  });

  it("starts empty", async () => {
    const all = await loadSnippets();
    expect(all).toEqual([]);
  });

  it("upsert creates then updates", async () => {
    const s1 = await upsertSnippet({ label: "sign", content: "Cordialement", shortcut: "sign" });
    expect(s1.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s1.deleted_at).toBeNull();

    const s1bis = await upsertSnippet({ id: s1.id, label: "sign", content: "Best regards", shortcut: "sign" });
    expect(s1bis.id).toBe(s1.id);
    expect(s1bis.content).toBe("Best regards");
    expect(new Date(s1bis.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(s1.updated_at).getTime());

    const all = await loadSnippets();
    expect(all).toHaveLength(1);
  });

  it("soft-delete sets deleted_at", async () => {
    const s1 = await upsertSnippet({ label: "hi", content: "hello", shortcut: null });
    await softDeleteSnippet(s1.id);
    const all = await loadSnippets();
    expect(all[0].deleted_at).not.toBeNull();
  });

  it("migrateLegacySnippetsOnce imports legacy then is idempotent", async () => {
    const legacy = [
      { trigger: "sign", replacement: "Cordialement" },
      { trigger: "hi", replacement: "hello" },
    ];
    const cleared = await migrateLegacySnippetsOnce(legacy);
    expect(cleared).toBe(true);
    const all = await loadSnippets();
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.label === "sign")?.content).toBe("Cordialement");

    // Second call: noop
    const cleared2 = await migrateLegacySnippetsOnce(legacy);
    expect(cleared2).toBe(false);
    const all2 = await loadSnippets();
    expect(all2).toHaveLength(2);
  });
});
