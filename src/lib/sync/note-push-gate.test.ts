import { describe, it, expect } from "vitest";
import { shouldPushNote } from "./note-push-gate";
import { NOTE_SIZE_LIMIT_BYTES } from "./note-size";

describe("shouldPushNote", () => {
  it("returns false when the note is localOnly, even with valid content", () => {
    expect(shouldPushNote({ localOnly: true }, "<p>hello</p>")).toBe(false);
  });

  it("returns false for empty content", () => {
    expect(shouldPushNote({}, "")).toBe(false);
  });

  it("returns false for whitespace-only content", () => {
    expect(shouldPushNote({}, "   \n\t  ")).toBe(false);
  });

  it("returns false for content over the size cap", () => {
    expect(shouldPushNote({}, "a".repeat(NOTE_SIZE_LIMIT_BYTES + 1))).toBe(false);
  });

  it("returns true for a normal syncable note", () => {
    expect(shouldPushNote({}, "<p>hello</p>")).toBe(true);
  });

  it("returns true at exactly the size limit", () => {
    expect(shouldPushNote({}, "a".repeat(NOTE_SIZE_LIMIT_BYTES))).toBe(true);
  });

  it("treats an explicit localOnly: false like an absent flag", () => {
    expect(shouldPushNote({ localOnly: false }, "<p>hello</p>")).toBe(true);
  });
});
