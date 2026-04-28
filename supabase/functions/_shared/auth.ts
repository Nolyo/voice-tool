// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** Extrait le user_id depuis le JWT présenté dans Authorization: Bearer <token>.
 *  Retourne { userId, client } où client a les permissions du user (RLS actif). */
export async function getAuthenticatedUser(req: Request): Promise<
  | { userId: string; client: SupabaseClient<any, any, any>; token: string }
  | { error: string; status: number }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "missing or invalid Authorization header", status: 401 };
  }
  const token = authHeader.slice("Bearer ".length);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { error: "server misconfigured", status: 500 };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { error: "invalid token", status: 401 };
  }
  return { userId: data.user.id, client, token };
}
