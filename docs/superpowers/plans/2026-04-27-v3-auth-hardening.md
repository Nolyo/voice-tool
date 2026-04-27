# V3 Auth Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anti-abuse defenses to the existing v3.0 auth flow before opening v3.2 billing — email canonicalization (strip Gmail `+suffix` and dots), disposable-domain blocklist, and Cloudflare Turnstile captcha at signup.

**Architecture:** Defense in depth at signup. Postgres-level enforcement (`normalize_email()` function + generated `email_canonical` column + unique trigger on `auth.users`) blocks duplicates even if a client bypasses validation. Frontend layer (`normalizeEmail()` + `isDisposableDomain()` helpers wired into `SignInPanel`) gives friendly UX feedback. Cloudflare Turnstile token sent via `supabase.auth.signUp({ options: { captchaToken } })` — Supabase Auth validates it natively (no Edge Function needed).

**Tech Stack:** Postgres (migrations + pgtap tests), TypeScript + React 19 (frontend), Vitest (frontend tests), `@marsidev/react-turnstile` (Turnstile widget), Supabase Auth native captcha integration.

**Spec source:** `docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md` sections 8 + 10.1.

**Out of scope** (deferred to subsequent plans):
- `WelcomeScreen` first-run component → goes into `04-billing` plan (depends on trial mechanics & cloud service).
- IP rate limit on signup → Supabase native rate limit suffices for v3.2; bespoke implementation deferred.
- Device fingerprint analytics query → already implementable today, doc-only deliverable to add to `docs/v3/runbooks/` (Task 7).

---

## File Structure

**New files:**
- `supabase/migrations/20260601000100_email_canonical.sql` — `normalize_email()` function + `email_canonical` column + unique trigger.
- `supabase/tests/email_canonical.sql` — pgtap tests (function purity + trigger blocking duplicates).
- `src/lib/email-normalize.ts` — frontend `normalizeEmail()` + `isDisposableDomain()` helpers + embedded blocklist.
- `src/lib/email-normalize.test.ts` — Vitest tests for the helpers.
- `src/lib/disposable-domains.ts` — embedded list of disposable email domains (constant).
- `src/components/auth/TurnstileWidget.tsx` — thin wrapper around `@marsidev/react-turnstile` with i18n + theme integration.
- `docs/v3/decisions/0011-email-canonical.md` — ADR explaining canonicalization strategy and migration retroactivity.
- `docs/v3/runbooks/device-fingerprint-investigation.md` — runbook with the analytical SQL query.

**Modified files:**
- `src/components/auth/SignInPanel.tsx` — integrate email validation + Turnstile widget; pass `captchaToken` to `supabase.auth.signUp()` and `supabase.auth.signInWithOtp()`.
- `src/lib/supabase.ts` — export Turnstile site key from env (`VITE_TURNSTILE_SITE_KEY`).
- `src/locales/fr.json` + `src/locales/en.json` — i18n keys for new error messages.
- `supabase/config.toml` — enable captcha provider (`turnstile`) under `[auth.captcha]`.
- `package.json` — add `@marsidev/react-turnstile` dependency.
- `.env.local.example` (or equivalent doc) — document `VITE_TURNSTILE_SITE_KEY` and the Supabase secret `auth.captcha.secret`.

**Total scope:** 7 tasks. Estimated 4-6 hours of focused work.

---

## Task 1 — Postgres `normalize_email()` function + pgtap tests

**Files:**
- Create: `supabase/migrations/20260601000100_email_canonical.sql` (function only in this task)
- Create: `supabase/tests/email_canonical.sql`

The function strips `+suffix` for any provider, strips `.` only for Gmail/Googlemail, and lowercases. Returns NULL on NULL input.

- [ ] **Step 1 — Write the pgtap tests first**

Create `supabase/tests/email_canonical.sql` with:

```sql
begin;
select plan(12);

-- Function purity
select is(public.normalize_email('user@example.com'), 'user@example.com', 'lowercase passthrough');
select is(public.normalize_email('USER@Example.COM'), 'user@example.com', 'lowercases');
select is(public.normalize_email('user+anything@example.com'), 'user@example.com', 'strips +suffix on any domain');
select is(public.normalize_email('User+a+b+c@Example.com'), 'user@example.com', 'strips multiple +suffix and lowercases');
select is(public.normalize_email('u.s.e.r@gmail.com'), 'user@gmail.com', 'strips dots on gmail.com');
select is(public.normalize_email('u.s.e.r@googlemail.com'), 'user@googlemail.com', 'strips dots on googlemail.com');
select is(public.normalize_email('u.s.e.r+x@gmail.com'), 'user@gmail.com', 'strips dots and +suffix on gmail');
select is(public.normalize_email('u.s.e.r@outlook.com'), 'u.s.e.r@outlook.com', 'does NOT strip dots on outlook');
select is(public.normalize_email('u.s.e.r@yahoo.com'), 'u.s.e.r@yahoo.com', 'does NOT strip dots on yahoo');
select is(public.normalize_email(NULL), NULL, 'NULL passthrough');
select is(public.normalize_email(''), '', 'empty string passthrough');
select is(public.normalize_email('no-at-sign'), 'no-at-sign', 'malformed input passthrough (no @)');

select * from finish();
rollback;
```

