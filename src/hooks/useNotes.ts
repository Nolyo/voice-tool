import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import i18n from '@/i18n';
import {
  createNoteSynced,
  deleteNoteSynced,
  toggleNoteFavoriteSynced,
  moveNoteToFolderSynced,
  pushNoteUpdate,
  scheduleNoteUpdatePush,
  cancelNoteUpdatePush,
} from '@/lib/sync/notes-store';

// Debounce window for the cloud push of updateNote. Local disk write stays
// immediate; only the queue enqueue is delayed to coalesce rapid keystrokes.
const UPDATE_NOTE_DEBOUNCE_MS = 2_000;

// Module-level flag: survives React StrictMode double-mount but resets on
// full page reload, which is the correct scope for "first launch" detection.
let welcomeNoteCreating = false;

function getWelcomeNoteHtml(): string {
  const t = i18n.t;
  return `<h1>${t('welcome.title')}</h1>
${t('welcome.intro')}
<h2>${t('welcome.listsTitle')}</h2>
<ul><li><p>${t('welcome.bulletList')}</p></li><li><p>${t('welcome.secondItem')}</p></li></ul>
<ol><li><p>${t('welcome.orderedList')}</p></li><li><p>${t('welcome.secondItem')}</p></li></ol>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>${t('welcome.taskDone')}</p></li><li data-type="taskItem" data-checked="false"><p>${t('welcome.taskTodo')}</p></li></ul>
<h2>${t('welcome.headingsTitle')}</h2>
${t('welcome.headingsDesc')}
<h2>${t('welcome.codeTitle')}</h2>
${t('welcome.codeDesc')}
<hr>
${t('welcome.start')}`;
}

export interface NoteMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  folderId?: string;
  order: number;
}

export interface NoteData {
  meta: NoteMeta;
  content: string;
}

export function deriveTitle(content: string): string {
  // Extract text from HTML by stripping tags
  const text = content.replace(/<[^>]*>/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const firstLine = text.split('\n').find(line => line.trim().length > 0);
  if (!firstLine) return i18n.t('notes.editor.untitled');
  const trimmed = firstLine.trim();
  return trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed;
}

export function useNotes() {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await invoke<NoteMeta[]>('list_notes');
      if (result.length === 0 && !welcomeNoteCreating) {
        welcomeNoteCreating = true;
        // Route the welcome note through the Synced wrappers so it enqueues
        // a cloud upsert. If the user enables sync later, the queue flushes
        // the welcome note as their first note.
        const meta = await createNoteSynced(null);
        const welcomeHtml = getWelcomeNoteHtml();
        const title = deriveTitle(welcomeHtml);
        const persistedMeta = await invoke<NoteMeta>('update_note', { id: meta.id, content: welcomeHtml, title });
        await pushNoteUpdate(persistedMeta, welcomeHtml);
        const updated = await invoke<NoteMeta[]>('list_notes');
        setNotes(updated);
      } else {
        setNotes(result);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const createNote = async (folderId: string | null = null): Promise<NoteMeta> => {
    const meta = await createNoteSynced(folderId);
    setNotes(prev => [meta, ...prev]);
    return meta;
  };

  const moveNoteToFolder = async (noteId: string, folderId: string | null): Promise<void> => {
    const updated = await moveNoteToFolderSynced(noteId, folderId);
    setNotes(prev => prev.map(n => n.id === noteId ? updated : n));
  };

  const readNote = async (id: string): Promise<NoteData> => {
    return invoke<NoteData>('read_note', { id });
  };

  const updateNote = async (id: string, content: string, title: string) => {
    // 1) Local disk write immediate (no debounce on filesystem persistence).
    const updated = await invoke<NoteMeta>('update_note', { id, content, title });
    setNotes(prev => prev.map(n => n.id === id ? updated : n));

    // 2) Debounce 2s the cloud push to coalesce rapid keystrokes into one upsert.
    scheduleNoteUpdatePush(id, updated, content, UPDATE_NOTE_DEBOUNCE_MS);
  };

  const deleteNote = async (id: string) => {
    // Cancel any pending debounced push for this note — soft-delete supersedes.
    cancelNoteUpdatePush(id);
    await deleteNoteSynced(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const searchNotes = async (query: string): Promise<NoteMeta[]> => {
    return invoke<NoteMeta[]>('search_notes', { query });
  };

  const toggleFavorite = async (id: string): Promise<void> => {
    const updated = await toggleNoteFavoriteSynced(id);
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
  };

  const reorderNotesInFolder = async (
    folderId: string | null,
    noteIds: string[],
  ): Promise<void> => {
    const indexOf = new Map(noteIds.map((id, i) => [id, i]));
    setNotes(prev =>
      prev.map(n => {
        const idx = indexOf.get(n.id);
        return idx !== undefined ? { ...n, order: idx } : n;
      }),
    );
    try {
      await invoke('reorder_notes_in_folder', { folderId, noteIds });
      // Reorder bumps `order` + `updated_at` on each touched note — enqueue an upsert
      // per moved note so the cloud picks up the new ordering via LWW. We read fresh
      // meta + content via `read_note` after the Rust command persists.
      for (const noteId of noteIds) {
        try {
          const data = await invoke<NoteData>('read_note', { id: noteId });
          await pushNoteUpdate(data.meta, data.content);
        } catch (e) {
          console.warn('[useNotes] enqueue failed for reorder', noteId, e);
        }
      }
    } catch (error) {
      console.error('Failed to reorder notes:', error);
      await loadNotes();
    }
  };

  const moveNoteToFolderAtIndex = async (
    noteId: string,
    targetFolderId: string | null,
    noteIdsInNewOrder: string[],
  ): Promise<void> => {
    try {
      await moveNoteToFolderSynced(noteId, targetFolderId);
    } catch (error) {
      console.error('Failed to move note:', error);
      await loadNotes();
      throw error;
    }
    try {
      await invoke('reorder_notes_in_folder', {
        folderId: targetFolderId,
        noteIds: noteIdsInNewOrder,
      });
      for (const id of noteIdsInNewOrder) {
        try {
          const data = await invoke<NoteData>('read_note', { id });
          await pushNoteUpdate(data.meta, data.content);
        } catch (e) {
          console.warn('[useNotes] enqueue failed for reorder-after-move', id, e);
        }
      }
    } catch (error) {
      console.error('Failed to reorder notes after move:', error);
      await loadNotes();
      throw error;
    }
    // On success, refresh local state to reflect both the folderId change and the order change.
    await loadNotes();
  };

  return {
    notes,
    isLoading,
    loadNotes,
    createNote,
    readNote,
    updateNote,
    deleteNote,
    searchNotes,
    toggleFavorite,
    moveNoteToFolder,
    reorderNotesInFolder,
    moveNoteToFolderAtIndex,
    reloadNotes: loadNotes,
  };
}
