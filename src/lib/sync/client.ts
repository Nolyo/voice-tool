import { supabase } from "@/lib/supabase";
import type {
  CloudSettingsData,
  CloudUserSettingsRow,
  CloudDictionaryWordRow,
  CloudSnippetRow,
  SyncOperation,
} from "./types";

export interface PullResult {
  settings: CloudUserSettingsRow | null;
  dictionary: CloudDictionaryWordRow[];
  snippets: CloudSnippetRow[];
}

/** Pull FULL ou INCREMENTAL (since = ISO timestamp, null = full). */
export async function pullAll(since: string | null): Promise<PullResult> {
  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    throw new Error("not authenticated");
  }

  const settingsQuery = supabase.from("user_settings").select("*").maybeSingle();
  const dictQuery = since
    ? supabase.from("user_dictionary_words").select("*").gt("updated_at", since)
    : supabase.from("user_dictionary_words").select("*");
  const snipQuery = since
    ? supabase.from("user_snippets").select("*").gt("updated_at", since)
    : supabase.from("user_snippets").select("*");

  const [settingsRes, dictRes, snipRes] = await Promise.all([
    settingsQuery,
    dictQuery,
    snipQuery,
  ]);

  if (settingsRes.error) throw settingsRes.error;
  if (dictRes.error) throw dictRes.error;
  if (snipRes.error) throw snipRes.error;

  return {
    settings: (settingsRes.data as CloudUserSettingsRow | null) ?? null,
    dictionary: (dictRes.data ?? []) as CloudDictionaryWordRow[],
    snippets: (snipRes.data ?? []) as CloudSnippetRow[],
  };
}

export interface PushResponse {
  ok: boolean;
  server_time?: string;
  current_bytes?: number;
  results: Array<{ index: number; ok: boolean; error?: string }>;
  error?: string;
  quota_bytes?: number;
}

export async function pushOperations(
  operations: SyncOperation[],
  deviceId: string
): Promise<PushResponse> {
  const { data, error } = await supabase.functions.invoke<PushResponse>("sync-push", {
    body: { operations, device_id: deviceId },
  });
  if (error) {
    // Le Functions client throw sur status >= 400, capturer proprement :
    return {
      ok: false,
      error: error.message,
      results: [],
    };
  }
  return data ?? { ok: false, error: "empty response", results: [] };
}

/** Envoie uniquement le blob settings (upsert). Retourne l'erreur éventuelle. */
export async function pushSettings(data: CloudSettingsData, deviceId: string) {
  return pushOperations([{ kind: "settings-upsert", data }], deviceId);
}
