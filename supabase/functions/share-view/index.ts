import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { publicCorsHeaders, publicPreflight } from "../_shared/cors-public.ts";

export interface ShareViewDeps {
  client: SupabaseClient;
}

export function isValidSlug(s: string): boolean {
  return /^[0-9A-Za-z]{16}$/.test(s);
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...publicCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function slugFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("s");
  return q;
}

export async function handleShareView(req: Request, deps: ShareViewDeps): Promise<Response> {
  const slug = slugFromRequest(req);
  if (!slug || !isValidSlug(slug)) return json(req, { error: "invalid_slug" }, 400);

  const { data: share } = await deps.client
    .from("note_shares")
    .select("note_id,user_id")
    .eq("slug", slug)
    .is("revoked_at", null)
    .maybeSingle();
  if (!share) return json(req, { error: "not_found" }, 404);

  const { data: note } = await deps.client
    .from("user_notes")
    .select("title,content_html,updated_at")
    .eq("id", (share as { note_id: string }).note_id)
    .eq("user_id", (share as { user_id: string }).user_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!note) return json(req, { error: "not_found" }, 404);

  const n = note as { title: string; content_html: string; updated_at: string };
  return json(req, { title: n.title, contentHtml: n.content_html, updatedAt: n.updated_at });
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return publicPreflight(req);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return handleShareView(req, { client });
});
