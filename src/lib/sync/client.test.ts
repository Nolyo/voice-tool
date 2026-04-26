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
// Supports: .select(...).maybeSingle() and .select(...).gt(...) and bare .select(...).
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
  const builder = {
    maybeSingle: () => Promise.resolve(resp),
    gt: () => thenable,
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
    const res = await pullAll(null);
    expect(res.settings).toBeNull();
    expect(res.invalid.settings).toBe(true);
    expect(res.dictionary).toHaveLength(1);
    expect(res.dictionary[0].word).toBe("ok");
    expect(res.invalid.dictionary).toBe(1);
    expect(res.snippets).toHaveLength(0);
    expect(res.invalid.snippets).toBe(0);
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

    const res = await pullAll(null);
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
      "dev"
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
      "dev"
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
      "dev"
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("boom");
    expect(r.results).toEqual([]);
  });
});
