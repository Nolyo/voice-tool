import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./types";

// Service-role client. Bypasses RLS — use only in trusted Worker context.
// Never expose this client or its key to the browser/desktop client.
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(env: Env): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

export function _resetSupabaseClientForTest(): void {
  cachedClient = null;
}
