import { describe, it, expect } from "vitest";
import { firstGrapheme } from "./emoji";

describe("firstGrapheme", () => {
  it("returns a plain character as-is", () => {
    expect(firstGrapheme("a")).toBe("a");
  });

  it("keeps only the first grapheme of a longer string", () => {
    expect(firstGrapheme("📁 docs")).toBe("📁");
  });

  it("keeps a ZWJ emoji sequence whole", () => {
    expect(firstGrapheme("👨‍👩‍👧‍👦xyz")).toBe("👨‍👩‍👧‍👦");
  });

  it("keeps a flag emoji (regional indicator pair) whole", () => {
    expect(firstGrapheme("🇫🇷 France")).toBe("🇫🇷");
  });

  it("returns null for an empty string", () => {
    expect(firstGrapheme("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(firstGrapheme("   ")).toBeNull();
  });
});