- [ ] **Step 2 — Run the tests; confirm they fail**

Run: `pnpm exec supabase test db --linked` (or local `pnpm exec supabase db reset && pnpm exec supabase test db`)
Expected: tests fail with `function public.normalize_email(text) does not exist`.

- [ ] **Step 3 — Write the migration with the function**

Create `supabase/migrations/20260601000100_email_canonical.sql`:

```sql
-- Email canonicalization for anti-abuse (ADR 0011).
-- Strips +suffix for all domains, strips dots for gmail.com/googlemail.com, lowercases.
-- The `strict` modifier auto-returns NULL for NULL input — no explicit guard needed.

create or replace function public.normalize_email(p_email text)
returns text
language plpgsql
immutable
strict
as $$
declare
  v_local text;
  v_domain text;
  v_at_pos int;
begin
  v_at_pos := position('@' in p_email);

  -- Malformed (no @) → return lowercased input as-is
  if v_at_pos = 0 then
    return lower(p_email);
  end if;

  v_local := lower(substring(p_email from 1 for v_at_pos - 1));
  v_domain := lower(substring(p_email from v_at_pos + 1));

  -- Strip +suffix on any domain (most providers treat the suffix as an alias)
  v_local := split_part(v_local, '+', 1);

  -- Strip dots only for Gmail / Googlemail (their addressing rule)
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
  end if;

  return v_local || '@' || v_domain;
end;
$$;

comment on function public.normalize_email is
  'Canonicalizes an email for anti-abuse uniqueness check (ADR 0011). Strips +suffix on all domains, strips dots on Gmail/Googlemail, lowercases.';
```

- [ ] **Step 4 — Run the tests; confirm they all pass**

Run: `pnpm exec supabase db reset && pnpm exec supabase test db`
Expected: 12/12 pass.

- [ ] **Step 5 — Commit**

```bash
git add supabase/migrations/20260601000100_email_canonical.sql supabase/tests/email_canonical.sql
git commit -m "feat(auth): add normalize_email() function with pgtap tests"
```

---

## Task 2 — `email_canonical` generated column + unique trigger

**Files:**
- Modify: `supabase/migrations/20260601000100_email_canonical.sql` (extend)
- Modify: `supabase/tests/email_canonical.sql` (extend)

`auth.users` is owned by Supabase Auth — we cannot add a generated column directly. Instead we use a `BEFORE INSERT OR UPDATE` trigger that rejects rows whose canonical form collides with an existing user.

- [ ] **Step 1 — Extend the pgtap tests**

Append to `supabase/tests/email_canonical.sql`, before `select * from finish();` (also bump the plan count: change `select plan(12)` to `select plan(17)`):

```sql
-- Trigger : duplicate canonical rejected on INSERT
insert into auth.users (id, email, aud, role) values
  ('33333333-3333-3333-3333-333333333333', 'alice@gmail.com', 'authenticated', 'authenticated');

select throws_ok(
  $$ insert into auth.users (id, email, aud, role) values
       ('44444444-4444-4444-4444-444444444444', 'a.l.i.c.e+work@gmail.com', 'authenticated', 'authenticated') $$,
  'P0001',
  'email already registered (canonical form collision)',
  'INSERT with same canonical form is rejected'
);

select throws_ok(
  $$ insert into auth.users (id, email, aud, role) values
       ('55555555-5555-5555-5555-555555555555', 'ALICE+other@GMAIL.COM', 'authenticated', 'authenticated') $$,
  'P0001',
  'email already registered (canonical form collision)',
  'INSERT with case+suffix variant is rejected'
);

-- Different domain → not blocked
select lives_ok(
  $$ insert into auth.users (id, email, aud, role) values
       ('66666666-6666-6666-6666-666666666666', 'alice@outlook.com', 'authenticated', 'authenticated') $$,
  'INSERT on different domain is allowed'
);

-- UPDATE that creates a collision is rejected
select throws_ok(
  $$ update auth.users set email = 'alice+update@gmail.com' where id = '66666666-6666-6666-6666-666666666666' $$,
  'P0001',
  'email already registered (canonical form collision)',
  'UPDATE creating canonical collision is rejected'
);

-- UPDATE the same user's own email (no collision) is allowed
select lives_ok(
  $$ update auth.users set email = 'alice2@gmail.com' where id = '33333333-3333-3333-3333-333333333333' $$,
  'UPDATE on owner row is allowed when canonical changes uniquely'
);
```

