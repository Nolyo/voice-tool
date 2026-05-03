import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY — check .env.local",
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // We manage persistence ourselves via the OS keyring (see AuthContext).
    persistSession: false,
    autoRefreshToken: true,
    // Never use URL detection — the Rust deep-link handler does that.
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

export const AUTH_CALLBACK_URL =
  import.meta.env.VITE_AUTH_CALLBACK_URL ??
  "https://auth.lexena.app";

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? "";

if (import.meta.env.PROD && !TURNSTILE_SITE_KEY) {
  // Soft-locking signup is worse than a noisy crash. Catch the misconfiguration immediately.
  throw new Error(
    "VITE_TURNSTILE_SITE_KEY is required in production builds. " +
    "Set it in your build environment before running `pnpm tauri build`. " +
    "Dev workstations can use the Cloudflare always-pass test key 1x00000000000000000000AA."
  );
}
