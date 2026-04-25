import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("rejects requests without bearer", async () => {
  const { handler } = await import("./index.ts");
  const res = await handler(new Request("http://localhost/functions/v1/purge-account-deletions", { method: "POST" }), {
    cronSecret: "secret",
    deleteUser: async () => ({ data: null, error: null }),
    selectExpired: async () => [],
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
    },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.purged, 2);
  assertEquals(body.errors.length, 1);
  assertEquals(body.errors[0].uid, "b");
});
