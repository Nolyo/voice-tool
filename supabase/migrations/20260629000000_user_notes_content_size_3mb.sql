-- Relève le hard cap par note de 1 MB → 3 MB (3 145 728 bytes).
-- Assouplissement de contrainte : aucune ligne existante ne peut violer une borne plus large,
-- donc le DROP + ADD est sûr et la revalidation ne rejette rien.
-- Aligné avec NOTE_SIZE_LIMIT_BYTES (client) et le schéma Zod sync-push (Edge Function).
alter table public.user_notes
  drop constraint if exists user_notes_content_size_check;

alter table public.user_notes
  add constraint user_notes_content_size_check
  check (octet_length(content_html) <= 3145728);

comment on table public.user_notes is
  'v3 sync: notes texte (TipTap HTML brut). UUID client-generated + LWW + soft-delete + hard cap 3 MB content_html.';
