import { describe, it, expect, vi } from "vitest";
import { createShare, revokeShare, listShares } from "./shares-client";

function fakeSupabase(calls: { insert?: unknown; activeExisting?: unknown; list?: unknown[] }) {
  const log: Record<string, unknown> = {};
  const api = {
    from: vi.fn(() => api),
    select: vi.fn(() => api),
    insert: vi.fn((row: unknown) => { log.inserted = row; return api; }),
    update: vi.fn((row: unknown) => { log.updated = row; return api; }),
    eq: vi.fn(() => api),
    is: vi.fn(() => api),
    order: vi.fn(() => api),
    maybeSingle: vi.fn(() => Promise.resolve({ data: calls.activeExisting ?? null, error: null })),
    single: vi.fn(() => Promise.resolve({ data: calls.insert, error: null })),
    then: undefined as unknown,
  };
  // listShares awaits the builder directly → make it thenable to resolve the list.
  (api as Record<string, unknown>).then = (res: (v: unknown) => void) =>
    res({ data: calls.list ?? [], error: null });
  return { api, log };
}

describe("createShare", () => {
  it("inserts a new active share when none exists", async () => {
    const { api, log } = fakeSupabase({
      activeExisting: null,
      insert: { id: "1", slug: "aB3dEf9hKmNp2qrS", note_id: "n", title_snapshot: "T", created_at: "t" },
    });
    const share = await createShare(api as never, { noteId: "n", userId: "u", title: "T" });
    expect(share.slug).toBe("aB3dEf9hKmNp2qrS");
    expect((log.inserted as { user_id: string }).user_id).toBe("u");
  });

  it("returns the existing active share without inserting", async () => {
    const { api, log } = fakeSupabase({
      activeExisting: { id: "9", slug: "ZZZZZZZZZZZZZZZZ", note_id: "n", title_snapshot: "T", created_at: "t" },
    });
    const share = await createShare(api as never, { noteId: "n", userId: "u", title: "T" });
    expect(share.slug).toBe("ZZZZZZZZZZZZZZZZ");
    expect(log.inserted).toBeUndefined();
  });
});

describe("revokeShare", () => {
  it("sets revoked_at", async () => {
    const { api, log } = fakeSupabase({});
    await revokeShare(api as never, "9");
    expect((log.updated as { revoked_at: string }).revoked_at).toBeTruthy();
  });
});

describe("listShares", () => {
  it("maps rows to NoteShare", async () => {
    const { api } = fakeSupabase({
      list: [{ id: "1", slug: "aB3dEf9hKmNp2qrS", note_id: "n", title_snapshot: "T", created_at: "t" }],
    });
    const rows = await listShares(api as never, "u");
    expect(rows[0].noteId).toBe("n");
    expect(rows[0].titleSnapshot).toBe("T");
  });
});
