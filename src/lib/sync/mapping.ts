import type { AppSettings } from "@/lib/settings";
import type {
  CloudSettingsData,
  CloudUserFolderRow,
  CloudUserNoteRow,
  FolderPayload,
  LocalFolderMeta,
  LocalNoteMeta,
  NotePayload,
} from "./types";

const VALID_LOCAL_MODEL_SIZES: ReadonlySet<string> = new Set([
  "tiny",
  "base",
  "small",
  "medium",
  "large-v1",
  "large-v2",
  "large-v3",
  "large-v3-turbo",
  "large-v3-turbo-q5_0",
]);

export function extractCloudSettings(s: AppSettings["settings"]): CloudSettingsData {
  return {
    ui: {
      theme: s.theme,
      language: s.ui_language,
    },
    hotkeys: {
      toggle: s.record_hotkey,
      push_to_talk: s.ptt_hotkey,
      open_window: s.open_window_hotkey,
    },
    features: {
      auto_paste: s.insertion_mode,
      sound_effects: s.enable_sounds,
    },
    transcription: {
      provider: s.transcription_provider,
      local_model: s.local_model_size,
    },
  };
}

const VALID_PROVIDERS: ReadonlySet<AppSettings["settings"]["transcription_provider"]> =
  new Set(["Local", "LexenaCloud"] as const);

export function applyCloudSettings(
  local: AppSettings["settings"],
  cloud: CloudSettingsData
): AppSettings["settings"] {
  const local_model_size = VALID_LOCAL_MODEL_SIZES.has(cloud.transcription.local_model)
    ? (cloud.transcription.local_model as AppSettings["settings"]["local_model_size"])
    : local.local_model_size;

  // Clamp legacy third-party providers (OpenAI/Groq/Google) to Local — Phase A retired BYOK.
  const transcription_provider = VALID_PROVIDERS.has(
    cloud.transcription.provider as AppSettings["settings"]["transcription_provider"]
  )
    ? (cloud.transcription.provider as AppSettings["settings"]["transcription_provider"])
    : "Local";

  return {
    ...local,
    theme: cloud.ui.theme,
    ui_language: cloud.ui.language,
    record_hotkey: cloud.hotkeys.toggle,
    ptt_hotkey: cloud.hotkeys.push_to_talk,
    open_window_hotkey: cloud.hotkeys.open_window,
    insertion_mode: cloud.features.auto_paste,
    enable_sounds: cloud.features.sound_effects,
    transcription_provider,
    local_model_size,
  };
}

// Retourne true si au moins une clé syncable diffère entre deux snapshots AppSettings.
export function syncableSettingsChanged(
  a: AppSettings["settings"],
  b: AppSettings["settings"]
): boolean {
  const ca = extractCloudSettings(a);
  const cb = extractCloudSettings(b);
  return JSON.stringify(ca) !== JSON.stringify(cb);
}

// ── Sub-épique 03 sync-notes : mapping local <-> cloud pour notes + dossiers.
// `folderId` côté local est `string | undefined` (clé omise quand absente, Rust
// utilise `Option<String>` + `skip_serializing_if`). Côté cloud, la colonne est
// `folder_id: string | null` (FK ON DELETE SET NULL). On normalise à la frontière.

export function mapNoteToCloud(meta: LocalNoteMeta, content: string): NotePayload {
  return {
    id: meta.id,
    title: meta.title,
    content_html: content,
    folder_id: meta.folderId ?? null,
    favorite: meta.favorite,
    order: meta.order,
    updated_at: meta.updatedAt,
  };
}

export function mapNoteFromCloud(row: CloudUserNoteRow): {
  meta: LocalNoteMeta;
  content: string;
} {
  return {
    meta: {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      favorite: row.favorite,
      ...(row.folder_id !== null && { folderId: row.folder_id }),
      order: row.order,
      ...(row.deleted_at !== null && { deletedAt: row.deleted_at }),
    },
    content: row.content_html,
  };
}

export function mapFolderToCloud(folder: LocalFolderMeta): FolderPayload {
  return {
    id: folder.id,
    name: folder.name,
    order: folder.order,
    updated_at: folder.updatedAt,
  };
}

export function mapFolderFromCloud(row: CloudUserFolderRow): LocalFolderMeta {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    order: row.order,
    ...(row.deleted_at !== null && { deletedAt: row.deleted_at }),
  };
}
