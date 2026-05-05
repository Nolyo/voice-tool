/**
 * Définition canonique des 4 variantes Lemon Squeezy.
 * Les variant_ids sont des valeurs publiques (apparaissent dans l'URL de checkout).
 * Cf. ADR 0013 (premium offer).
 */

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
  /** URL de checkout Lemon Squeezy (publique, store-test ou prod selon env). */
  checkout_url: string;
  /** Variant ID Lemon Squeezy (matché côté Edge Function via env). */
  variant_id: string;
}

// IMPORTANT : ces valeurs sont des PLACEHOLDERS pré-prod. À remplacer par
// les vrais variant_ids et checkout URLs dès que le Store Lemon Squeezy
// production est créé. Côté webhook, les variant_ids doivent matcher
// LEMON_SQUEEZY_{TIER}_{CYCLE}_VARIANT_ID.
//
// La variable d'env Vite `VITE_LEMON_SQUEEZY_STORE_SUBDOMAIN` permet de
// pointer dev vs prod. À défaut, fallback sur le store de test.

const STORE_SUBDOMAIN =
  import.meta.env.VITE_LEMON_SQUEEZY_STORE_SUBDOMAIN ?? "lexena-test";

function checkoutUrl(slug: string): string {
  return `https://${STORE_SUBDOMAIN}.lemonsqueezy.com/buy/${slug}`;
}

export const PLANS: Record<PlanKey, PlanMetadata> = {
  starter_monthly: {
    tier: "starter",
    cycle: "monthly",
    price_eur: 5,
    quota_minutes: 400,
    checkout_url: checkoutUrl(import.meta.env.VITE_LS_STARTER_MONTHLY_SLUG ?? "PLACEHOLDER"),
    variant_id: import.meta.env.VITE_LS_STARTER_MONTHLY_VARIANT_ID ?? "PLACEHOLDER",
  },
  starter_annual: {
    tier: "starter",
    cycle: "annual",
    price_eur: 49,
    quota_minutes: 400,
    checkout_url: checkoutUrl(import.meta.env.VITE_LS_STARTER_ANNUAL_SLUG ?? "PLACEHOLDER"),
    variant_id: import.meta.env.VITE_LS_STARTER_ANNUAL_VARIANT_ID ?? "PLACEHOLDER",
  },
  pro_monthly: {
    tier: "pro",
    cycle: "monthly",
    price_eur: 9,
    quota_minutes: 1000,
    checkout_url: checkoutUrl(import.meta.env.VITE_LS_PRO_MONTHLY_SLUG ?? "PLACEHOLDER"),
    variant_id: import.meta.env.VITE_LS_PRO_MONTHLY_VARIANT_ID ?? "PLACEHOLDER",
  },
  pro_annual: {
    tier: "pro",
    cycle: "annual",
    price_eur: 89,
    quota_minutes: 1000,
    checkout_url: checkoutUrl(import.meta.env.VITE_LS_PRO_ANNUAL_SLUG ?? "PLACEHOLDER"),
    variant_id: import.meta.env.VITE_LS_PRO_ANNUAL_VARIANT_ID ?? "PLACEHOLDER",
  },
};

export function getPlan(tier: PlanTier, cycle: BillingCycle): PlanMetadata {
  return PLANS[`${tier}_${cycle}`];
}
