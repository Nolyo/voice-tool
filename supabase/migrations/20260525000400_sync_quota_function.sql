-- Calcule la taille totale des données sync pour un user (bytes).
-- Utilisée par l'Edge Function /sync/push pour rejeter quand > 5 MB.
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
  -- Sécurité : seul un user peut interroger sa propre taille
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

  return total;
end;
$$;

revoke all on function public.compute_user_sync_size(uuid) from public;
grant execute on function public.compute_user_sync_size(uuid) to authenticated;

comment on function public.compute_user_sync_size is
  'v3 sync: taille totale (bytes) des données sync pour le user courant. Appelée par /sync/push pour quota 5 MB.';
