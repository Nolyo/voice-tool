import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = await getAuthenticatedUser(req);
  if ("error" in auth) return json({ error: auth.error }, auth.status);

  const { userId, client } = auth;

  const [settings, dictionary, snippets, devices] = await Promise.all([
    client.from("user_settings").select("*").maybeSingle(),
    client.from("user_dictionary_words").select("*"),
    client.from("user_snippets").select("*"),
    client.from("user_devices").select("*"),
  ]);

  for (const r of [settings, dictionary, snippets, devices]) {
    if (r.error) return json({ error: r.error.message }, 500);
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

  return json(payload);
});
