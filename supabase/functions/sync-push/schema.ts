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
    provider: z.enum(["OpenAI", "Google", "Local", "Groq"]),
    local_model: z.string().max(50),
  }),
});

export const SnippetSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  shortcut: z.string().max(200).nullable(),
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
]);

export const PushBodySchema = z.object({
  operations: z.array(PushOperationSchema).min(1).max(200),
  device_id: z.string().max(100),
});

export const QUOTA_BYTES = 5 * 1024 * 1024;
