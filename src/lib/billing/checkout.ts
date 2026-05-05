import { invoke } from "@tauri-apps/api/core";
import type { PlanMetadata } from "./plans";

export interface CheckoutOpenResult {
  opened_url: string;
}

export async function openCheckout(params: {
  plan: PlanMetadata;
  user_id: string;
  email?: string;
}): Promise<CheckoutOpenResult> {
  return await invoke<CheckoutOpenResult>("open_checkout", {
    checkoutUrl: params.plan.checkout_url,
    userId: params.user_id,
    email: params.email ?? null,
  });
}
