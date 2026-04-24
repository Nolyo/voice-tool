-- Tombstone for account deletion requests. A cron job (sub-epic 02+) purges the
-- actual data after the 30-day window.

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
create policy "adr_insert_own" on public.account_deletion_requests
  for insert with check (auth.uid() = user_id);
create policy "adr_select_own" on public.account_deletion_requests
  for select using (auth.uid() = user_id);

create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.account_deletion_requests (user_id)
  values (uid)
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;

comment on table public.account_deletion_requests is 'Tombstone for account deletion requests. Cron purges data after 30 days (GDPR).';
