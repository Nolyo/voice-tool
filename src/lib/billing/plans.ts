/**
 * Métadonnées des plans premium (display + quota).
 * Les variant_ids et l'URL de checkout sont gérés côté Edge Function
 * `lemonsqueezy-create-checkout` (cf. ADR 0013, plan billing 2026-05-05).
 */

// Lemon Squeezy is still in test mode — flip to true once production
// payments are validated. While false, all subscribe/renew CTAs are
// disabled in the UI and a "coming soon" banner is shown instead.
export const BILLING_ENABLED = false;

export type PlanTier = "starter" | "pro";
export type BillingCycle = "monthly" | "annual";
export type PlanKey = `${PlanTier}_${BillingCycle}`;

export interface PlanMetadata {
  tier: PlanTier;
  cycle: BillingCycle;
  /** Prix affiché à l'utilisateur (TTC, EUR). */
  price_eur: number;
  /** Quota minutes incluses par mois. */
  quota_minutes: number;
}

export const PLANS: Record<PlanKey, PlanMetadata> = {
  starter_monthly: { tier: "starter", cycle: "monthly", price_eur: 5, quota_minutes: 400 },
  starter_annual: { tier: "starter", cycle: "annual", price_eur: 49, quota_minutes: 400 },
  pro_monthly: { tier: "pro", cycle: "monthly", price_eur: 9, quota_minutes: 1000 },
  pro_annual: { tier: "pro", cycle: "annual", price_eur: 89, quota_minutes: 1000 },
};

export function getPlan(tier: PlanTier, cycle: BillingCycle): PlanMetadata {
  return PLANS[`${tier}_${cycle}`];
}
