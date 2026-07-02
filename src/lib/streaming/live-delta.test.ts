import { describe, expect, it } from "vitest";
import { splitLiveDelta } from "./live-delta";

describe("splitLiveDelta", () => {
  it("marks everything fresh on the first text", () => {
    const d = splitLiveDelta("", "bonjour tout le monde", 90);
    expect(d).toEqual({
      truncated: false,
      stable: "",
      fresh: "bonjour tout le monde",
    });
  });

  it("splits an appended suffix from the settled prefix", () => {
    const d = splitLiveDelta("bonjour", "bonjour tout le monde", 90);
    expect(d.stable).toBe("bonjour");
    expect(d.fresh).toBe(" tout le monde");
    expect(d.truncated).toBe(false);
  });

  it("returns no fresh part when the text is unchanged", () => {
    const d = splitLiveDelta("bonjour", "bonjour", 90);
    expect(d.stable).toBe("bonjour");
    expect(d.fresh).toBe("");
  });

  it("treats a mid-text insertion as fresh from the divergence point", () => {
    // A late chunk landing before an already-displayed one.
    const d = splitLiveDelta("alpha charlie", "alpha bravo charlie", 90);
    expect(d.stable).toBe("alpha ");
    expect(d.fresh).toBe("bravo charlie");
  });

  it("clips the stable part to the tail window", () => {
    const prev = "a".repeat(100);
    const next = prev + " fin";
    const d = splitLiveDelta(prev, next, 20);
    expect(d.truncated).toBe(true);
    expect(d.stable + d.fresh).toBe(next.slice(-20));
    expect(d.fresh).toBe(" fin");
  });

  it("clips the fresh part itself when it overflows the tail", () => {
    const next = "x".repeat(50);
    const d = splitLiveDelta("", next, 20);
    expect(d.truncated).toBe(true);
    expect(d.stable).toBe("");
    expect(d.fresh).toBe("x".repeat(20));
  });

  it("handles the text shrinking (defensive reset)", () => {
    const d = splitLiveDelta("bonjour tout le monde", "bonjour", 90);
    expect(d.stable).toBe("bonjour");
    expect(d.fresh).toBe("");
  });
});
