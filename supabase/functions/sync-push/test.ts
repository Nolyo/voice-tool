// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ENDPOINT = "http://localhost/functions/v1/sync-push";

const VALID_SETTINGS = {
  ui: { theme: "dark" as const, language: "fr" as const },
  hotkeys: {
    toggle: "Ctrl+F11",
    push_to_talk: "Ctrl+F12",
    open_window: "Ctrl+Alt+O",
  },
  features: { auto_paste: "cursor" as const, sound_effects: true },
  transcription: { provider: "OpenAI" as const, local_model: "tiny" },
};

interface UpsertCall {
  kind: "upsert";
  table: string;
  record: any;
  options: any;
}
interface UpdateCall {
  kind: "update";
  table: string;
  record: any;
  eqs: Array<{ col: string; val: any }>;
}
interface RpcCall {
  kind: "rpc";
  name: string;
  args: any;
}
type ClientCall = UpsertCall | UpdateCall | RpcCall;

interface FakeClientOptions {
  upsertError?: { table: string; error: any };
  updateError?: { table: string; error: any };
  rpcResult?: { data: number | null; error: any };
}

function makeFakeClient(opts: FakeClientOptions = {}): { client: any; calls: ClientCall[] } {
  const calls: ClientCall[] = [];
  const client: any = {
    from(table: string) {
      return {
        upsert(record: any, options: any) {
          calls.push({ kind: "upsert", table, record, options });
          if (opts.upsertError && opts.upsertError.table === table) {
            return Promise.resolve({ error: opts.upsertError.error });
          }
          return Promise.resolve({ error: null });
        },
        update(record: any) {
          const eqs: Array<{ col: string; val: any }> = [];
          calls.push({ kind: "update", table, record, eqs });
          const filter: any = {
            eq(col: string, val: any) {
              eqs.push({ col, val });
              return filter;
            },
            then(resolve: any, reject: any) {
              const err =
                opts.updateError && opts.updateError.table === table
                  ? opts.updateError.error
                  : null;
              return Promise.resolve({ error: err }).then(resolve, reject);
            },
          };
          return filter;
        },
      };
    },
    rpc(name: string, args: any) {
      calls.push({ kind: "rpc", name, args });
      return Promise.resolve(opts.rpcResult ?? { data: 100, error: null });
    },
  };
  return { client, calls };
}

function authOk(userId = "user-1", clientOpts: FakeClientOptions = {}) {
  const { client, calls } = makeFakeClient(clientOpts);
  return {
    authenticate: async () => ({ userId, client }),
    calls,
  };
}

function authFail(error = "invalid token", status = 401) {
  return {
    authenticate: async () => ({ error, status }),
  };
}

function postJson(body: unknown, headers: Record<string, string> = {}) {
  return new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

Deno.test("OPTIONS from allowed Tauri origin echoes the origin", async () => {
  const { handler } = await import("./index.ts");
  const req = new Request(ENDPOINT, {
    method: "OPTIONS",
    headers: { Origin: "tauri://localhost" },
  });
  const res = await handler(req, authFail());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "tauri://localhost");
  assertEquals(res.headers.get("Vary"), "Origin");
});

Deno.test("OPTIONS from disallowed origin omits Allow-Origin", async () => {
  const { handler } = await import("./index.ts");
  const req = new Request(ENDPOINT, {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example.com" },
  });
  const res = await handler(req, authFail());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(res.headers.get("Vary"), "Origin");
});

Deno.test("GET returns 405", async () => {
  const { handler } = await import("./index.ts");
  const req = new Request(ENDPOINT, { method: "GET" });
  const res = await handler(req, authFail());
  assertEquals(res.status, 405);
  assertEquals((await res.json()).error, "method not allowed");
});

Deno.test("auth failure propagates status and message", async () => {
  const { handler } = await import("./index.ts");
  const req = postJson({ operations: [], device_id: "x" });
  const res = await handler(req, authFail("expired token", 401));
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "expired token");
});

Deno.test("invalid JSON body returns 400 invalid body", async () => {
  const { handler } = await import("./index.ts");
  const req = new Request(ENDPOINT, { method: "POST", body: "not-json" });
  const res = await handler(req, authOk());
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "invalid body");
});

Deno.test("empty operations array fails Zod validation (min 1)", async () => {
  const { handler } = await import("./index.ts");
  const req = postJson({ operations: [], device_id: "dev-1" });
  const res = await handler(req, authOk());
  assertEquals(res.status, 400);
});

Deno.test("settings-upsert: posts to user_settings with userId + device_id", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-42");
  const req = postJson({
    operations: [{ kind: "settings-upsert", data: VALID_SETTINGS }],
    device_id: "dev-A",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.results, [{ index: 0, ok: true }]);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert");
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].table, "user_settings");
  assertEquals(upserts[0].record.user_id, "user-42");
  assertEquals(upserts[0].record.updated_by_device, "dev-A");
  assertEquals(upserts[0].options, { onConflict: "user_id" });
});

