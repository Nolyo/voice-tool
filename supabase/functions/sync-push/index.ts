// deno-lint-ignore-file no-explicit-any
import { type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { isRateLimited } from "../_shared/rate-limit.ts";
import { PushBodySchema, QUOTA_BY_PLAN } from "./schema.ts";

const ACTIVE_SUBSCRIPTION_STATUSES: readonly string[] = ["active", "on_trial"];

/**
 * Résout la limite de quota d'un user en fonction de sa subscription active.
 * - Absence de row, statut non actif, ou plan inconnu → fallback `free` (10 MB).
 * - Sinon, retourne le plan + sa limite issus de `QUOTA_BY_PLAN`.
 */
export async function getUserQuota(
  client: SupabaseClient<any, any, any>,
  userId: string,
): Promise<{ plan: string; limit: number }> {
  const { data } = await client
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || !ACTIVE_SUBSCRIPTION_STATUSES.includes(data.status)) {
    return { plan: "free", limit: QUOTA_BY_PLAN.free };
  }
  const plan = String(data.plan);
  const limit = QUOTA_BY_PLAN[plan as keyof typeof QUOTA_BY_PLAN] ?? QUOTA_BY_PLAN.free;
  return { plan, limit };
}

export interface SyncPushDeps {
  authenticate: (req: Request) => Promise<
    | { userId: string; client: SupabaseClient<any, any, any>; token?: string }
    | { error: string; status: number }
  >;
  /** Optional rate-limit gate. Returns true if the request should be rejected. */
  rateLimit?: (userId: string, client: SupabaseClient<any, any, any>) => Promise<boolean>;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export async function handler(req: Request, deps: SyncPushDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  const auth = await deps.authenticate(req);
  if ("error" in auth) return json(req, { error: auth.error }, auth.status);

  if (deps.rateLimit && (await deps.rateLimit(auth.userId, auth.client))) {
    return json(req, { error: "rate limited" }, 429);
  }

  const raw = await req.json().catch(() => null);
  const parsed = PushBodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(req, { error: "invalid body", details: parsed.error.flatten() }, 400);
  }
  const { operations, device_id, profile_id } = parsed.data;

  const { userId, client } = auth;
  const nowIso = new Date().toISOString();
  const results: Array<{ index: number; ok: boolean; error?: string }> = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    try {
      switch (op.kind) {
        case "settings-upsert": {
          const { error } = await client
            .from("user_settings")
            .upsert(
              {
                user_id: userId,
                profile_id,
                data: op.data,
                updated_by_device: device_id,
                updated_at: nowIso,
              },
              { onConflict: "user_id,profile_id" }
            );
          if (error) throw error;
          break;
        }
        case "dictionary-upsert": {
          const { error } = await client
            .from("user_dictionary_words")
            .upsert(
              {
                user_id: userId,
                profile_id,
                word: op.word,
                deleted_at: null,
                updated_at: nowIso,
              },
              { onConflict: "user_id,profile_id,word" }
            );
          if (error) throw error;
          break;
        }
        case "dictionary-delete": {
          // Soft delete via update pour que les autres devices le propagent
          const { error } = await client
            .from("user_dictionary_words")
            .upsert(
              {
                user_id: userId,
                profile_id,
                word: op.word,
                deleted_at: nowIso,
                updated_at: nowIso,
              },
              { onConflict: "user_id,profile_id,word" }
            );
          if (error) throw error;
          break;
        }
        case "snippet-upsert": {
          const { error } = await client.from("user_snippets").upsert(
            {
              id: op.snippet.id,
              user_id: userId,
              profile_id,
              label: op.snippet.label,
              content: op.snippet.content,
              shortcut: op.snippet.shortcut,
              deleted_at: null,
              updated_at: nowIso,
            },
            { onConflict: "id" }
          );
          if (error) throw error;
          break;
        }
        case "snippet-delete": {
          const { error } = await client
            .from("user_snippets")
            .update({ deleted_at: nowIso, updated_at: nowIso })
            .eq("id", op.id)
            .eq("user_id", userId);
          if (error) throw error;
          break;
        }
        case "note-upsert": {
          // Taille de `content_html` : Zod (max 1_048_576 code units) rejette avant ce point ;
          // la DB applique en plus un CHECK `octet_length <= 1_048_576` côté bytes UTF-8 comme autorité finale.
          const { error } = await client.from("user_notes").upsert(
            {
              id: op.note.id,
              user_id: userId,
              profile_id,
              title: op.note.title,
              content_html: op.note.content_html,
              folder_id: op.note.folder_id,
              favorite: op.note.favorite,
              order: op.note.order,
              deleted_at: null,
              updated_at: nowIso,
            },
            { onConflict: "id" },
          );
          if (error) throw error;
          break;
        }
        case "note-delete": {
          const { error } = await client
            .from("user_notes")
            .update({ deleted_at: nowIso, updated_at: nowIso })
            .eq("id", op.id)
            .eq("user_id", userId);
          if (error) throw error;
          break;
        }
        case "folder-upsert": {
          const { error } = await client.from("user_folders").upsert(
            {
              id: op.folder.id,
              user_id: userId,
              profile_id,
              name: op.folder.name,
              order: op.folder.order,
              deleted_at: null,
              updated_at: nowIso,
            },
            { onConflict: "id" },
          );
          if (error) throw error;
          break;
        }
        case "folder-delete": {
          const { error } = await client
            .from("user_folders")
            .update({ deleted_at: nowIso, updated_at: nowIso })
            .eq("id", op.id)
            .eq("user_id", userId);
          if (error) throw error;
          break;
        }
        case "profile-upsert": {
          const { error } = await client.from("user_profiles").upsert(
            {
              id: op.profile.id,
              user_id: userId,
              name: op.profile.name,
              deleted_at: null,
              updated_at: nowIso,
            },
            { onConflict: "id" },
          );
          if (error) throw error;
          break;
        }
        case "profile-delete": {
          const { error } = await client
            .from("user_profiles")
            .update({ deleted_at: nowIso, updated_at: nowIso })
            .eq("id", op.id)
            .eq("user_id", userId);
          if (error) throw error;
          break;
        }
        default: {
          const _exhaustive: never = op;
          throw new Error(`unhandled op kind: ${(_exhaustive as { kind: string }).kind}`);
        }
      }
      results.push({ index: i, ok: true });
    } catch (e: any) {
      results.push({ index: i, ok: false, error: String(e?.message ?? e) });
    }
  }

  // Quota check après l'application — rejet si > seuil, client doit supprimer du contenu.
  // La limite est dérivée du plan utilisateur via `getUserQuota()` (free 10 MB par défaut).
  const { data: sizeData, error: sizeErr } = await client.rpc("compute_user_sync_size", {
    target_user: userId,
  });
  if (sizeErr) {
    return json(req, { error: "quota check failed", details: sizeErr.message }, 500);
  }
  const size = Number(sizeData ?? 0);
  const { plan, limit } = await getUserQuota(client, userId);
  if (size > limit) {
    return json(
      req,
      {
        error: "quota_exceeded",
        plan,
        used: size,
        limit,
        results,
      },
      413,
    );
  }

  return json(req, { ok: true, server_time: nowIso, current_bytes: size, plan, limit, results });
}

if (import.meta.main) {
  Deno.serve((req) =>
    handler(req, {
      authenticate: getAuthenticatedUser,
      // 60 push/min per user — generous for legit clients, throttles spam.
      rateLimit: (userId, client) => isRateLimited(client, `sync-push:${userId}`, 60, 60),
    }),
  );
}
