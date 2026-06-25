// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContext } from "react";
import { DEFAULT_SETTINGS } from "@/lib/settings";

// ── Hoisted spies / shared state (vi.mock factories are hoisted) ─────────────
const h = vi.hoisted(() => ({
  storeData: {} as Record<string, unknown>,
  pullAllSpy: vi.fn(),
  pushSpy: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) => {
    if (cmd === "get_active_profile_sync_meta_path") return "meta.json";
    if (cmd === "get_or_create_device_id") return "device-B";
    return undefined;
  },
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: async () => ({
      get: async (k: string) => h.storeData[k] ?? null,
      set: async (k: string, v: unknown) => {
        h.storeData[k] = v;
      },
      save: async () => {},
    }),
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onFocusChanged: async () => () => {} }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ status: "signed-in" }),
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: DEFAULT_SETTINGS.settings,
    updateSettings: vi.fn(async () => {}),
    subscribeToChanges: () => () => {},
  }),
}));

vi.mock("@/lib/flog", () => ({ flog: () => {} }));

vi.mock("@/lib/sync/client", () => ({
  pullAll: (...a: unknown[]) => h.pullAllSpy(...a),
  pushOperations: (...a: unknown[]) => h.pushSpy(...a),
}));

// Queue: empty / inert.
vi.mock("@/lib/sync/queue", () => ({
  enqueue: async () => {},
  peekAll: async () => [],
  peekReadyHead: async () => null,
  markRetry: async () => {},
  moveToDeadLetter: async () => {},
  getDeadLetters: async () => [],
  MAX_RETRIES_BEFORE_DLQ: 5,
  size: async () => 0,
}));

vi.mock("@/lib/sync/apply-batch-results", () => ({
  applyBatchResults: async () => ({ failedCount: 0 }),
}));

vi.mock("@/lib/sync/snippets-store", () => ({
  loadSnippets: async () => [],
  applyRemoteSnippet: async () => {},
  migrateLegacySnippetsOnce: async () => {},
}));

vi.mock("@/lib/sync/notes-store", () => ({
  applyRemoteNote: async () => {},
  flushPendingNoteUpdates: async () => {},
  listNotes: async () => [],
  readNote: async () => ({ meta: {}, content: "" }),
}));

vi.mock("@/lib/sync/folders-store", () => ({
  applyRemoteFolder: async () => {},
  listFolders: async () => [],
}));

vi.mock("@/lib/sync/dictionary-store", () => ({
  loadDictionary: async () => ({ words: [] }),
  applyRemoteWord: async () => {},
  migrateLegacyDictionaryOnce: async () => {},
}));

import { SyncContext, SyncProvider } from "./SyncContext";

const EMPTY_PULL = {
  settings: null,
  dictionary: [],
  snippets: [],
  notes: [],
  folders: [],
  invalid: { settings: false, dictionary: 0, snippets: 0, notes: 0, folders: 0 },
};

beforeEach(() => {
  Object.keys(h.storeData).forEach((k) => delete h.storeData[k]);
  h.pullAllSpy.mockReset().mockResolvedValue(EMPTY_PULL);
  h.pushSpy.mockReset().mockResolvedValue({ ok: true, results: [], server_time: "2026-06-25T00:00:00Z" });
});

describe("SyncContext — activation forces a full reconcile", () => {
  it("enableSync pulls with since=null even when a stale cursor is stored", async () => {
    // Simulate a device that synced before: a residual incremental cursor.
    h.storeData["enabled"] = false;
    h.storeData["last_pull_at"] = "2020-01-01T00:00:00Z";

    const { result } = renderHook(() => useContext(SyncContext), {
      wrapper: SyncProvider,
    });

    await act(async () => {
      await result.current!.enableSync();
    });

    // Activation MUST pull with since=null (full reconcile). A stale cursor
    // would otherwise make it incremental and miss the older notes.
    expect(h.pullAllSpy).toHaveBeenCalled();
    const sinceArgs = h.pullAllSpy.mock.calls.map((c) => c[0]);
    expect(sinceArgs).toContain(null);
    expect(sinceArgs).not.toContain("2020-01-01T00:00:00Z");
  });

  it("disableSync clears the stored pull cursor", async () => {
    // Mount disabled (stable, no activation pull) — disableSync clears the
    // cursor unconditionally so a later re-enable always full-reconciles.
    h.storeData["enabled"] = false;
    h.storeData["last_pull_at"] = "2026-06-01T00:00:00Z";

    const { result } = renderHook(() => useContext(SyncContext), {
      wrapper: SyncProvider,
    });

    await act(async () => {
      await result.current!.disableSync();
    });

    expect(h.storeData["last_pull_at"]).toBeNull();
  });
});
