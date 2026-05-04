# PR #44 Managed Transcription — Post-Review Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the two blockers and the perf-positive polish items from the PR #44 code review, before tagging v3.0 stable. Skip lock-based race fixes (user accepts the few-cents loss) — this plan is perf-first.

**Architecture:** Three threads of work:
1. **Atomic trial bump via DB trigger** — replace the Worker's two-step "INSERT event + RPC bump" with a single INSERT; the trigger does the bump in the same Postgres transaction. Eliminates 1 Supabase round-trip per cloud transcription and removes the partial-failure window where an event is recorded but the trial isn't debited.
2. **Worker test coverage** — set up vitest in `workers/transcription-api/` and add unit tests for the two highest-risk paths: JWT verification (`auth.ts`) and quota priority logic (`usage.ts`).
3. **Perf + polish bundle** — `Promise.all` the trial+sub fetch on the post-process path, hoist `useUsage` into `CloudContext` so 2+ consumers share a single fetch, rename the misleading `audio_too_large` error code, drop dead wrangler staging block, document the assumed quota race + JWT cache scope.

**Tech Stack:** Cloudflare Workers (TypeScript), Supabase Postgres + pgTAP, vitest, React 19 context, react-i18next.

---

## File Structure

**Create:**
- `supabase/migrations/20260504221727_atomic_trial_bump.sql` — trigger that debits `trial_credits` automatically on `usage_events` insert
- `workers/transcription-api/vitest.config.ts` — vitest config for the Worker package
- `workers/transcription-api/src/auth.test.ts` — JWT verification tests (mocks JWKS fetch + signs real ES256 tokens)
- `workers/transcription-api/src/usage.test.ts` — quota priority tests (mocks Supabase client)

**Modify:**
- `supabase/tests/usage_summary_trigger.sql` — extend to assert the trial bump fires
- `workers/transcription-api/src/usage.ts` — drop the post-insert RPC call (now redundant with the trigger)
- `workers/transcription-api/src/post-process.ts` — `Promise.all` the trial + sub fetches
- `workers/transcription-api/src/errors.ts` — rename `audio_too_large` → `payload_too_large`
- `workers/transcription-api/src/transcribe.ts` — use renamed error code
- `workers/transcription-api/src/post-process.ts` — use renamed error code (re-touched in same task)
- `workers/transcription-api/src/auth.ts` — one-line comment on per-isolate cache scope
- `workers/transcription-api/wrangler.toml` — remove dead `[env.staging]` block
- `workers/transcription-api/package.json` — add vitest devDep + `test` script
- `src/contexts/CloudContext.tsx` — host the trial/usage/sub state, expose via context
- `src/hooks/useUsage.ts` — collapse to a thin context consumer
- `src/lib/cloud/api.test.ts` — unchanged (uses Tauri-side error shape, not Worker error codes)

---

## Task 1: Atomic trial bump via DB trigger

**Files:**
- Create: `supabase/migrations/20260504221727_atomic_trial_bump.sql`
- Modify: `supabase/tests/usage_summary_trigger.sql`

This migration moves the `trial_credits.minutes_consumed` debit from the Worker (which calls it after inserting the event) into a Postgres trigger that fires on the same INSERT. One round-trip instead of two, and atomic — if the trigger fails, the INSERT rolls back, so we never end up with an event that wasn't billed.

We keep the existing `bump_trial_minutes` RPC in place (no caller anymore, but cheap to leave for future admin use). The existing `trg_usage_events_aggregate` trigger that maintains `usage_summary` is untouched — separate responsibility, separate trigger.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260504221727_atomic_trial_bump.sql`:

```sql
-- Replace the Worker's after-insert RPC call with a Postgres trigger that debits
-- trial_credits in the same transaction as the usage_events INSERT. Atomic by
-- construction — if the bump fails the INSERT rolls back, so we never have an
-- event recorded without the matching trial debit.
--
-- Pre-existing trg_usage_events_aggregate (which maintains usage_summary) is
-- untouched. Two triggers, two responsibilities, both fire on INSERT.

