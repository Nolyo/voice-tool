import { useCallback, useEffect, useRef, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta } from "@/hooks/useNotes";

interface UseNotesWorkflowOptions {
  createNote: (folderId?: string | null) => Promise<NoteMeta>;
  deleteNote: (id: string) => Promise<void>;
  notes: NoteMeta[];
  notesLoaded: boolean;
}

interface PersistedTabState {
  openNoteIds: string[];
  activeNoteId: string | null;
}

const STORE_KEY = "tabs";
const SAVE_DEBOUNCE_MS = 300;

let tabStore: Store | null = null;
async function getTabStore(): Promise<Store> {
  if (!tabStore) {
    const path = await invoke<string>("get_active_profile_notes_tabs_path");
    tabStore = await Store.load(path);
  }
  return tabStore;
}

/**
 * Manages the open-tabs state for the docked notes editor: which notes are
 * currently open as tabs and which one is active.
 *
 * The tab state is persisted per profile so the user finds the same set of
 * open notes when they reopen the app.
 *
 * Handlers preserve the original behavior:
 * - Creating a note automatically opens it as a tab.
 * - Opening an existing note adds it to the tab list if missing.
 * - Closing a tab focuses the last remaining tab.
 * - Deleting a note transparently closes its tab first.
 */
export function useNotesWorkflow({
  createNote,
  deleteNote,
  notes,
  notesLoaded,
}: UseNotesWorkflowOptions) {
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted tabs once the notes list is available, filtering out any
  // IDs whose underlying note no longer exists.
  useEffect(() => {
    if (!notesLoaded || hasLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const store = await getTabStore();
        const persisted = await store.get<PersistedTabState>(STORE_KEY);
        if (cancelled) return;
        if (persisted) {
          const validIds = new Set(notes.map((n) => n.id));
          const filtered = persisted.openNoteIds.filter((id) => validIds.has(id));
          const active =
            persisted.activeNoteId && filtered.includes(persisted.activeNoteId)
              ? persisted.activeNoteId
              : filtered.length > 0
                ? filtered[filtered.length - 1]
                : null;
          setOpenNoteIds(filtered);
          setActiveNoteId(active);
        }
      } catch (error) {
        console.error("Failed to load persisted note tabs:", error);
      } finally {
        if (!cancelled) hasLoadedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notesLoaded, notes]);

  // Persist tab state on every change, debounced.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const store = await getTabStore();
        await store.set(STORE_KEY, { openNoteIds, activeNoteId });
        await store.save();
      } catch (error) {
        console.error("Failed to persist note tabs:", error);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [openNoteIds, activeNoteId]);

  const handleCreateNote = useCallback(async (folderId: string | null = null) => {
    const note = await createNote(folderId);
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