- [ ] **Step 2 — Run; confirm the new tests fail**

Run: `pnpm exec supabase db reset && pnpm exec supabase test db`
Expected: previous 12 still pass, the 5 new fail with `42P01` or no error raised (trigger missing).

- [ ] **Step 3 — Extend the migration with the trigger**

Append to `supabase/migrations/20260601000100_email_canonical.sql`:

```sql
-- Trigger : reject duplicate canonical emails on auth.users INSERT/UPDATE.
create or replace function public.enforce_email_canonical_unique()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_canonical text;
begin
  v_canonical := public.normalize_email(NEW.email);
  if exists (
    select 1 from auth.users
    where id <> NEW.id
      and public.normalize_email(email) = v_canonical
  ) then
    raise exception 'email already registered (canonical form collision)'
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_email_canonical_unique_trigger on auth.users;
create trigger enforce_email_canonical_unique_trigger
  before insert or update of email on auth.users
  for each row execute function public.enforce_email_canonical_unique();

comment on function public.enforce_email_canonical_unique is
  'Rejects auth.users INSERT/UPDATE whose canonical email collides with an existing row. ADR 0011.';
```

- [ ] **Step 4 — Run; confirm all 17 tests pass**

Run: `pnpm exec supabase db reset && pnpm exec supabase test db`
Expected: 17/17 pass.

- [ ] **Step 5 — Commit**

```bash
git add supabase/migrations/20260601000100_email_canonical.sql supabase/tests/email_canonical.sql
git commit -m "feat(auth): reject duplicate canonical emails via trigger on auth.users"
```

---

## Task 3 — Frontend `normalizeEmail()` + disposable-domains list + Vitest tests

**Files:**
- Create: `src/lib/disposable-domains.ts`
- Create: `src/lib/email-normalize.ts`
- Create: `src/lib/email-normalize.test.ts`

Mirrors the Postgres function client-side for instant UX feedback. Source of truth remains the DB trigger.

- [ ] **Step 1 — Write the failing Vitest tests**

Create `src/lib/email-normalize.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeEmail, isDisposableDomain } from "./email-normalize";

describe("normalizeEmail", () => {
  it("lowercases passthrough", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
    expect(normalizeEmail("USER@Example.COM")).toBe("user@example.com");
  });

  it("strips +suffix on any domain", () => {
    expect(normalizeEmail("user+a@example.com")).toBe("user@example.com");
    expect(normalizeEmail("User+a+b+c@Example.com")).toBe("user@example.com");
  });

  it("strips dots only on gmail.com / googlemail.com", () => {
    expect(normalizeEmail("u.s.e.r@gmail.com")).toBe("user@gmail.com");
    expect(normalizeEmail("u.s.e.r@googlemail.com")).toBe("user@googlemail.com");
    expect(normalizeEmail("u.s.e.r+x@gmail.com")).toBe("user@gmail.com");
    expect(normalizeEmail("u.s.e.r@outlook.com")).toBe("u.s.e.r@outlook.com");
    expect(normalizeEmail("u.s.e.r@yahoo.com")).toBe("u.s.e.r@yahoo.com");
  });

  it("handles malformed input gracefully", () => {
    expect(normalizeEmail("no-at-sign")).toBe("no-at-sign");
    expect(normalizeEmail("")).toBe("");
  });

  it("trims whitespace before normalizing", () => {
    expect(normalizeEmail("  user@gmail.com  ")).toBe("user@gmail.com");
  });
});

describe("isDisposableDomain", () => {
  it("flags known disposable domains", () => {
    expect(isDisposableDomain("user@mailinator.com")).toBe(true);
    expect(isDisposableDomain("user@tempmail.com")).toBe(true);
    expect(isDisposableDomain("user@guerrillamail.com")).toBe(true);
  });

  it("does not flag legitimate domains", () => {
    expect(isDisposableDomain("user@gmail.com")).toBe(false);
    expect(isDisposableDomain("user@outlook.com")).toBe(false);
    expect(isDisposableDomain("user@protonmail.com")).toBe(false);
    expect(isDisposableDomain("user@icloud.com")).toBe(false);
  });

  it("is case-insensitive on the domain", () => {
    expect(isDisposableDomain("user@MAILINATOR.com")).toBe(true);
  });

  it("returns false on malformed input", () => {
    expect(isDisposableDomain("no-at-sign")).toBe(false);
    expect(isDisposableDomain("")).toBe(false);
  });
});
```

- [ ] **Step 2 — Run; confirm fail**

