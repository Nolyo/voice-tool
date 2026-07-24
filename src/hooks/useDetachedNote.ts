import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type NoteData, type NoteMeta } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";

/** A remote (sync pull) content reload is skipped when the user typed in this
 *  window recently — local edits win and the next save resolves via LWW. */
const REMOTE_RELOAD_QUIET_MS = 3_000;

/**
 * Data layer of a detached note window (spec §5): loads the note + the
 * notes/folders lists (for wiki-links and the breadcrumb), saves to disk
 * directly via `update_note`, and talks to the main window through events.
 * NO sync state lives here — the main window owns the queue.
 */
export function useDetachedNote(noteId: string) {
  const [meta, setMeta] = useState<NoteMeta | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const lastLocalEditRef = useRef(0);

  const refreshLists = useCallback(async () => {
    try {
      const [allNotes, allFolders] = await Promise.all([
        invoke<NoteMeta[]>("list_notes"),
        invoke<FolderMeta[]>("list_folders"),
      ]);
      setNotes(allNotes);
      setFolders(allFolders);
      const fresh = allNotes.find((n) => n.id === noteId);
      if (fresh) {
        setMeta(fresh);
      } else if (!allNotes.some((n) => n.id === noteId)) {
        setLoadFailed(true);
      }
    } catch (e) {
      console.error("[note-window] failed to refresh lists:", e);
      setLoadFailed(true);
    }
  }, [noteId]);

  // Initial load + refresh on window focus (picks up folder moves, favorite
  // toggles and renames done in the main window while we were unfocused).
  useEffect(() => {
    void refreshLists();
    const win = getCurrentWindow();
    const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
      if (focused) void refreshLists();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refreshLists]);

  // Keep the OS window title in sync with the note title.
  useEffect(() => {
    const title = meta?.title?.trim();
    void getCurrentWindow().setTitle(title ? `${title} — Lexena` : "Lexena");
  }, [meta?.title]);

  // Meta pushed back by the main window (local-only toggle round-trip).
  useEffect(() => {
    const unlistenPromise = listen<{ meta: NoteMeta }>(
      "note-meta-updated",
      (event) => {
        if (event.payload.meta.id === noteId) setMeta(event.payload.meta);
      },
    );
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [noteId]);

  const readNote = useCallback(
    (id: string) => invoke<NoteData>("read_note", { id }),
    [],
  );

  /** Immediate disk write + broadcast: the (possibly hidden) main window
   *  refreshes its sidebar metadata and schedules the cloud push. */
  const handleUpdateNote = useCallback(
    async (id: string, content: string, title: string) => {
      lastLocalEditRef.current = Date.now();
      try {
        const updated = await invoke<NoteMeta>("update_note", {
          id,
          content,
          title,
        });
        setMeta(updated);
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        await emit("note-detached-updated", {
          id,
          title: updated.title,
          updatedAt: updated.updatedAt,
        });
      } catch (e) {
        console.error("[note-window] failed to save note:", e);
      }
    },
    [],
  );

  const markLocalEdit = useCallback(() => {
    lastLocalEditRef.current = Date.now();
  }, []);

  const isQuiescent = useCallback(
    () => Date.now() - lastLocalEditRef.current > REMOTE_RELOAD_QUIET_MS,
    [],
  );

  /** Re-read the note from disk (remote-update reload). Updates meta and
   *  returns the fresh data so the caller can feed the editor. */
  const reloadFromDisk = useCallback(async (): Promise<NoteData | null> => {
    try {
      const data = await invoke<NoteData>("read_note", { id: noteId });
      setMeta(data.meta);
      return data;
    } catch (e) {
      console.error("[note-window] failed to reload note:", e);
      return null;
    }
  }, [noteId]);

  const requestReattach = useCallback(() => {
    void emit("note-reattach-request", { id: noteId });
  }, [noteId]);

  const requestDelete = useCallback(() => {
    void emit("note-detached-delete-request", { id: noteId });
  }, [noteId]);

  const requestToggleLocalOnly = useCallback(() => {
    void emit("note-toggle-local-only-request", { id: noteId });
  }, [noteId]);

  const openNoteInMain = useCallback((id: string) => {
    void emit("note-open-request", { id });
  }, []);

  return {
    meta,
    notes,
    folders,
    loadFailed,
    readNote,
    handleUpdateNote,
    markLocalEdit,
    isQuiescent,
    reloadFromDisk,
    requestReattach,
    requestDelete,
    requestToggleLocalOnly,
    openNoteInMain,
  };
}
