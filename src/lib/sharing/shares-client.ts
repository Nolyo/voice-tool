import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteShare } from "./types";
import { generateSlug } from "./slug";

interface ShareRow {
  id: string;
  slug: string;
  note_id: string;
  title_snapshot: string;
  created_at: string;
}

function toNoteShare(r: ShareRow): NoteShare {
  return { id: r.id, slug: r.slug, noteId: r.note_id, titleSnapshot: r.title_snapshot, createdAt: r.created_at };
}

export async function createShare(
  supabase: SupabaseClient,
  args: { noteId: string; userId: string; title: string },
): Promise<NoteShare> {
  const { data: existing } = await supabase
    .from("note_shares")
    .select("id,slug,note_id,title_snapshot,created_at")
    .eq("note_id", args.noteId)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing) return toNoteShare(existing as ShareRow);

  const { data, error } = await supabase
    .from("note_shares")
    .insert({
      slug: generateSlug(),
      note_id: args.noteId,
      user_id: args.userId,
      title_snapshot: args.title,
    })
    .select("id,slug,note_id,title_snapshot,created_at")
    .single();
  if (error) throw error;
  return toNoteShare(data as ShareRow);
}

export async function revokeShare(supabase: SupabaseClient, shareId: string): Promise<void> {
  const { error } = await supabase
    .from("note_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId);
  if (error) throw error;
}

export async function listShares(supabase: SupabaseClient, userId: string): Promise<NoteShare[]> {
  const { data, error } = await supabase
    .from("note_shares")
    .select("id,slug,note_id,title_snapshot,created_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ShareRow[]).map(toNoteShare);
}