CREATE OR REPLACE FUNCTION public.bump_trial_on_usage_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'trial'
     AND NEW.kind = 'transcription'
     AND NEW.units_unit = 'minutes' THEN
    UPDATE public.trial_credits
       SET minutes_consumed = minutes_consumed + NEW.units
     WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_usage_events_trial_bump
  AFTER INSERT ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.bump_trial_on_usage_event();

COMMENT ON FUNCTION public.bump_trial_on_usage_event() IS
  'Debits trial_credits.minutes_consumed when a usage_events row is inserted with source=trial AND kind=transcription. Atomic with the INSERT.';
```

- [ ] **Step 2: Extend pgTAP test to cover the trigger**

Modify `supabase/tests/usage_summary_trigger.sql`. Bump `plan(4)` to `plan(6)` and add the two assertions before `SELECT * FROM finish();`:

```sql
-- ─── Trial bump trigger ─────────────────────────────────────────────────────
-- The 2 transcription events above (1.0 + 2.5 = 3.5 min) were inserted with
-- source='trial' so the new trigger should have debited trial_credits.
-- The post_process event was 'trial' too but units_unit='tokens' → no bump.

INSERT INTO public.trial_credits (user_id, minutes_granted, minutes_consumed)
VALUES ('11111111-1111-1111-1111-111111111111', 60, 0);

-- Re-insert one transcription event to trigger the bump (the events above
-- ran before trial_credits row existed).
INSERT INTO public.usage_events
  (user_id, kind, units, units_unit, model, provider, source)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'transcription', 0.5, 'minutes', 'whisper-large-v3-turbo', 'groq', 'trial');

SELECT is(
  (SELECT minutes_consumed FROM public.trial_credits
   WHERE user_id = '11111111-1111-1111-1111-111111111111')::numeric,
  0.5::numeric,
  'trigger debited trial_credits by event units'
);

-- Non-trial event must NOT debit.
INSERT INTO public.usage_events
  (user_id, kind, units, units_unit, model, provider, source)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'transcription', 1.0, 'minutes', 'whisper-large-v3-turbo', 'groq', 'quota');

SELECT is(
  (SELECT minutes_consumed FROM public.trial_credits
   WHERE user_id = '11111111-1111-1111-1111-111111111111')::numeric,
  0.5::numeric,
  'non-trial event did not bump trial_credits'
);
```

- [ ] **Step 3: Apply the migration to staging Supabase**

Run: `pnpm exec supabase db push --linked`
Expected: migration `20260504221727_atomic_trial_bump.sql` applied, no errors.

- [ ] **Step 4: Run pgTAP tests against staging**

Run: `pnpm exec supabase test db --linked` (or whatever invocation the project uses — confirm against existing `supabase/tests/`)
Expected: all assertions pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260504221727_atomic_trial_bump.sql supabase/tests/usage_summary_trigger.sql
git commit -m "feat(cloud): atomic trial bump via INSERT trigger"
```

---

## Task 2: Drop the redundant RPC call from the Worker

**Files:**
- Modify: `workers/transcription-api/src/usage.ts`

Now that the trigger does the bump, `recordUsageEvent` no longer needs the post-insert RPC. Removing it cuts 1 round-trip per trial transcription and removes the partial-failure window.

- [ ] **Step 1: Remove the bump block**

In `workers/transcription-api/src/usage.ts`, delete lines 162-170 (the trial bump block):

```typescript
// DELETE THIS:
  if (event.source === "trial" && event.kind === "transcription") {
    const { error: bumpErr } = await sb.rpc("bump_trial_minutes", {
      p_user_id: event.user_id,
      p_minutes: event.units,
    });
    if (bumpErr) {
      throw new Error(`trial bump failed: ${bumpErr.message}`);
    }
  }
```

The function should now end (after the existing dedup-on-conflict branch):

```typescript
    throw new Error(`recordUsageEvent failed: ${error.message}`);
  }

  return { event_id: data!.id as string, deduplicated: false };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd workers/transcription-api && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add workers/transcription-api/src/usage.ts
git commit -m "refactor(cloud): drop redundant trial bump RPC (trigger handles it)"
```

---

## Task 3: Set up vitest in the Worker package

**Files:**
- Create: `workers/transcription-api/vitest.config.ts`
- Modify: `workers/transcription-api/package.json`

