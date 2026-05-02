// deno-lint-ignore-file no-explicit-any
import { type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

/**
 * Returns true if the operation should be rejected (rate-limit exceeded).
 *
 * Wraps the public.check_rate_limit RPC which inserts an audit row + returns
 * whether the count over the sliding window has crossed maxCount.
 *
 * `key` should namespace by both action and user, e.g. "sync-push:<uuid>".
 *
 * On infra failure (RPC error / network), this fails OPEN (returns false) to
 * avoid blocking legitimate users when the rate-limit table is unhealthy.
 */
export async function isRateLimited(
  client: SupabaseClient<any, any, any>,
  key: string,
  windowSeconds: number,
  maxCount: number,
): Promise<boolean> {
  const { data, error } = await client.rpc("check_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max_count: maxCount,
  });
  if (error) {
    console.log(JSON.stringify({
      event: "rate_limit_check_error",
      key,
      message: error.message,
    }));
    return false;
  }
  return Boolean(data);
}
