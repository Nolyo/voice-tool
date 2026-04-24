-- When a fresh device row is inserted, send a notification email.
-- v3.0 simplification: we set a `notified_at` column to NULL on insert and rely on
-- a future Edge Function (not shipped in this sub-epic) that reads NULL rows and
-- dispatches emails via Supabase SMTP.

alter table public.user_devices
  add column if not exists notified_at timestamptz;

create or replace function public.notify_new_device()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Placeholder: future email dispatch will be handled by a separate Edge Function
  -- reading rows where notified_at IS NULL. See 01-auth.md §"Multi-device".
  -- For now, this trigger is a no-op that just lets the row be inserted;
  -- the notified_at column starts NULL and will be filled by the Edge Function.
  return new;
end;
$$;

drop trigger if exists trg_notify_new_device on public.user_devices;
create trigger trg_notify_new_device
  after insert on public.user_devices
  for each row execute function public.notify_new_device();

comment on column public.user_devices.notified_at is 'Set by a cron/edge function after sending the new-device notification email. NULL = pending.';
