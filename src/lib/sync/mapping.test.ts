import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  extractCloudSettings,
  applyCloudSettings,
  mapNoteToCloud,
  mapNoteFromCloud,
  mapFolderToCloud,
  mapFolderFromCloud,
} from "./mapping";
import type {
  CloudUserFolderRow,
  CloudUserNoteRow,
  LocalFolderMeta,
  LocalNoteMeta,
} from "./types";

describe("mapping AppSettings ↔ Cloud", () => {
  it("extractCloudSettings returns the spec shape", () => {
    const cloud = extractCloudSettings(DEFAULT_SETTINGS.settings);
    expect(cloud).toEqual({
      ui: { theme: "dark", language: DEFAULT_SETTINGS.settings.ui_language },
      hotkeys: {
        toggle: "Ctrl+F11",
        push_to_talk: "Ctrl+F12",
        open_window: "Ctrl+Alt+O",
      },
      features: { auto_paste: "cursor", sound_effects: true },
      transcription: { provider: "Local", local_model: "base" },
    });
  });

  it("applyCloudSettings merges only syncable keys (clamping legacy provider to Local)", () => {
    const local = { ...DEFAULT_SETTINGS.settings };
    const cloud = {
      ui: { theme: "light" as const, language: "en" as const },
      hotkeys: {
        toggle: "Ctrl+F5",
        push_to_talk: "Ctrl+F6",
        open_window: "Ctrl+Alt+P",
      },
      features: { auto_paste: "clipboard" as const, sound_effects: false },
      transcription: { provider: "OpenAI" as const, local_model: "small" },
    };
    const merged = applyCloudSettings(local, cloud);

    expect(merged.theme).toBe("light");
    expect(merged.ui_language).toBe("en");
    expect(merged.record_hotkey).toBe("Ctrl+F5");
    expect(merged.insertion_mode).toBe("clipboard");
    expect(merged.enable_sounds).toBe(false);
    // Legacy "OpenAI" provider clamped to "Local" (Phase A retired BYOK).
    expect(merged.transcription_provider).toBe("Local");
    expect(merged.local_model_size).toBe("small");

    // Non-syncable keys préservées
    expect(merged.silence_threshold).toBe(local.silence_threshold);
    expect(merged.recordings_keep_last).toBe(local.recordings_keep_last);
  });

  it("round-trip extract -> apply est idempotent pour les clés syncées", () => {
    const local = {
      ...DEFAULT_SETTINGS.settings,
      theme: "light" as const,
      transcription_provider: "LexenaCloud" as const,
    };
    const cloud = extractCloudSettings(local);
    const merged = applyCloudSettings(DEFAULT_SETTINGS.settings, cloud);
    expect(merged.theme).toBe("light");
    expect(merged.transcription_provider).toBe("LexenaCloud");
  });

  it("applyCloudSettings clamps Groq legacy provider to Local", () => {
    const local = { ...DEFAULT_SETTINGS.settings };
    const cloud = {
      ui: { theme: "dark" as const, language: "fr" as const },
      hotkeys: { toggle: "x", push_to_talk: "y", open_window: "z" },
      features: { auto_paste: "cursor" as const, sound_effects: true },
      transcription: { provider: "Groq" as const, local_model: "tiny" },
    };
    const merged = applyCloudSettings(local, cloud);
    expect(merged.transcription_provider).toBe("Local");
  });

  it("applyCloudSettings falls back to local when cloud local_model is unknown", () => {
    const local = { ...DEFAULT_SETTINGS.settings, local_model_size: "medium" as const };
    const cloud = {
      ui: { theme: "light" as const, language: "en" as const },
      hotkeys: { toggle: "x", push_to_talk: "y", open_window: "z" },
      features: { auto_paste: "cursor" as const, sound_effects: true },
      transcription: { provider: "Local" as const, local_model: "ggml-tiny.bin" },
    };
    const merged = applyCloudSettings(local, cloud);
    expect(merged.local_model_size).toBe("medium"); // fallback
  });

  it("applyCloudSettings accepts known local_model values", () => {
    const local = { ...DEFAULT_SETTINGS.settings };
    const cloud = {
      ui: { theme: "light" as const, language: "en" as const },
      hotkeys: { toggle: "x", push_to_talk: "y", open_window: "z" },
      features: { auto_paste: "cursor" as const, sound_effects: true },
      transcription: { provider: "Local" as const, local_model: "large-v3-turbo" },
    };
    const merged = applyCloudSettings(local, cloud);
    expect(merged.local_model_size).toBe("large-v3-turbo");
  });
});

// ── Sub-épique 03 sync-notes : mapping notes + folders ────────────────────────

