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
- A user who signs up via OAuth (e.g., Google) and tries again later via email/password will be rejected by the trigger if the canonical form already exists. They will see the generic anti-enumeration screen ("If this account didn't exist, a confirmation email has just been sent") and never receive the mail. They have to figure out from the password sign-in path that the account already exists. Accepted tradeoff — see UX note below.
- Trigger runs on every `auth.users` insert/update, but the cost is one canonicalization + one indexed lookup. Negligible.
- We do not strip dots on non-Gmail providers — a user could in theory create `u.s.e.r@outlook.com` and `user@outlook.com` as two distinct accounts. Acceptable: Outlook does not actually treat them as the same inbox, and the captcha + disposable blocklist + verification email cover the residual fraud risk.

**Performance deferral:**
- The trigger queries `auth.users` with `public.normalize_email(email) = v_canonical`. Without a functional index, this is a sequential scan + per-row function call. At launch scale (<10k users) acceptable. If signup latency becomes measurable (>50k users), evaluate creating a functional index `auth.users(public.normalize_email(email))`. Note: `auth.users` is owned by `supabase_auth_admin`; index creation may require elevated privileges or coordination with Supabase support.

## UX policy: strict anti-enumeration over friendly canonical-collision message

Initial draft of this ADR proposed surfacing a clear "email already registered" message to the user when the trigger fires, by substring-matching the `RAISE EXCEPTION` text in the frontend. Implementation (PR #26) revealed that **GoTrue masks any database-level exception during signup as a generic 500 `unexpected_failure` to the client** — the message text never reaches the SDK, and a robust workaround would have required either:

- A pre-check RPC `public.email_canonical_taken(p_email)` callable by anon — which is by definition an enumeration oracle.
- A functional unique index that GoTrue would interpret as a native duplicate-email error — but GoTrue's duplicate path also delivers a (silent) anti-enumeration response, so this would not improve UX either.

Decision (revised 2026-04-28): **keep strict anti-enumeration**. A legitimate user who uses a `+suffix` or dot variant of an existing account will see the generic vague message and never receive a mail. They are expected to recover via the password sign-in flow (which returns "invalid credentials"). This protects the email base from being scanned by an attacker, which we judge more important than the corner-case UX cost.

The trigger remains in place as defense-in-depth — it ensures no actual canonical-collision row can be inserted, even if a malicious client bypasses the SDK.

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
