// Shape du blob côté cloud (matche la spec nested).
export interface CloudSettingsData {
  ui: {
    theme: "light" | "dark";
    language: "fr" | "en";
  };
  hotkeys: {
    toggle: string;
    push_to_talk: string;
    open_window: string;
  };
  features: {
    auto_paste: "cursor" | "clipboard" | "none";
    sound_effects: boolean;
  };
  transcription: {
    // Wide enum kept for backward-compat when pulling settings from older clients
    // that may still hold "OpenAI" | "Google" | "Groq". applyCloudSettings clamps
    // these legacy values to "Local" before applying. New writes only emit
    // "Local" | "LexenaCloud".
    provider: "OpenAI" | "Google" | "Local" | "Groq" | "LexenaCloud";
    local_model: string;
  };
}

// Rows côté cloud
export interface CloudUserSettingsRow {
  user_id: string;
  profile_id: string;
  data: CloudSettingsData;
  schema_version: number;
  updated_at: string; // ISO
  updated_by_device: string | null;
}

export interface CloudDictionaryWordRow {
  user_id: string;
  profile_id: string;
  word: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CloudSnippetRow {
  id: string; // uuid
  user_id: string;
  profile_id: string;
  label: string;
  content: string;
  shortcut: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Shape côté client (Tauri Store) pour snippets
export interface LocalSnippet {
  id: string; // uuid
  label: string;
  content: string;
  shortcut: string | null;
  updated_at: string; // ISO — trace côté client pour debug
  deleted_at: string | null;
  created_at: string;
}

export interface LocalDictionary {
  words: string[];
  tombstones: string[]; // mots supprimés mais pas encore push
  updated_at: string;
}

// Queue entries (persistées dans Tauri Store)
export type SyncOperation =
  | { kind: "settings-upsert"; data: CloudSettingsData }
  | { kind: "dictionary-upsert"; word: string }
  | { kind: "dictionary-delete"; word: string }
  | { kind: "snippet-upsert"; snippet: LocalSnippet }
  | { kind: "snippet-delete"; id: string }
  | { kind: "note-upsert"; note: NotePayload }
  | { kind: "note-delete"; id: string }
  | { kind: "folder-upsert"; folder: FolderPayload }
  | { kind: "folder-delete"; id: string }
  | { kind: "profile-upsert"; profile: ProfilePayload }
  | { kind: "profile-delete"; id: string };

export interface SyncQueueEntry {
  id: string; // uuid local de l'entrée queue (idempotence côté client)
  operation: SyncOperation;
  enqueued_at: string;
  retry_count: number;
  last_error: string | null;
  next_retry_at: string | null; // ISO — null = ready immediately
}

// État global
export type SyncStatus =
  | "disabled"
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "quota-exceeded";

export interface SyncState {
  enabled: boolean;
  status: SyncStatus;
  last_sync_at: string | null;
  last_pull_at: string | null;
  pending_count: number;
  last_error: string | null;
  /**
   * Number of active local notes that exceed the 1 MB hard cap and therefore
   * cannot be synced. They stay local-only; the UI warns the user. Computed on
   * activation and once per session when sync is enabled.
   */
  oversized_note_count: number;
}

// ── Sub-épique 03 sync-notes ─────────────────────────────────────────────────

/** Payload pushed to the cloud for a note. Server forces deleted_at: null on upsert. */
export interface NotePayload {
  id: string;
  title: string;
  content_html: string;
  folder_id: string | null;
  favorite: boolean;
  order: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface FolderPayload {
  id: string;
  name: string;
  /** Emoji icon; null clears it. Travels in the same LWW row as the name. */
  icon: string | null;
  order: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfilePayload {
  id: string;
  name: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CloudUserProfileRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Local NoteMeta shape (matches Rust NoteMeta camelCase serialization). */
export interface LocalNoteMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  folderId?: string; // missing key when None server-side
  order: number;
  deletedAt?: string;
  /** True = never synced to the cloud (explicit per-note opt-out, PR3). */
  localOnly?: boolean;
}

export interface LocalFolderMeta {
  id: string;
  name: string;
  /** Emoji icon; key absent = default folder glyph. */
  icon?: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  deletedAt?: string;
}

export interface CloudUserNoteRow {
  id: string;
  user_id: string;
  profile_id: string;
  title: string;
  content_html: string;
  folder_id: string | null;
  favorite: boolean;
  order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CloudUserFolderRow {
  id: string;
  user_id: string;
  profile_id: string;
  name: string;
  /** Optional to tolerate a pre-migration DB row. */
  icon?: string | null;
  order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
