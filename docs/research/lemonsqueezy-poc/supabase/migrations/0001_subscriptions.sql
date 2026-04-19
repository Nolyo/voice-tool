-- POC NOL-32 — subscriptions table for LemonSqueezy
-- Runs on a fresh Supabase EU project (NOL-30).

create extension if not exists "pgcrypto";

create type subscription_status as enum (
  'active',
  'on_trial',
  'paused',
  'past_due',
  'unpaid',
  'cancelled',
  'expired'
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  status subscription_status not null,
  provider text not null default 'lemonsqueezy',
  provider_customer_id text not null,
  provider_subscription_id text not null unique,
  provider_variant_id text,
  renews_at timestamptz,
  expires_at timestamptz,
  trial_ends_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on subscriptions(user_id);
create index subscriptions_status_idx on subscriptions(status);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger subscriptions_set_updated_at
before update on subscriptions
for each row execute function set_updated_at();

alter table subscriptions enable row level security;

-- Users can read only their own subscription rows.
create policy "subscriptions_select_own"
  on subscriptions for select
  using (auth.uid() = user_id);

-- No client-side writes: only the service role (webhook) mutates rows.
-- Explicitly deny insert/update/delete from authenticated role.
revoke insert, update, delete on subscriptions from authenticated;
revoke insert, update, delete on subscriptions from anon;
