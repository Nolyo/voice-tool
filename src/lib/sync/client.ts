import { supabase } from "@/lib/supabase";
import type {
  CloudSettingsData,
  CloudUserSettingsRow,
  CloudDictionaryWordRow,
  CloudSnippetRow,
  SyncOperation,
} from "./types";
import {
  CloudUserSettingsRowSchema,
  CloudDictionaryWordRowSchema,
  CloudSnippetRowSchema,
  PushResponseSchema,
} from "./schemas";

export interface PullResult {
  settings: CloudUserSettingsRow | null;
  dictionary: CloudDictionaryWordRow[];
  snippets: CloudSnippetRow[];
  invalid: {
    settings: boolean;
    dictionary: number;
    snippets: number;
  };
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

  // Runtime validation — drop invalid rows, count them for visibility
  let settings: CloudUserSettingsRow | null = null;
  let invalidSettings = false;
  if (settingsRes.data) {
    const parsed = CloudUserSettingsRowSchema.safeParse(settingsRes.data);
    if (parsed.success) {
      settings = parsed.data as CloudUserSettingsRow;
    } else {
      invalidSettings = true;
      console.warn(
        "[sync pullAll] malformed user_settings row dropped",
        parsed.error.flatten()
      );
    }
  }

  let invalidDict = 0;
  const dictionary: CloudDictionaryWordRow[] = [];
  for (const row of dictRes.data ?? []) {
    const parsed = CloudDictionaryWordRowSchema.safeParse(row);
    if (parsed.success) {
      dictionary.push(parsed.data as CloudDictionaryWordRow);
    } else {
      invalidDict++;
      console.warn(
        "[sync pullAll] malformed user_dictionary_words row dropped",
        row,
        parsed.error.flatten()
      );
    }
  }

  let invalidSnip = 0;
  const snippets: CloudSnippetRow[] = [];
  for (const row of snipRes.data ?? []) {
    const parsed = CloudSnippetRowSchema.safeParse(row);
    if (parsed.success) {
      snippets.push(parsed.data as CloudSnippetRow);
    } else {
      invalidSnip++;
      console.warn(
        "[sync pullAll] malformed user_snippets row dropped",
        row,
        parsed.error.flatten()
      );
    }
  }

  return {
    settings,
    dictionary,
    snippets,
    invalid: {
      settings: invalidSettings,
      dictionary: invalidDict,
      snippets: invalidSnip,
    },
  };
}

export interface PushResponse {
  ok: boolean;
  server_time?: string;
  current_bytes?: number;
  results: Array<{ index: number; ok: boolean; error?: string }>;
  error?: string;
  quota_bytes?: number;
  status?: number;
}

export async function pushOperations(
  operations: SyncOperation[],
  deviceId: string
): Promise<PushResponse> {
  const { data, error } = await supabase.functions.invoke("sync-push", {
    body: { operations, device_id: deviceId },
  });
  if (error) {
    // FunctionsHttpError exposes the Response in error.context (>= 400).
    const ctx = (error as { context?: Response }).context;
    let status: number | undefined;
    let body: unknown = undefined;
    if (ctx && typeof ctx === "object" && "status" in ctx) {
      status = (ctx as Response).status;
      try {
        body = await (ctx as Response).clone().json();
      } catch {
        body = undefined;
      }
    }
    if (
      body &&
      typeof body === "object" &&
      "error" in (body as Record<string, unknown>)
    ) {
      const b = body as {
        error?: string;
        quota_bytes?: number;
        current_bytes?: number;
        results?: Array<{ index: number; ok: boolean; error?: string }>;
      };
      return {
        ok: false,
        error: b.error ?? error.message,
        results: b.results ?? [],
        quota_bytes: b.quota_bytes,
        current_bytes: b.current_bytes,
        status,
      };
    }
    return {
      ok: false,
      error: error.message,
      results: [],
      status,
    };
  }
  const parsed = PushResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(
      "[sync pushOperations] malformed edge response",
      data,
      parsed.error.flatten()
    );
    return { ok: false, error: "malformed edge response", results: [] };
  }
  return parsed.data;
}

/** Envoie uniquement le blob settings (upsert). Retourne l'erreur éventuelle. */
export async function pushSettings(data: CloudSettingsData, deviceId: string) {
  return pushOperations([{ kind: "settings-upsert", data }], deviceId);
}
