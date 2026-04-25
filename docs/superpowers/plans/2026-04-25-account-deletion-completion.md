# Account Deletion — 30-day Purge Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the account deletion pipeline so the existing "Supprimer mon compte" button effectively removes all user data after 30 days, blocks re-login during the grace period with a cancel option, and revokes sessions on all devices on request.

**Architecture:** Tombstone-driven workflow. The existing RPC `request_account_deletion` is tightened (AAL2 enforcement when MFA enrolled), a symmetric `cancel_account_deletion` RPC is added, and a Supabase Edge Function `purge-account-deletions` triggered daily by `pg_cron` calls `auth.admin.deleteUser()` for each tombstone older than 30 days, relying on existing `on delete cascade` FKs to wipe the data tables. The frontend reads the tombstone post-AAL2 via `AuthContext` and routes to a dedicated `DeletionPendingScreen` that gates app access.

**Tech Stack:** Supabase Postgres + RLS + pg_cron, Supabase Edge Functions (Deno), supabase-js v2, Tauri 2 (Rust + React 19 + TypeScript), react-i18next, Vitest, pgtap. Spec : `docs/superpowers/specs/2026-04-25-account-deletion-completion-design.md`.

**Spec deltas accepted by this plan:**
- The spec proposed a helper `extractAalFromJwt`. The existing `AuthContext.evaluateMfa()` already discriminates `signed-in` vs `mfa-required` based on AAL (cf. `src/contexts/AuthContext.tsx:62-76`). Reading the JWT claim manually is therefore redundant — the deletion-pending check uses `status === "signed-in"` as the AAL2-reached signal.
- The spec proposed an asynchronous helper `requireAal2()`. We instead surface the `aal2_required` RPC error as a user-actionable message + call `reevaluateMfa()` (already exposed) to trigger the existing MFA challenge UI. The user manually retries the action after completing 2FA. This keeps logic linear and avoids new state-promise plumbing.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260501000510_account_deletion_v2.sql` | Tighten `request_account_deletion` (AAL2) + new `cancel_account_deletion` RPC |
| `supabase/migrations/20260501000520_account_deletion_cron.sql` | `pg_cron` daily job calling the Edge Function via `net.http_post` |
| `supabase/tests/account_deletion.sql` | pgtap tests for both RPCs (auth, AAL2 enforcement, RLS) |
| `supabase/functions/purge-account-deletions/index.ts` | Edge Function: select tombstones >30d via DELETE-RETURNING, call `admin.deleteUser` per uid |
| `supabase/functions/purge-account-deletions/test.ts` | Deno tests with mocked admin client |
| `src/lib/sync/local-purge.ts` | `purgeLocalCloudData()` — wipes sync stores + invokes backend backup purge |
| `src/lib/sync/local-purge.test.ts` | Vitest covering store deletion + invoke calls |
| `src/components/auth/DeletionPendingScreen.tsx` | Dedicated screen shown when a deletion request is pending |
| `src/components/settings/sections/account/DangerCard.tsx` | Extracted from `AccountSection.tsx`, new flow with global signOut + local purge |
| `docs/v3/decisions/0011-account-deletion-completion.md` | ADR closing the deferral tracked in 0009/0010 |
| `docs/v3/runbooks/account-deletion-purge.md` | Operator runbook (manual trigger, troubleshoot, rollback) |
| `docs/v3/03-account-deletion-e2e-checklist.md` | E2E manual checklist |

### Modified

| Path | Change |
|---|---|
| `src-tauri/src/sync.rs` | Add `delete_all_local_backups` Tauri command |
| `src-tauri/src/lib.rs` | Register the new command in `invoke_handler` |
| `src/contexts/AuthContext.tsx` | Add `deletionPending` state + effect that queries the tombstone when `status === "signed-in"` |
| `src/components/settings/sections/AccountSection.tsx` | Remove inline `DangerCard`, import the extracted component |
| `src/App.tsx` | Route to `DeletionPendingScreen` when `auth.deletionPending` is set |
| `src/locales/fr.json` | Add `auth.deletion_pending.*` + `sync.delete_account.aal2_required` |
| `src/locales/en.json` | Same keys, English |
| `docs/v3/compliance/registre-traitements.md` | Add the automated 30-day purge entry |

---

## Phase 1 — Backend (Supabase)

### Task 1: SQL migration — tighten `request_account_deletion` + add `cancel_account_deletion`

**Files:**
- Create: `supabase/migrations/20260501000510_account_deletion_v2.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Tighten request_account_deletion to require AAL2 when MFA is enrolled,
-- and add the symmetric cancel_account_deletion RPC.

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  has_mfa boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1 from auth.mfa_factors
    where user_id = uid and status = 'verified'
  ) into has_mfa;

  if has_mfa and user_aal <> 'aal2' then
    raise exception 'aal2_required' using errcode = '42501';
  end if;

  insert into public.account_deletion_requests (user_id)
  values (uid)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  has_mfa boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1 from auth.mfa_factors
    where user_id = uid and status = 'verified'
  ) into has_mfa;

  if has_mfa and user_aal <> 'aal2' then
    raise exception 'aal2_required' using errcode = '42501';
  end if;

  delete from public.account_deletion_requests where user_id = uid;
