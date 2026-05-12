import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("buildSubscriptionRow returns null when variant_id unknown", async () => {
  const { buildSubscriptionRow } = await import("../index.ts");
  const row = buildSubscriptionRow({
    meta: { webhook_id: "wh_1", custom_data: { user_id: "u1" } },
    data: {
      id: "sub_1",
      attributes: {
        customer_id: "cust_1",
        variant_id: "unknown_variant",
        status: "active",
      },
    },
  });
  assertEquals(row, null);
});

Deno.test("buildSubscriptionRow maps starter monthly variant", async () => {
  Deno.env.set("LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID", "111");
  Deno.env.set("LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID", "112");
  Deno.env.set("LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID", "211");
  Deno.env.set("LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID", "212");

  const { buildSubscriptionRow } = await import("../index.ts");
  const row = buildSubscriptionRow({
    meta: { webhook_id: "wh_2", custom_data: { user_id: "u1" } },
    data: {
      id: "sub_2",
      attributes: {
        customer_id: "cust_1",
        variant_id: "111",
        status: "active",
        renews_at: "2026-06-05T00:00:00Z",
      },
    },
  });

  assertEquals(row?.plan, "starter");
  assertEquals(row?.quota_minutes, 400);
  assertEquals(row?.current_period_end, "2026-06-05T00:00:00Z");
});

Deno.test("buildSubscriptionRow maps each variant correctly", async () => {
  Deno.env.set("LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID", "111");
  Deno.env.set("LEMON_SQUEEZY_STARTER_ANNUAL_VARIANT_ID", "112");
  Deno.env.set("LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID", "211");
  Deno.env.set("LEMON_SQUEEZY_PRO_ANNUAL_VARIANT_ID", "212");

  const { buildSubscriptionRow } = await import("../index.ts");
  const cases = [
    { variant_id: "111", expected_plan: "starter", expected_quota: 400 },
    { variant_id: "112", expected_plan: "starter", expected_quota: 400 },
    { variant_id: "211", expected_plan: "pro", expected_quota: 1000 },
    { variant_id: "212", expected_plan: "pro", expected_quota: 1000 },
  ];

  for (const c of cases) {
    const row = buildSubscriptionRow({
      meta: { webhook_id: `wh_${c.variant_id}`, custom_data: { user_id: "u1" } },
      data: {
        id: `sub_${c.variant_id}`,
        attributes: {
          customer_id: "cust_1",
          variant_id: c.variant_id,
          status: "active",
          renews_at: "2026-06-05T00:00:00Z",
        },
      },
    });
    assertEquals(row?.plan, c.expected_plan);
    assertEquals(row?.quota_minutes, c.expected_quota);
  }
});

Deno.test("normaliseStatus handles trialing and unknown", async () => {
  Deno.env.set("LEMON_SQUEEZY_STARTER_MONTHLY_VARIANT_ID", "111");

  const { buildSubscriptionRow } = await import("../index.ts");

  const trialRow = buildSubscriptionRow({
    meta: { webhook_id: "wh_t", custom_data: { user_id: "u1" } },
    data: {
      id: "sub_t",
      attributes: {
        customer_id: "c",
        variant_id: "111",
        status: "trialing",
        renews_at: "2026-06-05T00:00:00Z",
      },
    },
  });
  assertEquals(trialRow?.status, "on_trial");

  const unknownRow = buildSubscriptionRow({
    meta: { webhook_id: "wh_u", custom_data: { user_id: "u1" } },
    data: {
      id: "sub_u",
      attributes: {
        customer_id: "c",
        variant_id: "111",
        status: "garbage",
        renews_at: "2026-06-05T00:00:00Z",
      },
    },
  });
  assertEquals(unknownRow?.status, "expired");
});
