// deno-lint-ignore-file no-explicit-any
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { isRateLimited } from "../_shared/rate-limit.ts";
import { PushBodySchema, QUOTA_BYTES } from "./schema.ts";

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
  const { operations, device_id } = parsed.data;

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
                data: op.data,
                updated_by_device: device_id,
                updated_at: nowIso,
              },
              { onConflict: "user_id" }
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
                word: op.word,
                deleted_at: null,
                updated_at: nowIso,
              },
              { onConflict: "user_id,word" }
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
                word: op.word,
                deleted_at: nowIso,
                updated_at: nowIso,
              },
              { onConflict: "user_id,word" }
            );
          if (error) throw error;
          break;
        }
        case "snippet-upsert": {
          const { error } = await client.from("user_snippets").upsert(
            {
              id: op.snippet.id,
              user_id: userId,
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
      }
      results.push({ index: i, ok: true });
    } catch (e: any) {
      results.push({ index: i, ok: false, error: String(e?.message ?? e) });
    }
  }

  // Quota check après l'application — rejet si > seuil, client doit supprimer du contenu
  const { data: sizeData, error: sizeErr } = await client.rpc("compute_user_sync_size", {
    target_user: userId,
  });
  if (sizeErr) {
    return json(req, { error: "quota check failed", details: sizeErr.message }, 500);
  }
  const size = Number(sizeData ?? 0);
  if (size > QUOTA_BYTES) {
    return json(
      req,
      {
        error: "quota exceeded",
        quota_bytes: QUOTA_BYTES,
        current_bytes: size,
        results,
      },
      413
    );
  }

  return json(req, { ok: true, server_time: nowIso, current_bytes: size, results });
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
