-- Fix: store_recovery_codes / consume_recovery_code failed because SET search_path = public
-- excluded the `extensions` schema where pgcrypto's digest() lives on Supabase.
-- Recreate with empty search_path and fully-qualified calls (Supabase-recommended hardening).

create or replace function public.store_recovery_codes(codes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.recovery_codes where user_id = uid;
  foreach c in array codes loop
    insert into public.recovery_codes (user_id, code_hash)
    values (uid, encode(extensions.digest(c, 'sha256'), 'hex'));
  end loop;
end;
$$;

create or replace function public.consume_recovery_code(code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h text := encode(extensions.digest(code, 'sha256'), 'hex');
  matched uuid;
begin
  if uid is null then return false; end if;
  update public.recovery_codes
    set used_at = now()
    where user_id = uid and code_hash = h and used_at is null
    returning id into matched;
  return matched is not null;
end;
$$;