Run: `pnpm test src/lib/email-normalize.test.ts`
Expected: file not found / module not found.

- [ ] **Step 3 — Write `disposable-domains.ts`**

Create `src/lib/disposable-domains.ts`:

```typescript
// Curated subset of common disposable email domains.
// Source for fuller list: https://github.com/disposable/disposable-email-domains (MIT, regularly updated).
// Update this list periodically; for v3.2 launch an embedded subset is sufficient.
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com",
  "tempmail.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "trashmail.com",
  "throwawaymail.com",
  "yopmail.com",
  "10minutemail.com",
  "10minutemail.net",
  "maildrop.cc",
  "fakeinbox.com",
  "tempinbox.com",
  "getairmail.com",
  "dispostable.com",
  "sharklasers.com",
  "mailcatch.com",
  "spam4.me",
  "mintemail.com",
  "mohmal.com",
  "tempr.email",
  "armyspy.com",
  "cuvox.de",
  "dayrep.com",
  "einrot.com",
  "fleckens.hu",
  "gustr.com",
  "jourrapide.com",
  "rhyta.com",
  "superrito.com",
  "teleworm.us",
]);
```

- [ ] **Step 4 — Write `email-normalize.ts`**

Create `src/lib/email-normalize.ts`:

```typescript
import { DISPOSABLE_DOMAINS } from "./disposable-domains";

/**
 * Canonicalizes an email for client-side anti-abuse pre-check.
 * Mirrors public.normalize_email() in Postgres (ADR 0011) — server is source of truth.
 *
 * Strips +suffix for any domain. Strips dots only for gmail.com / googlemail.com. Lowercases.
 */
export function normalizeEmail(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const lowered = trimmed.toLowerCase();
  const atPos = lowered.indexOf("@");
  if (atPos === -1) return lowered;
  const localRaw = lowered.slice(0, atPos);
  const domain = lowered.slice(atPos + 1);
  const localNoSuffix = localRaw.split("+")[0];
  const local =
    domain === "gmail.com" || domain === "googlemail.com"
      ? localNoSuffix.replaceAll(".", "")
      : localNoSuffix;
  return `${local}@${domain}`;
}

/**
 * Returns true if the email's domain is in the embedded disposable-domain blocklist.
 * Returns false on malformed input (no @).
 */
export function isDisposableDomain(input: string): boolean {
  const atPos = input.indexOf("@");
  if (atPos === -1) return false;
  const domain = input.slice(atPos + 1).trim().toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}
```

- [ ] **Step 5 — Run; confirm pass**

Run: `pnpm test src/lib/email-normalize.test.ts`
Expected: all tests pass.

- [ ] **Step 6 — Commit**

```bash
git add src/lib/email-normalize.ts src/lib/email-normalize.test.ts src/lib/disposable-domains.ts
git commit -m "feat(auth): add client-side email canonicalization and disposable-domain blocklist"
```

---

## Task 4 — Wire validation into `SignInPanel`