end;
$$;

grant execute on function public.cancel_account_deletion() to authenticated;
```

- [ ] **Step 2: Apply locally to verify SQL syntax**

Run: `pnpm exec supabase db reset`
Expected: migration applies without error, output shows `applying migration ... 20260501000510_account_deletion_v2.sql`. If it errors on `auth.mfa_factors`, the table is `auth.mfa_factors` in Supabase by default — confirm via `\d auth.mfa_factors` in Studio.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260501000510_account_deletion_v2.sql
git commit -m "feat: tighten request_account_deletion AAL2 + add cancel RPC"
```

---

### Task 2: pgtap tests for the RPCs

**Files:**
- Create: `supabase/tests/account_deletion.sql`

- [ ] **Step 1: Write the failing tests**

```sql
begin;
select plan(10);

-- Fixture: two users
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, instance_id)
values
  ('11111111-1111-1111-1111-111111111111', 'a@test', '', now(), '{}', '{}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', '', now(), '{}', '{}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- Verified MFA factor for user A
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'totp', 'totp', 'verified', 'x', now(), now());

-- Helper: simulate auth.jwt + auth.uid for a user at a given AAL
create or replace function tests.simulate_jwt(user_id uuid, aal text)
returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', user_id::text, 'aal', aal, 'role', 'authenticated')::text, true);
$$;

-- (1) Anonymous: not authenticated
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.request_account_deletion() $$, 'not authenticated');

-- (2) User without MFA at AAL1: insert succeeds
select tests.simulate_jwt('22222222-2222-2222-2222-222222222222', 'aal1');
select lives_ok($$ select public.request_account_deletion() $$);
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'tombstone inserted for user without MFA at AAL1'
);

-- (3) User with MFA at AAL1: aal2_required
select tests.simulate_jwt('11111111-1111-1111-1111-111111111111', 'aal1');
select throws_ok($$ select public.request_account_deletion() $$, 'aal2_required');

-- (4) User with MFA at AAL2: insert succeeds
select tests.simulate_jwt('11111111-1111-1111-1111-111111111111', 'aal2');
select lives_ok($$ select public.request_account_deletion() $$);

-- (5) RLS cross-tenant SELECT: user B cannot see user A's tombstone
select tests.simulate_jwt('22222222-2222-2222-2222-222222222222', 'aal2');
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'RLS: user B cannot see user A tombstone'
);

-- (6) RLS cross-tenant DELETE: user B's delete is invisible to user A's row
delete from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111';
-- Switch to postgres to bypass RLS and verify user A's row still exists
set local role postgres;
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'RLS: user B cannot delete user A tombstone'
);
-- Restore user A's session for the cancel tests that follow
set local role authenticated;
select tests.simulate_jwt('11111111-1111-1111-1111-111111111111', 'aal2');

-- (7) cancel_account_deletion symmetry: AAL1+MFA fails
select tests.simulate_jwt('11111111-1111-1111-1111-111111111111', 'aal1');
select throws_ok($$ select public.cancel_account_deletion() $$, 'aal2_required');

-- (8) cancel_account_deletion at AAL2 deletes own row
select tests.simulate_jwt('11111111-1111-1111-1111-111111111111', 'aal2');
select lives_ok($$ select public.cancel_account_deletion() $$);
select is(
  (select count(*)::int from public.account_deletion_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'tombstone deleted'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run tests to verify they fail (function not yet applied if you reset)**

Run: `pnpm exec supabase db test`
Expected: 10/10 pass (the migration from Task 1 is loaded by `db reset`). If they fail with "function does not exist", run `pnpm exec supabase db reset` first to apply Task 1's migration.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/account_deletion.sql
git commit -m "test: pgtap coverage for account deletion RPCs"
```

---

