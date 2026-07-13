-- PR4 UX series: emoji icon per folder.
-- Additive + nullable: legacy clients ignore the column; an absent icon
-- renders the default Folder glyph client-side. RLS unchanged (icon is a
-- plain attribute inside the user-scoped row).
alter table public.user_folders add column if not exists icon text;

-- Guardrail against out-of-band PostgREST writes: the sync-push Edge caps the
-- icon at 32 UTF-16 units; char_length counts code points (always <= UTF-16
-- units), so every Edge-accepted value passes and only oversized direct
-- writes are rejected. NULL passes CHECK by SQL semantics.
alter table public.user_folders
  add constraint user_folders_icon_max_length check (char_length(icon) <= 32);
