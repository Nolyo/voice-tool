import { invoke } from "@tauri-apps/api/core";
import { supabase } from "@/lib/supabase";
import type { BillingCycle, PlanTier } from "./plans";

export interface CheckoutOpenResult {
  opened_url: string;
}

async function describeFunctionsError(error: unknown): Promise<string> {
  // supabase-js wraps non-2xx responses in FunctionsHttpError, which carries
  // the original Response on `.context`. Without unwrapping, the message is
  // a generic "Edge Function returned a non-2xx status code", which makes
  // diagnosis impossible in production builds where DevTools is unavailable.
  const ctx = (error as { context?: Response }).context;
  if (ctx instanceof Response) {
    const body = await ctx.text().catch(() => "");
    return `${ctx.status} ${body || ctx.statusText}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function openCheckout(params: {
  tier: PlanTier;
  cycle: BillingCycle;
}): Promise<CheckoutOpenResult> {
  const { data, error } = await supabase.functions.invoke<{ checkout_url: string }>(
    "lemonsqueezy-create-checkout",
    { body: { plan: params.tier, cycle: params.cycle } },
  );
  if (error) {
    const detail = await describeFunctionsError(error);
    throw new Error(`create_checkout_failed: ${detail}`);
  }
  if (!data?.checkout_url) throw new Error("create_checkout_failed: missing url");

  return await invoke<CheckoutOpenResult>("open_checkout", {
    checkoutUrl: data.checkout_url,
  });
}
