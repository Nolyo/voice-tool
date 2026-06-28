// POC NOL-32 — LemonSqueezy webhook handler (Supabase Edge Function / Deno).
//
// Deploy:
//   supabase functions deploy lemonsqueezy-webhook --no-verify-jwt
//
// Env (Supabase dashboard → Edge Functions → Secrets):
//   LEMON_SQUEEZY_WEBHOOK_SECRET  — shared secret configured in LS dashboard
//   SUPABASE_URL                  — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY     — auto-injected

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

async function verifySignature(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
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
    custom_data?: Record<string, string> | null;
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
  };
};

type SubscriptionRow = {
  user_id: string;
  plan: string;
  status: string;
  provider: string;
  provider_customer_id: string;
  provider_subscription_id: string;
  provider_variant_id: string | null;
  renews_at: string | null;
  expires_at: string | null;
  trial_ends_at: string | null;
  raw_payload: unknown;
};

function normaliseStatus(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase();
  if (SUBSCRIPTION_STATUS.has(s)) return s;
  // LS sometimes emits 'trialing' — map it to on_trial.
  if (s === "trialing") return "on_trial";
  return "expired";
}

function buildSubscriptionRow(payload: LemonSqueezyPayload): SubscriptionRow | null {
  const attrs = payload.data?.attributes ?? {};
  const userId = payload.meta?.custom_data?.user_id;
  const subscriptionId = String(payload.data?.id ?? "");
  const customerId = String((attrs.customer_id as string | number | undefined) ?? "");
  if (!userId || !subscriptionId || !customerId) return null;
  return {
    user_id: userId,
    plan: String(attrs.product_name ?? attrs.variant_name ?? "unknown"),
    status: normaliseStatus(attrs.status as string | undefined),
    provider: "lemonsqueezy",
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    provider_variant_id: attrs.variant_id ? String(attrs.variant_id) : null,
    renews_at: (attrs.renews_at as string | null) ?? null,
    expires_at: (attrs.ends_at as string | null) ?? null,
    trial_ends_at: (attrs.trial_ends_at as string | null) ?? null,
    raw_payload: payload,
  };
}

Deno.serve(async (req) => {
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
    // 200 so LS does not retry forever; log for inspection.
    console.log(`[webhook] ignored event: ${eventName}`);
    return json({ ignored: true, event: eventName }, 200);
  }

  let payload: LemonSqueezyPayload;
  try {
    payload = JSON.parse(rawBody) as LemonSqueezyPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // order_created has no subscription attrs; log and return.
  if (eventName === "order_created") {
    console.log(`[webhook] order_created: order ${payload.data?.id}`);
    return json({ ok: true, event: eventName }, 200);
  }

  const row = buildSubscriptionRow(payload);
  if (!row) return json({ error: "missing_required_fields" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "provider_subscription_id" });

  if (error) {
    console.error(`[webhook] upsert failed:`, error);
    return json({ error: "db_upsert_failed", detail: error.message }, 500);
  }

  return json({ ok: true, event: eventName, subscription: row.provider_subscription_id }, 200);
});
