# Public Note Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user publish a note as a live public web link (`lexena.app/s/<slug>`) viewable by anyone without the app, with revocation and a "my shared links" panel.

**Architecture:** A lightweight `note_shares` table maps an unguessable slug to a `user_notes` row (no content copy). An anonymous Edge Function `share-view` (service role, `verify_jwt = false`) serves the note's *current* content (live). The app creates/revokes/lists shares via supabase-js under owner RLS. The public render page (separate marketing repo) sanitizes the HTML and flattens wiki-links; the sanitize+flatten logic is implemented and tested here as `src/lib/sharing/render-html.ts`.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions/Deno), supabase-js, React 19 + TypeScript + react-i18next, Vitest, pgTAP, DOMPurify.

## Global Constraints

- **Branch protection:** `main` is protected — all work lands via PR on branch `feat/note-public-sharing` (already created). Never commit to `main`.
- **i18n mandatory:** every user-facing string (including `title`/`aria-label`) goes through react-i18next with both `fr` and `en` entries. Never hard-code UI text.
- **Migration filenames:** real timestamp `YYYYMMDDHHMMSS_*.sql` (no `YYYYMM01_NNNNNN` pattern).
- **Supabase API keys:** publishable + secret only. Never reference legacy `anon`/`service_role` names in app code (Edge Functions use `SUPABASE_SERVICE_ROLE_KEY` env var, which is the platform-injected secret — that is allowed server-side).
- **Anonymous Edge Function:** `share-view` must be declared `verify_jwt = false` in `supabase/config.toml` AND deployed with `--no-verify-jwt`, else it 401s silently.
- **No dependency breakage:** only *add* `dompurify` (+ types) as a dev dependency; do not run a global `pnpm update` or change existing package versions.
- **Commits:** conventional commits, English, short. End commit messages with the Co-Authored-By trailer used in this repo.
- **Sharing requires active sync** for the current profile (`useSync().enabled === true`) — the note must exist in `user_notes` to be served live.

---

### Task 1: `note_shares` table + RLS + pgTAP cross-tenant test

**Files:**
- Create: `supabase/migrations/20260625120000_note_shares.sql`
- Create (test): `supabase/tests/rls_note_shares.sql`

**Interfaces:**
- Produces: table `public.note_shares(id uuid, slug text unique, user_id uuid, note_id uuid, title_snapshot text, created_at timestamptz, revoked_at timestamptz)`; partial unique index `note_shares_one_active_per_note` on `(note_id) where revoked_at is null`; owner-only RLS policies named `note_shares_{select,insert,update,delete}_own`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/rls_note_shares.sql` (mirror the style of `supabase/tests/rls_user_notes.sql`):

```sql
begin;
select plan(7);

-- Two tenants + one note owned by user A.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@test.dev');
insert into public.user_notes (id, user_id, title, content_html)
  values ('00000000-0000-0000-0000-00000000note', '00000000-0000-0000-0000-0000000000a1', 'A note', '<p>hi</p>');

-- Act as user A: can insert a share for own note.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$insert into public.note_shares (slug, user_id, note_id, title_snapshot)
    values ('aaaaaaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000note', 'A note')$$,
  'owner can insert own share');

select results_eq(
  $$select count(*)::int from public.note_shares$$, $$values (1)$$,
  'owner sees own share');

-- Partial unique: a second ACTIVE share for the same note must fail.
select throws_ok(
  $$insert into public.note_shares (slug, user_id, note_id, title_snapshot)
    values ('cccccccccccccccc', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000note', 'A note')$$,
  '23505', null, 'only one active share per note');

-- Act as user B: cannot see or mutate A's share.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select results_eq(
  $$select count(*)::int from public.note_shares$$, $$values (0)$$,
  'cross-tenant select blocked by RLS');

select results_eq(
  $$with u as (update public.note_shares set revoked_at = now()
      where slug = 'aaaaaaaaaaaaaaaa' returning 1) select count(*)::int from u$$,
  $$values (0)$$, 'cross-tenant update blocked by RLS');

select results_eq(
  $$with d as (delete from public.note_shares where slug = 'aaaaaaaaaaaaaaaa' returning 1)
    select count(*)::int from d$$,
  $$values (0)$$, 'cross-tenant delete blocked by RLS');

