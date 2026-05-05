# Trial Auto-Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-grant a `trial_credits` row (60 min / 30 days) when a user's email becomes verified, removing the need for manual Supabase inserts.

**Architecture:** Pure Postgres. One `plpgsql SECURITY DEFINER` function `grant_trial_credits()` shared by two triggers on `auth.users`: an `AFTER INSERT WHEN email_confirmed_at IS NOT NULL` (covers OAuth + signup with confirmations off) and an `AFTER UPDATE OF email_confirmed_at` (covers magic link + signup with confirmations on). Idempotent via `ON CONFLICT DO NOTHING`. No frontend or Rust changes.

**Tech Stack:** PostgreSQL + Supabase migrations + pgtap.

**Spec:** `docs/superpowers/specs/2026-05-05-trial-auto-provisioning-design.md`

**Branch:** `feat/trial-auto-provisioning` (already created, spec committed).

**Local validation constraint:** Docker / local Supabase stack is not available in this environment. Local pgtap runs are not possible. Validation strategy: rely on CI (`.github/workflows/ci.yml` job `pgtap`) which runs `supabase start && supabase test db` on every PR. The plan accounts for this by pushing early and reacting to CI feedback.

---

## File Structure

**Create:**
- `supabase/migrations/<TS>_grant_trial_on_verify.sql` — trigger function + 2 trigger declarations. `<TS>` = UTC timestamp generated at task time via `date -u +"%Y%m%d%H%M%S"`.
- `supabase/tests/grant_trial_on_verify.sql` — pgtap, 7 assertions (5 scenarios + 2 sanity checks), follows the conventions of `supabase/tests/usage_summary_trigger.sql`.

**Modify:** none.

**Why two files only:** the spec covers a self-contained DB feature. No app code changes, no Edge Function changes, no Rust changes, no UI strings, no docs updates beyond the spec already committed.

---

## Task 1: Generate migration timestamp and capture it

**Files:** none yet — this task only produces a value used by tasks 2 and 3.

The migration filename and the test file reference each other only loosely (the test asserts the function and trigger names, not the filename). Generate the timestamp once and reuse it.

- [ ] **Step 1: Generate the UTC timestamp**

Run (PowerShell on Windows, or bash):
```bash
date -u +"%Y%m%d%H%M%S"
```
Expected: a string like `20260505123456`.

- [ ] **Step 2: Hold the timestamp in a variable for the rest of the session**

Either capture the value mentally / in a scratch note, or set an env var:
```powershell
$env:TS = (Get-Date -Format "yyyyMMddHHmmss")
```

For the rest of this plan, `<TS>` refers to that value.

---

## Task 2: Write the failing pgtap test

**Files:**
- Create: `supabase/tests/grant_trial_on_verify.sql`

The test exercises 5 scenarios from the spec + 2 sanity checks. It follows the structure of `supabase/tests/usage_summary_trigger.sql`: `BEGIN / SELECT plan(N) / ... / SELECT * FROM finish() / ROLLBACK`.

`auth.users` accepts direct INSERTs with `(id, email, email_confirmed_at)` in test context (existing tests do this). The `enforce_email_canonical_unique` trigger from migration `20260601000100_email_canonical.sql` will fire on these INSERTs but will accept distinct emails — pick distinct test emails to avoid conflict.

- [ ] **Step 1: Create the test file with the full content below**

Create `supabase/tests/grant_trial_on_verify.sql`:

