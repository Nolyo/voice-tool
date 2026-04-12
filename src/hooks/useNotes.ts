import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Module-level flag: survives React StrictMode double-mount but resets on
// full page reload, which is the correct scope for "first launch" detection.
let welcomeNoteCreating = false;

const WELCOME_NOTE_HTML = `<h1>Bienvenue dans Notes</h1>
<p>Sélectionnez du texte pour faire apparaître le menu de formatage. Vous pouvez écrire en <strong>gras</strong>, en <em>italique</em>, le <u>souligner</u> ou le <s>barrer</s>.</p>
<h2>Listes</h2>
<ul><li><p>Liste à puces</p></li><li><p>Deuxième élément</p></li></ul>
<ol><li><p>Liste numérotée</p></li><li><p>Deuxième élément</p></li></ol>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Tâche terminée</p></li><li data-type="taskItem" data-checked="false"><p>Tâche à faire</p></li></ul>
<h2>Titres</h2>
<p>Utilisez le menu de formatage pour appliquer des titres <strong>H1</strong>, <strong>H2</strong>, <strong>H3</strong> à vos paragraphes.</p>
<h2>Code et séparateurs</h2>
<p>Tapez <code>---</code> pour insérer un séparateur, ou <code>&#96;&#96;&#96;</code> pour un bloc de code.</p>
<hr>
<p>Commencez à écrire votre première note !</p>`;

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
      if (result.length === 0 && !welcomeNoteCreating) {
        welcomeNoteCreating = true;
        const meta = await invoke<NoteMeta>('create_note');
        const title = deriveTitle(WELCOME_NOTE_HTML);
        await invoke<NoteMeta>('update_note', { id: meta.id, content: WELCOME_NOTE_HTML, title });
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
