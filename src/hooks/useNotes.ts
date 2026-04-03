import { useState, useEffect } from 'react';
import { Store } from '@tauri-apps/plugin-store';

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const NOTES_KEY = 'notes';

export function deriveTitle(content: string): string {
  const firstLine = content.split('\n').find(line => line.trim().length > 0);
  if (!firstLine) return 'Note sans titre';
  const trimmed = firstLine.trim();
  return trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed;
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const store = await Store.load('settings.json');
      const stored = await store.get<Note[]>(NOTES_KEY);

      if (stored && Array.isArray(stored)) {
        const sorted = stored.sort((a, b) => {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        setNotes(sorted);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveNotes = async (newNotes: Note[]) => {
    try {
      const store = await Store.load('settings.json');
      await store.set(NOTES_KEY, newNotes);
      await store.save();
    } catch (error) {
      console.error('Failed to save notes:', error);
    }
  };

  const addNote = async () => {
    const now = new Date().toISOString();
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: 'Note sans titre',
      content: '',
      createdAt: now,
      updatedAt: now,
    };

    const newNotes = [newNote, ...notes];
    setNotes(newNotes);
    await saveNotes(newNotes);

    return newNote;
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    const newNotes = notes.map(n =>
      n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
    );
    setNotes(newNotes);
    await saveNotes(newNotes);
  };

  const deleteNote = async (id: string) => {
    const newNotes = notes.filter(n => n.id !== id);
    setNotes(newNotes);
    await saveNotes(newNotes);
  };

  const searchNotes = (query: string): Note[] => {
    if (!query.trim()) return notes;

    const lowerQuery = query.toLowerCase();
    return notes.filter(n =>
      n.title.toLowerCase().includes(lowerQuery) ||
      n.content.toLowerCase().includes(lowerQuery)
    );
  };

  return {
    notes,
    isLoading,
    addNote,
    updateNote,
    deleteNote,
    searchNotes,
    reloadNotes: loadNotes,
  };
}
