// deno-lint-ignore-file no-explicit-any
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

export interface AccountExportDeps {
  authenticate: (req: Request) => Promise<
    | { userId: string; client: SupabaseClient<any, any, any>; token?: string }
    | { error: string; status: number }
  >;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export async function handler(req: Request, deps: AccountExportDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  const auth = await deps.authenticate(req);
  if ("error" in auth) return json(req, { error: auth.error }, auth.status);

  const { userId, client } = auth;

  const [settings, dictionary, snippets, devices] = await Promise.all([
    client.from("user_settings").select("*").maybeSingle(),
    client.from("user_dictionary_words").select("*"),
    client.from("user_snippets").select("*"),
    client.from("user_devices").select("*"),
  ]);

  for (const r of [settings, dictionary, snippets, devices]) {
    if (r.error) return json(req, { error: r.error.message }, 500);
  }

  const payload = {
    export_version: 1,
    exported_at: new Date().toISOString(),
    user_id: userId,
    user_settings: settings.data,
    user_dictionary_words: dictionary.data,
    user_snippets: snippets.data,
    user_devices: devices.data,
  };

  return json(req, payload);
}

if (import.meta.main) {
  Deno.serve((req) => handler(req, { authenticate: getAuthenticatedUser }));
}
