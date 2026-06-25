// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const listMock = vi.fn();
const createMock = vi.fn();
const revokeMock = vi.fn();
vi.mock("@/lib/sharing/shares-client", () => ({
  listShares: (...a: unknown[]) => listMock(...a),
  createShare: (...a: unknown[]) => createMock(...a),
  revokeShare: (...a: unknown[]) => revokeMock(...a),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

// Mutable auth state — readable by the mock factory (hoisted)
const authState = { status: "signed-in" as string, user: { id: "u" } as { id: string } | null };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ status: authState.status, user: authState.user }),
}));

import { useNoteShares } from "./useNoteShares";

beforeEach(() => {
  // Reset to signed-in by default
  authState.status = "signed-in";
  authState.user = { id: "u" };

  listMock.mockReset().mockResolvedValue([
    { id: "1", slug: "aB3dEf9hKmNp2qrS", noteId: "n1", titleSnapshot: "T", createdAt: "t" },
  ]);
  createMock.mockReset();
  revokeMock.mockReset();
});

describe("useNoteShares", () => {
  it("loads shares and resolves activeShareFor", async () => {
    const { result } = renderHook(() => useNoteShares());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeShareFor("n1")?.slug).toBe("aB3dEf9hKmNp2qrS");
    expect(result.current.activeShareFor("nope")).toBeUndefined();
  });

  it("share() creates and adds to state", async () => {
    createMock.mockResolvedValue({ id: "2", slug: "ZZZZZZZZZZZZZZZZ", noteId: "n2", titleSnapshot: "T2", createdAt: "t" });
    const { result } = renderHook(() => useNoteShares());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.share("n2", "T2"); });
    expect(result.current.activeShareFor("n2")?.slug).toBe("ZZZZZZZZZZZZZZZZ");
  });

  it("revoke() removes from state", async () => {
    revokeMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteShares());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.revoke("1"); });
    expect(result.current.activeShareFor("n1")).toBeUndefined();
  });

  it("signed-out: loading is false and shares is [] without calling listShares", async () => {
    authState.status = "signed-out";
    authState.user = null;

    const { result } = renderHook(() => useNoteShares());
    // No async work needed — effect returns immediately for signed-out
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.shares).toEqual([]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("account switch: stale result from u1 does not overwrite u2 shares", async () => {
    // u1 listShares resolves slowly
    const u1Shares = [{ id: "s1", slug: "U1SLUG1234567890", noteId: "n1", titleSnapshot: "T1", createdAt: "t" }];
    const u2Shares = [{ id: "s2", slug: "U2SLUG1234567890", noteId: "n2", titleSnapshot: "T2", createdAt: "t" }];

    let resolveU1: (v: typeof u1Shares) => void;
    const u1Promise = new Promise<typeof u1Shares>((resolve) => { resolveU1 = resolve; });

    listMock.mockReset();
    // First call (u1) → deferred promise; second call (u2) → resolves immediately
    listMock
      .mockImplementationOnce(() => u1Promise)
      .mockResolvedValueOnce(u2Shares);

    authState.status = "signed-in";
    authState.user = { id: "u1" };

    const { result, rerender } = renderHook(() => useNoteShares());

    // Switch to u2 before u1's promise resolves
    authState.status = "signed-in";
    authState.user = { id: "u2" };
    rerender();

    // Now let u2 settle
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Resolve u1 late — should be ignored (cancelled)
    resolveU1!(u1Shares);

    // Give any stale callbacks a tick to fire (they shouldn't)
    await new Promise((r) => setTimeout(r, 20));

    // Final state must reflect u2, not u1
    expect(result.current.shares).toEqual(u2Shares);
    expect(result.current.activeShareFor("n1")).toBeUndefined();
    expect(result.current.activeShareFor("n2")?.slug).toBe("U2SLUG1234567890");
  });
});
