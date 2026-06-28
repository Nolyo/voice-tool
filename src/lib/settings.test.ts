import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings";

describe("tour_pending setting", () => {
  it("defaults to false so existing users get no surprise tour on update", () => {
    expect(DEFAULT_SETTINGS.settings.tour_pending).toBe(false);
  });

  it("mergeSettings preserves an explicit tour_pending=true", () => {
    const merged = mergeSettings({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settings: { tour_pending: true } as any,
    });
    expect(merged.settings.tour_pending).toBe(true);
  });
});