### Task 3: Edge Function `purge-account-deletions`

**Files:**
- Create: `supabase/functions/purge-account-deletions/index.ts`
- Create: `supabase/functions/purge-account-deletions/test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/purge-account-deletions/test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supabase/functions/purge-account-deletions && deno test --allow-net --allow-env --allow-read`
Expected: FAIL with "module not found" for `./index.ts`.

- [ ] **Step 3: Write the Edge Function**

```ts
// supabase/functions/purge-account-deletions/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface Deps {
  cronSecret: string;
  selectExpired: () => Promise<string[]>;
  deleteUser: (uid: string) => Promise<{ data: any; error: { message: string } | null }>;
}

function realDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET")!;
  const client: SupabaseClient = createClient(url, key);

  return {
    cronSecret,
    async selectExpired() {
      // DELETE-RETURNING is atomic: a concurrent cancel either races us out
      // (no row to delete) or loses (tombstone removed before its delete fires).
      const { data, error } = await client.rpc("execute_purge_select", {});
      if (error) {
        // fallback raw query
        const { data: rows, error: e2 } = await client
          .from("account_deletion_requests")
          .delete()
          .lt("requested_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
          .select("user_id");
        if (e2) throw e2;
        return (rows ?? []).map((r: any) => r.user_id as string);
      }
      return (data ?? []) as string[];
    },
    async deleteUser(uid) {
      return await client.auth.admin.deleteUser(uid);
    },
  };
}

export async function handler(req: Request, deps: Deps): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${deps.cronSecret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const start = performance.now();
  const uids = await deps.selectExpired();
  const errors: Array<{ uid: string; message: string }> = [];
  let purged = 0;

  for (const uid of uids) {
    const { error } = await deps.deleteUser(uid);
    if (error) {
      errors.push({ uid, message: error.message });
      continue;
    }
    purged++;
  }

  const duration_ms = Math.round(performance.now() - start);
  console.log(JSON.stringify({ event: "purge_run", purged, errors: errors.length, duration_ms }));
  return new Response(JSON.stringify({ purged, errors, duration_ms }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve((req) => handler(req, realDeps()));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions/purge-account-deletions && deno test --allow-net --allow-env --allow-read`
Expected: 3 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/purge-account-deletions/
git commit -m "feat: edge function purge-account-deletions"
```

---

### Task 4: SQL migration — schedule the cron

**Files:**
- Create: `supabase/migrations/20260501000520_account_deletion_cron.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Daily cron at 03:00 UTC. URL and secret are stored as Postgres GUC settings
-- (set out-of-band via `alter database postgres set app.settings.* = ...`).

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'purge-account-deletions-daily',
  '0 3 * * *',
  $cron$
    select net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/purge-account-deletions',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
```

- [ ] **Step 2: Verify the migration applies**

Run: `pnpm exec supabase db reset`
Expected: migration applies. Note: locally, `pg_cron` may not be enabled — the migration succeeds anyway because of `if not exists`. The schedule call may also no-op locally; on Supabase remote it'll work.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260501000520_account_deletion_cron.sql
git commit -m "feat: schedule daily purge-account-deletions via pg_cron"
```

---

## Phase 2 — Frontend (Tauri / React)

### Task 5: Tauri command `delete_all_local_backups`

**Files:**
- Modify: `src-tauri/src/sync.rs` (add command at end)
- Modify: `src-tauri/src/lib.rs:130-141` (register command)

- [ ] **Step 1: Append the command in `src-tauri/src/sync.rs`**

```rust
#[tauri::command]
pub async fn delete_all_local_backups(app: AppHandle) -> Result<u32, String> {
    let dir = backups_dir(&app)?;
    let mut deleted: u32 = 0;
    for entry in fs::read_dir(&dir).map_err(|e| format!("cannot read backups dir: {}", e))? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let name = match path.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => continue,
        };
        if !name.starts_with(BACKUP_FILE_PREFIX) || !name.ends_with(".json") {
            continue;
        }
        if let Err(e) = fs::remove_file(&path) {
            warn!("failed to remove backup {:?}: {}", path, e);
            continue;
        }
        deleted += 1;
    }
    info!("delete_all_local_backups removed {} files", deleted);
    Ok(deleted)
}
```

- [ ] **Step 2: Register the command in `src-tauri/src/lib.rs`**

Replace the line `sync::delete_local_backup,` with:

```
            sync::delete_local_backup,
            sync::delete_all_local_backups,
            sync::save_export_to_download,
```

