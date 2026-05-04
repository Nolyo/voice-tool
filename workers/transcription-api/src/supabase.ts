import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./types";

// Server-side admin client (Supabase "Secret key", successor of legacy service_role).
// Bypasses RLS — use only in trusted Worker context. Never expose to browser/desktop.
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(env: Env): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
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