Vitest runs on Node 20+ which has Web Crypto and `fetch` natively, so we can test the Worker code without spinning up `@cloudflare/vitest-pool-workers`. We mock `@supabase/supabase-js` for the usage tests, and mock `globalThis.fetch` for the JWKS endpoint in the auth tests.

- [ ] **Step 1: Add vitest devDeps and script**

Modify `workers/transcription-api/package.json`:

```json
{
  "name": "@lexena/transcription-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20251001.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.80.0"
  }
}
```

- [ ] **Step 2: Add vitest config**

Create `workers/transcription-api/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Install**

Run: `cd workers/transcription-api && pnpm install`
Expected: vitest added to lockfile, no errors.

- [ ] **Step 4: Verify the runner finds zero tests**

Run: `cd workers/transcription-api && pnpm test`
Expected: "No test files found" or exits 0 with 0 tests collected. Both fine — we just want to confirm vitest is wired.

- [ ] **Step 5: Commit**

```bash
git add workers/transcription-api/package.json workers/transcription-api/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(cloud): set up vitest for transcription-api worker"
```

---

## Task 4: Worker tests — quota priority logic

**Files:**
- Create: `workers/transcription-api/src/usage.test.ts`

Covers the four-way priority decision in `checkQuotaForTranscription`: `trial > quota > overage > deny`. Mocks the Supabase client so we control what `trial_status` and `subscriptions` return for each branch.

- [ ] **Step 1: Write the test file**

Create `workers/transcription-api/src/usage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkQuotaForTranscription, QuotaExhausted } from "./usage";
import { _resetSupabaseClientForTest } from "./supabase";

const ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  GROQ_API_KEY: "groq_test",
  OPENAI_API_KEY: "openai_test",
} as const;

// Build a chainable Supabase query mock that resolves to {data, error}.
function mockSupabaseChain(returns: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => returns[table] ?? { data: null, error: null },
            }),
            maybeSingle: async () => returns[table] ?? { data: null, error: null },
          }),
          maybeSingle: async () => returns[table] ?? { data: null, error: null },
        }),
      }),
    }),
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));
import { createClient } from "@supabase/supabase-js";

beforeEach(() => {
  _resetSupabaseClientForTest();
  vi.resetAllMocks();
});

describe("checkQuotaForTranscription priority", () => {
  it("prefers trial when active with minutes remaining", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseChain({
        trial_status: { data: { is_active: true, minutes_remaining: 10 }, error: null },
        subscriptions: { data: { status: "active", plan: "starter", quota_minutes: 1000 }, error: null },
      }),
    );
    const result = await checkQuotaForTranscription(ENV, "u1");
    expect(result.source).toBe("trial");
    expect(result.remaining_minutes_estimate).toBe(10);
  });

  it("falls back to quota when trial is inactive", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseChain({
        trial_status: { data: { is_active: false, minutes_remaining: 0 }, error: null },
        subscriptions: { data: { status: "active", plan: "starter", quota_minutes: 1000 }, error: null },
        usage_summary: { data: { units_total: 200 }, error: null },
      }),
    );
    const result = await checkQuotaForTranscription(ENV, "u1");
    expect(result.source).toBe("quota");
    expect(result.remaining_minutes_estimate).toBe(800);
  });

  it("falls back to overage when quota is exhausted", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseChain({
        trial_status: { data: { is_active: false, minutes_remaining: 0 }, error: null },
        subscriptions: { data: { status: "active", plan: "starter", quota_minutes: 1000 }, error: null },
        usage_summary: { data: { units_total: 1100 }, error: null }, // 100 min over
      }),
    );
    const result = await checkQuotaForTranscription(ENV, "u1");
    expect(result.source).toBe("overage");
    // overage allowance = 300, used overage = 100 → 200 left
    expect(result.remaining_minutes_estimate).toBe(200);
  });

  it("denies when no active subscription and no trial", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseChain({
        trial_status: { data: { is_active: false, minutes_remaining: 0 }, error: null },
        subscriptions: { data: null, error: null },
      }),
    );
    await expect(checkQuotaForTranscription(ENV, "u1")).rejects.toBeInstanceOf(QuotaExhausted);
  });

  it("denies when subscription expired even if quota would allow", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseChain({
        trial_status: { data: { is_active: false, minutes_remaining: 0 }, error: null },
        subscriptions: { data: { status: "expired", plan: "starter", quota_minutes: 1000 }, error: null },
        usage_summary: { data: { units_total: 0 }, error: null },
      }),
    );
    await expect(checkQuotaForTranscription(ENV, "u1")).rejects.toBeInstanceOf(QuotaExhausted);
  });

  it("denies when overage hard cap is reached", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabaseChain({
        trial_status: { data: { is_active: false, minutes_remaining: 0 }, error: null },
        subscriptions: { data: { status: "active", plan: "starter", quota_minutes: 1000 }, error: null },
        usage_summary: { data: { units_total: 1400 }, error: null }, // 400 over the 300 cap
      }),
    );
    await expect(checkQuotaForTranscription(ENV, "u1")).rejects.toBeInstanceOf(QuotaExhausted);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd workers/transcription-api && pnpm test`
Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add workers/transcription-api/src/usage.test.ts
git commit -m "test(cloud): cover quota priority logic"
```

