import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Deps } from "./index.ts";

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    authenticate: async (_req: Request) => ({ userId: "user-1" }),
    consume: async (_userId: string, _code: string) => true,
    deleteAllFactors: async (_userId: string) => ({ error: null }),
    ...overrides,
  };
}

async function importHandler() {
  const mod = await import("./index.ts");
  return mod.handler;
}

function makeReq(opts: {
  method?: string;
  origin?: string;
  body?: unknown;
  authHeader?: string;
} = {}): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.origin) headers["Origin"] = opts.origin;
  if (opts.authHeader) headers["Authorization"] = opts.authHeader;
  return new Request("http://localhost/functions/v1/consume-recovery-code", {
    method: opts.method ?? "POST",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

Deno.test("preflight OPTIONS returns 200", async () => {
  const handler = await importHandler();
  const res = await handler(makeReq({ method: "OPTIONS" }), makeDeps());
  assertEquals(res.status, 200);
});

Deno.test("rejects non-POST/non-OPTIONS with 405", async () => {
  const handler = await importHandler();
  const res = await handler(makeReq({ method: "GET", authHeader: "Bearer x" }), makeDeps());
  assertEquals(res.status, 405);
});

Deno.test("rejects missing auth (401)", async () => {
  const handler = await importHandler();
  const res = await handler(
    makeReq({ body: { code: "abcd-1234" } }),
    makeDeps({
      authenticate: async () => ({ error: "missing or invalid Authorization header", status: 401 }),
    }),
  );
  assertEquals(res.status, 401);
});

Deno.test("rejects empty body (400)", async () => {
  const handler = await importHandler();
  const res = await handler(
    makeReq({ authHeader: "Bearer x" }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("rejects body without code (400)", async () => {
  const handler = await importHandler();
  const res = await handler(
    makeReq({ authHeader: "Bearer x", body: {} }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("rejects body with code shorter than 4 chars (400)", async () => {
  const handler = await importHandler();
  const res = await handler(
    makeReq({ authHeader: "Bearer x", body: { code: "abc" } }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("returns 401 when consume returns false (invalid/used code)", async () => {
  const handler = await importHandler();
  const consumeCalls: Array<{ userId: string; code: string }> = [];
  const res = await handler(
    makeReq({ authHeader: "Bearer x", body: { code: "abcd-1234" } }),
    makeDeps({
      consume: async (userId, code) => {
        consumeCalls.push({ userId, code });
        return false;
      },
    }),
  );
  assertEquals(res.status, 401);
  assertEquals(consumeCalls.length, 1);
  assertEquals(consumeCalls[0].userId, "user-1");
  assertEquals(consumeCalls[0].code, "abcd-1234");
});

Deno.test("does NOT delete factors when consume returns false", async () => {
  const handler = await importHandler();
  let deleteCalled = false;
  await handler(
    makeReq({ authHeader: "Bearer x", body: { code: "abcd-1234" } }),
    makeDeps({
      consume: async () => false,
      deleteAllFactors: async () => {
        deleteCalled = true;
        return { error: null };
      },
    }),
  );
  assertEquals(deleteCalled, false);
});

Deno.test("happy path: 200 + ok:true + deleteAllFactors called", async () => {
  const handler = await importHandler();
  const factorDeletes: string[] = [];
  const res = await handler(
    makeReq({ authHeader: "Bearer x", body: { code: "abcd-1234" } }),
    makeDeps({
      deleteAllFactors: async (uid) => {
        factorDeletes.push(uid);
        return { error: null };
      },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(factorDeletes, ["user-1"]);
});

Deno.test("returns 500 if deleteAllFactors errors", async () => {
  const handler = await importHandler();
  const res = await handler(
    makeReq({ authHeader: "Bearer x", body: { code: "abcd-1234" } }),
    makeDeps({
      deleteAllFactors: async () => ({ error: { message: "boom" } }),
    }),
  );
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "factor cleanup failed");
});

Deno.test("trims whitespace before consume", async () => {
  const handler = await importHandler();
  let receivedCode: string | null = null;
  await handler(
    makeReq({ authHeader: "Bearer x", body: { code: "  abcd-1234\n" } }),
    makeDeps({
      consume: async (_uid, code) => {
        receivedCode = code;
        return true;
      },
    }),
  );
  assertEquals(receivedCode, "abcd-1234");
});

Deno.test("includes CORS headers for allowlisted origin", async () => {
  const handler = await importHandler();
  const res = await handler(
    makeReq({ method: "OPTIONS", origin: "tauri://localhost" }),
    makeDeps(),
  );
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "tauri://localhost");
});

Deno.test("returns 429 when rate-limit gate trips", async () => {
  const handler = await importHandler();
  let consumeCalled = false;
  let deleteCalled = false;
  const res = await handler(
    makeReq({ authHeader: "Bearer x", body: { code: "abcd-1234" } }),
    makeDeps({
      rateLimit: async () => true,
      consume: async () => {
        consumeCalled = true;
        return true;
      },
      deleteAllFactors: async () => {
        deleteCalled = true;
        return { error: null };
      },
    }),
  );
  assertEquals(res.status, 429);
  assertEquals(consumeCalled, false);
  assertEquals(deleteCalled, false);
});
