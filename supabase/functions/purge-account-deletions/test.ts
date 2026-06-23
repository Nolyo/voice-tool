import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Default deps stub used to make tests focused. Override fields per test.
function makeDeps(overrides: any = {}) {
  return {
    cronSecret: "secret",
    selectExpired: async () => [],
    deleteUser: async () => ({ data: null, error: null }),
    deleteTombstone: async () => {},
    purgeSoftDeletedSyncItems: async () => ({ notes: 0, folders: 0 }),
    ...overrides,
  };
}

Deno.test("rejects requests without bearer", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(new Request("http://localhost/functions/v1/purge-account-deletions", { method: "POST" }), makeDeps());
  assertEquals(res.status, 401);
});

Deno.test("calls deleteUser for each expired uid", async () => {
  const { handler } = await import("./index.ts");
  const calls: string[] = [];
  const res = await handler(
    new Request("http://localhost/functions/v1/purge-account-deletions", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    }),
    makeDeps({
      deleteUser: async (uid: string) => { calls.push(uid); return { data: null, error: null }; },
      selectExpired: async () => ["a", "b"],
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(calls, ["a", "b"]);
  const body = await res.json();
  assertEquals(body.purged, 2);
  assertEquals(body.errors, []);
});

Deno.test("partial failure: continues + returns errors", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request("http://localhost/functions/v1/purge-account-deletions", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    }),
    makeDeps({
      deleteUser: async (uid: string) =>
        uid === "b"
          ? { data: null, error: { message: "boom" } as any }
          : { data: null, error: null },
      selectExpired: async () => ["a", "b", "c"],
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.purged, 2);
  assertEquals(body.errors.length, 1);
  assertEquals(body.errors[0].uid, "b");
});

Deno.test("returns 500 when selectExpired throws", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request("http://localhost/functions/v1/purge-account-deletions", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    }),
    makeDeps({
      selectExpired: async () => { throw new Error("db gone"); },
    }),
  );
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "selectExpired failed");
});

Deno.test("partial failure: thrown deleteUser is caught and reported", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request("http://localhost/functions/v1/purge-account-deletions", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    }),
    makeDeps({
      selectExpired: async () => ["a", "b", "c"],
      deleteUser: async (uid: string) => {
        if (uid === "b") throw new Error("network blip");
        return { data: null, error: null };
      },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.purged, 2);
  assertEquals(body.errors.length, 1);
  assertEquals(body.errors[0].uid, "b");
  assertEquals(body.errors[0].message, "network blip");
});

Deno.test("rejects non-POST requests with 405", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request("http://localhost/functions/v1/purge-account-deletions", {
      method: "GET",
      headers: { Authorization: "Bearer secret" },
    }),
    makeDeps(),
  );
  assertEquals(res.status, 405);
});

Deno.test("ordering: tombstone n'est supprimée que si deleteUser réussit", async () => {
  const { handler } = await import("./index.ts");
  const deletedTombstones: string[] = [];

  const deps = makeDeps({
    selectExpired: async () => ["uid-ok", "uid-fail"],
    deleteUser: async (uid: string) => {
      if (uid === "uid-fail") return { data: null, error: { message: "boom" } };
      return { data: {}, error: null };
    },
    deleteTombstone: async (uid: string) => {
      deletedTombstones.push(uid);
    },
  });

  const req = new Request("http://x", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  });
  const res = await handler(req, deps as any);
  const body = await res.json();

  if (deletedTombstones.length !== 1 || deletedTombstones[0] !== "uid-ok") {
    throw new Error(`expected ['uid-ok'], got ${JSON.stringify(deletedTombstones)}`);
  }
  if (body.purged !== 1 || body.errors?.length !== 1) {
    throw new Error(`expected purged=1 + errors=1, got ${JSON.stringify(body)}`);
  }
});

// Sub-epic 03 sync-notes : tests purge soft-deleted notes/folders >30j.

Deno.test("purgeSoftDeletedSyncItems: counts reported in response", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request("http://x", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    }),
    makeDeps({
      selectExpired: async () => [],
      purgeSoftDeletedSyncItems: async () => ({ notes: 7, folders: 2 }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sync_items_purged, { notes: 7, folders: 2 });
  assertEquals(body.sync_purge_error, null);
});

Deno.test("purgeSoftDeletedSyncItems error does NOT block account deletion purge", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(
    new Request("http://x", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    }),
    makeDeps({
      selectExpired: async () => ["a"],
      purgeSoftDeletedSyncItems: async () => { throw new Error("notes table locked"); },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.purged, 1);
  assertEquals(body.errors, []);
  assertEquals(body.sync_items_purged, { notes: 0, folders: 0 });
  assertEquals(body.sync_purge_error, "notes table locked");
});

Deno.test("purgeSoftDeletedSyncItems runs even when no account deletions are pending", async () => {
  const { handler } = await import("./index.ts");
  let purgeCalled = false;
  const res = await handler(
    new Request("http://x", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    }),
    makeDeps({
      selectExpired: async () => [],
      purgeSoftDeletedSyncItems: async () => { purgeCalled = true; return { notes: 3, folders: 0 }; },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(purgeCalled, true);
  const body = await res.json();
  assertEquals(body.sync_items_purged, { notes: 3, folders: 0 });
  assertEquals(body.purged, 0);
});