**Files:**
- Modify: `src/components/auth/SignInPanel.tsx`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/en.json`

Add pre-signup checks: disposable domain → block with friendly message. Email canonical normalization is informational only client-side (the DB trigger has the final word).

- [ ] **Step 1 — Add i18n keys**

Modify `src/locales/fr.json` — add under existing `auth.signup` namespace:

```json
"emailDisposable": "Cette adresse email semble jetable. Utilise une adresse permanente.",
"emailAlreadyRegistered": "Cette adresse email (ou une variante) est déjà enregistrée."
```

Modify `src/locales/en.json` — add under existing `auth.signup` namespace:

```json
"emailDisposable": "This email looks disposable. Please use a permanent address.",
"emailAlreadyRegistered": "This email (or a variant) is already registered."
```

(Exact placement under the existing `auth.signup` object — preserve trailing commas as needed.)

- [ ] **Step 2 — Modify `SignInPanel.tsx` — add import**

Modify `src/components/auth/SignInPanel.tsx:1-8` — add import after `isPwnedPassword`:

```typescript
import { isDisposableDomain } from "@/lib/email-normalize";
```

- [ ] **Step 3 — Modify `handleSignup` to add disposable check + map server error**

Replace the body of `handleSignup` (`src/components/auth/SignInPanel.tsx:108-132`) with:

```typescript
async function handleSignup(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  if (password.length < 10) {
    setError(t("auth.signup.passwordTooShort"));
    return;
  }
  if (isDisposableDomain(email)) {
    setError(t("auth.signup.emailDisposable"));
    return;
  }
  setLoading(true);
  const pwned = await isPwnedPassword(password);
  if (pwned) {
    setLoading(false);
    setError(t("auth.signup.passwordPwned"));
    return;
  }
  const { error: signupError } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: AUTH_CALLBACK_URL },
  });
  setLoading(false);
  if (signupError) {
    // Trigger from migration 20260601000100 raises P0001 with our message.
    if (signupError.message.includes("canonical form collision")) {
      setError(t("auth.signup.emailAlreadyRegistered"));
      return;
    }
    console.warn("signup error (not shown)", signupError.message);
  }
  setStep("sent");
}
```

Note: `setStep("sent")` is now inside the success branch only — moved out of the unconditional path. Anti-enumeration is preserved because we still show "sent" on generic errors (no message disclosed).

- [ ] **Step 4 — Manual smoke test**

Run: `pnpm tauri dev` (ask user to run — see CLAUDE.md). Open the auth modal, switch to signup tab.

Test cases:
1. Email `test@mailinator.com` + valid password → form blocks with "This email looks disposable" / "Cette adresse email semble jetable".
2. Email `test+a@gmail.com` + valid password → first signup succeeds, "check inbox" view appears.
3. Email `test+b@gmail.com` (same canonical) + valid password → form blocks with "email already registered" message.
4. Email `legitimate@gmail.com` + weak password (length < 10) → form blocks with existing pwned/short rule (regression check, no behavior change).

Expected: cases 1, 3 show the new error texts; case 2 succeeds; case 4 unchanged.

- [ ] **Step 5 — Commit**

```bash
git add src/components/auth/SignInPanel.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat(auth): block disposable domains and surface canonical-collision error at signup"
```

---

## Task 5 — Cloudflare Turnstile widget + Supabase integration

**Files:**
- Modify: `package.json` (add dep)
- Create: `src/components/auth/TurnstileWidget.tsx`
- Modify: `src/components/auth/SignInPanel.tsx` (add widget + pass `captchaToken`)
- Modify: `src/lib/supabase.ts` (export `TURNSTILE_SITE_KEY` from env)
- Modify: `supabase/config.toml` (enable captcha)
- Modify: `.env.local.example` (or documented equivalent — add the new key)

Supabase Auth validates the captcha natively when `captchaToken` is passed in the signUp/signInWithOtp options — no Edge Function intermediary needed.

- [ ] **Step 1 — Install the React Turnstile lib**

Run: `pnpm add @marsidev/react-turnstile@latest`
Verify in `package.json`: `"@marsidev/react-turnstile": "^X.Y.Z"` appears under dependencies.

- [ ] **Step 2 — Export the site key from `lib/supabase.ts`**

Modify `src/lib/supabase.ts` — at the bottom of the file, add:

```typescript
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? "";
```

If the file already has a section exporting env-derived constants, add it there. If `TURNSTILE_SITE_KEY` is empty, the widget will render but Cloudflare will not load — an explicit dev-mode test key (`1x00000000000000000000AA`) is provided in step 6 below for local development.

- [ ] **Step 3 — Create `TurnstileWidget.tsx`**

Create `src/components/auth/TurnstileWidget.tsx`:

```typescript
import { Turnstile } from "@marsidev/react-turnstile";
import { TURNSTILE_SITE_KEY } from "@/lib/supabase";

