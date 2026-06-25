// deno-lint-ignore-file no-explicit-any
// Tests for A4: profile_id stamping + profile-upsert / profile-delete handler cases.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";

// ---------------------------------------------------------------------------
// Minimal fake Supabase client (mirrors the shape used in test.ts)
// ---------------------------------------------------------------------------

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
type ClientCall = UpsertCall | UpdateCall;

interface FakeClientOptions {
  /** Intercept upserts for assertions before they resolve. */
  onUpsert?: (table: string, row: any) => void;
}

function makeFakeClient(opts: FakeClientOptions = {}): { client: any; calls: ClientCall[] } {
  const calls: ClientCall[] = [];
  const client: any = {
    from(table: string) {
      return {
        upsert(record: any, options: any) {
          calls.push({ kind: "upsert", table, record, options });
          opts.onUpsert?.(table, record);
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
              return Promise.resolve({ error: null }).then(resolve, reject);
            },
          };
          return filter;
        },
        select(_cols: string) {
          const chain: any = {
            eq(_col: string, _val: any) {
              return chain;
            },
            maybeSingle() {
              // Default: no subscription row → free tier
              return Promise.resolve({ data: null, error: null });
            },
          };
          return chain;
        },
      };
    },
    rpc(_name: string, _args: any) {
      // Return a small size so quota check passes
      return Promise.resolve({ data: 100, error: null });
    },
  };
  return { client, calls };
}

/** Build a fake deps object that injects the given fake client. */
function authOk(userId = "00000000-0000-0000-0000-0000000000a1", clientOpts: FakeClientOptions = {}) {
  const { client, calls } = makeFakeClient(clientOpts);
  return {
    authenticate: async (_req: Request) => ({ userId, client }),
    calls,
  };
}

const PROFILE_ID = "10000000-0000-0000-0000-000000000001";
const NOTE_ID = "20000000-0000-0000-0000-000000000002";
const PROFILE2_ID = "30000000-0000-0000-0000-000000000003";
const ENDPOINT = "http://x/sync-push";

// ---------------------------------------------------------------------------
// A4 spec tests
// ---------------------------------------------------------------------------

Deno.test("note-upsert stamps profile_id from body", async () => {
  const captured: Record<string, unknown>[] = [];
  const auth = authOk("00000000-0000-0000-0000-0000000000a1", {
    onUpsert: (table, row) => {
      if (table === "user_notes") captured.push(row);
    },
  });
  const req = new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      profile_id: PROFILE_ID,
      device_id: "dev1",
      operations: [
        {
          kind: "note-upsert",
          note: {
            id: NOTE_ID,
            title: "t",
            content_html: "",
            folder_id: null,
            favorite: false,
            order: 0,
            updated_at: "2026-06-25T00:00:00+00:00",
            deleted_at: null,
          },
        },
      ],
    }),
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  assertEquals(captured.length, 1, "expected exactly one user_notes upsert");
  assertEquals(captured[0].profile_id, PROFILE_ID);
});

Deno.test("settings-upsert stamps profile_id with onConflict user_id,profile_id", async () => {
  const auth = authOk();
  const req = new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      profile_id: PROFILE_ID,
      device_id: "dev1",
      operations: [
        {
          kind: "settings-upsert",
          data: {
            ui: { theme: "dark", language: "fr" },
            hotkeys: { toggle: "Ctrl+F11", push_to_talk: "Ctrl+F12", open_window: "Ctrl+Alt+O" },
            features: { auto_paste: "cursor", sound_effects: true },
            transcription: { provider: "OpenAI", local_model: "tiny" },
          },
        },
      ],
    }),
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert" && c.table === "user_settings");
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].record.profile_id, PROFILE_ID);
  assertEquals(upserts[0].options, { onConflict: "user_id,profile_id" });
});

Deno.test("dictionary-upsert stamps profile_id with onConflict user_id,profile_id,word", async () => {
  const auth = authOk();
  const req = new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      profile_id: PROFILE_ID,
      device_id: "dev1",
      operations: [{ kind: "dictionary-upsert", word: "bonjour" }],
    }),
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert" && c.table === "user_dictionary_words");
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].record.profile_id, PROFILE_ID);
  assertEquals(upserts[0].options, { onConflict: "user_id,profile_id,word" });
});

Deno.test("snippet-upsert stamps profile_id", async () => {
  const auth = authOk();
  const req = new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      profile_id: PROFILE_ID,
      device_id: "dev1",
      operations: [
        {
          kind: "snippet-upsert",
          snippet: {
            id: "11111111-1111-4111-8111-111111111111",
            label: "Hi",
            content: "Hello",
            shortcut: null,
          },
        },
      ],
    }),
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert" && c.table === "user_snippets");
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].record.profile_id, PROFILE_ID);
});

Deno.test("folder-upsert stamps profile_id", async () => {
  const auth = authOk();
  const req = new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      profile_id: PROFILE_ID,
      device_id: "dev1",
      operations: [
        {
          kind: "folder-upsert",
          folder: {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Inbox",
            order: 0,
            updated_at: "2026-06-25T00:00:00+00:00",
          },
        },
      ],
    }),
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert" && c.table === "user_folders");
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].record.profile_id, PROFILE_ID);
});

Deno.test("profile-upsert writes to user_profiles with onConflict id", async () => {
  const auth = authOk("00000000-0000-0000-0000-0000000000a1");
  const req = new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      profile_id: PROFILE_ID,
      device_id: "dev1",
      operations: [
        {
          kind: "profile-upsert",
          profile: {
            id: PROFILE2_ID,
            name: "Travail",
            updated_at: "2026-06-25T00:00:00+00:00",
          },
        },
      ],
    }),
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const upserts = auth.calls.filter((c): c is UpsertCall => c.kind === "upsert" && c.table === "user_profiles");
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].record.id, PROFILE2_ID);
  assertEquals(upserts[0].record.user_id, "00000000-0000-0000-0000-0000000000a1");
  assertEquals(upserts[0].record.name, "Travail");
  assertEquals(upserts[0].record.deleted_at, null);
  assertEquals(upserts[0].options, { onConflict: "id" });
});

Deno.test("profile-delete issues soft-delete update on user_profiles", async () => {
  const userId = "00000000-0000-0000-0000-0000000000a1";
  const auth = authOk(userId);
  const req = new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      profile_id: PROFILE_ID,
      device_id: "dev1",
      operations: [{ kind: "profile-delete", id: PROFILE2_ID }],
    }),
  });
  const res = await handler(req, auth);
  assertEquals(res.status, 200);
  const updates = auth.calls.filter((c): c is UpdateCall => c.kind === "update" && c.table === "user_profiles");
  assertEquals(updates.length, 1);
  assertEquals(typeof updates[0].record.deleted_at, "string");
  assertEquals(typeof updates[0].record.updated_at, "string");
  assertEquals(updates[0].eqs, [
    { col: "id", val: PROFILE2_ID },
    { col: "user_id", val: userId },
  ]);
});
