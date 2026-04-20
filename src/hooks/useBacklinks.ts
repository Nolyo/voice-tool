import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta } from "@/hooks/useNotes";

/**
 * Fetch the list of notes whose content references `noteId` via a note-link.
 * Re-fetches when `noteId` or `refreshKey` changes (increment `refreshKey`
 * after edits to the current note to pick up newly added links).
 */
export function useBacklinks(noteId: string | null, refreshKey: number): {
  backlinks: NoteMeta[];
  isLoading: boolean;
} {
  const [backlinks, setBacklinks] = useState<NoteMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!noteId) {
      setBacklinks([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    invoke<NoteMeta[]>("get_backlinks", { noteId })
      .then((result) => {
        if (!cancelled) setBacklinks(result);
      })
      .catch((err) => {
        console.error("Failed to load backlinks:", err);
        if (!cancelled) setBacklinks([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [noteId, refreshKey]);

  return { backlinks, isLoading };
}
