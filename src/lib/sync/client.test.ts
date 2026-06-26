import { describe, it, expect, beforeEach, vi } from "vitest";

// The client imports @/lib/supabase which imports @tauri-apps/*; mock the whole module.
vi.mock("@/lib/supabase", () => {
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  };
  return { supabase: mockSupabase };
});

import { supabase } from "@/lib/supabase";
import { pullAll, pushOperations } from "./client";

// Helper that builds a thenable query chain returning `resp`.
// Supports: .select(...).eq(...).maybeSingle(), .select(...).eq(...).gt(...),
//           and bare awaits at any step.
function makeQuery(resp: { data: unknown; error: unknown }) {
  // Both `.gt(...)` and the bare select-builder are awaited directly. We make
  // them thenable so `await query` resolves to `resp`. The `then` impl must
  // call onFulfilled(resp) — JS's await uses the returned promise's resolution.
  const thenable = {
    then: (
      onFulfilled: (v: typeof resp) => unknown,
      onRejected?: (e: unknown) => unknown
    ) => {
      try {
        const out = onFulfilled(resp);
        return Promise.resolve(out);
      } catch (e) {
        if (onRejected) return Promise.resolve(onRejected(e));
        return Promise.reject(e);
      }
    },
  };
  const builder: Record<string, unknown> = {
    maybeSingle: () => Promise.resolve(resp),
    gt: () => thenable,
    eq: () => builder,
    ...thenable,
  };
  return {
    select: () => builder,
  };
}

