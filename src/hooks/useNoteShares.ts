import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { NoteShare } from "@/lib/sharing/types";
import { createShare, revokeShare, listShares } from "@/lib/sharing/shares-client";

export interface UseNoteShares {
  shares: NoteShare[];
  loading: boolean;
  activeShareFor(noteId: string): NoteShare | undefined;
  share(noteId: string, title: string): Promise<NoteShare>;
  revoke(shareId: string): Promise<void>;
  refresh(): Promise<void>;
}

export function useNoteShares(): UseNoteShares {
  const auth = useAuth();
  const userId = auth.status === "signed-in" ? auth.user?.id : undefined;
  const [shares, setShares] = useState<NoteShare[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!userId) { setShares([]); setLoading(false); return; }
      setLoading(true);
      try {
        const data = await listShares(supabase, userId);
        if (!cancelled) setShares(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) { setShares([]); setLoading(false); return; }
    setLoading(true);
    try {
      setShares(await listShares(supabase, userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const share = useCallback(async (noteId: string, title: string): Promise<NoteShare> => {
    if (!userId) throw new Error("not signed in");
    const created = await createShare(supabase, { noteId, userId, title });
    setShares((prev) => (prev.some((s) => s.id === created.id) ? prev : [created, ...prev]));
    return created;
  }, [userId]);

  const revoke = useCallback(async (shareId: string): Promise<void> => {
    await revokeShare(supabase, shareId);
    setShares((prev) => prev.filter((s) => s.id !== shareId));
  }, []);

  const activeShareFor = useCallback(
    (noteId: string) => shares.find((s) => s.noteId === noteId),
    [shares],
  );

  return { shares, loading, activeShareFor, share, revoke, refresh };
}
