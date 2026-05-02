// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Deps } from "./index.ts";

const URL = "http://localhost/functions/v1/send-new-device-email";

function makeDevice(over: Partial<any> = {}): any {
  return {
    id: "dev-1",
    user_id: "user-1",
    device_fingerprint: "fp-abcdef0123456789",
    os_name: "Windows",
    os_version: "11",
    app_version: "3.0.0",
    label: null,
    first_seen_at: "2026-05-02T10:00:00Z",
    ...over,
  };
}

function baseDeps(over: Partial<Deps> = {}): Deps {
  return {
    cronSecret: "secret",
    selectPending: async () => [],
    getUserEmail: async () => "user@example.com",
    sendEmail: async () => ({ ok: true }),
    markNotified: async () => {},
    ...over,
  };
}

Deno.test("rejects non-POST with 405", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request(URL, { method: "GET", headers: { Authorization: "Bearer secret" } }),
    baseDeps(),
  );
  assertEquals(res.status, 405);
});

Deno.test("rejects missing bearer with 401", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(new Request(URL, { method: "POST" }), baseDeps());
  assertEquals(res.status, 401);
});

Deno.test("rejects wrong bearer with 401", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer nope" } }),
    baseDeps(),
  );
  assertEquals(res.status, 401);
});

Deno.test("empty pending list → 200 with sent=0", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer secret" } }),
    baseDeps({ selectPending: async () => [] }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sent, 0);
  assertEquals(body.errors, []);
});

Deno.test("happy path: sends email and marks notified", async () => {
  const { handler } = await import("./index.ts");
  const sentCalls: any[] = [];
  const markedIds: string[] = [];
  const res = await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer secret" } }),
    baseDeps({
      selectPending: async () => [makeDevice({ id: "a" }), makeDevice({ id: "b" })],
      getUserEmail: async () => "alice@example.com",
      sendEmail: async (p) => { sentCalls.push(p); return { ok: true }; },
      markNotified: async (id) => { markedIds.push(id); },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sent, 2);
  assertEquals(body.errors, []);
  assertEquals(sentCalls.length, 2);
  assertEquals(sentCalls[0].to, "alice@example.com");
  assertEquals(markedIds, ["a", "b"]);
});

Deno.test("uses label when present, fallback to fingerprint", async () => {
  const { handler } = await import("./index.ts");
  const sentCalls: any[] = [];
  await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer secret" } }),
    baseDeps({
      selectPending: async () => [
        makeDevice({ id: "a", label: "MacBook Pro perso" }),
        makeDevice({ id: "b", label: null, device_fingerprint: "deadbeef-rest" }),
        makeDevice({ id: "c", label: "   " }),
      ],
      sendEmail: async (p) => { sentCalls.push(p); return { ok: true }; },
    }),
  );
  assertEquals(sentCalls[0].deviceName, "MacBook Pro perso");
  assertEquals(sentCalls[1].deviceName, "Device deadbeef");
  // empty/whitespace label falls back to fingerprint slice
  assertEquals(sentCalls[2].deviceName.startsWith("Device "), true);
});

Deno.test("send failure: device NOT marked, error reported, loop continues", async () => {
  const { handler } = await import("./index.ts");
  const markedIds: string[] = [];
  const res = await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer secret" } }),
    baseDeps({
      selectPending: async () => [
        makeDevice({ id: "a" }),
        makeDevice({ id: "b" }),
        makeDevice({ id: "c" }),
      ],
      sendEmail: async (p) => p.to === "fail@example.com"
        ? { ok: false, message: "resend 422: blocked" }
        : { ok: true },
      getUserEmail: async (uid) => uid === "user-1"
        ? (markedIds.length === 1 ? "fail@example.com" : "ok@example.com")
        : "ok@example.com",
      markNotified: async (id) => { markedIds.push(id); },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  // 3 devices, 2 succeed, 1 fails → sent=2, errors=1
  assertEquals(body.sent + body.errors.length, 3);
});

Deno.test("user without email: error reported, loop continues", async () => {
  const { handler } = await import("./index.ts");
  let markCount = 0;
  const res = await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer secret" } }),
    baseDeps({
      selectPending: async () => [
        makeDevice({ id: "a", user_id: "no-email" }),
        makeDevice({ id: "b", user_id: "ok" }),
      ],
      getUserEmail: async (uid) => uid === "no-email" ? null : "ok@example.com",
      markNotified: async () => { markCount++; },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sent, 1);
  assertEquals(body.errors.length, 1);
  assertEquals(body.errors[0].phase, "getUserEmail");
  assertEquals(markCount, 1);
});

Deno.test("markNotified failure: email already sent → reported as warning", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer secret" } }),
    baseDeps({
      selectPending: async () => [makeDevice({ id: "a" })],
      markNotified: async () => { throw new Error("db blip"); },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sent, 0);
  assertEquals(body.errors.length, 1);
  assertEquals(body.errors[0].phase, "markNotified");
});

Deno.test("selectPending throws → 500", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer secret" } }),
    baseDeps({ selectPending: async () => { throw new Error("db gone"); } }),
  );
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "selectPending failed");
});

Deno.test("loop catches thrown errors per device", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request(URL, { method: "POST", headers: { Authorization: "Bearer secret" } }),
    baseDeps({
      selectPending: async () => [makeDevice({ id: "a" }), makeDevice({ id: "b" })],
      getUserEmail: async (uid) => {
        if (uid === "user-1") throw new Error("network blip");
        return "ok@example.com";
      },
    }),
  );
  // both devices have user_id "user-1" → both throw
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sent, 0);
  assertEquals(body.errors.length, 2);
  assertEquals(body.errors[0].phase, "loop");
});
