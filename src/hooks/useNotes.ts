import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface NoteMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
}

export interface NoteData {
  meta: NoteMeta;
  content: string;
}

export function deriveTitle(content: string): string {
  // Extract text from HTML by stripping tags
  const text = content.replace(/<[^>]*>/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const firstLine = text.split('\n').find(line => line.trim().length > 0);
  if (!firstLine) return 'Note sans titre';
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
      setNotes(result);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const createNote = async (): Promise<NoteMeta> => {
    const meta = await invoke<NoteMeta>('create_note');
    setNotes(prev => [meta, ...prev]);
    return meta;
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
    reloadNotes: loadNotes,
  };
}
