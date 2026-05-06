import { invoke } from "@tauri-apps/api/core";
import { supabase } from "@/lib/supabase";
import type { BillingCycle, PlanTier } from "./plans";

export interface CheckoutOpenResult {
  opened_url: string;
}

/**
 * Crée un checkout Lemon Squeezy à la volée via l'Edge Function dédiée,
 * puis ouvre l'URL retournée dans le navigateur par défaut. Le user_id
 * est attaché côté serveur dans `checkout_data.custom`, donc le webhook
 * peut rattacher l'abonnement sans qu'on le passe en query string.
 */
export async function openCheckout(params: {
  tier: PlanTier;
  cycle: BillingCycle;
}): Promise<CheckoutOpenResult> {
  const { data, error } = await supabase.functions.invoke<{ checkout_url: string }>(
    "lemonsqueezy-create-checkout",
    { body: { plan: params.tier, cycle: params.cycle } },
  );
  if (error) throw new Error(`create_checkout_failed: ${error.message}`);
  if (!data?.checkout_url) throw new Error("create_checkout_failed: missing url");

  return await invoke<CheckoutOpenResult>("open_checkout", {
    checkoutUrl: data.checkout_url,
  });
}