---

## Task 5: Worker tests — JWT verification

**Files:**
- Create: `workers/transcription-api/src/auth.test.ts`

We generate a real ES256 keypair via `crypto.subtle.generateKey`, sign a JWT manually, and stub `globalThis.fetch` to serve the corresponding JWKS. This catches regressions in the kid lookup, signature verification, and exp check — the three places where a bad refactor could silently let an invalid token through.

- [ ] **Step 1: Write the test file**

Create `workers/transcription-api/src/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticate, AuthError, _resetJwksCacheForTest } from "./auth";

const ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  GROQ_API_KEY: "g",
  OPENAI_API_KEY: "o",
} as const;

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateKeypair() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, jwk };
}

async function makeToken(
  privateKey: CryptoKey,
  kid: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = { alg: "ES256", typ: "JWT", kid };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signed = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signed),
  );
  return `${signed}.${b64url(signature)}`;
}

function mockJwksFetch(jwks: { keys: Array<Record<string, unknown>> }) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as typeof fetch;
}

beforeEach(() => {
  _resetJwksCacheForTest();
});

describe("authenticate", () => {
  it("accepts a valid ES256 token", async () => {
    const { privateKey, jwk } = await generateKeypair();
    const kid = "kid-1";
    mockJwksFetch({ keys: [{ ...jwk, kid, kty: "EC", crv: "P-256" }] });

    const token = await makeToken(privateKey, kid, {
      sub: "user-123",
      email: "user@test.local",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = await authenticate(req, ENV);
    expect(user.user_id).toBe("user-123");
    expect(user.email).toBe("user@test.local");
  });

  it("rejects a missing Authorization header", async () => {
    const req = new Request("https://api.test/transcribe", { method: "POST" });
    await expect(authenticate(req, ENV)).rejects.toMatchObject({
      name: "AuthError",
      code: "missing",
    });
  });

  it("rejects an expired token", async () => {
    const { privateKey, jwk } = await generateKeypair();
    const kid = "kid-1";
    mockJwksFetch({ keys: [{ ...jwk, kid, kty: "EC", crv: "P-256" }] });

    const token = await makeToken(privateKey, kid, {
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(authenticate(req, ENV)).rejects.toMatchObject({
      name: "AuthError",
      code: "expired",
    });
  });

  it("rejects an unsupported alg", async () => {
    // Hand-craft a token with alg=HS256 — signature doesn't matter, alg gate trips first.
    const headerB64 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: "k" }));
    const payloadB64 = b64url(
      JSON.stringify({ sub: "u", exp: Math.floor(Date.now() / 1000) + 60 }),
    );
    const sig = b64url("nope");
    const token = `${headerB64}.${payloadB64}.${sig}`;
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(authenticate(req, ENV)).rejects.toMatchObject({
      name: "AuthError",
      code: "invalid",
    });
  });

  it("rejects a token signed by a different key", async () => {
    const { privateKey: priv1 } = await generateKeypair();
    const { jwk: jwk2 } = await generateKeypair();
    const kid = "kid-1";
    mockJwksFetch({ keys: [{ ...jwk2, kid, kty: "EC", crv: "P-256" }] });

    const token = await makeToken(priv1, kid, {
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(authenticate(req, ENV)).rejects.toMatchObject({
      name: "AuthError",
      code: "invalid",
    });
  });

  it("rejects an unknown kid (and tries one refresh)", async () => {
    const { jwk } = await generateKeypair();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ keys: [{ ...jwk, kid: "kid-other", kty: "EC", crv: "P-256" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { privateKey } = await generateKeypair();
    const token = await makeToken(privateKey, "kid-missing", {
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(authenticate(req, ENV)).rejects.toMatchObject({
      name: "AuthError",
      code: "invalid",
    });
    // First call to populate cache, second forced refresh on unknown kid.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd workers/transcription-api && pnpm test`
