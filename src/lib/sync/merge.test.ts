import { describe, it, expect } from "vitest";
import { mergeSnippetLWW, mergeSettingsLWW } from "./merge";
import type { LocalSnippet, CloudSnippetRow, CloudUserSettingsRow } from "./types";
import { DEFAULT_SETTINGS } from "@/lib/settings";

function localSnippet(partial: Partial<LocalSnippet>): LocalSnippet {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    label: "a",
    content: "A",
    shortcut: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...partial,
  };
}

function cloudSnippet(partial: Partial<CloudSnippetRow>): CloudSnippetRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    label: "a",
    content: "A",
    shortcut: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...partial,
  };
}

describe("merge LWW snippets", () => {
  it("cloud plus récent → cloud gagne", () => {
    const local = localSnippet({ content: "old", updated_at: "2026-01-01T10:00:00Z" });
    const remote = cloudSnippet({ content: "new", updated_at: "2026-01-01T11:00:00Z" });
    const merged = mergeSnippetLWW(local, remote);
    expect(merged.content).toBe("new");
  });

  it("local plus récent → local gagne", () => {
    const local = localSnippet({ content: "newer", updated_at: "2026-01-01T12:00:00Z" });
    const remote = cloudSnippet({ content: "stale", updated_at: "2026-01-01T11:00:00Z" });
    const merged = mergeSnippetLWW(local, remote);
    expect(merged.content).toBe("newer");
  });

  it("cloud soft-deleted plus récent → local marqué deleted", () => {
    const local = localSnippet({ updated_at: "2026-01-01T10:00:00Z", deleted_at: null });
    const remote = cloudSnippet({
      updated_at: "2026-01-01T11:00:00Z",
      deleted_at: "2026-01-01T11:00:00Z",
    });
    const merged = mergeSnippetLWW(local, remote);
    expect(merged.deleted_at).not.toBeNull();
  });

  it("local null → remote wins unconditionally", () => {
    const remote = cloudSnippet({ content: "from-cloud" });
    const merged = mergeSnippetLWW(null, remote);
    expect(merged.content).toBe("from-cloud");
  });
});

describe("merge LWW settings", () => {
  it("cloud présent et pas de lastPushedAt → apply-cloud", () => {
    const cloud: CloudUserSettingsRow = {
      user_id: "22222222-2222-4222-8222-222222222222",
      data: {
        ui: { theme: "light", language: "en" },
        hotkeys: { toggle: "Ctrl+F5", push_to_talk: "Ctrl+F6", open_window: "Ctrl+Alt+P" },
        features: { auto_paste: "clipboard", sound_effects: false },
        transcription: { provider: "OpenAI", local_model: "small" },
      },
      schema_version: 1,
      updated_at: "2026-01-01T12:00:00Z",
      updated_by_device: "dev",
    };
    const merged = mergeSettingsLWW(DEFAULT_SETTINGS.settings, null, cloud);
    expect(merged.settings.theme).toBe("light");
    expect(merged.action).toBe("apply-cloud");
  });

  it("local plus récent que cloud → push-local", () => {
    const cloud: CloudUserSettingsRow = {
      user_id: "22222222-2222-4222-8222-222222222222",
      data: {
        ui: { theme: "light", language: "en" },
        hotkeys: { toggle: "Ctrl+F5", push_to_talk: "Ctrl+F6", open_window: "Ctrl+Alt+P" },
        features: { auto_paste: "clipboard", sound_effects: false },
        transcription: { provider: "OpenAI", local_model: "small" },
      },
      schema_version: 1,
      updated_at: "2026-01-01T10:00:00Z",
      updated_by_device: "dev",
    };
    const localPushedAt = "2026-01-01T11:00:00Z";
    const merged = mergeSettingsLWW(DEFAULT_SETTINGS.settings, localPushedAt, cloud);
    expect(merged.action).toBe("push-local");
  });

  it("cloud null → push-local", () => {
    const merged = mergeSettingsLWW(DEFAULT_SETTINGS.settings, null, null);
    expect(merged.action).toBe("push-local");
  });
});
