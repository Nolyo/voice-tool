-- Multi-profil cloud : partition par profile_id sur les 5 tables sync.
-- COUPE NETTE (spec 2026-06-25) : parc = 0, on vide les tables et on ajoute
-- profile_id NOT NULL. Le client re-pousse depuis le local après réactivation.
-- RLS inchangé (auth.uid() = user_id) — profile_id est un discriminant intra-user.

-- 1. Vider les tables (ordre : notes avant folders à cause de la FK folder_id,
--    mais TRUNCATE ... CASCADE gère l'ensemble).
truncate table
  public.user_settings,
  public.user_dictionary_words,
  public.user_snippets,
  public.user_notes,
  public.user_folders
  cascade;

-- 2. user_settings : PK user_id -> (user_id, profile_id).
alter table public.user_settings
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
alter table public.user_settings drop constraint user_settings_pkey;
alter table public.user_settings add primary key (user_id, profile_id);

-- 3. user_dictionary_words : PK (user_id, word) -> (user_id, profile_id, word).
alter table public.user_dictionary_words
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
alter table public.user_dictionary_words drop constraint user_dictionary_words_pkey;
alter table public.user_dictionary_words add primary key (user_id, profile_id, word);
create index if not exists user_dictionary_words_profile_updated_idx
  on public.user_dictionary_words (user_id, profile_id, updated_at);

-- 4. user_snippets : PK id inchangée, ajout colonne + index.
alter table public.user_snippets
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
create index if not exists user_snippets_profile_active_idx
  on public.user_snippets (user_id, profile_id) where deleted_at is null;

-- 5. user_notes : PK id inchangée, ajout colonne + index.
alter table public.user_notes
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
create index if not exists user_notes_profile_active_idx
  on public.user_notes (user_id, profile_id) where deleted_at is null;

-- 6. user_folders : PK id inchangée, ajout colonne + index.
alter table public.user_folders
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
create index if not exists user_folders_profile_active_idx
  on public.user_folders (user_id, profile_id) where deleted_at is null;
