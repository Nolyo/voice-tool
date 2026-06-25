import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PushBodySchema } from "./schema.ts";

Deno.test("PushBodySchema requires profile_id uuid", () => {
  const ok = PushBodySchema.safeParse({
    profile_id: "10000000-0000-0000-0000-000000000001",
    device_id: "dev1",
    operations: [{ kind: "dictionary-upsert", word: "hello" }],
  });
  assertEquals(ok.success, true);

  const missing = PushBodySchema.safeParse({
    device_id: "dev1",
    operations: [{ kind: "dictionary-upsert", word: "hello" }],
  });
  assertEquals(missing.success, false);
});

Deno.test("PushOperationSchema accepts profile-upsert + profile-delete", () => {
  const up = PushBodySchema.safeParse({
    profile_id: "10000000-0000-0000-0000-000000000001",
    device_id: "dev1",
    operations: [
      {
        kind: "profile-upsert",
        profile: {
          id: "10000000-0000-0000-0000-000000000001",
          name: "Travail",
          updated_at: "2026-06-25T00:00:00+00:00",
        },
      },
      { kind: "profile-delete", id: "10000000-0000-0000-0000-000000000001" },
    ],
  });
  assertEquals(up.success, true);
});
