// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// In-memory fake Tauri Store backing the settings persistence.
const storeData = new Map<string, unknown>();
const fakeStore = {
  get: vi.fn(async (k: string) => storeData.get(k)),
  set: vi.fn(async (k: string, v: unknown) => {
    storeData.set(k, v);
  }),
  save: vi.fn(async () => {}),
};

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: vi.fn(async () => fakeStore) },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => "settings.json"),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@/i18n", () => ({ changeLanguage: vi.fn(async () => {}) }));
vi.mock("@/lib/theme", () => ({ applyTheme: vi.fn() }));

import { SettingsProvider, useSettingsContext } from "./SettingsContext";

beforeEach(() => {
  storeData.clear();
});

describe("SettingsContext callback stability", () => {
  // Regression: unstable `updateSetting`/`updateSettings`/`subscribeToChanges`
  // identities made SyncContext's `pullAndApply` re-create on every settings
  // render, which re-fired the pull effect and clobbered the just-edited value
  // (the "transcription cloud → local in a microsecond" bug).
  it("updateSetting keeps a stable identity across settings changes", async () => {
    const { result } = renderHook(() => useSettingsContext(), {
      wrapper: SettingsProvider,
    });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const first = result.current.updateSetting;
    await act(async () => {
      await result.current.updateSetting("theme", "light");
    });

    // A real re-render happened (state changed)…
    expect(result.current.settings.theme).toBe("light");
    // …yet the callback identity is unchanged.
    expect(result.current.updateSetting).toBe(first);
  });

  it("updateSettings and subscribeToChanges are also stable across changes", async () => {
    const { result } = renderHook(() => useSettingsContext(), {
      wrapper: SettingsProvider,
    });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const firstUpdateSettings = result.current.updateSettings;
    const firstSubscribe = result.current.subscribeToChanges;
    await act(async () => {
      await result.current.updateSettings({ theme: "light" });
    });

    expect(result.current.settings.theme).toBe("light");
    expect(result.current.updateSettings).toBe(firstUpdateSettings);
    expect(result.current.subscribeToChanges).toBe(firstSubscribe);
  });
});