Expected: 6 auth tests + 6 usage tests = 12 pass.

- [ ] **Step 3: Commit**

```bash
git add workers/transcription-api/src/auth.test.ts
git commit -m "test(cloud): cover JWT verification (ES256, JWKS, kid rotation)"
```

---

## Task 6: Parallelize trial+sub fetch on post-process

**Files:**
- Modify: `workers/transcription-api/src/post-process.ts`

`handlePostProcess` currently awaits `fetchTrialStatus` then `fetchSubscriptionState`. Both are independent reads and the eligibility check needs both before deciding. Promise.all halves the wait.

- [ ] **Step 1: Replace the sequential awaits**

In `workers/transcription-api/src/post-process.ts`, replace the eligibility block (around lines 41-49):

```typescript
// BEFORE:
  // Eligibility: post_process is gated by *any* of trial active OR active subscription.
  const trial = await fetchTrialStatus(env, user.user_id);
  const sub = await fetchSubscriptionState(env, user.user_id);
  const eligible = trial.is_active || sub.status === "active";
```

With:

```typescript
  // Eligibility: post_process is gated by *any* of trial active OR active subscription.
  // Parallel fetch — neither read depends on the other.
  const [trial, sub] = await Promise.all([
    fetchTrialStatus(env, user.user_id),
    fetchSubscriptionState(env, user.user_id),
  ]);
  const eligible = trial.is_active || sub.status === "active";
```

- [ ] **Step 2: Typecheck**

Run: `cd workers/transcription-api && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add workers/transcription-api/src/post-process.ts
git commit -m "perf(cloud): parallelize trial+sub fetch on post-process"
```

---

## Task 7: Hoist usage state into CloudContext

**Files:**
- Modify: `src/contexts/CloudContext.tsx`
- Modify: `src/hooks/useUsage.ts`

Today `useUsage` does 3 Supabase round-trips on every mount. `QuotaCounter` (header) and `CloudSection` (settings) both consume it, so opening Settings = 6 round-trips. Hosting the state in `CloudProvider` (which is already mounted globally above `Dashboard`) means a single fetch shared across consumers.

`useUsage` collapses to a thin context selector. Public API stays identical so existing call sites (`QuotaCounter`, `CloudSection`) don't change.

- [ ] **Step 1: Move the fetch logic into CloudProvider**

Replace the entire contents of `src/contexts/CloudContext.tsx`:

