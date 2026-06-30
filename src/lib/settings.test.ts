import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  OFFICIAL_LOCAL_MODEL,
  mergeSettings,
} from "./settings";

describe("default local model", () => {
  it("defaults to the official (non-legacy) model", () => {
    // A fresh profile must land on the only model we still ship. Defaulting to a
    // deprecated size like "base" caused the 'model missing' + legacy-migration
    // banners to fire on every fresh install / new profile.
    expect(DEFAULT_SETTINGS.settings.local_model_size).toBe(OFFICIAL_LOCAL_MODEL);
    expect(DEFAULT_SETTINGS.settings.local_model_size).not.toBe("base");
  });

  it("keeps the official model when merging an empty partial", () => {
    expect(mergeSettings({}).settings.local_model_size).toBe(OFFICIAL_LOCAL_MODEL);
  });

  it("preserves a legacy model already stored by a beta user", () => {
    // Legacy values stay in the union so the migration banner can name them;
    // mergeSettings must not silently overwrite an existing choice.
    const merged = mergeSettings({
      settings: { ...DEFAULT_SETTINGS.settings, local_model_size: "medium" },
    });
    expect(merged.settings.local_model_size).toBe("medium");
  });
});

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
