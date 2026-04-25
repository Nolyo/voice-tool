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
grant execute on function public.request_account_deletion() to authenticated;
