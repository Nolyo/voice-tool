import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleShareView, isValidSlug } from "../index.ts";

// Minimal fake of the supabase-js query builder chain used by the handler.
function fakeClient(opts: { share?: unknown; note?: unknown; error?: unknown }) {
  return {
    from(table: string) {
      const row = table === "note_shares" ? opts.share : opts.note;
      const err = opts.error ?? null;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.maybeSingle = () =>
        err
          ? Promise.resolve({ data: null, error: err })
          : Promise.resolve({ data: row ?? null, error: null });
      return builder;
    },
  } as unknown as Parameters<typeof handleShareView>[1]["client"];
}

function fakeClientThatErrors() {
  return fakeClient({ error: { message: "connection refused", code: "PGRST000" } });
}

Deno.test("isValidSlug accepts 16-char base62, rejects others", () => {
  assertEquals(isValidSlug("aB3dEf9hKmNp2qrS"), true);
  assertEquals(isValidSlug("short"), false);
  assertEquals(isValidSlug("aaaaaaaaaaaaaaa!"), false);
});

Deno.test("returns 404 for unknown slug", async () => {
  const req = new Request("https://x/share-view?s=aaaaaaaaaaaaaaaa");
  const res = await handleShareView(req, { client: fakeClient({ share: null }) });
  assertEquals(res.status, 404);
});

Deno.test("returns 404 when note is soft-deleted/missing", async () => {
  const req = new Request("https://x/share-view?s=aaaaaaaaaaaaaaaa");
  const res = await handleShareView(req, {
    client: fakeClient({ share: { note_id: "n", user_id: "u" }, note: null }),
  });
  assertEquals(res.status, 404);
});

Deno.test("returns content for a valid active share", async () => {
  const req = new Request("https://x/share-view?s=aaaaaaaaaaaaaaaa");
  const res = await handleShareView(req, {
    client: fakeClient({
      share: { note_id: "n", user_id: "u" },
      note: { title: "Tuto", content_html: "<p>hi</p>", updated_at: "2026-06-25T00:00:00Z" },
    }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { title: "Tuto", contentHtml: "<p>hi</p>", updatedAt: "2026-06-25T00:00:00Z" });
});

Deno.test("rejects malformed slug with 400", async () => {
  const req = new Request("https://x/share-view?s=bad");
  const res = await handleShareView(req, { client: fakeClient({}) });
  assertEquals(res.status, 400);
});

Deno.test("returns 500 when the share lookup errors", async () => {
  const req = new Request("https://x/share-view?s=aaaaaaaaaaaaaaaa");
  const res = await handleShareView(req, { client: fakeClientThatErrors() });
  assertEquals(res.status, 500);
});
