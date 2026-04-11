import { useCallback, useState } from "react";
import type { NoteMeta } from "@/hooks/useNotes";

interface UseNotesWorkflowOptions {
  createNote: () => Promise<NoteMeta>;
  deleteNote: (id: string) => Promise<void>;
}

/**
 * Manages the open-tabs state for the notes modal editor: which notes are
 * currently open as tabs, which one is active, and whether the editor
 * window is visible.
 *
 * The handlers preserve the original Dashboard behavior:
 * - Creating a note automatically opens it as a tab and shows the editor.
 * - Opening an existing note adds it to the tab list if missing.
 * - Closing a tab focuses the last remaining tab, or hides the editor when
 *   the last tab is closed.
 * - Deleting a note transparently closes its tab first.
 */
export function useNotesWorkflow({
  createNote,
  deleteNote,
}: UseNotesWorkflowOptions) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const handleCreateNote = useCallback(async () => {
    const note = await createNote();
    setOpenNoteIds((prev) => [...prev, note.id]);
    setActiveNoteId(note.id);
    setEditorOpen(true);
  }, [createNote]);

  const handleOpenNote = useCallback((note: NoteMeta) => {
    setOpenNoteIds((prev) =>
      prev.includes(note.id) ? prev : [...prev, note.id],
    );
    setActiveNoteId(note.id);
    setEditorOpen(true);
  }, []);

  const handleCloseNoteTab = useCallback(
    (id: string) => {
      setOpenNoteIds((prev) => {
        const next = prev.filter((nid) => nid !== id);
        if (activeNoteId === id) {
          setActiveNoteId(next.length > 0 ? next[next.length - 1] : null);
        }
        if (next.length === 0) {
          setEditorOpen(false);
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

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
  }, []);

  return {
    editorOpen,
    openNoteIds,
    activeNoteId,
    setActiveNoteId,
    handleCreateNote,
    handleOpenNote,
    handleCloseNoteTab,
    handleDeleteNote,
    closeEditor,
  };
}
