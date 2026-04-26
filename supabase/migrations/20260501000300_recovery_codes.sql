-- Recovery codes for 2FA (MFA TOTP). Hashed server-side; never stored raw.
-- 10 codes per user, regenerated on demand. Each is one-time use.

create extension if not exists pgcrypto;

create table if not exists public.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recovery_codes_user_idx on public.recovery_codes (user_id);

alter table public.recovery_codes enable row level security;
create policy "recovery_codes_select_own" on public.recovery_codes
  for select using (auth.uid() = user_id);
create policy "recovery_codes_insert_own" on public.recovery_codes
  for insert with check (auth.uid() = user_id);
create policy "recovery_codes_update_own" on public.recovery_codes
  for update using (auth.uid() = user_id);

-- Stores fresh codes for the current user. Invalidates any previous codes.
create or replace function public.store_recovery_codes(codes text[])
returns void
language plpgsql
security definer
set search_path = public
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
    values (uid, encode(digest(c, 'sha256'), 'hex'));
  end loop;
end;
$$;

grant execute on function public.store_recovery_codes(text[]) to authenticated;

-- Attempts to consume a recovery code. Returns true if the code matched and was not yet used.
create or replace function public.consume_recovery_code(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  h text := encode(digest(code, 'sha256'), 'hex');
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

grant execute on function public.consume_recovery_code(text) to authenticated;

comment on table public.recovery_codes is 'Hashed (SHA-256) 2FA recovery codes, one-time use, 10 per user.';