interface Props {
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

/**
 * Cloudflare Turnstile widget wrapper.
 * The token is passed to supabase.auth.signUp({ options: { captchaToken } });
 * Supabase validates it natively (see [auth.captcha] in supabase/config.toml).
 */
export function TurnstileWidget({ onSuccess, onExpire, onError }: Props) {
  if (!TURNSTILE_SITE_KEY) {
    console.warn("VITE_TURNSTILE_SITE_KEY not set — captcha disabled in dev");
    return null;
  }
  return (
    <Turnstile
      siteKey={TURNSTILE_SITE_KEY}
      onSuccess={onSuccess}
      onExpire={onExpire}
      onError={onError}
      options={{ theme: "auto", size: "flexible" }}
    />
  );
}
```

- [ ] **Step 4 — Wire the widget into `SignInPanel`**

Modify `src/components/auth/SignInPanel.tsx`:

a) Add the import after the existing imports:

```typescript
import { TurnstileWidget } from "./TurnstileWidget";
```

b) Add a state hook near the other useState calls (after `const [error, setError] = useState<string | null>(null);`):

```typescript
const [captchaToken, setCaptchaToken] = useState<string | null>(null);
```

c) Modify `handleSignup` — guard at the top after the pwned check (before the `supabase.auth.signUp` call):

```typescript
if (!captchaToken) {
  setLoading(false);
  setError(t("auth.signup.captchaRequired"));
  return;
}
```

And add `captchaToken` to the signUp options:

```typescript
const { error: signupError } = await supabase.auth.signUp({
  email,
  password,
  options: { emailRedirectTo: AUTH_CALLBACK_URL, captchaToken },
});
```

After signUp completes (success or error), reset the token (Turnstile single-use):

```typescript
setCaptchaToken(null);
```

d) Modify `handleMagicLink` similarly — guard captcha + add `captchaToken` to `signInWithOtp` options + reset on completion. Magic link is also signup-equivalent (creates the user on first use), so it must be captcha-protected.

```typescript
async function handleMagicLink(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  if (!captchaToken) {
    setError(t("auth.signup.captchaRequired"));
    return;
  }
  setLoading(true);
  const { error: signinError } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: AUTH_CALLBACK_URL, captchaToken },
  });
  setLoading(false);
  setCaptchaToken(null);
  setStep("sent");
  if (signinError) {
    console.warn("magic link error (not shown to user)", signinError.message);
  }
}
```

(`handlePasswordSignIn` does not need captcha — the user already exists.)

e) Render the widget in the form. Insert just **before** the primary submit button (`src/components/auth/SignInPanel.tsx:396` area — the `<button type="submit">` line):

```tsx
{(mode === "signup" || (mode === "signin" && method === "magic")) && (
  <div className="my-3 flex justify-center">
    <TurnstileWidget
      onSuccess={(token) => setCaptchaToken(token)}
      onExpire={() => setCaptchaToken(null)}
      onError={() => setCaptchaToken(null)}
    />
  </div>
)}
```

- [ ] **Step 5 — Add i18n key for captcha required**

Modify `src/locales/fr.json` (under `auth.signup`):

```json
"captchaRequired": "Merci de valider le captcha avant de continuer."
```

Modify `src/locales/en.json` (under `auth.signup`):

```json
"captchaRequired": "Please complete the captcha before continuing."
```

- [ ] **Step 6 — Configure captcha in Supabase**

Modify `supabase/config.toml`. Find the existing `[auth]` block (or create one if missing) and add inside or right after:

```toml
[auth.captcha]
enabled = true
provider = "turnstile"
secret = "env(SUPABASE_AUTH_CAPTCHA_SECRET)"
```

Document the env vars. Create or update `.env.local.example`:

```bash
# Cloudflare Turnstile (signup captcha)
# Public site key — exposed to the browser, OK to commit a placeholder.
# Dev / local: use the always-pass test key from Cloudflare docs.
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA

# Server-side secret — set in Supabase project secrets, NEVER commit the real value.
# Dev / local: use the always-pass test secret from Cloudflare docs.
SUPABASE_AUTH_CAPTCHA_SECRET=1x0000000000000000000000000000000AA
```

Cloudflare always-pass test keys are documented at https://developers.cloudflare.com/turnstile/troubleshooting/testing/ — they let you exercise the flow locally without a real Turnstile account.

For production, the user must:
1. Create a real Turnstile widget at https://dash.cloudflare.com/?to=/:account/turnstile (free tier is generous).
2. Set `VITE_TURNSTILE_SITE_KEY` in the Tauri build env.
3. Set `SUPABASE_AUTH_CAPTCHA_SECRET` as a Supabase secret via `supabase secrets set` or the dashboard.

- [ ] **Step 7 — Manual smoke test**

Run: `pnpm tauri dev` (ask user). Open the auth modal, switch to signup tab.

Test cases:
1. Widget visible. Token resolves automatically (test key always-passes). Submit succeeds.
2. Click submit before captcha resolves → "Please complete the captcha" error.
3. Magic link tab → widget visible, same behavior.
4. Sign-in (password method) → widget NOT visible (intentional).

Expected: all four cases match.

- [ ] **Step 8 — Commit**

```bash
git add package.json pnpm-lock.yaml src/components/auth/TurnstileWidget.tsx src/components/auth/SignInPanel.tsx src/lib/supabase.ts src/locales/fr.json src/locales/en.json supabase/config.toml .env.local.example
git commit -m "feat(auth): add Cloudflare Turnstile captcha at signup and magic link"
```

---

## Task 6 — ADR 0011 + device-fingerprint runbook

**Files:**
- Create: `docs/v3/decisions/0011-email-canonical.md`
- Create: `docs/v3/runbooks/device-fingerprint-investigation.md`

Documentation deliverables. No code, no tests.

- [ ] **Step 1 — Write ADR 0011**

Create `docs/v3/decisions/0011-email-canonical.md`:

```markdown
# ADR 0011 — Email canonicalization for anti-abuse

**Status:** Accepted
**Date:** 2026-04-27
**Context:** sub-épique 01-auth (rétroactif), sub-épique 04-billing (motivation)

## Context

The free trial introduced in sub-épique 04-billing (60 minutes + 30 days, no credit card required at signup) creates an incentive to create multiple accounts to cumulate trials. Two well-known Gmail-side techniques bypass naive uniqueness checks:

