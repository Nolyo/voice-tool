import { z } from "npm:zod@3.23.8";

export const CloudSettingsDataSchema = z.object({
  ui: z.object({
    theme: z.enum(["light", "dark"]),
    language: z.enum(["fr", "en"]),
  }),
  hotkeys: z.object({
    toggle: z.string().max(100),
    push_to_talk: z.string().max(100),
    open_window: z.string().max(100),
  }),
  features: z.object({
    auto_paste: z.enum(["cursor", "clipboard", "none"]),
    sound_effects: z.boolean(),
  }),
  transcription: z.object({
    // "LexenaCloud" est sélectionnable côté UI depuis sub-épiques 04 billing / 05 managed
    // transcription : on doit l'accepter en push pour synchroniser la préférence utilisateur.
    // Les legacy "OpenAI"/"Google"/"Groq" restent acceptés pour pull rétro-compat (clampés
    // à "Local" côté client via applyCloudSettings).
    provider: z.enum(["OpenAI", "Google", "Local", "Groq", "LexenaCloud"]),
    local_model: z.string().max(50),
  }),
});

export const SnippetSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  shortcut: z.string().max(200).nullable(),
});

// Sub-épique 03 sync-notes : payloads notes + dossiers.
// Hard cap content_html = 1 MB (1_048_576) — aligné avec la contrainte SQL `octet_length(content_html) <= 1048576`.
// Zod compte en code units UTF-16 ; côté DB c'est des octets. Mismatch possible sur contenus multibytes,
// mais on accepte cette approximation côté ingress (la DB constraint reste l'autorité finale).
// `updated_at` / `deleted_at` : `{ offset: true }` car Rust `chrono::Utc::now().to_rfc3339()` émet
// `+00:00` (RFC 3339 valide) et non `Z`. `deleted_at` est `.optional()` parce que le serveur force
// `null` côté handler sur les upserts — laisser le client l'omettre est valide.
const offsetDatetime = () => z.string().datetime({ offset: true });

export const NotePayloadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  content_html: z.string().max(1_048_576),
  folder_id: z.string().uuid().nullable(),
  favorite: z.boolean(),
  order: z.number().int(),
  updated_at: offsetDatetime(),
  deleted_at: offsetDatetime().nullable().optional(),
});

export const FolderPayloadSchema = z.object({
  id: z.string().uuid(),
  // .min(1) mirrors DB CHECK (char_length(name) between 1 and 200). Title côté note n'a pas de min DB
  // (default ''), donc on laisse `NotePayloadSchema.title` sans `.min(1)`.
  name: z.string().min(1).max(200),
  order: z.number().int(),
  updated_at: offsetDatetime(),
  deleted_at: offsetDatetime().nullable().optional(),
});

// Sub-épique sync-multi-profile (A3) : payload profil utilisateur.
export const ProfilePayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  updated_at: offsetDatetime(),
  deleted_at: offsetDatetime().nullable().optional(),
});

export const PushOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("settings-upsert"),
    data: CloudSettingsDataSchema,
  }),
  z.object({
    kind: z.literal("dictionary-upsert"),
    word: z.string().min(1).max(100),
  }),
  z.object({
    kind: z.literal("dictionary-delete"),
    word: z.string().min(1).max(100),
  }),
  z.object({
    kind: z.literal("snippet-upsert"),
    snippet: SnippetSchema,
  }),
  z.object({
    kind: z.literal("snippet-delete"),
    id: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("note-upsert"),
    note: NotePayloadSchema,
  }),
  z.object({
    kind: z.literal("note-delete"),
    id: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("folder-upsert"),
    folder: FolderPayloadSchema,
  }),
  z.object({
    kind: z.literal("folder-delete"),
    id: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("profile-upsert"),
    profile: ProfilePayloadSchema,
  }),
  z.object({
    kind: z.literal("profile-delete"),
    id: z.string().uuid(),
  }),
]);

export const PushBodySchema = z.object({
  profile_id: z.string().uuid(),
  operations: z.array(PushOperationSchema).min(1).max(200),
  device_id: z.string().max(100),
});

/**
 * Quota par plan en bytes — v3 sub-épique 03.
 * - free : 10 MB (gratuit, par défaut quand pas de row `subscriptions` ou statut inactif)
 * - starter : 100 MB
 * - pro : 500 MB
 */
export const QUOTA_BY_PLAN = {
  free: 10 * 1024 * 1024,
  starter: 100 * 1024 * 1024,
  pro: 500 * 1024 * 1024,
} as const;
