// Webhook Lemon Squeezy → upsert public.subscriptions.
// Sécurité : HMAC SHA-256 timing-safe sur header x-signature.
// Idempotence : insert prealable dans public.processed_webhooks (PK webhook_id).
//
// Env (Supabase Dashboard → Edge Functions → Secrets) :
//   LEMON_SQUEEZY_WEBHOOK_SECRET        — secret partagé LS
//   LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID
//   LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID
//   LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID
//   LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID
//   SUPABASE_URL                        — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY           — auto-injected
//
// Cf. ADR 0013 et plan billing 2026-05-05.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const HEADER_SIGNATURE = "x-signature";
const HEADER_EVENT = "x-event-name";

const HANDLED_EVENTS = new Set([
  "order_created",
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
]);

const SUBSCRIPTION_STATUS = new Set([
  "active",
  "on_trial",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
  "expired",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return new Uint8Array();
    out[i] = byte;
  }
  return out;
}

export async function verifySignature(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  const provided = hexToBytes(signatureHex);
  if (provided.byteLength === 0) return false;
  return timingSafeEqual(digest, provided);
}

type LemonSqueezyPayload = {
  meta?: {
    event_name?: string;
    webhook_id?: string;
    custom_data?: Record<string, string> | null;
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
  };
};

type Plan = "starter" | "pro";
type SubscriptionRow = {
  user_id: string;
  plan: Plan;
  status: string;
  provider: string;
  provider_customer_id: string;
  provider_subscription_id: string;
  provider_variant_id: string | null;
  quota_minutes: number;
  overage_rate_cents: number;
  current_period_end: string;
  renews_at: string | null;
  expires_at: string | null;
  trial_ends_at: string | null;
  raw_payload: unknown;
};

const PLAN_QUOTAS: Record<Plan, { quota_minutes: number; overage_rate_cents: number }> = {
  starter: { quota_minutes: 400, overage_rate_cents: 0.03 },
  pro: { quota_minutes: 1000, overage_rate_cents: 0.02 },
};

export function planFromVariantId(variantId: string): Plan | null {
  const starter = [
    Deno.env.get("LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID"),
    Deno.env.get("LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID"),
  ];
  const pro = [
    Deno.env.get("LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID"),
    Deno.env.get("LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID"),
  ];
  if (starter.includes(variantId)) return "starter";
  if (pro.includes(variantId)) return "pro";
  return null;
}

function normaliseStatus(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase();
  if (SUBSCRIPTION_STATUS.has(s)) return s;
  if (s === "trialing") return "on_trial";
  return "expired";
}

export function buildSubscriptionRow(payload: LemonSqueezyPayload): SubscriptionRow | null {
  const attrs = payload.data?.attributes ?? {};
  const userId = payload.meta?.custom_data?.user_id;
  const subscriptionId = String(payload.data?.id ?? "");
  const customerId = String((attrs.customer_id as string | number | undefined) ?? "");
  const variantId = attrs.variant_id ? String(attrs.variant_id) : "";

  if (!userId || !subscriptionId || !customerId || !variantId) return null;

  const plan = planFromVariantId(variantId);
  if (!plan) return null;
  const quotas = PLAN_QUOTAS[plan];

  const renewsAt = (attrs.renews_at as string | null) ?? null;
  // Lemon Squeezy renews_at = next billing period start. Use it as
  // current_period_end ; fallback to NOW() + 30d to satisfy NOT NULL.
  const currentPeriodEnd =
    renewsAt ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  return {
    user_id: userId,
    plan,
    status: normaliseStatus(attrs.status as string | undefined),
    provider: "lemonsqueezy",
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    provider_variant_id: variantId,
    quota_minutes: quotas.quota_minutes,
    overage_rate_cents: quotas.overage_rate_cents,
    current_period_end: currentPeriodEnd,
    renews_at: renewsAt,
    expires_at: (attrs.ends_at as string | null) ?? null,
    trial_ends_at: (attrs.trial_ends_at as string | null) ?? null,
    raw_payload: payload,
  };
}

export async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("LEMON_SQUEEZY_WEBHOOK_SECRET");
  if (!secret) return json({ error: "missing_webhook_secret" }, 500);

  const signature = req.headers.get(HEADER_SIGNATURE) ?? "";
  const eventName = req.headers.get(HEADER_EVENT) ?? "";
  const rawBody = await req.text();

  if (!(await verifySignature(rawBody, signature, secret))) {
    return json({ error: "invalid_signature" }, 401);
  }

  if (!HANDLED_EVENTS.has(eventName)) {
    console.log(`[webhook] ignored event: ${eventName}`);
    return json({ ignored: true, event: eventName }, 200);
  }

  let payload: LemonSqueezyPayload;
  try {
    payload = JSON.parse(rawBody) as LemonSqueezyPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Idempotence : si webhook_id absent → log et ignore (LS doit toujours
  // l'envoyer ; absence = malformation).
  const webhookId = payload.meta?.webhook_id;
  if (!webhookId) {
    console.warn(`[webhook] missing meta.webhook_id, event=${eventName}`);
    return json({ error: "missing_webhook_id" }, 400);
  }

  // Tenter d'enregistrer le webhook_id. Si conflit (déjà traité), short-circuit.
  const { error: idemError } = await supabase
    .from("processed_webhooks")
    .insert({ webhook_id: webhookId, event_name: eventName });

  if (idemError && idemError.code !== "23505") {
    // 23505 = unique_violation = déjà traité, on retourne 200 idempotent.
    console.error(`[webhook] processed_webhooks insert failed:`, idemError);
    return json({ error: "idempotency_db_error", detail: idemError.message }, 500);
  }
  if (idemError?.code === "23505") {
    console.log(`[webhook] duplicate webhook_id ${webhookId}, returning 200`);
    return json({ ok: true, event: eventName, idempotent: true }, 200);
  }

  // order_created : pas de mutation subscriptions.
  if (eventName === "order_created") {
    console.log(`[webhook] order_created: order ${payload.data?.id}`);
    return json({ ok: true, event: eventName }, 200);
  }

  const row = buildSubscriptionRow(payload);
  if (!row) return json({ error: "missing_required_fields_or_unknown_variant" }, 400);

  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "provider_subscription_id" });

  if (error) {
    console.error(`[webhook] upsert failed:`, error);
    return json({ error: "db_upsert_failed", detail: error.message }, 500);
  }

  return json(
    { ok: true, event: eventName, subscription: row.provider_subscription_id, plan: row.plan },
    200,
  );
}

// Only start the HTTP server when run as the entry module (Edge Function
// runtime), never when imported by tests.
if (import.meta.main) {
  Deno.serve(handleWebhook);
}
