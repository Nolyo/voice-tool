/**
 * Pure transitions for the notes tab strip + detached-windows registry.
 * Extracted from useNotesWorkflow so the detach/reattach lifecycle
 * (spec §4, docs/superpowers/specs/2026-07-24-detachable-notes-design.md)
 * is unit-testable without React.
 */

export interface NotesTabsState {
  openNoteIds: string[];
  activeNoteId: string | null;
  detachedNoteIds: string[];
}

/** Tab list after removing `id`, active falling back to the last remaining
 *  tab (same behavior as the historical handleCloseNoteTab). */
function closeTab(
  state: NotesTabsState,
  id: string,
): Pick<NotesTabsState, "openNoteIds" | "activeNoteId"> {
  const openNoteIds = state.openNoteIds.filter((nid) => nid !== id);
  const activeNoteId =
    state.activeNoteId === id
      ? openNoteIds.length > 0
        ? openNoteIds[openNoteIds.length - 1]
        : null
      : state.activeNoteId;
  return { openNoteIds, activeNoteId };
}

/** Detach: the note leaves the tab strip and joins the detached registry. */
export function detachNote(state: NotesTabsState, id: string): NotesTabsState {
  const { openNoteIds, activeNoteId } = closeTab(state, id);
  const detachedNoteIds = state.detachedNoteIds.includes(id)
    ? state.detachedNoteIds
    : [...state.detachedNoteIds, id];
  return { openNoteIds, activeNoteId, detachedNoteIds };
}

/** Reattach: only acts when the id is actually in the registry — the guard
 *  that makes `note-window-closed` safe for the delete and explicit-reattach
 *  flows, which remove the id from the registry before closing the window. */
export function reattachNote(
  state: NotesTabsState,
  id: string,
  opts: { activate: boolean },
): NotesTabsState {
  if (!state.detachedNoteIds.includes(id)) return state;
  const detachedNoteIds = state.detachedNoteIds.filter((nid) => nid !== id);
  const openNoteIds = state.openNoteIds.includes(id)
    ? state.openNoteIds
    : [...state.openNoteIds, id];
  return {
    openNoteIds,
    activeNoteId: opts.activate ? id : state.activeNoteId,
    detachedNoteIds,
  };
}

/** Remove the note everywhere (delete flow). */
export function forgetNote(state: NotesTabsState, id: string): NotesTabsState {
  const { openNoteIds, activeNoteId } = closeTab(state, id);
  return {
    openNoteIds,
    activeNoteId,
    detachedNoteIds: state.detachedNoteIds.filter((nid) => nid !== id),
  };
}

/** Startup state: detached notes come back as tabs (spec §2 « redémarrage »),
 *  invalid ids dropped, duplicates removed, registry cleared. Idempotent —
 *  covers clean restart, tray quit and crash alike. */
export function mergeDetachedAtLoad(
  persisted: {
    openNoteIds: string[];
    activeNoteId: string | null;
    detachedNoteIds?: string[];
  },
  validIds: Set<string>,
): NotesTabsState {
  const merged: string[] = [];
  for (const id of [...persisted.openNoteIds, ...(persisted.detachedNoteIds ?? [])]) {
    if (validIds.has(id) && !merged.includes(id)) merged.push(id);
  }
  const activeNoteId =
    persisted.activeNoteId && merged.includes(persisted.activeNoteId)
      ? persisted.activeNoteId
      : merged.length > 0
        ? merged[merged.length - 1]
        : null;
  return { openNoteIds: merged, activeNoteId, detachedNoteIds: [] };
}