-- B cannot insert a share pointing at A's note row (RLS insert check is on user_id only;
-- but B claiming own user_id with A's note must still be allowed by RLS yet is harmless —
-- the Edge Function join on (note_id,user_id) prevents serving it). Assert B can only
-- insert rows with its own user_id.
select throws_ok(
  $$insert into public.note_shares (slug, user_id, note_id, title_snapshot)
    values ('dddddddddddddddd', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000note', 'x')$$,
  '42501', null, 'cannot insert a share owned by another user');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails (table missing)**

Run: `pnpm exec supabase test db --file supabase/tests/rls_note_shares.sql`
Expected: FAIL — relation `public.note_shares` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260625120000_note_shares.sql`:

```sql
-- note_shares — public live-share links for notes. One active share per note.
-- Public read is NOT via RLS; it goes through the share-view Edge Function (service role).
create table if not exists public.note_shares (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.user_notes(id) on delete cascade,
  title_snapshot text not null default '',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists note_shares_one_active_per_note
  on public.note_shares (note_id) where revoked_at is null;

create index if not exists note_shares_user_active_idx
  on public.note_shares (user_id) where revoked_at is null;

create index if not exists note_shares_slug_active_idx
  on public.note_shares (slug) where revoked_at is null;

alter table public.note_shares enable row level security;

create policy "note_shares_select_own" on public.note_shares
  for select using (auth.uid() = user_id);
create policy "note_shares_insert_own" on public.note_shares
  for insert with check (auth.uid() = user_id);
create policy "note_shares_update_own" on public.note_shares
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "note_shares_delete_own" on public.note_shares
  for delete using (auth.uid() = user_id);

comment on table public.note_shares is
  'v3 sharing: public live-share link mapping slug -> user_notes. Content served live via share-view Edge Function.';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec supabase test db --file supabase/tests/rls_note_shares.sql`
Expected: PASS — `ok 1..7`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260625120000_note_shares.sql supabase/tests/rls_note_shares.sql
git commit -m "feat(sharing): note_shares table with owner RLS"
```

---

### Task 2: `share-view` Edge Function (anonymous, live content)

**Files:**
- Create: `supabase/functions/share-view/index.ts`
- Create: `supabase/functions/_shared/cors-public.ts`
- Create (test): `supabase/functions/share-view/test/handler.test.ts`
- Modify: `supabase/config.toml` (append `[functions.share-view]` block)

**Interfaces:**
- Consumes: `note_shares`, `user_notes` (Task 1).
- Produces: `export interface ShareViewDeps { client: SupabaseClient; }`, `export async function handleShareView(req: Request, deps: ShareViewDeps): Promise<Response>`. Success body: `{ title: string; contentHtml: string; updatedAt: string }`. Slug validated by `export function isValidSlug(s: string): boolean` (`^[0-9A-Za-z]{16}$`).
- Produces: `cors-public.ts` exporting `publicCorsHeaders(req)` and `publicPreflight(req)` allowing `https://lexena.app`, `https://www.lexena.app`, `http://localhost:5173`, `http://localhost:1420`.

- [ ] **Step 1: Write the public CORS helper**

Create `supabase/functions/_shared/cors-public.ts`:

```ts
// CORS for the PUBLIC share page (different origin set than the Tauri app helper).
const ALLOWED: ReadonlySet<string> = new Set([
  "https://lexena.app",
  "https://www.lexena.app",
  "http://localhost:5173",
  "http://localhost:1420",
]);

export function publicCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (ALLOWED.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function publicPreflight(req: Request): Response {
  return new Response("ok", { headers: publicCorsHeaders(req) });
}
```

- [ ] **Step 2: Write the failing handler test**

Create `supabase/functions/share-view/test/handler.test.ts` (mirror `lemonsqueezy-webhook/test/*` style; fake client via DI):

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleShareView, isValidSlug } from "../index.ts";

// Minimal fake of the supabase-js query builder chain used by the handler.
function fakeClient(opts: { share?: unknown; note?: unknown }) {
  return {
    from(table: string) {
      const row = table === "note_shares" ? opts.share : opts.note;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.maybeSingle = () => Promise.resolve({ data: row ?? null, error: null });
      return builder;
    },
  } as unknown as Parameters<typeof handleShareView>[1]["client"];
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd supabase/functions/share-view && deno test --allow-net --allow-env`
Expected: FAIL — `Module not found "../index.ts"`.

- [ ] **Step 4: Write the Edge Function**

Create `supabase/functions/share-view/index.ts`:

```ts
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { publicCorsHeaders, publicPreflight } from "../_shared/cors-public.ts";

export interface ShareViewDeps {
  client: SupabaseClient;
}

export function isValidSlug(s: string): boolean {
  return /^[0-9A-Za-z]{16}$/.test(s);
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...publicCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function slugFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("s");
  return q;
}

export async function handleShareView(req: Request, deps: ShareViewDeps): Promise<Response> {
  const slug = slugFromRequest(req);
  if (!slug || !isValidSlug(slug)) return json(req, { error: "invalid_slug" }, 400);

  const { data: share } = await deps.client
    .from("note_shares")
    .select("note_id,user_id")
    .eq("slug", slug)
    .is("revoked_at", null)
    .maybeSingle();
  if (!share) return json(req, { error: "not_found" }, 404);

  const { data: note } = await deps.client
    .from("user_notes")
    .select("title,content_html,updated_at")
    .eq("id", (share as { note_id: string }).note_id)
    .eq("user_id", (share as { user_id: string }).user_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!note) return json(req, { error: "not_found" }, 404);

  const n = note as { title: string; content_html: string; updated_at: string };
  return json(req, { title: n.title, contentHtml: n.content_html, updatedAt: n.updated_at });
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return publicPreflight(req);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return handleShareView(req, { client });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd supabase/functions/share-view && deno test --allow-net --allow-env`
Expected: PASS — all 5 tests ok.

- [ ] **Step 6: Declare the function as anonymous in config.toml**

Append to `supabase/config.toml` (after the `[functions.demo-transcribe]` block):

```toml
# Public share endpoint: the share page is viewed by people WITHOUT an account.
# Auth is by unguessable slug + revoked_at check inside the handler (service role).
[functions.share-view]
verify_jwt = false
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/share-view supabase/functions/_shared/cors-public.ts supabase/config.toml
git commit -m "feat(sharing): share-view edge function serving live note content"
```

---

### Task 3: Sharing client lib (slug, create/revoke/list)

**Files:**
- Create: `src/lib/sharing/types.ts`
- Create: `src/lib/sharing/slug.ts`
- Create: `src/lib/sharing/shares-client.ts`
- Create (test): `src/lib/sharing/slug.test.ts`
- Create (test): `src/lib/sharing/shares-client.test.ts`

**Interfaces:**
- Produces: `export interface NoteShare { id: string; slug: string; noteId: string; titleSnapshot: string; createdAt: string }`.
- Produces: `export function generateSlug(): string` (16-char base62, crypto).
- Produces: `export function shareUrl(slug: string): string` (`${SHARE_BASE_URL}/s/${slug}`).
- Produces: `export async function createShare(supabase, args: { noteId: string; userId: string; title: string }): Promise<NoteShare>` (returns existing active share if present), `export async function revokeShare(supabase, shareId: string): Promise<void>`, `export async function listShares(supabase, userId: string): Promise<NoteShare[]>`.

- [ ] **Step 1: Write the failing slug test**

Create `src/lib/sharing/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateSlug, shareUrl } from "./slug";

describe("generateSlug", () => {
  it("produces 16 base62 chars", () => {
    const s = generateSlug();
    expect(s).toMatch(/^[0-9A-Za-z]{16}$/);
  });
  it("is statistically unique across 1000 draws", () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateSlug()));
    expect(set.size).toBe(1000);
  });
});

