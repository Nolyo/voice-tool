import { describe, it, expect } from "vitest";
import {
  mergeSnippetLWW,
  mergeSettingsLWW,
  mergeNoteLWW,
  mergeFolderLWW,
  shouldApplyCloudSettings,
} from "./merge";
import type {
  LocalSnippet,
  CloudSnippetRow,
  CloudUserSettingsRow,
  LocalNoteMeta,
  CloudUserNoteRow,
  LocalFolderMeta,
  CloudUserFolderRow,
} from "./types";
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
    profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
      profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

describe("shouldApplyCloudSettings", () => {
  it("apply-cloud + no pending local push → apply", () => {
    expect(shouldApplyCloudSettings("apply-cloud", false)).toBe(true);
  });

  it("apply-cloud BUT a local settings push is still queued → do NOT apply", () => {
    // The user just toggled a setting on this device; the push hasn't reached
    // the server yet. Applying the (stale) cloud value here reverts the edit.
    expect(shouldApplyCloudSettings("apply-cloud", true)).toBe(false);
  });

  it("push-local action → never apply cloud regardless of queue", () => {
    expect(shouldApplyCloudSettings("push-local", false)).toBe(false);
    expect(shouldApplyCloudSettings("push-local", true)).toBe(false);
  });

  it("no-op action → never apply cloud", () => {
    expect(shouldApplyCloudSettings("no-op", false)).toBe(false);
  });
});

function localNoteMeta(partial: Partial<LocalNoteMeta>): LocalNoteMeta {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    title: "local title",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    favorite: false,
    order: 0,
    ...partial,
  };
}

function cloudNote(partial: Partial<CloudUserNoteRow>): CloudUserNoteRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: "22222222-2222-4222-8222-222222222222",
    profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "cloud title",
    content_html: "<p>cloud</p>",
    folder_id: null,
    favorite: false,
    order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...partial,
  };
}

