import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

export interface DetachedNotesBridgeHandlers {
  /** Rust `note-window-closed` — silent tab restore (native X). */
  onWindowClosed: (id: string) => void;
  /** « Réattacher » button — restore + activate + show main. */
  onReattachRequest: (id: string) => void;
  /** Wiki-link clicked in a detached window. */
  onOpenRequest: (id: string) => void;
  /** Delete confirmed in a detached window — canonical delete flow. */
  onDeleteRequest: (id: string) => void;
  /** A detached window saved the note to disk. */
  onDetachedUpdated: (payload: { id: string; title: string; updatedAt: string }) => void;
  /** Local-only toggle clicked in a detached window. */
  onToggleLocalOnlyRequest: (id: string) => void;
}

/**
 * Main-window side of the detached note windows (spec §5): subscribes once to
 * every event a detached window (or Rust) can emit and routes it to the
 * workflow. Handlers live in a ref so the listeners registered at mount
 * always call the freshest closures.
 */
export function useDetachedNotesBridge(handlers: DetachedNotesBridgeHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const unlistenPromises = [
      listen<{ noteId: string }>("note-window-closed", (e) =>
        handlersRef.current.onWindowClosed(e.payload.noteId),
      ),
      listen<{ id: string }>("note-reattach-request", (e) =>
        handlersRef.current.onReattachRequest(e.payload.id),
      ),
      listen<{ id: string }>("note-open-request", (e) =>
        handlersRef.current.onOpenRequest(e.payload.id),
      ),
      listen<{ id: string }>("note-detached-delete-request", (e) =>
        handlersRef.current.onDeleteRequest(e.payload.id),
      ),
      listen<{ id: string; title: string; updatedAt: string }>(
        "note-detached-updated",
        (e) => handlersRef.current.onDetachedUpdated(e.payload),
      ),
      listen<{ id: string }>("note-toggle-local-only-request", (e) =>
        handlersRef.current.onToggleLocalOnlyRequest(e.payload.id),
      ),
    ];
    return () => {
      for (const p of unlistenPromises) void p.then((unlisten) => unlisten());
    };
  }, []);
}
