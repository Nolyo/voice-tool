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
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ status: "signed-in", user: { id: "u" } }) }));

import { useNoteShares } from "./useNoteShares";

beforeEach(() => {
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
});