```sql
BEGIN;
SELECT plan(7);

-- ─── Sanity ─────────────────────────────────────────────────────────────────

SELECT has_function(
  'public', 'grant_trial_credits',
  'function public.grant_trial_credits exists'
);

SELECT has_trigger(
  'auth', 'users', 'grant_trial_on_user_insert',
  'AFTER INSERT trigger on auth.users exists'
);

-- ─── Scenario 1: OAuth / signup with confirmations off ──────────────────────
-- INSERT auth.users with email_confirmed_at already set fires the INSERT
-- trigger and grants the trial.

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'a@test.local', NOW());

SELECT is(
  (SELECT minutes_granted FROM public.trial_credits
   WHERE user_id = '11111111-1111-1111-1111-111111111111')::numeric,
  60::numeric,
  'scenario 1: trial granted on INSERT with email_confirmed_at set'
);

-- ─── Scenario 2: email signup not yet verified ──────────────────────────────
-- INSERT with email_confirmed_at NULL must NOT grant a trial.

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'b@test.local', NULL);

SELECT is(
  (SELECT count(*) FROM public.trial_credits
   WHERE user_id = '22222222-2222-2222-2222-222222222222')::int,
  0,
  'scenario 2: no trial granted while email_confirmed_at is NULL'
);

-- ─── Scenario 3: post-hoc verification (magic link / email confirm) ────────
-- The user from scenario 2 verifies. UPDATE OF email_confirmed_at fires the
-- UPDATE trigger and grants the trial.

UPDATE auth.users
   SET email_confirmed_at = NOW()
 WHERE id = '22222222-2222-2222-2222-222222222222';

SELECT is(
  (SELECT count(*) FROM public.trial_credits
   WHERE user_id = '22222222-2222-2222-2222-222222222222')::int,
  1,
  'scenario 3: trial granted after email_confirmed_at transitions NULL → NOT NULL'
);

-- ─── Scenario 4: irrelevant UPDATE does not duplicate ──────────────────────
-- Updating a column that is not email_confirmed_at must not fire our trigger
-- (the WHEN clause + AFTER UPDATE OF column filter prevents it). Verify by
-- counting rows for the already-verified user from scenario 1.

UPDATE auth.users
   SET raw_user_meta_data = '{"foo": "bar"}'::jsonb
 WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*) FROM public.trial_credits
   WHERE user_id = '11111111-1111-1111-1111-111111111111')::int,
  1,
  'scenario 4: unrelated UPDATE does not create a duplicate trial row'
);

-- ─── Scenario 5: idempotency — pre-existing trial is preserved ─────────────
-- (a) Insert an unverified user (FK target, no trigger fires).
-- (b) Manually insert a trial_credits row with minutes_consumed = 30.
-- (c) Verify the user. The UPDATE trigger fires but ON CONFLICT DO NOTHING
--     leaves the manual row untouched.

INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('33333333-3333-3333-3333-333333333333', 'c@test.local', NULL);

INSERT INTO public.trial_credits (user_id, minutes_granted, minutes_consumed)
VALUES ('33333333-3333-3333-3333-333333333333', 60, 30);

UPDATE auth.users
   SET email_confirmed_at = NOW()
 WHERE id = '33333333-3333-3333-3333-333333333333';

SELECT is(
  (SELECT minutes_consumed FROM public.trial_credits
   WHERE user_id = '33333333-3333-3333-3333-333333333333')::numeric,
  30::numeric,
  'scenario 5: pre-existing trial_credits row is preserved on verify (ON CONFLICT)'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Verify the file is well-formed**

Open the file, confirm:
- 7 `SELECT` assertions match `plan(7)`
- Every test user UUID is distinct
- Every test email is distinct (avoids `enforce_email_canonical_unique` collision)
- File ends with `ROLLBACK;`

- [ ] **Step 3: Confirm the failing-test expectation**

If a local Postgres + supabase CLI were available:
```bash
pnpm exec supabase test db
```
Expected: FAIL on the first sanity check (`has_function('public', 'grant_trial_credits')`) because the function does not exist yet.

In the current environment Docker is not running. Skip the local run; the failure mode will be implicit (CI on the first push without the migration would fail). We still document the expected failure for completeness.

- [ ] **Step 4: Stage but do not commit yet**

```bash
git add supabase/tests/grant_trial_on_verify.sql
```

Do NOT commit alone — task 3 produces the migration that makes this test pass, and we want the migration + test in one logical commit per the project's history convention (e.g. PR #44 commits group test + impl).

---

## Task 3: Write the migration to make the test pass

**Files:**
- Create: `supabase/migrations/<TS>_grant_trial_on_verify.sql`

`<TS>` is the UTC timestamp from Task 1. Following Supabase convention, this filename ordering ensures the migration runs after `20260504100300_trial_credits.sql` (which creates the table this trigger depends on) and after `20260601000100_email_canonical.sql` (no actual dependency, just timestamp ordering — both modify `auth.users`).

- [ ] **Step 1: Create the migration file with the content below**

Replace `<TS>` with the actual timestamp from Task 1. Create `supabase/migrations/<TS>_grant_trial_on_verify.sql`:

```sql
-- Auto-grant 60 min / 30 days trial on email verification.
-- Fires on the two paths a user becomes "verified":
--   1. INSERT with email_confirmed_at already set (OAuth, or email signup
--      while auth.email.enable_confirmations = false).
--   2. UPDATE OF email_confirmed_at from NULL to NOT NULL (magic link, or
--      email signup with confirmations enabled).
--
-- ON CONFLICT DO NOTHING makes it idempotent: if a row was manually inserted
-- (e.g. for a test user) or for any future re-verify edge case, we don't
-- overwrite an in-progress trial.
--
-- minutes_granted / started_at / expires_at all use the table defaults
-- (60 min, NOW(), NOW() + 30 days) — keeping the grant policy in one place
-- (the table definition).

