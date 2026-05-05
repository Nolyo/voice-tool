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
