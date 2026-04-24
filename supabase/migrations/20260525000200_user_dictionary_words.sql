-- user_dictionary_words — dico personnalisé, clé composite (user_id, word)
create table if not exists public.user_dictionary_words (
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null check (char_length(word) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, word)
);

create index if not exists user_dictionary_words_user_updated_idx
  on public.user_dictionary_words (user_id, updated_at);

alter table public.user_dictionary_words enable row level security;

create policy "user_dict_select_own" on public.user_dictionary_words
  for select using (auth.uid() = user_id);

create policy "user_dict_insert_own" on public.user_dictionary_words
  for insert with check (auth.uid() = user_id);

create policy "user_dict_update_own" on public.user_dictionary_words
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_dict_delete_own" on public.user_dictionary_words
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto
create or replace function public.tg_user_dictionary_words_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_dict_updated_at on public.user_dictionary_words;
create trigger user_dict_updated_at
  before update on public.user_dictionary_words
  for each row execute function public.tg_user_dictionary_words_updated_at();

comment on table public.user_dictionary_words is
  'v3 sync: mots dico utilisateur. Clé composite + soft-delete pour propagation cross-device.';
