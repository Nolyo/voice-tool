// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ENDPOINT = "http://localhost/functions/v1/account-export";

interface TableData {
  settings?: { data: any; error: any };
  dictionary?: { data: any; error: any };
  snippets?: { data: any; error: any };
  devices?: { data: any; error: any };
  notes?: { data: any; error: any };
  folders?: { data: any; error: any };
  profiles?: { data: any; error: any };
}

function makeFakeClient(data: TableData = {}): { client: any; selects: string[] } {
  const selects: string[] = [];
  const client: any = {
    from(table: string) {
      return {
        select(_cols: string) {
          selects.push(table);
          const result =
            table === "user_settings"
              ? data.settings ?? { data: [], error: null }
              : table === "user_dictionary_words"
              ? data.dictionary ?? { data: [], error: null }
              : table === "user_snippets"
              ? data.snippets ?? { data: [], error: null }
              : table === "user_devices"
              ? data.devices ?? { data: [], error: null }
              : table === "user_notes"
              ? data.notes ?? { data: [], error: null }
              : table === "user_folders"
              ? data.folders ?? { data: [], error: null }
              : table === "user_profiles"
              ? data.profiles ?? { data: [], error: null }
              : { data: null, error: { message: `unknown table ${table}` } };
          return {
            then(resolve: any, reject: any) {
              return Promise.resolve(result).then(resolve, reject);
            },
          };
        },
      };
    },
  };
  return { client, selects };
}

function authOk(userId = "user-1", data: TableData = {}) {
  const { client, selects } = makeFakeClient(data);
  return {
    authenticate: async () => ({ userId, client }),
    selects,
  };
}

function authFail(error = "invalid token", status = 401) {
  return {
    authenticate: async () => ({ error, status }),
  };
}

Deno.test("OPTIONS from allowed origin echoes the origin", async () => {
  const { handler } = await import("./index.ts");
  const req = new Request(ENDPOINT, {
    method: "OPTIONS",
    headers: { Origin: "tauri://localhost" },
  });
  const res = await handler(req, authFail());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "tauri://localhost");
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
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, authFail("expired", 401));
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "expired");
});

Deno.test("successful export returns all 7 sections + user_id + version 3", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-42", {
    settings: {
      data: [{ user_id: "user-42", profile_id: "p1", data: { theme: "dark" } }],
      error: null,
    },
    dictionary: { data: [{ word: "hello" }], error: null },
    snippets: { data: [{ id: "s1", label: "x" }], error: null },
    devices: { data: [{ device_id: "d1" }], error: null },
    notes: {
      data: [
        { id: "n1", title: "Note", content_html: "<p>hi</p>", deleted_at: null },
        { id: "n2", title: "Tombstoned", content_html: "", deleted_at: "2026-05-10T00:00:00Z" },
      ],
      error: null,
    },
    folders: { data: [{ id: "f1", name: "Idées" }], error: null },
    profiles: { data: [{ id: "p1", user_id: "user-42", name: "Perso" }], error: null },
  });
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.export_version, 3);
  assertEquals(body.user_id, "user-42");
  assertExists(body.exported_at);
  assertEquals(body.user_settings, [{ user_id: "user-42", profile_id: "p1", data: { theme: "dark" } }]);
  assertEquals(body.user_dictionary_words, [{ word: "hello" }]);
  assertEquals(body.user_snippets, [{ id: "s1", label: "x" }]);
  assertEquals(body.user_devices, [{ device_id: "d1" }]);
  assertEquals(body.user_notes.length, 2);
  assertEquals(body.user_notes[1].deleted_at, "2026-05-10T00:00:00Z");
  assertEquals(body.user_folders, [{ id: "f1", name: "Idées" }]);
  assertEquals(body.user_profiles, [{ id: "p1", user_id: "user-42", name: "Perso" }]);
  assertEquals(auth.selects.sort(), [
    "user_devices",
    "user_dictionary_words",
    "user_folders",
    "user_notes",
    "user_profiles",
    "user_settings",
    "user_snippets",
  ]);
});

Deno.test("export with no data returns empty arrays for all 7 sections", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-empty");
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.user_settings, []);
  assertEquals(body.user_dictionary_words, []);
  assertEquals(body.user_snippets, []);
  assertEquals(body.user_devices, []);
  assertEquals(body.user_notes, []);
  assertEquals(body.user_folders, []);
  assertEquals(body.user_profiles, []);
});

Deno.test("DB error on notes returns 500", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-1", {
    notes: { data: null, error: { message: "notes broken" } },
  });
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, auth);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "notes broken");
});

Deno.test("DB error on folders returns 500", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-1", {
    folders: { data: null, error: { message: "folders broken" } },
  });
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, auth);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "folders broken");
});

Deno.test("DB error on profiles returns 500", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-1", {
    profiles: { data: null, error: { message: "profiles broken" } },
  });
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, auth);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "profiles broken");
});

Deno.test("DB error on settings returns 500 with the error message", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-1", {
    settings: { data: null, error: { message: "settings unreachable" } },
  });
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, auth);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "settings unreachable");
});

Deno.test("DB error on dictionary returns 500", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-1", {
    dictionary: { data: null, error: { message: "dict broken" } },
  });
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, auth);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "dict broken");
});

Deno.test("response from allowed origin includes the origin in Access-Control-Allow-Origin", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-1");
  const req = new Request(ENDPOINT, {
    method: "POST",
    headers: { Origin: "https://tauri.localhost" },
  });
  const res = await handler(req, auth);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://tauri.localhost");
});

Deno.test("rateLimit returns true: handler short-circuits with 429 + skips reads", async () => {
  const { handler } = await import("./index.ts");
  const auth = authOk("user-rl");
  const req = new Request(ENDPOINT, { method: "POST" });
  const res = await handler(req, { ...auth, rateLimit: async () => true });
  assertEquals(res.status, 429);
  assertEquals((await res.json()).error, "rate limited");
  assertEquals(auth.selects.length, 0);
});