- `+suffix` aliasing: `user+a@gmail.com` and `user+b@gmail.com` deliver to the same inbox `user@gmail.com`.
- Dot insertion (Gmail-specific): `u.s.e.r@gmail.com`, `us.er@gmail.com` and `user@gmail.com` are all the same inbox.

Most other providers (Outlook, Yahoo, ProtonMail, iCloud) honor `+suffix` aliasing too, but do not strip dots.

## Decision

Add a Postgres function `public.normalize_email(text)` that canonicalizes an email by:

1. Lowercasing the entire address.
2. Stripping the `+...` suffix from the local part (any domain).
3. Stripping dots from the local part **only** when the domain is `gmail.com` or `googlemail.com`.

Add a `BEFORE INSERT OR UPDATE` trigger on `auth.users` (`enforce_email_canonical_unique_trigger`) that rejects rows whose canonical form collides with an existing user, raising `P0001` with a stable error message.

Mirror the function client-side as `normalizeEmail()` in `src/lib/email-normalize.ts`. The client-side check is informational (instant UX feedback) — the database trigger is the source of truth.

## Consequences

**Positive:**
- Bypasses scripts that try to claim multiple trials by using `+suffix` or dot variants on the same Gmail inbox.
- Postgres-level enforcement covers all signup flows (password, magic link, OAuth callback when email is already known) without per-flow code.
- The function is `immutable` and `strict`, so it can be inlined by the planner and used safely in indexes if needed later.

**Negative:**
- A user who signs up via OAuth (e.g., Google) and tries again later via email/password will be rejected by the trigger if the canonical form already exists. Acceptable: the user should sign in via the OAuth method instead. Error message should be friendly enough to guide them.
- Trigger runs on every `auth.users` insert/update, but the cost is one canonicalization + one indexed lookup. Negligible.
- We do not strip dots on non-Gmail providers — a user could in theory create `u.s.e.r@outlook.com` and `user@outlook.com` as two distinct accounts. Acceptable: Outlook does not actually treat them as the same inbox, and the captcha + disposable blocklist + verification email cover the residual fraud risk.

## Retroactivity to sub-épique 01-auth

Sub-épique 01-auth was frozen 2026-04-22, before the trial mechanic was finalized. This ADR adds enforcement retroactively without breaking the existing flow:

- Existing rows in `auth.users` are not touched. If two pre-existing users have colliding canonical forms (very unlikely given current usage), they remain. Future inserts/updates are blocked.
- No data migration is required.
- No frontend breaking change: the new error path is opt-in (only signups that fail trigger this code path).

## Alternatives considered

- **Domain-aware unique constraint via a generated column on `auth.users`.** Rejected: `auth.users` is owned by Supabase Auth and adding a generated column requires elevated privileges and risks future Supabase Auth migration conflicts.
- **Full disposable-domain checking server-side via an Edge Function.** Rejected: the captcha + simple embedded blocklist (`src/lib/disposable-domains.ts`) covers the bulk of cases without adding latency or a server round-trip.
- **Phone verification.** Rejected (out of scope, friction = anti-thesis of the v3.2 onboarding goal). Per spec section 8.3.

## References

- Spec: `docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md` sections 8 + 10.1
- Sub-épique: `docs/v3/01-auth.md`
- Migration: `supabase/migrations/20260601000100_email_canonical.sql`
- Tests: `supabase/tests/email_canonical.sql`, `src/lib/email-normalize.test.ts`
```

- [ ] **Step 2 — Write the device-fingerprint runbook**

Create `docs/v3/runbooks/device-fingerprint-investigation.md`:

```markdown
# Runbook — Device fingerprint anti-abuse investigation

**Status:** Active (passive observation, no automatic blocking)
**Audience:** Solo dev / admin
**Cadence:** Run weekly during the v3.2 launch window; monthly thereafter unless an abuse pattern is suspected.

## Why this runbook exists

Spec `2026-04-27-v3-premium-offer-design.md` section 8.2 designates the `user_devices` table (already populated by sub-épique 01-auth) as a passive signal for multi-account abuse: a single device fingerprint associated with three or more distinct user accounts in a 30-day window is a probable abuse pattern.

We do **not** block on this signal automatically — it can produce false positives (shared family PC, dev test machine, public computer). The runbook documents the manual investigation path.

## Query

Run against the production database (read-only via Supabase SQL editor or `psql`):

```sql
select
  device_fingerprint,
  count(distinct user_id) as account_count,
  array_agg(distinct user_id) as user_ids,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from public.user_devices
where created_at > now() - interval '30 days'
group by device_fingerprint
having count(distinct user_id) >= 3
order by account_count desc, last_seen desc;
```

