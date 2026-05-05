import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test("rejects invalid signature with 401", async () => {
  Deno.env.set("LEMON_SQUEEZY_WEBHOOK_SECRET", "test_secret");

  const { verifySignature } = await import("../index.ts");
  const ok = await verifySignature("body", "0000", "test_secret");
  assertEquals(ok, false);
});

Deno.test("accepts valid signature", async () => {
  const secret = "test_secret";
  const body = '{"meta":{"webhook_id":"x"}}';
  const sig = await hmacHex(body, secret);
  const { verifySignature } = await import("../index.ts");
  const ok = await verifySignature(body, sig, secret);
  assertEquals(ok, true);
});