```typescript
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";

export type CloudMode = "local" | "cloud" | "uninitialized";

export interface TrialStatus {
  is_active: boolean;
  minutes_remaining: number;
  expires_at: string | null;
}

export interface UsagePlan {
  quota_minutes: number;
  plan: "starter" | "pro";
}

export interface CloudContextValue {
  /**
   * Effective routing for the next transcription / post-process call.
   * "cloud" requires: signed-in user, server-side eligibility (active trial
   * or active subscription), AND the user explicitly picked "LexenaCloud" as
   * their transcription provider in settings. Anything else falls back to
   * "local" — meaning the local Whisper / user's API key path.
   */
  mode: CloudMode;
  isCloudEligible: boolean;
  hasCloudSelected: boolean;

  // Usage data, hoisted here so QuotaCounter and CloudSection share a single
  // fetch instead of each mounting their own copy of useUsage.
  trial: TrialStatus;
  monthly_minutes_used: number;
  plan: UsagePlan | null;
  usageLoading: boolean;
  refreshUsage: () => Promise<void>;
}

const DEFAULT_TRIAL: TrialStatus = {
  is_active: false,
  minutes_remaining: 0,
  expires_at: null,
};

export const CloudContext = createContext<CloudContextValue>({
  mode: "uninitialized",
  isCloudEligible: false,
  hasCloudSelected: false,
  trial: DEFAULT_TRIAL,
  monthly_minutes_used: 0,
  plan: null,
  usageLoading: true,
  refreshUsage: async () => {},
});

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { settings } = useSettings();

  const [eligible, setEligible] = useState(false);
  const [trial, setTrial] = useState<TrialStatus>(DEFAULT_TRIAL);
  const [monthlyUsed, setMonthlyUsed] = useState(0);
  const [plan, setPlan] = useState<UsagePlan | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  const hasCloudSelected = settings.transcription_provider === "LexenaCloud";

  const refreshUsage = useCallback(async () => {
    if (!user) {
      setTrial(DEFAULT_TRIAL);
      setMonthlyUsed(0);
      setPlan(null);
      setEligible(false);
      setUsageLoading(false);
      return;
    }
    setUsageLoading(true);
    try {
      const ym = currentYearMonth();
      const [{ data: trialData }, { data: usage }, { data: sub }] = await Promise.all([
        supabase.from("trial_status").select("*").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("usage_summary")
          .select("units_total")
          .eq("user_id", user.id)
          .eq("year_month", ym)
          .eq("kind", "transcription")
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan, quota_minutes, status")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const t: TrialStatus = {
        is_active: Boolean(trialData?.is_active),
        minutes_remaining: Number(trialData?.minutes_remaining ?? 0),
        expires_at: (trialData?.expires_at as string) ?? null,
      };
      setTrial(t);
      setMonthlyUsed(Number(usage?.units_total ?? 0));
      setPlan(
        sub && sub.status === "active"
          ? { quota_minutes: Number(sub.quota_minutes), plan: sub.plan as "starter" | "pro" }
          : null,
      );
      setEligible(t.is_active || sub?.status === "active");
    } finally {
      setUsageLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  const mode: CloudMode = useMemo(() => {
    if (!user) return "local";
    if (!hasCloudSelected) return "local";
    return eligible ? "cloud" : "local";
  }, [user, eligible, hasCloudSelected]);

  const value: CloudContextValue = {
    mode,
    isCloudEligible: eligible,
    hasCloudSelected,
    trial,
    monthly_minutes_used: monthlyUsed,
    plan,
    usageLoading,
    refreshUsage,
  };
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
```

- [ ] **Step 2: Collapse useUsage to a context selector**

Replace the entire contents of `src/hooks/useUsage.ts`:

```typescript
import { useContext } from "react";
import { CloudContext, type TrialStatus, type UsagePlan } from "@/contexts/CloudContext";

interface UsageData {
  trial: TrialStatus;
  monthly_minutes_used: number;
  plan: UsagePlan | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Thin selector over CloudContext. The actual fetch lives in CloudProvider so
 * QuotaCounter (header) and CloudSection (settings) share one set of round-trips.
 */
export function useUsage(): UsageData {
  const ctx = useContext(CloudContext);
  return {
    trial: ctx.trial,
    monthly_minutes_used: ctx.monthly_minutes_used,
    plan: ctx.plan,
    loading: ctx.usageLoading,
    refresh: ctx.refreshUsage,
  };
}
```

- [ ] **Step 3: Verify CloudContext no longer needs `setEligibility`**

Grep for any remaining references that were calling `setEligibility` from outside:

