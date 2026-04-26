import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("rejects requests without bearer", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(new Request("http://localhost/functions/v1/purge-account-deletions", { method: "POST" }), {
    cronSecret: "secret",
    deleteUser: async () => ({ data: null, error: null }),
    selectExpired: async () => [],
    deleteTombstone: async () => {},
  });
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
    {
      cronSecret: "secret",
      deleteUser: async (uid: string) => { calls.push(uid); return { data: null, error: null }; },
      selectExpired: async () => ["a", "b"],
      deleteTombstone: async () => {},
    },
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
    {
      cronSecret: "secret",
      deleteUser: async (uid: string) =>
        uid === "b"
          ? { data: null, error: { message: "boom" } as any }
          : { data: null, error: null },
      selectExpired: async () => ["a", "b", "c"],
      deleteTombstone: async () => {},
    },
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
    {
      cronSecret: "secret",
      selectExpired: async () => { throw new Error("db gone"); },
      deleteUser: async () => ({ data: null, error: null }),
      deleteTombstone: async () => {},
    },
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
    {
      cronSecret: "secret",
      selectExpired: async () => ["a", "b", "c"],
      deleteUser: async (uid: string) => {
        if (uid === "b") throw new Error("network blip");
        return { data: null, error: null };
      },
      deleteTombstone: async () => {},
    },
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
    {
      cronSecret: "secret",
      selectExpired: async () => [],
      deleteUser: async () => ({ data: null, error: null }),
      deleteTombstone: async () => {},
    },
  );
  assertEquals(res.status, 405);
});

Deno.test("ordering: tombstone n'est supprimée que si deleteUser réussit", async () => {
  const { handler } = await import("./index.ts");
  const deletedTombstones: string[] = [];
  const seenSelect: string[] = ["uid-ok", "uid-fail"];

  const deps = {
    cronSecret: "secret",
    selectExpired: async () => seenSelect,
    deleteUser: async (uid: string) => {
      if (uid === "uid-fail") return { data: null, error: { message: "boom" } };
      return { data: {}, error: null };
    },
    deleteTombstone: async (uid: string) => {
      deletedTombstones.push(uid);
    },
  };

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