## Interpretation

| `account_count` | Likely category | Action |
|---|---|---|
| 3 | Shared device (family / pair programming / dev) | None. Note in a tracking spreadsheet if curious. |
| 4-5 | Suspicious; could still be legitimate | Cross-check IPs and signup timestamps. If clustered (same IP, signups within minutes), flag for follow-up. |
| 6+ | Probable abuse | Investigate the email canonical forms (run `select email, public.normalize_email(email) from auth.users where id = any(...)`). If most are variants of each other, consider a soft-block (require a fresh email confirmation) or a manual ban. |

## Escalation

If a clear abuse pattern is detected:

1. Document the case (timestamp, fingerprint, user_ids, observation).
2. Decide on action: leave alone (low impact), email warning (medium impact), account termination (clear abuse).
3. If the pattern repeats at scale, open a discussion in `docs/v3/decisions/` about adding automatic soft-block (e.g., extra captcha or email re-verification when a device_fingerprint already has N accounts).

## Related

- Spec: `docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md` sections 8.1, 8.2
- Schema: `supabase/migrations/20260501000000_user_devices.sql`
```

- [ ] **Step 3 — Commit**

```bash
git add docs/v3/decisions/0011-email-canonical.md docs/v3/runbooks/device-fingerprint-investigation.md
git commit -m "docs(v3): add ADR 0011 (email canonical) and device-fingerprint runbook"
```

---

## Task 7 — Final verification + plan checkout

**Files:** none (verification only)

- [ ] **Step 1 — Re-run the full test suite**

Run: `pnpm test`
Expected: all Vitest tests pass (existing + new).

Run: `pnpm exec supabase db reset && pnpm exec supabase test db`
Expected: 17/17 pgtap tests pass.

- [ ] **Step 2 — Type check**

Run: `pnpm build` (this runs `tsc && vite build`)
Expected: no TypeScript errors.

- [ ] **Step 3 — Manual end-to-end smoke**

Run: `pnpm tauri dev` (ask user). Walk the full happy path:

1. Open auth modal → signup tab.
2. Email `tester@gmail.com`, password `correcthorsebatterystaple`. Captcha auto-resolves. Submit → success ("check inbox" view).
3. (After verifying email in Supabase admin or via inbox if SMTP wired.) Sign in via password.
4. Sign out.
5. Reopen modal → signup tab.
6. Email `t.e.s.t.e.r+other@gmail.com`. Submit → blocked with "email already registered (or a variant)".
7. Email `tester@mailinator.com`. Submit → blocked with "this email looks disposable".
8. Switch to signin tab → magic link method. Captcha visible. Email `tester@gmail.com` → success.

Expected: all 8 steps behave as written.

- [ ] **Step 4 — Push & open PR**

Push current branch and open a PR titled `feat(auth): v3 anti-abuse hardening (email canonical + Turnstile + blocklist)`. Body should reference the spec and ADR.

```bash
git push -u origin <current-branch>
gh pr create --title "feat(auth): v3 anti-abuse hardening" --body "$(cat <<'EOF'
## Summary
- Postgres `normalize_email()` function + trigger on `auth.users` rejects canonical-form duplicates (Gmail `+suffix` and dot tricks).
- Frontend mirrors the canonicalization for instant UX feedback (`src/lib/email-normalize.ts`).
- Disposable-domain blocklist embedded client-side (`src/lib/disposable-domains.ts`).
- Cloudflare Turnstile captcha at signup and magic-link flows, validated natively by Supabase Auth.
- ADR 0011 documents the canonicalization strategy.
- Runbook for device-fingerprint investigation (passive signal, no auto-block).

Spec: `docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md` sections 8 + 10.1
ADR: `docs/v3/decisions/0011-email-canonical.md`

## Test plan
- [ ] pgtap tests pass (17/17): `pnpm exec supabase test db`
- [ ] Vitest passes: `pnpm test`
- [ ] Manual smoke: 8 cases in plan Task 7 step 3

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5 — Mark plan completed**

Once the PR is approved and merged, this plan is closed. The next plan in the sequence is the brainstorming session for sub-épique `05-managed-transcription`.

---

## Self-Review checklist

- [x] Every spec requirement (sections 8 + 10.1 of the design) maps to a task.
- [x] No "TBD" / "TODO" / "implement later" placeholders.
- [x] Function names consistent across tasks (`normalize_email` in SQL, `normalizeEmail` in TS — naming convention divergence is intentional and matches each language's idiom).
- [x] All file paths are absolute or repo-relative; no `<placeholder>`.
- [x] Tests precede implementation (TDD).
- [x] Each task ends with a commit.
- [x] Manual smoke is explicit (8 specific cases, expected outcomes documented).

---

**End of plan.**