(Insert `delete_all_local_backups` between `delete_local_backup` and `save_export_to_download`.)

- [ ] **Step 3: Verify it compiles**

Run: `LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/sync.rs src-tauri/src/lib.rs
git commit -m "feat: tauri command delete_all_local_backups"
```

---

### Task 6: `purgeLocalCloudData()` lib + vitest

**Files:**
- Create: `src/lib/sync/local-purge.ts`
- Create: `src/lib/sync/local-purge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sync/local-purge.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const clearedPaths: string[] = [];
const invokeCalls: string[] = [];

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(async (path: string) => ({
      _path: path,
      clear: async () => { clearedPaths.push(path); },
      save: async () => {},
    })),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => { invokeCalls.push(cmd); return 0; }),
}));

import { purgeLocalCloudData } from "./local-purge";

describe("purgeLocalCloudData", () => {
  beforeEach(() => {
    clearedPaths.length = 0;
    invokeCalls.length = 0;
  });

  it("clears all sync stores and calls delete_all_local_backups", async () => {
    await purgeLocalCloudData();
    expect(clearedPaths.sort()).toEqual([
      "sync-dictionary.json",
      "sync-meta.json",
      "sync-queue.json",
      "sync-snippets.json",
    ]);
    expect(invokeCalls).toEqual(["delete_all_local_backups"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/sync/local-purge.test.ts`
Expected: FAIL with "Cannot find module './local-purge'".

- [ ] **Step 3: Implement the lib**

```ts
// src/lib/sync/local-purge.ts
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";

const STORES = [
  "sync-snippets.json",
  "sync-dictionary.json",
  "sync-queue.json",
  "sync-meta.json",
] as const;

export async function purgeLocalCloudData(): Promise<void> {
  for (const file of STORES) {
    try {
      const store = await Store.load(file);
      await store.clear();
      await store.save();
    } catch {
      // store may not exist yet — not an error
    }
  }
  await invoke<number>("delete_all_local_backups").catch(() => 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/sync/local-purge.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/local-purge.ts src/lib/sync/local-purge.test.ts
git commit -m "feat: purgeLocalCloudData wipes sync caches and local backups"
```

---

### Task 7: AuthContext deletion-pending state + effect

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add the state and exposed type**

In the `AuthContextValue` interface (after `signOut`), add:

```ts
  /** Populated when a deletion request exists for the current user. */
  deletionPending: { requestedAt: string; purgeAt: string } | null;
  /** Refreshes the deletionPending state from the DB (used after cancel). */
  refreshDeletionPending: () => Promise<void>;
```

In the `AuthProvider` body, add the state:

```ts
  const [deletionPending, setDeletionPending] = useState<
    { requestedAt: string; purgeAt: string } | null
  >(null);
```

- [ ] **Step 2: Add a query helper inside `AuthProvider`**

After the `evaluateMfa` function, add:

```ts
  async function fetchDeletionPending(userId: string) {
    const { data, error } = await supabase
      .from("account_deletion_requests")
      .select("requested_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      flog(`deletion-pending check failed: ${error.message}`, "warn");
      return null;
    }
    if (!data) return null;
    const requestedAt = data.requested_at as string;
    const purgeAt = new Date(
      new Date(requestedAt).getTime() + 30 * 24 * 3600 * 1000,
    ).toISOString();
    return { requestedAt, purgeAt };
  }

  async function refreshDeletionPending() {
    if (!session?.user) {
      setDeletionPending(null);
      return;
    }
    const pending = await fetchDeletionPending(session.user.id);
    setDeletionPending(pending);
  }
```

- [ ] **Step 3: Trigger the check when status flips to `signed-in`**

