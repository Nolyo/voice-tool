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
