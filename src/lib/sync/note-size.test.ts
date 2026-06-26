import { describe, it, expect } from "vitest";
import {
  NOTE_SIZE_LIMIT_BYTES,
  noteContentBytes,
  isNoteSyncable,
} from "./note-size";

describe("note-size", () => {
  it("counts UTF-8 bytes, not UTF-16 code units", () => {
    // "é" is 1 code unit but 2 UTF-8 bytes; "🪣" is 2 code units / 4 bytes.
    expect(noteContentBytes("a")).toBe(1);
    expect(noteContentBytes("é")).toBe(2);
    expect(noteContentBytes("🪣")).toBe(4);
  });

  it("accepts content at exactly the limit", () => {
    const atLimit = "a".repeat(NOTE_SIZE_LIMIT_BYTES);
    expect(noteContentBytes(atLimit)).toBe(NOTE_SIZE_LIMIT_BYTES);
    expect(isNoteSyncable(atLimit)).toBe(true);
  });

  it("rejects content one byte over the limit", () => {
    const overByOne = "a".repeat(NOTE_SIZE_LIMIT_BYTES + 1);
    expect(isNoteSyncable(overByOne)).toBe(false);
  });

  it("rejects content that passes a code-unit check but exceeds the byte cap", () => {
    // 600k '🪣' = 1.2M code units (would pass a naive .length check vs 1.05M?)
    // but 2.4M bytes — must be rejected on the byte measure.
    const multibyte = "🪣".repeat(600_000);
    expect(multibyte.length).toBeLessThan(NOTE_SIZE_LIMIT_BYTES * 2);
    expect(noteContentBytes(multibyte)).toBeGreaterThan(NOTE_SIZE_LIMIT_BYTES);
    expect(isNoteSyncable(multibyte)).toBe(false);
  });

  it("treats empty content as syncable", () => {
    expect(isNoteSyncable("")).toBe(true);
  });
});
