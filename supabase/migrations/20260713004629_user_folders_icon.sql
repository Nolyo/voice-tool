-- PR4 UX series: emoji icon per folder.
-- Additive + nullable: legacy clients ignore the column; an absent icon
-- renders the default Folder glyph client-side. RLS unchanged (icon is a
-- plain attribute inside the user-scoped row).
alter table public.user_folders add column if not exists icon text;