describe("shareUrl", () => {
  it("builds an /s/<slug> url", () => {
    expect(shareUrl("aB3dEf9hKmNp2qrS")).toMatch(/\/s\/aB3dEf9hKmNp2qrS$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/sharing/slug.test.ts`
Expected: FAIL — cannot find module `./slug`.

- [ ] **Step 3: Implement slug + url + types**

Create `src/lib/sharing/types.ts`:

```ts
export interface NoteShare {
  id: string;
  slug: string;
  noteId: string;
  titleSnapshot: string;
  createdAt: string;
}
```

Create `src/lib/sharing/slug.ts`:

```ts
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG_LEN = 16;

export function generateSlug(): string {
  const bytes = new Uint8Array(SLUG_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < SLUG_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const SHARE_BASE_URL =
  (import.meta.env.VITE_SHARE_BASE_URL as string | undefined) ?? "https://lexena.app";

export function shareUrl(slug: string): string {
  return `${SHARE_BASE_URL}/s/${slug}`;
}
```

- [ ] **Step 4: Run the slug test to verify it passes**

Run: `pnpm vitest run src/lib/sharing/slug.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing shares-client test**

Create `src/lib/sharing/shares-client.test.ts` (fake supabase query builder, same shape as `src/lib/sync/client.test.ts` fakes):

```ts
import { describe, it, expect, vi } from "vitest";
import { createShare, revokeShare, listShares } from "./shares-client";

function fakeSupabase(calls: { insert?: unknown; activeExisting?: unknown; list?: unknown[] }) {
  const log: Record<string, unknown> = {};
  const api = {
    from: vi.fn(() => api),
    select: vi.fn(() => api),
    insert: vi.fn((row: unknown) => { log.inserted = row; return api; }),
    update: vi.fn((row: unknown) => { log.updated = row; return api; }),
    eq: vi.fn(() => api),
    is: vi.fn(() => api),
    order: vi.fn(() => api),
    maybeSingle: vi.fn(() => Promise.resolve({ data: calls.activeExisting ?? null, error: null })),
    single: vi.fn(() => Promise.resolve({ data: calls.insert, error: null })),
    then: undefined as unknown,
  };
  // listShares awaits the builder directly → make it thenable to resolve the list.
  (api as Record<string, unknown>).then = (res: (v: unknown) => void) =>
    res({ data: calls.list ?? [], error: null });
  return { api, log };
}

describe("createShare", () => {
  it("inserts a new active share when none exists", async () => {
    const { api, log } = fakeSupabase({
      activeExisting: null,
      insert: { id: "1", slug: "aB3dEf9hKmNp2qrS", note_id: "n", title_snapshot: "T", created_at: "t" },
    });
    const share = await createShare(api as never, { noteId: "n", userId: "u", title: "T" });
    expect(share.slug).toBe("aB3dEf9hKmNp2qrS");
    expect((log.inserted as { user_id: string }).user_id).toBe("u");
  });

  it("returns the existing active share without inserting", async () => {
    const { api, log } = fakeSupabase({
      activeExisting: { id: "9", slug: "ZZZZZZZZZZZZZZZZ", note_id: "n", title_snapshot: "T", created_at: "t" },
    });
    const share = await createShare(api as never, { noteId: "n", userId: "u", title: "T" });
    expect(share.slug).toBe("ZZZZZZZZZZZZZZZZ");
    expect(log.inserted).toBeUndefined();
  });
});

describe("revokeShare", () => {
  it("sets revoked_at", async () => {
    const { api, log } = fakeSupabase({});
    await revokeShare(api as never, "9");
    expect((log.updated as { revoked_at: string }).revoked_at).toBeTruthy();
  });
});

describe("listShares", () => {
  it("maps rows to NoteShare", async () => {
    const { api } = fakeSupabase({
      list: [{ id: "1", slug: "aB3dEf9hKmNp2qrS", note_id: "n", title_snapshot: "T", created_at: "t" }],
    });
    const rows = await listShares(api as never, "u");
    expect(rows[0].noteId).toBe("n");
    expect(rows[0].titleSnapshot).toBe("T");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/lib/sharing/shares-client.test.ts`
Expected: FAIL — cannot find module `./shares-client`.

- [ ] **Step 7: Implement shares-client**

Create `src/lib/sharing/shares-client.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteShare } from "./types";
import { generateSlug } from "./slug";

interface ShareRow {
  id: string;
  slug: string;
  note_id: string;
  title_snapshot: string;
  created_at: string;
}

function toNoteShare(r: ShareRow): NoteShare {
  return { id: r.id, slug: r.slug, noteId: r.note_id, titleSnapshot: r.title_snapshot, createdAt: r.created_at };
}

export async function createShare(
  supabase: SupabaseClient,
  args: { noteId: string; userId: string; title: string },
): Promise<NoteShare> {
  const { data: existing } = await supabase
    .from("note_shares")
    .select("id,slug,note_id,title_snapshot,created_at")
    .eq("note_id", args.noteId)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing) return toNoteShare(existing as ShareRow);

  const { data, error } = await supabase
    .from("note_shares")
    .insert({
      slug: generateSlug(),
      note_id: args.noteId,
      user_id: args.userId,
      title_snapshot: args.title,
    })
    .select("id,slug,note_id,title_snapshot,created_at")
    .single();
  if (error) throw error;
  return toNoteShare(data as ShareRow);
}

export async function revokeShare(supabase: SupabaseClient, shareId: string): Promise<void> {
  const { error } = await supabase
    .from("note_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId);
  if (error) throw error;
}

export async function listShares(supabase: SupabaseClient, userId: string): Promise<NoteShare[]> {
  const { data, error } = await supabase
    .from("note_shares")
    .select("id,slug,note_id,title_snapshot,created_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ShareRow[]).map(toNoteShare);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/sharing/shares-client.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sharing/types.ts src/lib/sharing/slug.ts src/lib/sharing/shares-client.ts src/lib/sharing/slug.test.ts src/lib/sharing/shares-client.test.ts
git commit -m "feat(sharing): client lib for slug + create/revoke/list shares"
```

---

### Task 4: Public render util (flatten wiki-links + sanitize)

**Files:**
- Modify: `package.json` (add `dompurify` + `@types/dompurify` to `devDependencies`)
- Create: `src/lib/sharing/render-html.ts`
- Create (test): `src/lib/sharing/render-html.test.ts`

**Interfaces:**
- Consumes: raw `content_html` from a note (TipTap output). Wiki-links serialize as `<a data-note-link="true" data-note-id="..." data-note-title="...">label</a>` (see `src/components/notes/NotesEditor/NoteLinkExtension.ts`).
- Produces: `export function renderSharedNoteHtml(rawHtml: string): string` — wiki-links flattened to plain text, then DOMPurify-sanitized (allow `img` with `data:` URIs, strip scripts/handlers).

- [ ] **Step 1: Add the dependency**

Run: `pnpm add -D dompurify @types/dompurify`
Expected: `package.json` devDependencies gains both; `pnpm-lock.yaml` updated. (Only consumed by the test + the marketing page; tree-shaken from the app bundle since no runtime import in app code.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/sharing/render-html.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderSharedNoteHtml } from "./render-html";

describe("renderSharedNoteHtml", () => {
  it("flattens wiki-links to plain text", () => {
    const html = `<p>See <a data-note-link="true" data-note-id="x" data-note-title="Other">Other</a> too</p>`;
    const out = renderSharedNoteHtml(html);
    expect(out).not.toContain("data-note-link");
    expect(out).not.toContain("<a");
    expect(out).toContain("Other");
  });

  it("strips script tags", () => {
    const out = renderSharedNoteHtml(`<p>ok</p><script>alert(1)</script>`);
    expect(out).not.toContain("<script");
    expect(out).toContain("ok");
  });

  it("strips inline event handlers", () => {
    const out = renderSharedNoteHtml(`<img src="data:image/png;base64,AAA" onerror="alert(1)">`);
    expect(out).not.toContain("onerror");
  });

  it("keeps base64 images", () => {
    const out = renderSharedNoteHtml(`<img src="data:image/png;base64,AAAA">`);
    expect(out).toContain("data:image/png;base64,AAAA");
  });

  it("keeps a normal external https link", () => {
    const out = renderSharedNoteHtml(`<p><a href="https://example.com">x</a></p>`);
    expect(out).toContain('href="https://example.com"');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/lib/sharing/render-html.test.ts`
Expected: FAIL — cannot find module `./render-html`.

- [ ] **Step 4: Implement the render util**

Create `src/lib/sharing/render-html.ts`:

```ts
import DOMPurify from "dompurify";

/**
 * Prepares a note's raw TipTap HTML for public display:
 *  1. Flatten wiki-links (`<a data-note-link>`) to plain text — the target note
 *     is not shared, so the link must not be clickable or leak structure.
 *  2. Sanitize with DOMPurify — allow base64 images, strip scripts/handlers.
 */
export function renderSharedNoteHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc.querySelectorAll("a[data-note-link]").forEach((el) => {
    el.replaceWith(doc.createTextNode(el.textContent ?? ""));
  });
  const flattened = doc.body.innerHTML;

  return DOMPurify.sanitize(flattened, {
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i,
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/sharing/render-html.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/sharing/render-html.ts src/lib/sharing/render-html.test.ts
git commit -m "feat(sharing): sanitize + wiki-link flatten util for public render"
```

---

### Task 5: `useNoteShares` hook

**Files:**
- Create: `src/hooks/useNoteShares.ts`
- Create (test): `src/hooks/useNoteShares.test.tsx`

**Interfaces:**
- Consumes: `supabase` (from `@/lib/supabase`), `useAuth()` for `userId`, `createShare/revokeShare/listShares` (Task 3).
- Produces: `export interface UseNoteShares { shares: NoteShare[]; loading: boolean; activeShareFor(noteId: string): NoteShare | undefined; share(noteId: string, title: string): Promise<NoteShare>; revoke(shareId: string): Promise<void>; refresh(): Promise<void> }`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useNoteShares.test.tsx`. Mock the sharing client + auth:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const listMock = vi.fn();
const createMock = vi.fn();
const revokeMock = vi.fn();
vi.mock("@/lib/sharing/shares-client", () => ({
  listShares: (...a: unknown[]) => listMock(...a),
  createShare: (...a: unknown[]) => createMock(...a),
  revokeShare: (...a: unknown[]) => revokeMock(...a),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ status: "signed-in", user: { id: "u" } }) }));

import { useNoteShares } from "./useNoteShares";

beforeEach(() => {
  listMock.mockReset().mockResolvedValue([
    { id: "1", slug: "aB3dEf9hKmNp2qrS", noteId: "n1", titleSnapshot: "T", createdAt: "t" },
  ]);
  createMock.mockReset();
  revokeMock.mockReset();
});

describe("useNoteShares", () => {
  it("loads shares and resolves activeShareFor", async () => {
    const { result } = renderHook(() => useNoteShares());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeShareFor("n1")?.slug).toBe("aB3dEf9hKmNp2qrS");
    expect(result.current.activeShareFor("nope")).toBeUndefined();
  });

  it("share() creates and adds to state", async () => {
    createMock.mockResolvedValue({ id: "2", slug: "ZZZZZZZZZZZZZZZZ", noteId: "n2", titleSnapshot: "T2", createdAt: "t" });
    const { result } = renderHook(() => useNoteShares());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.share("n2", "T2"); });
    expect(result.current.activeShareFor("n2")?.slug).toBe("ZZZZZZZZZZZZZZZZ");
  });

  it("revoke() removes from state", async () => {
    revokeMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoteShares());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.revoke("1"); });
    expect(result.current.activeShareFor("n1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/hooks/useNoteShares.test.tsx`
Expected: FAIL — cannot find module `./useNoteShares`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useNoteShares.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { NoteShare } from "@/lib/sharing/types";
import { createShare, revokeShare, listShares } from "@/lib/sharing/shares-client";

export interface UseNoteShares {
  shares: NoteShare[];
  loading: boolean;
  activeShareFor(noteId: string): NoteShare | undefined;
  share(noteId: string, title: string): Promise<NoteShare>;
  revoke(shareId: string): Promise<void>;
  refresh(): Promise<void>;
}

export function useNoteShares(): UseNoteShares {
  const auth = useAuth();
  const userId = auth.status === "signed-in" ? auth.user?.id : undefined;
  const [shares, setShares] = useState<NoteShare[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) { setShares([]); setLoading(false); return; }
    setLoading(true);
    try {
      setShares(await listShares(supabase, userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const share = useCallback(async (noteId: string, title: string): Promise<NoteShare> => {
    if (!userId) throw new Error("not signed in");
    const created = await createShare(supabase, { noteId, userId, title });
    setShares((prev) => (prev.some((s) => s.id === created.id) ? prev : [created, ...prev]));
    return created;
  }, [userId]);

  const revoke = useCallback(async (shareId: string): Promise<void> => {
    await revokeShare(supabase, shareId);
    setShares((prev) => prev.filter((s) => s.id !== shareId));
  }, []);

  const activeShareFor = useCallback(
    (noteId: string) => shares.find((s) => s.noteId === noteId),
    [shares],
  );

  return { shares, loading, activeShareFor, share, revoke, refresh };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/hooks/useNoteShares.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNoteShares.ts src/hooks/useNoteShares.test.tsx
git commit -m "feat(sharing): useNoteShares hook"
```

---

### Task 6: Share popover in the note editor

**Files:**
- Create: `src/components/notes/NotesEditor/ShareNoteButton.tsx`
- Modify: `src/components/notes/NotesEditor/NotesEditorHeader.tsx` (render `<ShareNoteButton>` in the `.note-meta` row)
- Modify: `src/locales/fr.json` and `src/locales/en.json` (add `notes.share.*` keys)
- Create (test): `src/components/notes/NotesEditor/ShareNoteButton.test.tsx`

**Interfaces:**
- Consumes: `useNoteShares()` (Task 5), `useSync()` (`enabled`), `useAuth()`, `shareUrl()` (Task 3), `NoteMeta` (`note.id`, `note.title`).
- Produces: `export function ShareNoteButton({ note }: { note: NoteMeta | null }): JSX.Element | null`.

- [ ] **Step 1: Add i18n keys**

In `src/locales/fr.json`, add under the `notes` object:

```json
"share": {
  "button": "Partager",
  "title": "Partager ce tuto",
  "syncRequired": "Active la synchronisation pour partager une note.",
  "create": "Créer un lien public",
  "creating": "Création…",
  "liveHint": "Le lien montre toujours la dernière version synchronisée.",
  "copy": "Copier le lien",
  "copied": "Lien copié",
  "stop": "Arrêter le partage",
  "stopped": "Partage arrêté"
}
```

In `src/locales/en.json`, mirror with English values:

```json
"share": {
  "button": "Share",
  "title": "Share this tutorial",
  "syncRequired": "Enable sync to share a note.",
  "create": "Create a public link",
  "creating": "Creating…",
  "liveHint": "The link always shows the latest synced version.",
  "copy": "Copy link",
  "copied": "Link copied",
  "stop": "Stop sharing",
  "stopped": "Sharing stopped"
}
```

- [ ] **Step 2: Write the failing component test**

Create `src/components/notes/NotesEditor/ShareNoteButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const syncState = { enabled: true };
const sharesApi = {
  activeShareFor: vi.fn(() => undefined as undefined | { id: string; slug: string }),
  share: vi.fn(),
  revoke: vi.fn(),
};
vi.mock("@/hooks/useSync", () => ({ useSync: () => syncState }));
vi.mock("@/hooks/useNoteShares", () => ({ useNoteShares: () => sharesApi }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }) }));

import { ShareNoteButton } from "./ShareNoteButton";

const note = { id: "n1", title: "Tuto", createdAt: "", updatedAt: "", favorite: false, order: 0 };

beforeEach(() => {
  syncState.enabled = true;
  sharesApi.activeShareFor.mockReset().mockReturnValue(undefined);
  sharesApi.share.mockReset().mockResolvedValue({ id: "s1", slug: "aB3dEf9hKmNp2qrS" });
  sharesApi.revoke.mockReset().mockResolvedValue(undefined);
});

describe("ShareNoteButton", () => {
  it("shows sync-required message when sync is off", () => {
    syncState.enabled = false;
    render(<ShareNoteButton note={note as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Share|Partager/i }));
    expect(screen.getByText(/Enable sync|synchronisation/i)).toBeInTheDocument();
  });

  it("creates a link when sync is on and no active share", async () => {
    render(<ShareNoteButton note={note as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Share|Partager/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create a public link|Créer/i }));
    await waitFor(() => expect(sharesApi.share).toHaveBeenCalledWith("n1", "Tuto"));
  });

  it("shows copy + stop when an active share exists", () => {
    sharesApi.activeShareFor.mockReturnValue({ id: "s1", slug: "aB3dEf9hKmNp2qrS" });
    render(<ShareNoteButton note={note as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Share|Partager/i }));
    expect(screen.getByRole("button", { name: /Copy link|Copier/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stop sharing|Arrêter/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/components/notes/NotesEditor/ShareNoteButton.test.tsx`
Expected: FAIL — cannot find module `./ShareNoteButton`.

- [ ] **Step 4: Implement the component**

Create `src/components/notes/NotesEditor/ShareNoteButton.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import type { NoteMeta } from "@/hooks/useNotes";
import { useSync } from "@/hooks/useSync";
import { useNoteShares } from "@/hooks/useNoteShares";
import { shareUrl } from "@/lib/sharing/slug";

export function ShareNoteButton({ note }: { note: NoteMeta | null }) {
  const { t } = useTranslation();
  const { enabled } = useSync();
  const { activeShareFor, share, revoke } = useNoteShares();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!note) return null;
  const active = activeShareFor(note.id);

  const onCreate = async () => {
    setBusy(true);
    try { await share(note.id, note.title); } finally { setBusy(false); }
  };
  const onCopy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(shareUrl(active.slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const onStop = async () => {
    if (!active) return;
    setBusy(true);
    try { await revoke(active.id); } finally { setBusy(false); }
  };

  return (
    <div className="note-share">
      <button
        type="button"
        className="note-meta-item note-share-trigger"
        aria-label={t("notes.share.button", { defaultValue: "Partager" })}
        onClick={() => setOpen((v) => !v)}
      >
        <Share2 className="w-3 h-3" />
        <span>{t("notes.share.button", { defaultValue: "Partager" })}</span>
      </button>

      {open && (
        <div className="note-share-popover" role="dialog">
          <p className="note-share-title">{t("notes.share.title", { defaultValue: "Partager ce tuto" })}</p>

          {!enabled && (
            <p className="note-share-warn">
              {t("notes.share.syncRequired", { defaultValue: "Active la synchronisation pour partager une note." })}
            </p>
          )}

          {enabled && !active && (
            <button type="button" className="note-share-action" disabled={busy} onClick={onCreate}>
              {busy
                ? t("notes.share.creating", { defaultValue: "Création…" })
                : t("notes.share.create", { defaultValue: "Créer un lien public" })}
            </button>
          )}

          {enabled && active && (
            <div className="note-share-active">
              <input className="note-share-url" readOnly value={shareUrl(active.slug)} />
              <p className="note-share-hint">
                {t("notes.share.liveHint", { defaultValue: "Le lien montre toujours la dernière version synchronisée." })}
              </p>
              <div className="note-share-buttons">
                <button type="button" onClick={onCopy}>
                  {copied
                    ? t("notes.share.copied", { defaultValue: "Lien copié" })
                    : t("notes.share.copy", { defaultValue: "Copier le lien" })}
                </button>
                <button type="button" className="note-share-stop" disabled={busy} onClick={onStop}>
                  {t("notes.share.stop", { defaultValue: "Arrêter le partage" })}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the header**

In `src/components/notes/NotesEditor/NotesEditorHeader.tsx`, import and render inside the `.note-meta` div (after the word-count block):

```tsx
import { ShareNoteButton } from "./ShareNoteButton";
// ...
      <div className="note-meta">
        {/* existing updated + wordCount blocks unchanged */}
        <ShareNoteButton note={note} />
      </div>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/components/notes/NotesEditor/ShareNoteButton.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 7: Verify the build typechecks**

Run: `pnpm build`
Expected: TypeScript compile + Vite build succeed (no type errors from the new imports).

- [ ] **Step 8: Commit**

```bash
git add src/components/notes/NotesEditor/ShareNoteButton.tsx src/components/notes/NotesEditor/ShareNoteButton.test.tsx src/components/notes/NotesEditor/NotesEditorHeader.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat(sharing): share popover in note editor header"
```

---

### Task 7: "My shared links" panel in Settings

**Files:**
- Create: `src/components/settings/sections/SharedLinksPanel.tsx`
- Modify: `src/components/settings/sections/AccountSection.tsx` (render `<SharedLinksPanel>` when signed-in)
- Modify: `src/locales/fr.json` and `src/locales/en.json` (add `settings.sharedLinks.*` keys)
- Create (test): `src/components/settings/sections/SharedLinksPanel.test.tsx`

**Interfaces:**
- Consumes: `useNoteShares()` (Task 5), `shareUrl()` (Task 3).
- Produces: `export function SharedLinksPanel(): JSX.Element`.

- [ ] **Step 1: Add i18n keys**

In `src/locales/fr.json` under `settings`:

```json
"sharedLinks": {
  "heading": "Mes liens partagés",
  "empty": "Aucun lien actif.",
  "copy": "Copier",
  "revoke": "Révoquer",
  "loading": "Chargement…"
}
```

In `src/locales/en.json` under `settings`:

```json
"sharedLinks": {
  "heading": "My shared links",
  "empty": "No active links.",
  "copy": "Copy",
  "revoke": "Revoke",
  "loading": "Loading…"
}
```

- [ ] **Step 2: Write the failing test**

Create `src/components/settings/sections/SharedLinksPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const sharesApi = {
  shares: [] as Array<{ id: string; slug: string; noteId: string; titleSnapshot: string; createdAt: string }>,
  loading: false,
  revoke: vi.fn(),
};
vi.mock("@/hooks/useNoteShares", () => ({ useNoteShares: () => sharesApi }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }) }));

import { SharedLinksPanel } from "./SharedLinksPanel";

beforeEach(() => {
  sharesApi.shares = [
    { id: "1", slug: "aB3dEf9hKmNp2qrS", noteId: "n1", titleSnapshot: "Tuto A", createdAt: "2026-06-25" },
  ];
  sharesApi.loading = false;
  sharesApi.revoke.mockReset().mockResolvedValue(undefined);
});

describe("SharedLinksPanel", () => {
  it("lists active shares with their title", () => {
    render(<SharedLinksPanel />);
    expect(screen.getByText("Tuto A")).toBeInTheDocument();
  });

  it("shows empty state when no shares", () => {
    sharesApi.shares = [];
    render(<SharedLinksPanel />);
    expect(screen.getByText(/No active links|Aucun lien/i)).toBeInTheDocument();
  });

  it("revokes a share on click", async () => {
    render(<SharedLinksPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Revoke|Révoquer/i }));
    await waitFor(() => expect(sharesApi.revoke).toHaveBeenCalledWith("1"));
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/components/settings/sections/SharedLinksPanel.test.tsx`
Expected: FAIL — cannot find module `./SharedLinksPanel`.

- [ ] **Step 4: Implement the panel**

Create `src/components/settings/sections/SharedLinksPanel.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useNoteShares } from "@/hooks/useNoteShares";
import { shareUrl } from "@/lib/sharing/slug";

export function SharedLinksPanel() {
  const { t } = useTranslation();
  const { shares, loading, revoke } = useNoteShares();

  return (
    <section className="settings-block">
      <h3 className="settings-block-title">
        {t("settings.sharedLinks.heading", { defaultValue: "Mes liens partagés" })}
      </h3>

      {loading ? (
        <p className="settings-muted">{t("settings.sharedLinks.loading", { defaultValue: "Chargement…" })}</p>
      ) : shares.length === 0 ? (
        <p className="settings-muted">{t("settings.sharedLinks.empty", { defaultValue: "Aucun lien actif." })}</p>
      ) : (
        <ul className="shared-links-list">
          {shares.map((s) => (
            <li key={s.id} className="shared-links-item">
              <span className="shared-links-title truncate">{s.titleSnapshot}</span>
              <div className="shared-links-actions">
                <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl(s.slug))}>
                  {t("settings.sharedLinks.copy", { defaultValue: "Copier" })}
                </button>
                <button type="button" className="shared-links-revoke" onClick={() => void revoke(s.id)}>
                  {t("settings.sharedLinks.revoke", { defaultValue: "Révoquer" })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Wire into AccountSection**

In `src/components/settings/sections/AccountSection.tsx`, import `SharedLinksPanel` and render it in the signed-in branch (near `SyncedInventoryGrid`):

```tsx
import { SharedLinksPanel } from "./SharedLinksPanel";
// ... inside the signed-in JSX, after the sync inventory:
        <SharedLinksPanel />
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/components/settings/sections/SharedLinksPanel.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 7: Run the full unit suite + build**

Run: `pnpm vitest run && pnpm build`
Expected: all tests pass; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/settings/sections/SharedLinksPanel.tsx src/components/settings/sections/SharedLinksPanel.test.tsx src/components/settings/sections/AccountSection.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat(sharing): my shared links panel in account settings"
```

---

### Task 8: Deploy config, marketing-page contract, E2E checklist & ADR

**Files:**
- Create: `docs/v3/decisions/0018-note-public-sharing.md` (ADR)
- Create: `docs/v3/04-note-sharing-e2e-checklist.md`
- Create: `docs/v3/note-sharing-public-page-contract.md` (cross-repo contract for the marketing site)

**Interfaces:**
- Consumes: everything above. No app code in this task.

- [ ] **Step 1: Write the public-page contract**

Create `docs/v3/note-sharing-public-page-contract.md` documenting, for the separate marketing repo:
- Route `lexena.app/s/:slug`.
- Fetch: `GET https://<project>.supabase.co/functions/v1/share-view?s=<slug>` with header `apikey: <publishable key>` (anon endpoint; `verify_jwt = false`). Responses: `200 { title, contentHtml, updatedAt }`, `400 { error: "invalid_slug" }`, `404 { error: "not_found" }`.
- Render: port `src/lib/sharing/render-html.ts` (flatten wiki-links + DOMPurify) — copy the file and its test into the marketing repo; do not skip the sanitize step.
- CSP: `default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`.
- States: loading, 404 ("This link no longer exists or was disabled"), network error. Add a discreet "Made with Lexena" CTA.

- [ ] **Step 2: Write the E2E checklist**

Create `docs/v3/04-note-sharing-e2e-checklist.md` with the manual cases (blocking before beta tag):
1. Sync OFF → Share button shows "enable sync" message, no link created.
2. Sync ON → create link → open in private browser window → tutorial + base64 images render.
3. Edit the note → re-open the link → change is reflected (live).
4. Note with a wiki-link → public page shows the label as plain text (not clickable).
5. Revoke from editor popover → link returns 404.
6. Revoke from Settings panel → link returns 404, disappears from list.
7. Re-share after revoke → a NEW slug is issued; the old URL stays 404.
8. Inject `<script>` / `<img onerror>` into a note → public page does not execute it.
9. Soft-delete the note → link returns 404.
10. Two profiles / two accounts → cannot list or revoke each other's shares.

- [ ] **Step 3: Write the closure ADR**

Create `docs/v3/decisions/0018-note-public-sharing.md` capturing the validated decisions: live link (coupled to sync), `note_shares` no-content-copy model, anonymous `share-view` (service role) + DOMPurify on the public page, one active share per note with new-slug-on-reshare, no paywall at MVP, wiki-links flattened, no expiry/password. Link back to the spec.

- [ ] **Step 4: Deploy backend (remote) — operator step**

Run (operator, when authorized):
```bash
pnpm exec supabase db push                       # applies the note_shares migration
pnpm exec supabase functions deploy share-view --no-verify-jwt
```
Expected: migration applied; function deployed and reachable anonymously. (If deploy is gated, leave as a documented follow-up in the checklist.)

- [ ] **Step 5: Commit**

```bash
git add docs/v3/decisions/0018-note-public-sharing.md docs/v3/04-note-sharing-e2e-checklist.md docs/v3/note-sharing-public-page-contract.md
git commit -m "docs(sharing): adr, e2e checklist and public-page contract"
```

---

## Self-Review

**Spec coverage:**
- §4 architecture → Tasks 1 (table), 2 (edge fn), 3/5 (app client+hook), 6/7 (UI), 8 (page contract). ✓
- §5 data model → Task 1 (exact DDL + partial unique index). ✓
- §6 edge function (404 semantics, slug validation, no field leak) → Task 2 tests. ✓
- §7 public page (sanitize + flatten wiki-links + CSP) → Task 4 util + Task 8 contract. ✓
- §8 frontend (share action, sync-required CTA, my-links panel, i18n) → Tasks 6, 7. ✓
- §9 default decisions (no paywall, flatten, one active share/new slug, no expiry) → enforced in Task 1 (unique index), Task 4 (flatten), Task 3 (reshare path), captured in Task 8 ADR. ✓
- §10 security (slug entropy, sanitize, service-role scoping, CORS) → Tasks 2, 3, 4. ✓
- §11 tests (pgTAP, Deno, Vitest) → Tasks 1, 2, 3, 4, 5, 6, 7. ✓

**Placeholder scan:** no "TBD"/"handle edge cases"/uncoded steps — every code step ships real code. ✓

**Type consistency:** `NoteShare` fields (`id/slug/noteId/titleSnapshot/createdAt`) used identically in Tasks 3, 5, 6, 7. `createShare/revokeShare/listShares` signatures match between Task 3 (definition), Task 5 (consumption), Task 5 test mock. `handleShareView`/`isValidSlug` match between Task 2 impl and test. `renderSharedNoteHtml` single signature in Task 4. ✓

**Gaps fixed inline:** added `note_shares_slug_active_idx` (Task 1) to keep the public lookup fast; added `pnpm build` typecheck gates (Tasks 6, 7).
