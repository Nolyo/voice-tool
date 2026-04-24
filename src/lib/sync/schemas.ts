import { z } from "zod";

// Matches the Edge Function schema — keep in sync with supabase/functions/sync-push/schema.ts

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
    provider: z.enum(["OpenAI", "Google", "Local", "Groq"]),
    local_model: z.string().max(50),
  }),
});

export const CloudUserSettingsRowSchema = z.object({
  user_id: z.string().uuid(),
  data: CloudSettingsDataSchema,
  schema_version: z.number().int(),
  updated_at: z.string(),
  updated_by_device: z.string().nullable(),
});

export const CloudDictionaryWordRowSchema = z.object({
  user_id: z.string().uuid(),
  word: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export const CloudSnippetRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  label: z.string(),
  content: z.string(),
  shortcut: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export const PushResponseSchema = z.object({
  ok: z.boolean(),
  server_time: z.string().optional(),
  current_bytes: z.number().optional(),
  results: z.array(
    z.object({
      index: z.number(),
      ok: z.boolean(),
      error: z.string().optional(),
    })
  ),
  error: z.string().optional(),
  quota_bytes: z.number().optional(),
});