Run: `grep -rn "setEligibility" src/`
Expected: zero matches outside `CloudContext.tsx` (the old `useUsage` was the only caller — it's now baked into `refreshUsage`).

If any match shows up: remove that call site. The eligibility flag is now derived inside `refreshUsage`.

- [ ] **Step 4: Run the existing test suite**

Run: `pnpm test`
Expected: 123/123 pass — `useUsage` consumers (`QuotaCounter`, `CloudSection`) keep their public API.

- [ ] **Step 5: Smoke test in dev**

Ask the user to run `pnpm tauri dev` (the project rule forbids me from running it). They should:
- Sign in
- Open Settings → Cloud section: trial info loads
- Close & reopen Settings → no extra fetch in DevTools Network tab (data is cached in context)
- Header `QuotaCounter` shows the same trial info

- [ ] **Step 6: Commit**

```bash
git add src/contexts/CloudContext.tsx src/hooks/useUsage.ts
git commit -m "perf(cloud): hoist usage state into CloudContext (single fetch)"
```

---

## Task 8: Polish bundle (rename error code, clean wrangler, add comments)

**Files:**
- Modify: `workers/transcription-api/src/errors.ts`
- Modify: `workers/transcription-api/src/transcribe.ts`
- Modify: `workers/transcription-api/src/post-process.ts`
- Modify: `workers/transcription-api/wrangler.toml`
- Modify: `workers/transcription-api/src/auth.ts`
- Modify: `workers/transcription-api/src/usage.ts`

Five small fixes bundled in one commit:

1. Rename `audio_too_large` → `payload_too_large` (the post-process path uses it for text, not audio).
2. Drop the dead `[env.staging]` block in `wrangler.toml` — it has no `name` so the deploy command would either fail or shadow the default name.
3. One-line comment on the JWKS cache scope (per-isolate).
4. One-line comment on the assumed quota race (best-effort + 5% buffer).

The frontend doesn't pattern-match on the error code string (it switches on `status` 401/402/502), so this rename is non-breaking for the desktop client.

- [ ] **Step 1: Rename the error code**

In `workers/transcription-api/src/errors.ts`:

```typescript
// BEFORE: "audio_too_large"
// AFTER:  "payload_too_large"

export type ErrorCode =
  | "missing_auth"
  | "invalid_auth"
  | "expired_auth"
  | "quota_exhausted"
  | "trial_expired"
  | "payload_too_large"
  | "unsupported_format"
  | "provider_unavailable"
  | "internal";

// ...

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  missing_auth: 401,
  invalid_auth: 401,
  expired_auth: 401,
  quota_exhausted: 402,
  trial_expired: 402,
  payload_too_large: 413,
  unsupported_format: 415,
  provider_unavailable: 502,
  internal: 500,
};
```

- [ ] **Step 2: Update both call sites**

In `workers/transcription-api/src/transcribe.ts:39`:

```typescript
// BEFORE:
    return errorResponse("audio_too_large", `audio exceeds ${MAX_AUDIO_BYTES} bytes`);
// AFTER:
    return errorResponse("payload_too_large", `audio exceeds ${MAX_AUDIO_BYTES} bytes`);
```

In `workers/transcription-api/src/post-process.ts:37`:

```typescript
// BEFORE:
    return errorResponse("audio_too_large", `text too long (max ${MAX_INPUT_CHARS} chars)`);
// AFTER:
    return errorResponse("payload_too_large", `text too long (max ${MAX_INPUT_CHARS} chars)`);
```

- [ ] **Step 3: Drop the dead staging env block**

In `workers/transcription-api/wrangler.toml`, remove lines 12-14:

```toml
# DELETE THESE LINES:
# Staging on workers.dev
[env.staging]
# Uses default workers.dev subdomain
```

The file should end at the production env block + the secrets comment. If staging is needed later, add it with an explicit `name`.

- [ ] **Step 4: Comment the JWKS cache scope**

In `workers/transcription-api/src/auth.ts:45-46`, replace:

```typescript
// BEFORE:
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h
let jwksCache: JwksCache | null = null;
```

With:

```typescript
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h
// Cache is per-isolate: Workers reuse module state across requests on the same
// isolate but every cold-start spawns a fresh isolate with an empty cache. Worst
// case is a few extra JWKS fetches across the cluster — never a stale-key risk.
let jwksCache: JwksCache | null = null;
```

- [ ] **Step 5: Comment the assumed quota race**

In `workers/transcription-api/src/usage.ts`, just above `checkQuotaForTranscription` (around line 80):

```typescript
/**
 * Determine which "wallet" to debit for a transcription request.
 * Priority: trial > quota > overage > deny.
 *
 * Race note: this read+later-insert is best-effort, not serialized. Two
 * concurrent transcriptions from the same user can each see "1 minute
 * remaining" and each consume 1, leaving the trial 1 minute over. The CHECK
 * constraint on trial_credits (consumed <= granted * 1.05) caps the slop at
 * 5%; beyond that the trigger raises and the second event rolls back. Cost of
 * a typical race is well under a cent of Groq spend — accepted as a tradeoff
 * vs. the latency cost of a pessimistic lock.
 */
export async function checkQuotaForTranscription(
```

- [ ] **Step 6: Typecheck and run all tests**

Run in parallel:
- `cd workers/transcription-api && pnpm exec tsc --noEmit`
- `cd workers/transcription-api && pnpm test`
- `pnpm test` (frontend, from repo root)

Expected: typecheck clean, Worker tests still 12/12, frontend tests still 123/123.

- [ ] **Step 7: Commit**

```bash
git add workers/transcription-api/src/errors.ts \
        workers/transcription-api/src/transcribe.ts \
        workers/transcription-api/src/post-process.ts \
        workers/transcription-api/src/auth.ts \
        workers/transcription-api/src/usage.ts \
        workers/transcription-api/wrangler.toml
git commit -m "chore(cloud): rename payload_too_large, drop dead staging env, document race + cache"
```

---

## Task 9: Final verification & deploy staging

**Files:** none (operational task)

- [ ] **Step 1: Run the full test matrix**

Run sequentially:
- `cd workers/transcription-api && pnpm exec tsc --noEmit && pnpm test`
- `pnpm test`
- `LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check --manifest-path src-tauri/Cargo.toml` (PowerShell: `$env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"; cargo check --manifest-path src-tauri/Cargo.toml`)

Expected: all green.

- [ ] **Step 2: Deploy Worker to staging**

Run: `cd workers/transcription-api && pnpm exec wrangler deploy`
(Default env now that staging block is gone — confirms the deploy still works without it.)
Expected: Worker live on workers.dev, `/health` returns 200.

- [ ] **Step 3: Run E2E S1 against staging**

Trigger one cloud transcription from the desktop app pointed at staging. Verify in Supabase dashboard:
- New row in `usage_events` with `source='trial'`, `kind='transcription'`
- `trial_credits.minutes_consumed` debited by exactly the event's `units` (atomic, no RPC step)
- `usage_summary` row updated by the existing aggregate trigger

If the staging trial isn't seeded, run the manual SQL insert from `docs/v3/05-managed-transcription-e2e-checklist.md` first.

- [ ] **Step 4: Open follow-up issues for skipped items**

These were explicitly deferred (perf-first stance, accept-cents losses):
- Concurrent-call quota race (#2 in the review) — covered by the comment in Task 8
- CORS gate (#5) — non-issue while only desktop calls
- MAX_AUDIO_BYTES tightening (#9) — needs product decision on max recording length
- JWT in AppState refactor (#10)
- Localized post-process system prompts (#13)

Open one tracking issue or add them to the existing 04-billing plan, whichever the project prefers.

- [ ] **Step 5: Update PR description**

Mark the previously unchecked items in PR #44's test plan that are now covered:
- Worker unit tests: ✓ (12 tests via vitest)
- Atomic trial bump: ✓ (trigger + pgTAP)

Note that S1 E2E was re-run after the trigger refactor.

---

## Self-Review

**Spec coverage:**
- #1 Atomic bump → Tasks 1, 2 ✓
- #17 Worker tests → Tasks 3, 4, 5 ✓
- #4 Promise.all → Task 6 ✓
- #11 Hoist useUsage → Task 7 ✓
- #6 Rename error code → Task 8 ✓
- #7 Wrangler staging → Task 8 ✓
- #2 Race comment → Task 8 ✓
- #16 JWT cache comment → Task 8 ✓

**Skipped (acknowledged):** #3 units_unit assertion (now enforced by the trigger's IF clause in Task 1), #5 CORS, #8 filename, #9 audio cap, #10 JWT in AppState, #12 stub migration drop, #13 prompt localization, #14/#15 deployment runbook checks (operational, in Task 9).

**Type/name consistency check:** `bump_trial_on_usage_event`, `trg_usage_events_trial_bump`, `payload_too_large`, `refreshUsage`, `usageLoading` — used consistently across tasks. No drift.

**Total estimated effort:** 4-5h hands-on, broken into 9 commits. Tasks 1-2 can ship together if the staging Supabase is updated first; Tasks 3-5 are pure additions and can land independently; Tasks 6-8 are touch-ups stacked on top.
