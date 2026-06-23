-- Extension fonction quota : inclure les nouvelles tables user_notes + user_folders.
-- Sub-épique 03 sync-notes. Le quota côté Edge Function /sync/push tiendra
-- compte du plan utilisateur (Free 10 MB / Starter 100 MB / Pro 500 MB).
create or replace function public.compute_user_sync_size(target_user uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
stable
as $$
declare
  total bigint := 0;
begin
  -- Sécurité : seul un user peut interroger sa propre taille.
  if auth.uid() is null or auth.uid() <> target_user then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select coalesce(sum(pg_column_size(data)), 0) into total
    from public.user_settings where user_id = target_user;

  select coalesce(total + sum(pg_column_size(word)), total) into total
    from public.user_dictionary_words
    where user_id = target_user and deleted_at is null;

  select coalesce(total + sum(pg_column_size(label) + pg_column_size(content) + coalesce(pg_column_size(shortcut), 0)), total) into total
    from public.user_snippets
    where user_id = target_user and deleted_at is null;

  select coalesce(total + sum(pg_column_size(title) + pg_column_size(content_html)), total) into total
    from public.user_notes
    where user_id = target_user and deleted_at is null;

  select coalesce(total + sum(pg_column_size(name)), total) into total
    from public.user_folders
    where user_id = target_user and deleted_at is null;

  return total;
end;
$$;

revoke all on function public.compute_user_sync_size(uuid) from public;
grant execute on function public.compute_user_sync_size(uuid) to authenticated;

comment on function public.compute_user_sync_size is
  'v3 sync: taille totale (bytes) des données sync pour le user courant. Inclut settings + dictionary + snippets + notes + folders (actifs uniquement). Appelée par /sync/push pour quota par plan (Free/Starter/Pro).';
