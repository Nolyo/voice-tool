import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import i18n from '@/i18n';

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
        const meta = await invoke<NoteMeta>('create_note', { folderId: null });
        const welcomeHtml = getWelcomeNoteHtml();
        const title = deriveTitle(welcomeHtml);
        await invoke<NoteMeta>('update_note', { id: meta.id, content: welcomeHtml, title });
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
    const meta = await invoke<NoteMeta>('create_note', { folderId });
    setNotes(prev => [meta, ...prev]);
    return meta;
  };

  const moveNoteToFolder = async (noteId: string, folderId: string | null): Promise<void> => {
    const updated = await invoke<NoteMeta>('move_note_to_folder', { noteId, folderId });
    setNotes(prev => prev.map(n => n.id === noteId ? updated : n));
  };

  const readNote = async (id: string): Promise<NoteData> => {
    return invoke<NoteData>('read_note', { id });
  };

  const updateNote = async (id: string, content: string, title: string) => {
    const updated = await invoke<NoteMeta>('update_note', { id, content, title });
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
  };

  const deleteNote = async (id: string) => {
    await invoke('delete_note', { id });
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const searchNotes = async (query: string): Promise<NoteMeta[]> => {
    return invoke<NoteMeta[]>('search_notes', { query });
  };

  const toggleFavorite = async (id: string): Promise<void> => {
    const updated = await invoke<NoteMeta>('toggle_note_favorite', { id });
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
    } catch (error) {
      console.error('Failed to reorder notes:', error);
      await loadNotes();
    }
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
    reloadNotes: loadNotes,
  };
}
