// deno-lint-ignore-file no-explicit-any
// Edge Function "lemonsqueezy-create-checkout".
// Crée un checkout Lemon Squeezy à la volée via l'API LS, en attachant
// custom_data { user_id, plan, cycle } pour que le webhook puisse rattacher
// l'abonnement au bon utilisateur Supabase.
//
// Env (Supabase Dashboard → Edge Functions → Secrets) :
//   LEMON_SQUEEZY_API_KEY
//   LEMON_SQUEEZY_STORE_ID
//   LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID
//   LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID
//   LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID
//   LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID
//   SUPABASE_URL                 — auto-injected
//   SUPABASE_ANON_KEY            — auto-injected
//
// Cf. ADR 0013 et plan billing 2026-05-05.

import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";
const REDIRECT_URL = "lexena://billing/success";

export type Plan = "starter" | "pro";
export type Cycle = "monthly" | "annual";

export interface CreateCheckoutBody {
  plan: Plan;
  cycle: Cycle;
}

export interface CreateCheckoutResult {
  checkout_url: string;
}

export interface CreateCheckoutDeps {
  authenticate: (req: Request) => Promise<
    | { userId: string; email?: string }
    | { error: string; status: number }
  >;
  /** Calls the Lemon Squeezy API. Returns the checkout URL. */
  createCheckout: (params: {
    storeId: string;
    variantId: string;
    apiKey: string;
    userId: string;
    email: string | undefined;
    plan: Plan;
    cycle: Cycle;
  }) => Promise<{ url: string } | { error: string; status: number }>;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function variantIdFor(plan: Plan, cycle: Cycle): string | undefined {
  const key = `LEMON_SQUEEZY_${plan.toUpperCase()}_${cycle.toUpperCase()}_VARIANT_ID`;
  return Deno.env.get(key);
}

function isPlan(v: unknown): v is Plan {
  return v === "starter" || v === "pro";
}
function isCycle(v: unknown): v is Cycle {
  return v === "monthly" || v === "annual";
}

export async function handler(req: Request, deps: CreateCheckoutDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const auth = await deps.authenticate(req);
  if ("error" in auth) return json(req, { error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }
  const { plan, cycle } = (body ?? {}) as Partial<CreateCheckoutBody>;
  if (!isPlan(plan) || !isCycle(cycle)) {
    return json(req, { error: "invalid_plan_or_cycle" }, 400);
  }

  const variantId = variantIdFor(plan, cycle);
  const storeId = Deno.env.get("LEMON_SQUEEZY_STORE_ID");
  const apiKey = Deno.env.get("LEMON_SQUEEZY_API_KEY");
  if (!variantId || !storeId || !apiKey) {
    return json(req, { error: "server_misconfigured" }, 500);
  }

  const result = await deps.createCheckout({
    storeId,
    variantId,
    apiKey,
    userId: auth.userId,
    email: auth.email,
    plan,
    cycle,
  });
  if ("error" in result) return json(req, { error: result.error }, result.status);

  return json(req, { checkout_url: result.url } satisfies CreateCheckoutResult, 200);
}

/** Default Lemon Squeezy API caller. Calls POST /v1/checkouts. */
export async function callLemonSqueezyApi(params: {
  storeId: string;
  variantId: string;
  apiKey: string;
  userId: string;
  email: string | undefined;
  plan: Plan;
  cycle: Cycle;
}): Promise<{ url: string } | { error: string; status: number }> {
  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: params.email ?? null,
          custom: {
            user_id: params.userId,
            plan: params.plan,
            cycle: params.cycle,
          },
        },
        product_options: {
          redirect_url: REDIRECT_URL,
        },
      },
      relationships: {
        store: { data: { type: "stores", id: params.storeId } },
        variant: { data: { type: "variants", id: params.variantId } },
      },
    },
  };

  const res = await fetch(`${LS_API_BASE}/checkouts`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.warn(`[create-checkout] LS API error ${res.status}: ${detail}`);
    return { error: "ls_api_error", status: 502 };
  }

  const json = (await res.json()) as { data?: { attributes?: { url?: string } } };
  const url = json.data?.attributes?.url;
  if (typeof url !== "string" || url.length === 0) {
    return { error: "ls_api_missing_url", status: 502 };
  }
  return { url };
}

/** Adapter wrapping the shared JWT auth helper to project user-facing fields. */
async function defaultAuthenticate(req: Request) {
  const result = await getAuthenticatedUser(req);
  if ("error" in result) return result;
  // We need the email for prefilling LS checkout; getAuthenticatedUser only
  // returns userId, so re-fetch user details via the authed client.
  const { data, error } = await result.client.auth.getUser(result.token);
  if (error || !data.user) return { error: "invalid_token", status: 401 };
  return { userId: result.userId, email: data.user.email ?? undefined };
}

if (import.meta.main) {
  Deno.serve((req) =>
    handler(req, {
      authenticate: defaultAuthenticate,
      createCheckout: callLemonSqueezyApi,
    }),
  );
}
