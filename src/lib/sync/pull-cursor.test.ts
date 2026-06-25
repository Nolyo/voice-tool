import { describe, it, expect } from "vitest";
import { computeNextPullCursor } from "./pull-cursor";
import type { PullResult } from "./client";

function emptyResult(partial: Partial<PullResult> = {}): PullResult {
  return {
    settings: null,
    dictionary: [],
    snippets: [],
    notes: [],
    folders: [],
    invalid: { settings: false, dictionary: 0, snippets: 0, notes: 0, folders: 0 },
    ...partial,
  };
}

// Minimal row factories — only `updated_at` matters for the cursor.
function note(updated_at: string) {
  return { updated_at } as PullResult["notes"][number];
}
function folder(updated_at: string) {
  return { updated_at } as PullResult["folders"][number];
}
function settingsRow(updated_at: string) {
  return { updated_at } as NonNullable<PullResult["settings"]>;
}

describe("computeNextPullCursor", () => {
  it("full pull (prev null) → max updated_at across all rows", () => {
    const result = emptyResult({
      notes: [note("2026-01-01T10:00:00Z"), note("2026-01-01T12:00:00Z")],
      folders: [folder("2026-01-01T11:00:00Z")],
    });
    expect(computeNextPullCursor(null, result)).toBe("2026-01-01T12:00:00Z");
  });

  it("includes the settings row updated_at in the high-water mark", () => {
    const result = emptyResult({
      settings: settingsRow("2026-01-02T00:00:00Z"),
      notes: [note("2026-01-01T10:00:00Z")],
    });
    expect(computeNextPullCursor(null, result)).toBe("2026-01-02T00:00:00Z");
  });

  it("never regresses below prev when all rows are older (clock-skew guard)", () => {
    // The bug: a client-clock cursor could jump AHEAD of the newest server row,
    // permanently hiding remote changes. The server-derived cursor must stay at
    // the newest row actually seen and never use wall-clock time.
    const prev = "2026-01-01T12:00:00Z";
    const result = emptyResult({
      notes: [note("2026-01-01T09:00:00Z")],
    });
    expect(computeNextPullCursor(prev, result)).toBe(prev);
  });

  it("advances to the newest row when newer than prev", () => {
    const prev = "2026-01-01T12:00:00Z";
    const result = emptyResult({
      notes: [note("2026-01-01T15:00:00Z")],
    });
    expect(computeNextPullCursor(prev, result)).toBe("2026-01-01T15:00:00Z");
  });

  it("empty incremental pull → cursor unchanged", () => {
    const prev = "2026-01-01T12:00:00Z";
    expect(computeNextPullCursor(prev, emptyResult())).toBe(prev);
  });

  it("empty full pull (no data, no prev) → null", () => {
    expect(computeNextPullCursor(null, emptyResult())).toBeNull();
  });
});