describe("sync client runtime validation", () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getUser).mockReset();
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  it("pullAll drops invalid cloud rows and reports counts", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "u" } },
      error: null,
    } as never);

    const settingsResp = {
      data: { user_id: "not-a-uuid" /* invalid */ },
      error: null,
    };
    const dictResp = {
      data: [
        {
          user_id: "11111111-1111-4111-8111-111111111111",
          profile_id: "11111111-1111-4111-8111-111111111111",
          word: "ok",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          deleted_at: null,
        },
        { user_id: "bad" }, // invalid
      ],
      error: null,
    };
    const snipResp = { data: [], error: null };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_settings") return makeQuery(settingsResp) as never;
      if (table === "user_dictionary_words") return makeQuery(dictResp) as never;
      if (table === "user_snippets") return makeQuery(snipResp) as never;
      return makeQuery({ data: [], error: null }) as never;
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await pullAll(null, "11111111-1111-4111-8111-111111111111");
    expect(res.settings).toBeNull();
    expect(res.invalid.settings).toBe(true);
    expect(res.dictionary).toHaveLength(1);
    expect(res.dictionary[0].word).toBe("ok");
    expect(res.invalid.dictionary).toBe(1);
    expect(res.snippets).toHaveLength(0);
    expect(res.invalid.snippets).toBe(0);
    expect(res.notes).toHaveLength(0);
    expect(res.folders).toHaveLength(0);
    expect(res.invalid.notes).toBe(0);
    expect(res.invalid.folders).toBe(0);
    warn.mockRestore();
  });

  it("pullAll keeps a well-formed settings row and reports no invalid", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "u" } },
      error: null,
    } as never);

    const settingsResp = {
      data: {
        user_id: "11111111-1111-4111-8111-111111111111",
        profile_id: "11111111-1111-4111-8111-111111111111",
        data: {
          ui: { theme: "dark", language: "fr" },
          hotkeys: {
            toggle: "Ctrl+F11",
            push_to_talk: "Ctrl+F12",
            open_window: "Ctrl+Alt+O",
          },
          features: { auto_paste: "cursor", sound_effects: true },
          transcription: { provider: "OpenAI", local_model: "base" },
        },
        schema_version: 1,
        updated_at: "2026-01-01T00:00:00Z",
        updated_by_device: null,
      },
      error: null,
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_settings") return makeQuery(settingsResp) as never;
      return makeQuery({ data: [], error: null }) as never;
    });

    const res = await pullAll(null, "11111111-1111-4111-8111-111111111111");
    expect(res.settings).not.toBeNull();
    expect(res.settings?.data.ui.theme).toBe("dark");
    expect(res.invalid.settings).toBe(false);
  });

  it("pushOperations returns malformed-response error on shape mismatch", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { foo: "bar" }, // no "ok", no "results"
      error: null,
    } as never);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await pushOperations(
      [{ kind: "dictionary-upsert", word: "x" }],
      "dev",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("malformed");
    warn.mockRestore();
  });

  it("pushOperations passes through a valid edge response", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        ok: true,
        server_time: "2026-04-24T00:00:00Z",
        current_bytes: 42,
        results: [{ index: 0, ok: true }],
      },
      error: null,
    } as never);

    const r = await pushOperations(
      [{ kind: "dictionary-upsert", word: "x" }],
      "dev",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(r.ok).toBe(true);
    expect(r.current_bytes).toBe(42);
    expect(r.results).toHaveLength(1);
  });

  it("pushOperations forwards transport errors", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { message: "boom" } as never,
    } as never);

    const r = await pushOperations(
      [{ kind: "dictionary-upsert", word: "x" }],
      "dev",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("boom");
    expect(r.results).toEqual([]);
  });

  it("pushOperations sends profile_id in the body", async () => {
    const invokeSpy = vi.fn(async () => ({ data: { ok: true, results: [] }, error: null }));
    // @ts-expect-error — accès mock
    supabase.functions.invoke = invokeSpy;
    await pushOperations(
      [{ kind: "dictionary-upsert", word: "hi" }],
      "dev1",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(invokeSpy).toHaveBeenCalledWith("sync-push", {
      body: {
        operations: [{ kind: "dictionary-upsert", word: "hi" }],
        device_id: "dev1",
        profile_id: "11111111-1111-4111-8111-111111111111",
      },
    });
  });

  // ── Sub-épique 03 sync-notes : pull notes + folders ─────────────────────
  it("pullAll fetches user_notes and user_folders, validates them, and reports counts", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "u" } },
      error: null,
    } as never);

    const validNote = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      profile_id: "11111111-1111-4111-8111-111111111111",
      title: "Hello",
      content_html: "<p>body</p>",
      folder_id: null,
      favorite: false,
      order: 0,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T11:00:00Z",
      deleted_at: null,
    };
    const tombstoneNote = {
      ...validNote,
      id: "33333333-3333-4333-8333-333333333333",
      updated_at: "2026-05-19T12:00:00Z",
      deleted_at: "2026-05-19T12:00:00Z",
    };
    const validFolder = {
      id: "44444444-4444-4444-8444-444444444444",
      user_id: "22222222-2222-4222-8222-222222222222",
      profile_id: "11111111-1111-4111-8111-111111111111",
      name: "Recipes",
      order: 1,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T11:00:00Z",
      deleted_at: null,
    };

    const notesResp = {
      data: [validNote, tombstoneNote, { id: "bad" }],
      error: null,
    };
    const foldersResp = {
      data: [validFolder, { id: "also-bad", name: 42 }],
      error: null,
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_notes") return makeQuery(notesResp) as never;
      if (table === "user_folders") return makeQuery(foldersResp) as never;
      return makeQuery({ data: [], error: null }) as never;
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await pullAll("2026-05-01T00:00:00Z", "11111111-1111-4111-8111-111111111111");
    expect(res.notes).toHaveLength(2);
    // Soft-deleted rows are returned so merge can propagate tombstones.
    const tombstone = res.notes.find((n) => n.deleted_at !== null);
    expect(tombstone).toBeDefined();
    expect(res.invalid.notes).toBe(1);

    expect(res.folders).toHaveLength(1);
    expect(res.folders[0].name).toBe("Recipes");
    expect(res.invalid.folders).toBe(1);
    warn.mockRestore();
  });
});
