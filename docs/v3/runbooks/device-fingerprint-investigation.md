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