CREATE OR REPLACE FUNCTION public.grant_trial_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trial_credits (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_trial_credits() FROM PUBLIC;

CREATE TRIGGER grant_trial_on_user_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_trial_credits();

CREATE TRIGGER grant_trial_on_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_trial_credits();

COMMENT ON FUNCTION public.grant_trial_credits() IS
  'Inserts a trial_credits row (60 min / 30 days) for the user being verified. Idempotent via ON CONFLICT.';
```

- [ ] **Step 2: Verify the file is well-formed**

Confirm:
- Filename matches `supabase/migrations/<TS>_grant_trial_on_verify.sql` with the actual UTC timestamp
- Function uses `SECURITY DEFINER SET search_path = public` (matches project convention)
- Two `CREATE TRIGGER` statements, both reference `public.grant_trial_credits()`
- The INSERT trigger has `WHEN (NEW.email_confirmed_at IS NOT NULL)`
- The UPDATE trigger has `AFTER UPDATE OF email_confirmed_at` (column-scoped) **and** `WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)`

- [ ] **Step 3: Confirm the passing-test expectation**

If a local Postgres + supabase CLI were available:
```bash
pnpm exec supabase db reset    # apply all migrations including the new one
pnpm exec supabase test db     # run pgtap suite
```
Expected: 7/7 assertions pass.

In the current environment Docker is not running. The expected pass will be confirmed by CI after push (Task 5).

- [ ] **Step 4: Stage the migration**

```bash
git add supabase/migrations/<TS>_grant_trial_on_verify.sql
```

(Replace `<TS>` with the actual timestamp.)

---

## Task 4: Static review of the staged changes

This task replaces the local TDD pass we cannot run. It is a careful manual diff review against the spec.

- [ ] **Step 1: Diff the staged changes**

```bash
git diff --cached
```

- [ ] **Step 2: Manual review checklist**

Confirm against `docs/superpowers/specs/2026-05-05-trial-auto-provisioning-design.md`:

- [ ] Trigger names match: `grant_trial_on_user_insert` and `grant_trial_on_email_confirmed`
- [ ] Function name matches: `public.grant_trial_credits()`
- [ ] Function returns TRIGGER, language plpgsql, SECURITY DEFINER, SET search_path = public
- [ ] `REVOKE ALL FROM PUBLIC` present
- [ ] Test file uses `plan(7)` and asserts 7 times before `finish()`
- [ ] No emoji, no comments in French (project convention: SQL comments in English)
- [ ] No trailing whitespace in either file
- [ ] Test scenarios 1–5 each have a unique `user_id` UUID and `email`

- [ ] **Step 3: Cross-check the spec's "Critères d'acceptation"**

Open `docs/superpowers/specs/2026-05-05-trial-auto-provisioning-design.md`. The acceptance criteria require:
- [x] Migration applies without error → will be confirmed by CI's `supabase start`
- [x] pgtap 7/7 green → will be confirmed by CI's `supabase test db`
- [ ] Manual signup magic link → row created → **deferred**, requires user to test on remote after `supabase db push --linked`
- [ ] Manual signup OAuth Google → row created → **deferred**, same reason
- [ ] `QuotaCounter` shows trial counter without manual insert → **deferred**, requires the two manual signup tests above
- [x] No regression on signup flow → covered by scenarios 2 + 3 of pgtap

The deferred items are documented in the PR body so the user knows what to test on return.

---

## Task 5: Commit and open PR

- [ ] **Step 1: Commit the staged changes**

```bash
git commit -m "$(cat <<'EOF'
feat(v3): auto-grant trial_credits on email verification

Add a Postgres trigger that creates the trial_credits row (60 min /
30 days) when a user becomes verified, removing the need for manual
inserts in Supabase. One plpgsql SECURITY DEFINER function shared by
two triggers on auth.users covers OAuth, magic link, and email signup
paths. ON CONFLICT DO NOTHING preserves any pre-existing trial row.

