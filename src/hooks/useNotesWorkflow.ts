import { useCallback, useEffect, useRef, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta } from "@/hooks/useNotes";
import {
  detachNote,
  forgetNote,
  mergeDetachedAtLoad,
  reattachNote,
  type NotesTabsState,
} from "@/lib/notes-window/tab-transitions";

interface UseNotesWorkflowOptions {
  createNote: (folderId?: string | null) => Promise<NoteMeta>;
  deleteNote: (id: string) => Promise<void>;
  notes: NoteMeta[];
  notesLoaded: boolean;
}

interface PersistedTabState {
  openNoteIds: string[];
  activeNoteId: string | null;
  /** Notes currently open in their own detached window. Optional so tab
   *  stores written before this feature keep loading. */
  detachedNoteIds?: string[];
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
 * Manages the open-tabs state for the docked notes editor — which notes are
 * open as tabs, which one is active — plus the registry of notes detached
 * into their own OS window (spec 2026-07-24-detachable-notes-design §4).
 *
 * The whole state is persisted per profile; at load, detached notes come
 * back as tabs (the windows themselves are never restored across restarts).
 */
export function useNotesWorkflow({
  createNote,
  deleteNote,
  notes,
  notesLoaded,
}: UseNotesWorkflowOptions) {
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [detachedNoteIds, setDetachedNoteIds] = useState<string[]>([]);
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyState = useCallback((next: NotesTabsState) => {
    setOpenNoteIds(next.openNoteIds);
    setActiveNoteId(next.activeNoteId);
    setDetachedNoteIds(next.detachedNoteIds);
  }, []);

  // Load persisted tabs once the notes list is available. Detached notes are
  // merged back into the tab strip (idempotent — covers restart and crash).
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
          applyState(mergeDetachedAtLoad(persisted, validIds));
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
  }, [notesLoaded, notes, applyState]);

  // Persist tab state on every change, debounced.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const store = await getTabStore();
        await store.set(STORE_KEY, { openNoteIds, activeNoteId, detachedNoteIds });
        await store.save();
      } catch (error) {
        console.error("Failed to persist note tabs:", error);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [openNoteIds, activeNoteId, detachedNoteIds]);

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

  /** Detach: create/focus the OS window first; only update the tab state
   *  when the window actually opened. */
  const handleDetachNote = useCallback(
    async (id: string, atCursor = false) => {
      try {
        await invoke("open_note_window", { noteId: id, atCursor });
      } catch (error) {
        console.error("Failed to open note window:", error);
        return;
      }
      applyState(detachNote({ openNoteIds, activeNoteId, detachedNoteIds }, id));
    },
    [openNoteIds, activeNoteId, detachedNoteIds, applyState],
  );

  /** Rust `note-window-closed` (native X or any window death): restore the
   *  tab silently — the main window is NOT shown. No-op when the id isn't in
   *  the registry (delete / explicit reattach removed it first). */
  const handleNoteWindowClosed = useCallback(
    (id: string) => {
      applyState(
        reattachNote({ openNoteIds, activeNoteId, detachedNoteIds }, id, {
          activate: false,
        }),
      );
    },
    [openNoteIds, activeNoteId, detachedNoteIds, applyState],
  );

  /** Explicit « réattacher » button: restore + activate the tab. The caller
   *  (bridge) also shows the main window and closes the note window. */
  const handleReattachNote = useCallback(
    (id: string) => {
      applyState(
        reattachNote({ openNoteIds, activeNoteId, detachedNoteIds }, id, {
          activate: true,
        }),
      );
    },
    [openNoteIds, activeNoteId, detachedNoteIds, applyState],
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      if (detachedNoteIds.includes(id)) {
        // Remove from the registry BEFORE closing so the note-window-closed
        // handler can't resurrect the tab (spec §4).
        applyState(forgetNote({ openNoteIds, activeNoteId, detachedNoteIds }, id));
        try {
          await invoke("close_note_window", { noteId: id });
        } catch (error) {
          console.error("Failed to close note window:", error);
        }
      } else {
        handleCloseNoteTab(id);
      }
      await deleteNote(id);
    },
    [
      openNoteIds,
      activeNoteId,
      detachedNoteIds,
      applyState,
      handleCloseNoteTab,
      deleteNote,
    ],
  );

  return {
    openNoteIds,
    activeNoteId,
    detachedNoteIds,
    setActiveNoteId,
    handleCreateNote,
    handleOpenNote,
    handleCloseNoteTab,
    handleDeleteNote,
    handleDetachNote,
    handleNoteWindowClosed,
    handleReattachNote,
  };
}
