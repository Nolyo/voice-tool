import { describe, it, expect } from "vitest";
import { generateSlug, shareUrl } from "./slug";

describe("generateSlug", () => {
  it("produces 16 base62 chars", () => {
    const s = generateSlug();
    expect(s).toMatch(/^[0-9A-Za-z]{16}$/);
  });
  it("is statistically unique across 1000 draws", () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateSlug()));
    expect(set.size).toBe(1000);
  });
});

describe("shareUrl", () => {
  it("builds an /s/<slug> url", () => {
    expect(shareUrl("aB3dEf9hKmNp2qrS")).toMatch(/\/s\/aB3dEf9hKmNp2qrS$/);
  });
});
