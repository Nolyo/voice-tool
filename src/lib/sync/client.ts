import { supabase } from "@/lib/supabase";
import type {
  CloudSettingsData,
  CloudUserSettingsRow,
  CloudDictionaryWordRow,
  CloudSnippetRow,
  CloudUserNoteRow,
  CloudUserFolderRow,
  CloudUserProfileRow,
  SyncOperation,
} from "./types";
import {
  CloudUserSettingsRowSchema,
  CloudDictionaryWordRowSchema,
  CloudSnippetRowSchema,
  CloudUserNoteRowSchema,
  CloudUserFolderRowSchema,
  CloudUserProfileRowSchema,
  PushResponseSchema,
} from "./schemas";

export interface PullResult {
  settings: CloudUserSettingsRow | null;
  dictionary: CloudDictionaryWordRow[];
  snippets: CloudSnippetRow[];
  notes: CloudUserNoteRow[];
  folders: CloudUserFolderRow[];
  profiles: CloudUserProfileRow[];
  invalid: {
    settings: boolean;
    dictionary: number;
    snippets: number;
    notes: number;
    folders: number;
    profiles: number;
  };
}

/** Pull FULL ou INCREMENTAL (since = ISO timestamp, null = full). */
export async function pullAll(
  since: string | null,
  profileId: string
): Promise<PullResult> {
  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    throw new Error("not authenticated");
  }

  const settingsQuery = supabase
    .from("user_settings")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  const dictQuery = since
    ? supabase.from("user_dictionary_words").select("*").eq("profile_id", profileId).gt("updated_at", since)
    : supabase.from("user_dictionary_words").select("*").eq("profile_id", profileId);
  const snipQuery = since
    ? supabase.from("user_snippets").select("*").eq("profile_id", profileId).gt("updated_at", since)
    : supabase.from("user_snippets").select("*").eq("profile_id", profileId);
  // Sub-épique 03 sync-notes : on récupère TOUTES les rows depuis `since`,
  // y compris les tombstones (deleted_at IS NOT NULL) pour que le merge côté
  // client propage les soft-deletes. Aucun filtre extra.
  const notesQuery = since
    ? supabase.from("user_notes").select("*").eq("profile_id", profileId).gt("updated_at", since)
    : supabase.from("user_notes").select("*").eq("profile_id", profileId);
  const foldersQuery = since
    ? supabase.from("user_folders").select("*").eq("profile_id", profileId).gt("updated_at", since)
    : supabase.from("user_folders").select("*").eq("profile_id", profileId);

  const [settingsRes, dictRes, snipRes, notesRes, foldersRes] = await Promise.all([
    settingsQuery,
    dictQuery,
    snipQuery,
    notesQuery,
    foldersQuery,
  ]);

  if (settingsRes.error) throw settingsRes.error;
  if (dictRes.error) throw dictRes.error;
  if (snipRes.error) throw snipRes.error;
  if (notesRes.error) throw notesRes.error;
  if (foldersRes.error) throw foldersRes.error;

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

  let invalidNotes = 0;
  const notes: CloudUserNoteRow[] = [];
  for (const row of notesRes.data ?? []) {
    const parsed = CloudUserNoteRowSchema.safeParse(row);
    if (parsed.success) {
      notes.push(parsed.data as CloudUserNoteRow);
    } else {
      invalidNotes++;
      console.warn(
        "[sync pullAll] malformed user_notes row dropped",
        row,
        parsed.error.flatten()
      );
    }
  }

  let invalidFolders = 0;
  const folders: CloudUserFolderRow[] = [];
  for (const row of foldersRes.data ?? []) {
    const parsed = CloudUserFolderRowSchema.safeParse(row);
    if (parsed.success) {
      folders.push(parsed.data as CloudUserFolderRow);
    } else {
      invalidFolders++;
      console.warn(
        "[sync pullAll] malformed user_folders row dropped",
        row,
        parsed.error.flatten()
      );
    }
  }

  return {
    settings,
    dictionary,
    snippets,
    notes,
    folders,
    profiles: [], // Plan A: pull du registre profils différé à Plan B
    invalid: {
      settings: invalidSettings,
      dictionary: invalidDict,
      snippets: invalidSnip,
      notes: invalidNotes,
      folders: invalidFolders,
      profiles: 0,
    },
  };
}

/**
 * Pull the account-wide `user_profiles` registry (all active profiles of the
 * signed-in user, across every device). RLS scopes to `auth.uid()`, so this is
 * NOT scoped by profile_id — it's how a fresh device discovers the profiles that
 * already exist in the cloud. Tombstoned profiles (deleted_at) are excluded.
 * Malformed rows are dropped (counted in `invalid`) rather than aborting.
 */
export async function pullProfilesRegistry(): Promise<{
  profiles: CloudUserProfileRow[];
  invalid: number;
}> {
  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    throw new Error("not authenticated");
  }
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .is("deleted_at", null);
  if (error) throw error;

  let invalid = 0;
  const profiles: CloudUserProfileRow[] = [];
  for (const row of data ?? []) {
    const parsed = CloudUserProfileRowSchema.safeParse(row);
    if (parsed.success) {
      profiles.push(parsed.data as CloudUserProfileRow);
    } else {
      invalid++;
      console.warn(
        "[sync pullProfilesRegistry] malformed user_profiles row dropped",
        row,
        parsed.error.flatten()
      );
    }
  }
  return { profiles, invalid };
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
  deviceId: string,
  profileId: string
): Promise<PushResponse> {
  const { data, error } = await supabase.functions.invoke("sync-push", {
    body: { operations, device_id: deviceId, profile_id: profileId },
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
export async function pushSettings(data: CloudSettingsData, deviceId: string, profileId: string) {
  return pushOperations([{ kind: "settings-upsert", data }], deviceId, profileId);
}