Anywhere among the existing `useEffect` hooks in `AuthProvider` (after the auth-state-change subscription is fine — order doesn't matter here since this effect only reads from state), add a new effect:

```ts
  useEffect(() => {
    if (status !== "signed-in" || !session?.user) {
      setDeletionPending(null);
      return;
    }
    void (async () => {
      const pending = await fetchDeletionPending(session.user.id);
      setDeletionPending(pending);
    })();
  }, [status, session?.user?.id]);
```

Note: `status === "signed-in"` already implies AAL2 is reached (or no MFA enrolled) — `evaluateMfa` in this same file (lines 62-76) returns `"mfa-required"` instead when AAL elevation is needed. Reading the JWT claim manually is therefore unnecessary.

- [ ] **Step 4: Expose `deletionPending` and `refreshDeletionPending` in the value**

In the `useMemo` block that builds the context value (around line 295-318), add:

```ts
      deletionPending,
      refreshDeletionPending,
```

Add `deletionPending` to the dependency array.

- [ ] **Step 5: Verify it builds**

Run: `pnpm build`
Expected: no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: AuthContext exposes deletionPending state"
```

---

### Task 8: i18n keys

**Files:**
- Modify: `src/locales/fr.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: Add keys in `fr.json`**

Find the `auth` block, add a new sibling `deletion_pending` block:

```json
    "deletion_pending": {
      "title": "Suppression de compte en attente",
      "headline": "Tu as demandé la suppression de ton compte",
      "requested_at": "Demande effectuée le {{date}}",
      "purge_at": "Purge définitive prévue le {{date}}",
      "remaining": "{{count}} jour restant",
      "remaining_plural": "{{count}} jours restants",
      "cancel": "Annuler la suppression",
      "cancel_busy": "Annulation en cours…",
      "cancel_error": "Impossible d'annuler : {{message}}",
      "aal2_required": "Vérification 2FA requise. Termine le challenge MFA puis réessaie.",
      "signout": "Se déconnecter",
      "local_mode": "Continuer en mode local"
    }
```

In `sync.delete_account`, add:

```json
      "aal2_required": "Vérification 2FA requise pour confirmer la suppression. Termine le challenge MFA puis réessaie.",
```

- [ ] **Step 2: Add the same keys in `en.json`**

```json
    "deletion_pending": {
      "title": "Account deletion pending",
      "headline": "You requested the deletion of your account",
      "requested_at": "Requested on {{date}}",
      "purge_at": "Final purge scheduled for {{date}}",
      "remaining": "{{count}} day left",
      "remaining_plural": "{{count}} days left",
      "cancel": "Cancel deletion",
      "cancel_busy": "Cancelling…",
      "cancel_error": "Unable to cancel: {{message}}",
      "aal2_required": "2FA verification required. Complete the MFA challenge and retry.",
      "signout": "Sign out",
      "local_mode": "Continue in local mode"
    }
```

In `sync.delete_account`:

```json
      "aal2_required": "2FA verification required to confirm deletion. Complete the MFA challenge and retry.",
```

- [ ] **Step 3: Commit**

```bash
git add src/locales/fr.json src/locales/en.json
git commit -m "feat(i18n): keys for deletion-pending screen and AAL2 errors"
```

---

### Task 9: `DeletionPendingScreen` component

**Files:**
- Create: `src/components/auth/DeletionPendingScreen.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export function DeletionPendingScreen() {
  const { t, i18n } = useTranslation();
  const { deletionPending, refreshDeletionPending, signOut, reevaluateMfa } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!deletionPending) return null;

  const requestedDate = new Date(deletionPending.requestedAt);
  const purgeDate = new Date(deletionPending.purgeAt);
  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const remainingDays = Math.max(
    0,
    Math.ceil((purgeDate.getTime() - Date.now()) / (24 * 3600 * 1000)),
  );

  async function onCancel() {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("cancel_account_deletion");
      if (rpcError) {
        if (rpcError.message.includes("aal2_required")) {
          setError(t("auth.deletion_pending.aal2_required"));
          await reevaluateMfa();
          return;
        }
        throw rpcError;
      }
      await refreshDeletionPending();
    } catch (e: unknown) {
      setError(
        t("auth.deletion_pending.cancel_error", {
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vt-app min-h-screen flex items-center justify-center p-8">
      <div
        className="vt-card-sectioned max-w-[520px] w-full"
        style={{
          borderColor: "oklch(from var(--vt-danger) l c h / 0.4)",
        }}
      >
        <div
          className="px-6 py-5 flex items-start gap-3"
          style={{
            borderBottom: "1px solid oklch(from var(--vt-danger) l c h / 0.25)",
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "oklch(from var(--vt-danger) l c h / 0.15)",
              color: "var(--vt-danger)",
            }}
            aria-hidden
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-[18px] font-semibold" style={{ color: "var(--vt-danger)" }}>
              {t("auth.deletion_pending.title")}
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--vt-fg-2)" }}>
              {t("auth.deletion_pending.headline")}
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3 text-[13px]" style={{ color: "var(--vt-fg-2)" }}>
          <p>{t("auth.deletion_pending.requested_at", { date: dateFmt.format(requestedDate) })}</p>
          <p>
            {t("auth.deletion_pending.purge_at", { date: dateFmt.format(purgeDate) })}
            {" — "}
            <span style={{ color: "var(--vt-warn)" }}>
              {t("auth.deletion_pending.remaining", { count: remainingDays })}
            </span>
          </p>
          {error && (
            <p className="text-[12px]" style={{ color: "var(--vt-danger)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 flex flex-wrap items-center gap-2 justify-end" style={{ borderTop: "1px solid var(--vt-border)" }}>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={busy}
            className="vt-btn"
          >
            {t("auth.deletion_pending.signout")}
          </button>
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            className="vt-btn-primary"
          >
            {busy
              ? t("auth.deletion_pending.cancel_busy")
              : t("auth.deletion_pending.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm build`
Expected: no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/DeletionPendingScreen.tsx
git commit -m "feat: DeletionPendingScreen with cancel + signout"
```

---

### Task 10: Wire the screen into `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate the auth status branch**

Open `src/App.tsx`, find where the AuthContext is consumed and the app body is rendered (likely a guard around `status === "signed-in"`). Just before the normal `signed-in` rendering, add a check on `deletionPending`.

- [ ] **Step 2: Add the route**

```tsx
import { DeletionPendingScreen } from "@/components/auth/DeletionPendingScreen";
// ...
const { status, deletionPending } = useAuth();
// ...
if (status === "signed-in" && deletionPending) {
  return <DeletionPendingScreen />;
}
```

Place this BEFORE the normal app body rendering but AFTER the `loading` and `mfa-required` branches. The user must be fully authenticated (status === "signed-in") before we trust the `deletionPending` flag.

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: route to DeletionPendingScreen when deletion is pending"
```

---

### Task 11: Extract `DangerCard` and update its flow

**Files:**
- Create: `src/components/settings/sections/account/DangerCard.tsx`
- Modify: `src/components/settings/sections/AccountSection.tsx`

- [ ] **Step 1: Create the extracted component**

Copy the `DangerCard` function from `AccountSection.tsx:801-940` into the new file, then rewrite `onDelete()`. Full contents:

```tsx
// src/components/settings/sections/account/DangerCard.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { purgeLocalCloudData } from "@/lib/sync/local-purge";
import { VtIcon } from "../../vt";

export function DangerCard() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmWord = t("sync.delete_account.confirm_word");

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("request_account_deletion");
      if (rpcError) {
        if (rpcError.message.includes("aal2_required")) {
          setError(t("sync.delete_account.aal2_required"));
          await auth.reevaluateMfa();
          return;
        }
        throw rpcError;
      }
      await purgeLocalCloudData();
      await supabase.auth.signOut({ scope: "global" });
      // signOut will flip status to "signed-out"; the modal closes naturally.
      alert(t("sync.delete_account.submitted"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="vt-card-sectioned"
      style={{
        overflow: "hidden",
        borderColor: "oklch(from var(--vt-danger) l c h / 0.35)",
      }}
    >
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{
          borderBottom: "1px solid oklch(from var(--vt-danger) l c h / 0.25)",
        }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: "oklch(from var(--vt-danger) l c h / 0.15)",
            color: "var(--vt-danger)",
          }}
        >
          <VtIcon.alert />
        </div>
        <div className="flex-1">
          <h3
            className="text-[14px] font-semibold"
            style={{ color: "var(--vt-danger)" }}
          >
            {t("sync.delete_account.title")}
          </h3>
          <p className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("sync.delete_account.description")}
          </p>
        </div>
      </div>
      <div className="vt-row flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 pr-4">
          <div className="text-[13px] font-medium" style={{ color: "var(--vt-danger)" }}>
            {t("sync.delete_account.start")}
          </div>
          {!open && (
            <div className="text-[12px] mt-0.5" style={{ color: "var(--vt-fg-3)" }}>
              {t("auth.account.deleteAccountWarning")}
            </div>
          )}
          {open && (
            <div className="mt-3 space-y-2">
              <p className="text-[12px]" style={{ color: "var(--vt-fg-2)" }}>
                {t("sync.delete_account.confirm_prompt", { word: confirmWord })}
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmWord}
                className="w-full h-9 px-3 rounded-md vt-mono text-[13px]"
                style={{
                  background: "var(--vt-surface)",
                  border: "1px solid var(--vt-border)",
                  color: "var(--vt-fg)",
                }}
              />
              {error && (
                <p className="text-[12px]" style={{ color: "var(--vt-danger)" }}>
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="vt-btn"
              style={{
                color: "var(--vt-danger)",
                borderColor: "oklch(from var(--vt-danger) l c h / 0.4)",
              }}
            >
              <VtIcon.trash />
              {t("sync.delete_account.start")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirmText("");
                  setError(null);
                }}
                disabled={busy}
                className="vt-btn"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy || confirmText !== confirmWord}
                onClick={() => void onDelete()}
                className="vt-btn-primary"
                style={{ background: "var(--vt-danger)" }}
              >
                {busy
                  ? t("sync.delete_account.deleting")
                  : t("sync.delete_account.confirm")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove the inline `DangerCard` from `AccountSection.tsx`**

In `AccountSection.tsx`:
- Delete the entire `function DangerCard()` block (lines ~799-940).
- Delete its accent constant if unused after removal.
- Add the import at the top: `import { DangerCard } from "./account/DangerCard";`
- Verify `SignedInBlocks` still uses `<DangerCard />`.

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/sections/account/DangerCard.tsx src/components/settings/sections/AccountSection.tsx
git commit -m "refactor: extract DangerCard + integrate global signOut and local purge"
```

---

## Phase 3 — Documentation

### Task 12: ADR + runbook + E2E checklist + RGPD register

**Files:**
- Create: `docs/v3/decisions/0011-account-deletion-completion.md`
- Create: `docs/v3/runbooks/account-deletion-purge.md`
- Create: `docs/v3/03-account-deletion-e2e-checklist.md`
- Modify: `docs/v3/compliance/registre-traitements.md`

- [ ] **Step 1: Write the ADR**

```markdown
# 0011 — Account deletion: closure of the 30-day purge pipeline

**Date** : 2026-04-25
**Statut** : décidé
**Clôt** : reports tracés dans 0009 et 0010 ("Edge Function purge-account-deletions cron 30j")

## Contexte

L'épique v3 ne peut pas sortir publiquement avec un bouton "Supprimer mon compte" qui ne supprime rien. Le pipeline de purge avait été reporté lors des sub-épiques 01 et 02 ; ce sous-chantier le ferme.

## Décisions

- **Grace period** : 30 jours, conforme RGPD.
- **Mécanisme de purge** : `pg_cron` quotidien (03:00 UTC) → Edge Function `purge-account-deletions` → `auth.admin.deleteUser(uid)` pour chaque tombstone expirée → cascade FK sur toutes les tables user.
- **AAL2** : `request_account_deletion` et `cancel_account_deletion` exigent AAL2 quand un facteur MFA `verified` existe.
- **Sessions** : `signOut({ scope: 'global' })` au moment de la demande révoque tous les refresh tokens.
- **Re-login** : bloqué pendant la fenêtre via `DeletionPendingScreen` (proposant annuler ou logout).
- **Données locales** : purge agressive des caches cloud (sync stores + backups), conservation des données 100% locales (transcriptions, recordings).

## Conséquences

- Suppression effective et irréversible au J+30.
- Filet de sécurité : annulation possible à tout moment dans la fenêtre via re-login + AAL2.
- Race annulation/cron au J+30 03:00 UTC : fenêtre de quelques ms par jour, acceptable.
- L'envoi d'emails (confirmation, rappel J-3) reste reporté tant que le SMTP custom n'est pas livré.

## Spec & plan

- Spec : `docs/superpowers/specs/2026-04-25-account-deletion-completion-design.md`
- Plan : `docs/superpowers/plans/2026-04-25-account-deletion-completion.md`
```

- [ ] **Step 2: Write the runbook**

```markdown
# Runbook — Account deletion purge

## Vue d'ensemble

Cron Postgres `purge-account-deletions-daily` (03:00 UTC) appelle l'Edge Function `purge-account-deletions`, qui supprime les utilisateurs dont la demande date de plus de 30 jours.

## Vérifier l'état du cron

```sql
select * from cron.job where jobname = 'purge-account-deletions-daily';
select * from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'purge-account-deletions-daily')
  order by start_time desc limit 5;
```

## Lancer manuellement

```sql
select cron.run('purge-account-deletions-daily');
```

Ou directement via curl :

```bash
curl -X POST "$SUPABASE_URL/functions/v1/purge-account-deletions" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

Réponse attendue : `{ "purged": N, "errors": [], "duration_ms": ... }`.

## Investiguer un échec

1. Logs Edge Function : Supabase Studio → Logs → Edge Functions → `purge-account-deletions`.
2. Cas typique : `auth.admin.deleteUser` retourne une erreur (compte verrouillé Supabase, etc.) → `errors: [{ uid, message }]`.
3. Si la tombstone a déjà été supprimée par le DELETE RETURNING mais `deleteUser` a échoué, l'utilisateur reste orphelin dans `auth.users`. Action manuelle :

```sql
select id from auth.users where id = '<uid>';
-- si présent et confirmé orphelin :
delete from auth.users where id = '<uid>';
```

## Rollback

- Désactiver le cron : `select cron.unschedule('purge-account-deletions-daily');`
- Supprimer l'Edge Function : `pnpm exec supabase functions delete purge-account-deletions`
- Restaurer le RPC `request_account_deletion` à la version pré-AAL2 (script dans la migration v2 de la version précédente).
```

- [ ] **Step 3: Write the E2E checklist**

```markdown
# E2E Checklist — Account deletion

## User sans MFA

- [ ] Connexion → Settings → Compte → "Supprimer mon compte" → tape le mot de confirmation
- [ ] Alerte "purge sous 30 jours" affichée
- [ ] Vérifier en DB : ligne dans `account_deletion_requests` avec le bon `user_id`
- [ ] L'app a fait un signOut, retour écran login
- [ ] Re-login : on atterrit sur `DeletionPendingScreen`, dates affichées correctement
- [ ] Click "Annuler" → DB : ligne supprimée, app normale apparaît

## User avec MFA enrolled

- [ ] Demande de suppression → si déjà AAL2, succès direct (cas normal)
- [ ] Edge case AAL1 + MFA : RPC retourne `aal2_required`, l'erreur est affichée, MFA challenge déclenché
- [ ] Annulation déclenche le même flow si AAL1
- [ ] Recovery code utilisable comme alternative au TOTP pour atteindre AAL2

## Sessions actives multi-devices

- [ ] App ouverte sur PC1 ET PC2, demande de suppression sur PC1
- [ ] PC2 : au plus tard 1h après, refresh token KO → écran login → DeletionPendingScreen

## Cron de purge

- [ ] Backdate manuel d'une tombstone à -31j : `update account_deletion_requests set requested_at = now() - interval '31 days' where user_id = '<uid>'`
- [ ] Trigger manuel : `select cron.run('purge-account-deletions-daily')`
- [ ] Vérifier : `auth.users` ne contient plus l'uid, toutes les tables user (snippets, dictionary, settings, devices, recovery_codes) ne contiennent plus de ligne pour cet uid

## Données locales

- [ ] Avant suppression : présence de `sync-snippets.json`, `sync-dictionary.json`, etc. dans `%APPDATA%/com.nolyo.voice-tool/`
- [ ] Après suppression : ces fichiers sont absents/vides
- [ ] Backups dans `%APPDATA%/com.nolyo.voice-tool/backups/` : tous supprimés
- [ ] Recordings et historique transcriptions : **conservés** (intentionnel)
```

- [ ] **Step 4: Update the RGPD register**

Open `docs/v3/compliance/registre-traitements.md`, find the "Suppression compte" entry (or the section listing user-data treatments) and add or update the row to mention :

> Purge automatique 30 jours via `pg_cron` quotidien + Edge Function `purge-account-deletions` + `auth.admin.deleteUser` (cascade FK sur toutes les tables user). Filet de sécurité : annulation possible jusqu'à J+30 par l'utilisateur authentifié AAL2.

- [ ] **Step 5: Commit**

```bash
git add docs/v3/decisions/0011-account-deletion-completion.md docs/v3/runbooks/account-deletion-purge.md docs/v3/03-account-deletion-e2e-checklist.md docs/v3/compliance/registre-traitements.md
git commit -m "docs: ADR 0011, runbook, E2E checklist for account deletion"
```

---

## Deployment Steps (after merge)

These are operator actions, not part of the implementation plan. Capture them in `docs/v3/runbooks/account-deletion-purge.md` deployment section :

1. `pnpm exec supabase db push` — applies the two new migrations to remote.
2. `pnpm exec supabase functions deploy purge-account-deletions` — deploys the Edge Function.
3. `pnpm exec supabase secrets set CRON_SECRET=$(openssl rand -hex 32)` — sets the shared secret.
4. In Supabase Studio SQL editor :

```sql
alter database postgres set app.settings.supabase_url = 'https://<project-ref>.supabase.co';
alter database postgres set app.settings.cron_secret = '<the same value as above>';
```

5. Verify : `select * from cron.job where jobname = 'purge-account-deletions-daily';`
6. Smoke test : `select cron.run('purge-account-deletions-daily');` — check Edge Function logs.
7. Tag a release `v2.x.x` to ship the frontend changes via auto-update.