describe("mapping notes ↔ cloud", () => {
  const UUID_A = "11111111-1111-4111-8111-111111111111";
  const UUID_B = "22222222-2222-4222-8222-222222222222";
  const UUID_F = "33333333-3333-4333-8333-333333333333";

  it("mapNoteToCloud converts undefined folderId to null and emits all 7 cloud fields", () => {
    const meta: LocalNoteMeta = {
      id: UUID_A,
      title: "Hello",
      createdAt: "2026-05-19T10:00:00Z",
      updatedAt: "2026-05-19T11:00:00Z",
      favorite: true,
      // folderId omitted → undefined
      order: 5,
      // deletedAt omitted → undefined
    };
    const payload = mapNoteToCloud(meta, "<p>body</p>");
    expect(payload).toEqual({
      id: UUID_A,
      title: "Hello",
      content_html: "<p>body</p>",
      folder_id: null,
      favorite: true,
      order: 5,
      updated_at: "2026-05-19T11:00:00Z",
    });
    expect(Object.keys(payload)).toHaveLength(7);
  });

  it("mapNoteToCloud passes folderId through when defined", () => {
    const meta: LocalNoteMeta = {
      id: UUID_A,
      title: "T",
      createdAt: "2026-05-19T10:00:00Z",
      updatedAt: "2026-05-19T11:00:00Z",
      favorite: false,
      folderId: UUID_F,
      order: 0,
    };
    const payload = mapNoteToCloud(meta, "");
    expect(payload.folder_id).toBe(UUID_F);
  });

  it("mapNoteFromCloud round-trips ids, title, content; folderId defined when row.folder_id non-null", () => {
    const row: CloudUserNoteRow = {
      id: UUID_A,
      user_id: UUID_B,
      title: "Hello",
      content_html: "<p>body</p>",
      folder_id: UUID_F,
      favorite: true,
      order: 5,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T11:00:00Z",
      deleted_at: null,
    };
    const { meta, content } = mapNoteFromCloud(row);
    expect(meta.id).toBe(UUID_A);
    expect(meta.title).toBe("Hello");
    expect(content).toBe("<p>body</p>");
    expect(meta.folderId).toBe(UUID_F);
    expect(meta.deletedAt).toBeUndefined();
    expect("deletedAt" in meta).toBe(false);
  });

  it("mapNoteFromCloud omits folderId key when row.folder_id is null", () => {
    const row: CloudUserNoteRow = {
      id: UUID_A,
      user_id: UUID_B,
      title: "Hello",
      content_html: "",
      folder_id: null,
      favorite: false,
      order: 0,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T10:00:00Z",
      deleted_at: null,
    };
    const { meta } = mapNoteFromCloud(row);
    expect(meta.folderId).toBeUndefined();
    expect("folderId" in meta).toBe(false);
  });

  it("mapNoteFromCloud sets deletedAt when row.deleted_at is non-null", () => {
    const row: CloudUserNoteRow = {
      id: UUID_A,
      user_id: UUID_B,
      title: "Tombstone",
      content_html: "",
      folder_id: null,
      favorite: false,
      order: 0,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T12:00:00Z",
      deleted_at: "2026-05-19T12:00:00Z",
    };
    const { meta } = mapNoteFromCloud(row);
    expect(meta.deletedAt).toBe("2026-05-19T12:00:00Z");
  });

  it("note: cloud -> local -> cloud is symmetric for an active row", () => {
    const row: CloudUserNoteRow = {
      id: UUID_A,
      user_id: UUID_B,
      title: "Hello",
      content_html: "<p>body</p>",
      folder_id: UUID_F,
      favorite: true,
      order: 5,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T11:00:00Z",
      deleted_at: null,
    };
    const { meta, content } = mapNoteFromCloud(row);
    const back = mapNoteToCloud(meta, content);
    expect(back).toEqual({
      id: row.id,
      title: row.title,
      content_html: row.content_html,
      folder_id: row.folder_id,
      favorite: row.favorite,
      order: row.order,
      updated_at: row.updated_at,
    });
  });
});

describe("mapping folders ↔ cloud", () => {
  const UUID_F = "33333333-3333-4333-8333-333333333333";
  const UUID_U = "22222222-2222-4222-8222-222222222222";

  it("mapFolderToCloud emits id/name/order/updated_at", () => {
    const folder: LocalFolderMeta = {
      id: UUID_F,
      name: "Recipes",
      createdAt: "2026-05-19T10:00:00Z",
      updatedAt: "2026-05-19T11:00:00Z",
      order: 2,
    };
    const payload = mapFolderToCloud(folder);
    expect(payload).toEqual({
      id: UUID_F,
      name: "Recipes",
      order: 2,
      updated_at: "2026-05-19T11:00:00Z",
    });
    expect(Object.keys(payload)).toHaveLength(4);
  });

  it("mapFolderFromCloud omits deletedAt for active folder", () => {
    const row: CloudUserFolderRow = {
      id: UUID_F,
      user_id: UUID_U,
      name: "Recipes",
      order: 2,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T11:00:00Z",
      deleted_at: null,
    };
    const folder = mapFolderFromCloud(row);
    expect(folder).toEqual({
      id: UUID_F,
      name: "Recipes",
      createdAt: "2026-05-19T10:00:00Z",
      updatedAt: "2026-05-19T11:00:00Z",
      order: 2,
    });
    expect("deletedAt" in folder).toBe(false);
  });

  it("mapFolderFromCloud sets deletedAt for tombstone row", () => {
    const row: CloudUserFolderRow = {
      id: UUID_F,
      user_id: UUID_U,
      name: "Old",
      order: 0,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T12:00:00Z",
      deleted_at: "2026-05-19T12:00:00Z",
    };
    const folder = mapFolderFromCloud(row);
    expect(folder.deletedAt).toBe("2026-05-19T12:00:00Z");
  });

  it("folder: cloud -> local -> cloud is symmetric for an active row", () => {
    const row: CloudUserFolderRow = {
      id: UUID_F,
      user_id: UUID_U,
      name: "Recipes",
      order: 2,
      created_at: "2026-05-19T10:00:00Z",
      updated_at: "2026-05-19T11:00:00Z",
      deleted_at: null,
    };
    const local = mapFolderFromCloud(row);
    const back = mapFolderToCloud(local);
    expect(back).toEqual({
      id: row.id,
      name: row.name,
      order: row.order,
      updated_at: row.updated_at,
    });
  });
});