describe("mergeNoteLWW", () => {
  it("local null + remote → adopt remote (all fields mapped)", () => {
    const remote = cloudNote({
      title: "from-cloud",
      content_html: "<p>cloud body</p>",
      folder_id: "44444444-4444-4444-8444-444444444444",
      favorite: true,
      order: 7,
      updated_at: "2026-01-02T00:00:00Z",
      deleted_at: "2026-01-02T00:00:00Z",
    });
    const merged = mergeNoteLWW(null, null, remote);
    expect(merged.meta.title).toBe("from-cloud");
    expect(merged.meta.favorite).toBe(true);
    expect(merged.meta.order).toBe(7);
    expect(merged.meta.folderId).toBe("44444444-4444-4444-8444-444444444444");
    expect(merged.meta.deletedAt).toBe("2026-01-02T00:00:00Z");
    expect(merged.meta.updatedAt).toBe("2026-01-02T00:00:00Z");
    expect(merged.content).toBe("<p>cloud body</p>");
  });

  it("local newer than remote → keep local meta + localContent argument", () => {
    const local = localNoteMeta({
      title: "local-newer",
      updatedAt: "2026-01-02T00:00:00Z",
    });
    const remote = cloudNote({
      title: "remote-older",
      content_html: "<p>remote</p>",
      updated_at: "2026-01-01T00:00:00Z",
    });
    const merged = mergeNoteLWW(local, "<p>local body</p>", remote);
    expect(merged.meta).toBe(local); // returns local input unchanged (no mutation)
    expect(merged.meta.title).toBe("local-newer");
    expect(merged.content).toBe("<p>local body</p>");
  });

  it("local newer with null localContent → empty string", () => {
    const local = localNoteMeta({ updatedAt: "2026-01-02T00:00:00Z" });
    const remote = cloudNote({ updated_at: "2026-01-01T00:00:00Z" });
    const merged = mergeNoteLWW(local, null, remote);
    expect(merged.content).toBe("");
  });

  it("remote newer than local → adopt remote (meta + content_html)", () => {
    const local = localNoteMeta({
      title: "stale",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const remote = cloudNote({
      title: "fresh",
      content_html: "<p>fresh body</p>",
      updated_at: "2026-01-02T00:00:00Z",
    });
    const merged = mergeNoteLWW(local, "<p>stale body</p>", remote);
    expect(merged.meta.title).toBe("fresh");
    expect(merged.content).toBe("<p>fresh body</p>");
  });

  it("remote with deleted_at and newer → tombstone propagates", () => {
    const local = localNoteMeta({ updatedAt: "2026-01-01T00:00:00Z" });
    const remote = cloudNote({
      updated_at: "2026-01-02T00:00:00Z",
      deleted_at: "2026-01-02T00:00:00Z",
    });
    const merged = mergeNoteLWW(local, "<p>local</p>", remote);
    expect(merged.meta.deletedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("remote with folder_id null → meta.folderId key is absent", () => {
    const remote = cloudNote({ folder_id: null });
    const merged = mergeNoteLWW(null, null, remote);
    expect(Object.keys(merged.meta).includes("folderId")).toBe(false);
  });

  it("remote with deleted_at null → meta.deletedAt key is absent", () => {
    const remote = cloudNote({ deleted_at: null });
    const merged = mergeNoteLWW(null, null, remote);
    expect(Object.keys(merged.meta).includes("deletedAt")).toBe(false);
  });

  it("tied timestamps → remote wins (deterministic)", () => {
    const ts = "2026-01-01T12:00:00Z";
    const local = localNoteMeta({ title: "local-tied", updatedAt: ts });
    const remote = cloudNote({
      title: "remote-tied",
      content_html: "<p>remote</p>",
      updated_at: ts,
    });
    const merged = mergeNoteLWW(local, "<p>local</p>", remote);
    expect(merged.meta.title).toBe("remote-tied");
    expect(merged.content).toBe("<p>remote</p>");
  });
});

function localFolderMeta(partial: Partial<LocalFolderMeta>): LocalFolderMeta {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    name: "local folder",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    order: 0,
    ...partial,
  };
}

function cloudFolder(partial: Partial<CloudUserFolderRow>): CloudUserFolderRow {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    user_id: "22222222-2222-4222-8222-222222222222",
    profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "cloud folder",
    order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...partial,
  };
}

describe("mergeFolderLWW", () => {
  it("local null + remote → adopt remote", () => {
    const remote = cloudFolder({
      name: "from-cloud",
      order: 3,
      updated_at: "2026-01-02T00:00:00Z",
    });
    const merged = mergeFolderLWW(null, remote);
    expect(merged.name).toBe("from-cloud");
    expect(merged.order).toBe(3);
    expect(merged.updatedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("local newer than remote → keep local", () => {
    const local = localFolderMeta({
      name: "local-newer",
      updatedAt: "2026-01-02T00:00:00Z",
    });
    const remote = cloudFolder({
      name: "remote-older",
      updated_at: "2026-01-01T00:00:00Z",
    });
    const merged = mergeFolderLWW(local, remote);
    expect(merged).toBe(local);
    expect(merged.name).toBe("local-newer");
  });

  it("remote newer → adopt remote", () => {
    const local = localFolderMeta({
      name: "stale",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const remote = cloudFolder({
      name: "fresh",
      updated_at: "2026-01-02T00:00:00Z",
    });
    const merged = mergeFolderLWW(local, remote);
    expect(merged.name).toBe("fresh");
  });

  it("remote tombstone propagates", () => {
    const local = localFolderMeta({ updatedAt: "2026-01-01T00:00:00Z" });
    const remote = cloudFolder({
      updated_at: "2026-01-02T00:00:00Z",
      deleted_at: "2026-01-02T00:00:00Z",
    });
    const merged = mergeFolderLWW(local, remote);
    expect(merged.deletedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("remote with deleted_at null → deletedAt key absent", () => {
    const remote = cloudFolder({ deleted_at: null });
    const merged = mergeFolderLWW(null, remote);
    expect(Object.keys(merged).includes("deletedAt")).toBe(false);
  });

  it("tied timestamps → remote wins", () => {
    const ts = "2026-01-01T12:00:00Z";
    const local = localFolderMeta({ name: "local-tied", updatedAt: ts });
    const remote = cloudFolder({ name: "remote-tied", updated_at: ts });
    const merged = mergeFolderLWW(local, remote);
    expect(merged.name).toBe("remote-tied");
  });
});
