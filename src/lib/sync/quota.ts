/**
 * Sync quota helpers — keeps client-side displays aligned with the
 * server-side `QUOTA_BY_PLAN` declared in `supabase/functions/sync-push/schema.ts`.
 *
 * The Edge Function is the source of truth: it computes the user's current
 * usage via `compute_user_sync_size()` then rejects the batch with
 * `413 quota_exceeded` (carrying `{ plan, used, limit }`) when the quota is
 * exceeded. These helpers are only used to render labels and the free-tier
 * upsell — never to gate writes.
 */

export const QUOTA_BY_PLAN = {
  free: 10 * 1024 * 1024, // 10 MB
  starter: 100 * 1024 * 1024, // 100 MB
  pro: 500 * 1024 * 1024, // 500 MB
} as const;

export type Plan = keyof typeof QUOTA_BY_PLAN;

/**
 * Returns the byte quota for a given plan string.
 * Unknown/missing plans fall back to `free`, mirroring the Edge Function
 * default in `getUserQuota()`.
 */
export function getQuotaForPlan(plan: string | undefined | null): number {
  if (plan && plan in QUOTA_BY_PLAN) {
    return QUOTA_BY_PLAN[plan as Plan];
  }
  return QUOTA_BY_PLAN.free;
}

/** 80% of the quota — used to trigger the soft "almost full" warning. */
export function getWarningThreshold(quota: number): number {
  return Math.floor(quota * 0.8);
}

/** Human-readable byte formatter. Mirrors the format used in inventory cards. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
