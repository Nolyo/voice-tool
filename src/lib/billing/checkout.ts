import { invoke } from "@tauri-apps/api/core";
import { supabase } from "@/lib/supabase";
import type { BillingCycle, PlanTier } from "./plans";

export interface CheckoutOpenResult {
  opened_url: string;
}

async function describeFunctionsError(error: unknown): Promise<string> {
  // supabase-js wraps various failure modes in FunctionsError subclasses.
  // The original cause is on `.context` — a Response for HTTP errors, or
  // the underlying TypeError for fetch failures. Both must be unwrapped
  // since prod builds have no DevTools.
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    const body = await ctx.text().catch(() => "");
    return `${ctx.status} ${body || ctx.statusText}`;
  }
  const baseMsg = error instanceof Error ? error.message : String(error);
  if (ctx instanceof Error) return `${baseMsg} | cause: ${ctx.name}: ${ctx.message}`;
  if (ctx) return `${baseMsg} | context: ${JSON.stringify(ctx).slice(0, 200)}`;
  return baseMsg;
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