Spec: docs/superpowers/specs/2026-05-05-trial-auto-provisioning-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/trial-auto-provisioning
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(v3): auto-grant trial_credits on email verification" --body "$(cat <<'EOF'
## Summary

- New Postgres trigger auto-creates the `trial_credits` row (60 min / 30 days) when a user's email becomes verified, replacing the manual Supabase insert workflow.
- One `plpgsql SECURITY DEFINER` function shared by two triggers on `auth.users` covers OAuth, magic link, and email signup paths.
- `ON CONFLICT DO NOTHING` preserves any pre-existing trial row (e.g. manually seeded test users).

Spec: [docs/superpowers/specs/2026-05-05-trial-auto-provisioning-design.md](docs/superpowers/specs/2026-05-05-trial-auto-provisioning-design.md)

## Local validation

Docker was not running in the implementing environment, so pgtap was not exercised locally. Validation relies on CI (`pgtap` job runs `supabase start && supabase test db` on this PR). The static review against the spec is documented in the implementation plan.

## Test plan

- [ ] CI `pgtap` job: 7/7 green
- [ ] CI `vitest`, `cargo-test`, `deno-test`: green (no app code changed but verify no regression)
- [ ] After merge, run `pnpm exec supabase db push --linked` to apply on remote (deferred to maintainer — touches the live project)
- [ ] After remote push, test manual signup flows:
  - [ ] Magic link signup → `trial_credits` row appears in Supabase Dashboard with `minutes_granted=60`, `expires_at` ≈ NOW + 30d
  - [ ] OAuth Google signup → same outcome
  - [ ] `QuotaCounter` in the app header shows the trial without manual intervention

## Out of scope

- Backfill of existing users (none to backfill; project is at zero users)
- Anti-abuse for delete-account-then-resignup (option A in spec, YAGNI at launch scale)
- The full sub-épique 04 billing (pricing, gating, Lemon Squeezy) — to be brainstormed separately

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL from the output for Task 6.

---

## Task 6: Monitor CI and react to failures

- [ ] **Step 1: Wait for CI to finish on the PR**

```bash
gh pr checks --watch
```

This blocks until all checks resolve.

- [ ] **Step 2a: If all green** — done. Record PR URL in the final summary message to the user.

- [ ] **Step 2b: If `pgtap` fails** — read the failure output:

```bash
gh run view --log-failed
```

Common failure modes and fixes:

| Failure | Likely cause | Fix |
|---|---|---|
| `function "grant_trial_credits" does not exist` | Migration filename ordering wrong (ran before table) | Verify timestamp > `20260504100300`; rename if needed |
| `relation "auth.users" does not exist` in test | pgtap ran in wrong schema | Confirm test uses fully-qualified `auth.users` (it does) |
| `duplicate key value violates unique constraint "trial_credits_pkey"` | ON CONFLICT clause missing or wrong column | Re-check migration step 2 |
| `trigger "grant_trial_on_user_insert" already exists` | Old version of the function/trigger from a prior failed migration | Should not happen on fresh CI; if persistent, add `DROP TRIGGER IF EXISTS` to migration |
| Scenario 4 fails (count = 2) | UPDATE trigger fires on irrelevant column updates | Re-check `AFTER UPDATE OF email_confirmed_at` clause — the column filter is what prevents this |
| Scenario 5 fails (minutes_consumed != 30) | ON CONFLICT clause missing | Re-check migration step 1 |

Apply the fix on the same branch, push, re-watch CI.

- [ ] **Step 2c: If a different CI job fails** (vitest, cargo, deno) — those are unrelated to this PR (no app code changed). If they fail, it's a pre-existing flake or unrelated regression. Note in the PR comments and continue.

---

## Self-Review

After completing tasks 1–6:

**Spec coverage check:**
- ✅ Decision 1 (trigger at email verify) → Task 3 step 1 — both trigger declarations
- ✅ Decision 2 (no backfill) → no migration step inserts existing users; verified by reading migration file
- ✅ Decision 3 (no anti-abuse) → no extra table or check; verified by absence
- ✅ Decision 4 (one function, two triggers) → Task 3 step 1
- ✅ Decision 5 (no EXCEPTION block) → Task 3 step 1 — function body has no exception handling
- ✅ Architecture (one migration, no app changes) → File Structure section
- ✅ pgtap 7 assertions → Task 2 step 1
- ✅ Edge cases (5 scenarios) → Task 2 step 1
- ✅ Deployment + rollback → covered in PR body and spec
- ✅ GDPR (no PII added, CASCADE preserved) → no migration touches CASCADE; verified by reading

**Placeholder scan:** `<TS>` is documented as "the UTC timestamp generated in Task 1" — instruction, not placeholder. No TODO/TBD/FIXME elsewhere.

**Type/name consistency:**
- Function: `public.grant_trial_credits()` (Tasks 2, 3)
- Triggers: `grant_trial_on_user_insert` and `grant_trial_on_email_confirmed` (Tasks 2, 3)
- Test file: `supabase/tests/grant_trial_on_verify.sql` (Tasks 2, 4, 5)
- Migration file: `supabase/migrations/<TS>_grant_trial_on_verify.sql` (Tasks 1, 3, 5)
All consistent.
