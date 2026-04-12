import { useCallback, useState } from "react";
import type { NoteMeta } from "@/hooks/useNotes";

interface UseNotesWorkflowOptions {
  createNote: () => Promise<NoteMeta>;
  deleteNote: (id: string) => Promise<void>;
}

/**
 * Manages the open-tabs state for the docked notes editor: which notes are
 * currently open as tabs and which one is active.
 *
 * The handlers preserve the original behavior:
 * - Creating a note automatically opens it as a tab.
 * - Opening an existing note adds it to the tab list if missing.
 * - Closing a tab focuses the last remaining tab.
 * - Deleting a note transparently closes its tab first.
 */
export function useNotesWorkflow({
  createNote,
  deleteNote,
}: UseNotesWorkflowOptions) {
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const handleCreateNote = useCallback(async () => {
    const note = await createNote();
    setOpenNoteIds((prev) => [...prev, note.id]);
    setActiveNoteId(note.id);
  }, [createNote]);

  const handleOpenNote = useCallback((note: NoteMeta) => {
    setOpenNoteIds((prev) =>
      prev.includes(note.id) ? prev : [...prev, note.id],
    );
    setActiveNoteId(note.id);
  }, []);

  const handleCloseNoteTab = useCallback(
    (id: string) => {
      setOpenNoteIds((prev) => {
        const next = prev.filter((nid) => nid !== id);
        if (activeNoteId === id) {
          setActiveNoteId(next.length > 0 ? next[next.length - 1] : null);
        }
        return next;
      });
    },
    [activeNoteId],
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      handleCloseNoteTab(id);
      await deleteNote(id);
    },
    [handleCloseNoteTab, deleteNote],
  );

  return {
    openNoteIds,
    activeNoteId,
    setActiveNoteId,
    handleCreateNote,
    handleOpenNote,
    handleCloseNoteTab,
    handleDeleteNote,
  };
}
