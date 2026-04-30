-- Rate-limit account deletion requests at the DB layer.
-- 3 requests / 24h per user is plenty for a legitimate user changing their mind;
-- anything beyond is suspicious (bot, accidental loop) and we want a hard stop.
-- The check happens BEFORE the insert so a rate-limited request never creates a tombstone.
-- Preserves the existing AAL2-when-MFA-enrolled rule from 20260501000510.

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
  blocked boolean;
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

  -- 3 requests / 24h per user (rate_limit_log is global; namespace by action+uid).
  select public.check_rate_limit(format('deletion-request:%s', uid), 86400, 3) into blocked;
  if blocked then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.account_deletion_requests (user_id)
  values (uid)
  on conflict (user_id) do nothing;
end;
$$;
