import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler, type CreateCheckoutDeps } from "../index.ts";

function makeReq(body: unknown, method = "POST"): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("http://localhost/lemonsqueezy-create-checkout", init);
}

function authedDeps(overrides: Partial<CreateCheckoutDeps> = {}): CreateCheckoutDeps {
  return {
    authenticate: () =>
      Promise.resolve({ userId: "user-123", email: "u@example.com" }),
    createCheckout: () =>
      Promise.resolve({ url: "https://lexena.lemonsqueezy.com/buy/abc-123" }),
    ...overrides,
  };
}

function setEnv() {
  Deno.env.set("LEMON_SQUEEZY_API_KEY", "k");
  Deno.env.set("LEMON_SQUEEZY_STORE_ID", "s");
  Deno.env.set("LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID", "1");
  Deno.env.set("LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID", "2");
  Deno.env.set("LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID", "3");
  Deno.env.set("LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID", "4");
}

Deno.test("rejects non-POST", async () => {
  setEnv();
  const res = await handler(makeReq({ plan: "pro", cycle: "monthly" }, "GET"), authedDeps());
  assertEquals(res.status, 405);
});

Deno.test("rejects unauthenticated", async () => {
  setEnv();
  const deps = authedDeps({
    authenticate: () => Promise.resolve({ error: "missing token", status: 401 }),
  });
  const res = await handler(makeReq({ plan: "pro", cycle: "monthly" }), deps);
  assertEquals(res.status, 401);
});

Deno.test("rejects invalid JSON body", async () => {
  setEnv();
  const res = await handler(makeReq("{not json"), authedDeps());
  assertEquals(res.status, 400);
});

Deno.test("rejects invalid plan", async () => {
  setEnv();
  const res = await handler(makeReq({ plan: "enterprise", cycle: "monthly" }), authedDeps());
  assertEquals(res.status, 400);
});

Deno.test("rejects invalid cycle", async () => {
  setEnv();
  const res = await handler(makeReq({ plan: "pro", cycle: "lifetime" }), authedDeps());
  assertEquals(res.status, 400);
});

Deno.test("returns 500 when env vars missing", async () => {
  Deno.env.delete("LEMON_SQUEEZY_API_KEY");
  Deno.env.delete("LEMON_SQUEEZY_STORE_ID");
  Deno.env.delete("LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID");
  const res = await handler(makeReq({ plan: "pro", cycle: "monthly" }), authedDeps());
  assertEquals(res.status, 500);
});

Deno.test("propagates LS API error", async () => {
  setEnv();
  const deps = authedDeps({
    createCheckout: () => Promise.resolve({ error: "ls_api_error", status: 502 }),
  });
  const res = await handler(makeReq({ plan: "pro", cycle: "monthly" }), deps);
  assertEquals(res.status, 502);
});

Deno.test("returns checkout_url on success", async () => {
  setEnv();
  let capturedVariantId = "";
  let capturedUserId = "";
  let capturedPlan = "";
  let capturedCycle = "";
  const deps = authedDeps({
    createCheckout: (params) => {
      capturedVariantId = params.variantId;
      capturedUserId = params.userId;
      capturedPlan = params.plan;
      capturedCycle = params.cycle;
      return Promise.resolve({ url: "https://lexena.lemonsqueezy.com/buy/x" });
    },
  });
  const res = await handler(makeReq({ plan: "pro", cycle: "annual" }), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { checkout_url: "https://lexena.lemonsqueezy.com/buy/x" });
  assertEquals(capturedVariantId, "4");
  assertEquals(capturedUserId, "user-123");
  assertEquals(capturedPlan, "pro");
  assertEquals(capturedCycle, "annual");
});

Deno.test("maps starter_monthly to the correct variant_id", async () => {
  setEnv();
  let captured = "";
  const deps = authedDeps({
    createCheckout: (params) => {
      captured = params.variantId;
      return Promise.resolve({ url: "https://x" });
    },
  });
  await handler(makeReq({ plan: "starter", cycle: "monthly" }), deps);
  assertEquals(captured, "1");
});