Deno.test("dictionary-upsert: clears deleted_at on revival", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk();
  const req = postJson({
    operations: [{ kind: "dictionary-upsert", word: "hello" }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert");
  assertEquals(upserts[0].table, "user_dictionary_words");
  assertEquals(upserts[0].record.word, "hello");
  assertEquals(upserts[0].record.deleted_at, null);
  assertEquals(upserts[0].options, { onConflict: "user_id,word" });
});

Deno.test("dictionary-delete: soft-deletes via upsert with deleted_at set", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk();
  const req = postJson({
    operations: [{ kind: "dictionary-delete", word: "obsolete" }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert");
  assertEquals(upserts[0].table, "user_dictionary_words");
  assertEquals(upserts[0].record.word, "obsolete");
  assertEquals(typeof upserts[0].record.deleted_at, "string");
});

Deno.test("snippet-upsert: forwards id, label, content, shortcut", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk();
  const snippet = {
    id: "11111111-1111-4111-8111-111111111111",
    label: "Greeting",
    content: "Hello world",
    shortcut: ":hi",
  };
  const req = postJson({
    operations: [{ kind: "snippet-upsert", snippet }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert");
  assertEquals(upserts[0].table, "user_snippets");
  assertEquals(upserts[0].record.id, snippet.id);
  assertEquals(upserts[0].record.label, snippet.label);
  assertEquals(upserts[0].record.content, snippet.content);
  assertEquals(upserts[0].record.shortcut, snippet.shortcut);
  assertEquals(upserts[0].record.deleted_at, null);
});

Deno.test("snippet-delete: scoped update with id + user_id", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-7");
  const snippetId = "22222222-2222-4222-8222-222222222222";
  const req = postJson({
    operations: [{ kind: "snippet-delete", id: snippetId }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const updates = auth.calls.filter((c): c is UpdateCall => c.kind === "update");
  assertEquals(updates.length, 1);
  assertEquals(updates[0].table, "user_snippets");
  assertEquals(typeof updates[0].record.deleted_at, "string");
  assertEquals(updates[0].eqs, [
    { col: "id", val: snippetId },
    { col: "user_id", val: "user-7" },
  ]);
});

Deno.test("DB error on one op: batch continues, error reported per index", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-1", {
    upsertError: { table: "user_dictionary_words", error: { message: "db boom" } },
  });
  const req = postJson({
    operations: [
      { kind: "dictionary-upsert", word: "first" },
      { kind: "settings-upsert", data: VALID_SETTINGS },
    ],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.results.length, 2);
  assertEquals(body.results[0].ok, false);
  assertEquals(body.results[0].error, "db boom");
  assertEquals(body.results[1].ok, true);
});

Deno.test("RPC quota error returns 500 quota check failed", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-1", {
    rpcResult: { data: null, error: { message: "rpc down" } },
  });
  const req = postJson({
    operations: [{ kind: "dictionary-upsert", word: "x" }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "quota check failed");
  assertEquals(body.details, "rpc down");
});

Deno.test("quota exceeded returns 413 with quota_bytes + current_bytes", async () => {
  const { handler } = await import("./index.ts");
  const QUOTA = 5 * 1024 * 1024;
  const over = QUOTA + 1;
  const auth = authOk("user-1", {
    rpcResult: { data: over, error: null },
  });
  const req = postJson({
    operations: [{ kind: "dictionary-upsert", word: "x" }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 413);
  const body = await res.json();
  assertEquals(body.error, "quota exceeded");
  assertEquals(body.quota_bytes, QUOTA);
  assertEquals(body.current_bytes, over);
  assertEquals(body.results.length, 1);
});

Deno.test("RPC is invoked with target_user = userId", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-rpc-check");
  const req = postJson({
    operations: [{ kind: "dictionary-upsert", word: "x" }],
    device_id: "d",
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const rpcs = auth.calls.filter((c): c is RpcCall => c.kind === "rpc");
  assertEquals(rpcs.length, 1);
  assertEquals(rpcs[0].name, "compute_user_sync_size");
  assertEquals(rpcs[0].args, { target_user: "user-rpc-check" });
});

Deno.test("response from allowed origin includes the origin in Access-Control-Allow-Origin", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk();
  const req = new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      operations: [{ kind: "dictionary-upsert", word: "x" }],
      device_id: "d",
    }),
    headers: { Origin: "https://tauri.localhost" },
  });
  const res = await handler(req, auth);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://tauri.localhost");
});

Deno.test("rateLimit returns true: handler short-circuits with 429 + skips DB", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk();
  const req = postJson({
    operations: [{ kind: "dictionary-upsert", word: "x" }],
    device_id: "d",
  });
  const res = await handler(req, { ...auth, rateLimit: async () => true });
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error, "rate limited");
  assertEquals(auth.calls.length, 0);
});
