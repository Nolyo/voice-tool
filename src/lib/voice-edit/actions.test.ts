import { describe, expect, it, vi } from "vitest";

// See prompts.test.ts for why `@/i18n` is mocked. Here the fake echoes the key
// back, which is also what i18next does for a missing key — so the assertions
// below deliberately avoid depending on translated content.
vi.mock("@/i18n", () => ({
  default: { t: (key: string) => key },
}));

const { getDefaultVoiceEditActions, resolveActionByIndex, truncateSelection } =
  await import("./actions");

describe("getDefaultVoiceEditActions", () => {
  it("starts with translate, the dominant use case", () => {
    expect(getDefaultVoiceEditActions()[0].id).toBe("translate");
  });

  it("has unique ids", () => {
    const ids = getDefaultVoiceEditActions().map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives translate an empty prompt, since it is built from the language settings", () => {
    expect(getDefaultVoiceEditActions()[0].systemPrompt).toBe("");
  });

  it("gives every other action a system prompt", () => {
    for (const action of getDefaultVoiceEditActions().slice(1)) {
      expect(action.systemPrompt.length).toBeGreaterThan(0);
    }
  });

  it("rebuilds on each call, so a language switch updates the palette", () => {
    expect(getDefaultVoiceEditActions()).not.toBe(getDefaultVoiceEditActions());
  });
});

describe("resolveActionByIndex", () => {
  it("maps the key '1' to the first action", () => {
    expect(resolveActionByIndex(getDefaultVoiceEditActions(), 1)?.id).toBe(
      "translate",
    );
  });

  it("returns null past the end of the palette", () => {
    expect(resolveActionByIndex(getDefaultVoiceEditActions(), 9)).toBeNull();
  });

  it("returns null for index 0, which is not a palette key", () => {
    expect(resolveActionByIndex(getDefaultVoiceEditActions(), 0)).toBeNull();
  });

  it("returns null for a negative index", () => {
    expect(resolveActionByIndex(getDefaultVoiceEditActions(), -1)).toBeNull();
  });

  it("returns null for a non-integer index", () => {
    expect(resolveActionByIndex(getDefaultVoiceEditActions(), 1.5)).toBeNull();
  });
});

describe("truncateSelection", () => {
  it("leaves short text untouched", () => {
    expect(truncateSelection("bonjour")).toEqual({
      text: "bonjour",
      truncated: false,
    });
  });

  it("cuts at the cap and reports it", () => {
    const long = "a".repeat(20_000);
    const result = truncateSelection(long);
    expect(Array.from(result.text)).toHaveLength(15_000);
    expect(result.truncated).toBe(true);
  });

  it("counts code points, not UTF-16 code units", () => {
    // Emoji are surrogate pairs: slicing by .length would cut one in half and
    // produce a lone surrogate.
    const result = truncateSelection("\u{1F600}\u{1F600}\u{1F600}", 2);
    expect(result.text).toBe("\u{1F600}\u{1F600}");
    expect(result.truncated).toBe(true);
  });

  it("treats a selection of exactly the cap as untruncated", () => {
    const exact = "a".repeat(15_000);
    expect(truncateSelection(exact).truncated).toBe(false);
  });
});
