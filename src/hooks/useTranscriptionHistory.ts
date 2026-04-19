import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Transcription {
  id: string;
  date: string;
  time: string;
  text: string;
  provider?: 'whisper';
  duration?: number;
  isStreaming?: boolean;
  audioPath?: string;
  apiCost?: number;
  /** Raw Whisper output before post-process. Set only when post-process modified the text. */
  originalText?: string;
  /** Mode applied by the post-process step ("auto", "list", "email", ...). */
  postProcessMode?: string;
  /** USD cost of the post-process LLM call (separate from `apiCost` which covers Whisper). */
  postProcessCost?: number;
}

export function useTranscriptionHistory() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const result = await invoke<Transcription[]>('list_transcriptions');
      setTranscriptions(result);
    } catch (error) {
      console.error('Failed to load transcription history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const addTranscription = async (
    text: string,
    provider: 'whisper' = 'whisper',
    audioPath?: string,
    apiCost?: number,
    originalText?: string,
    postProcessMode?: string,
    postProcessCost?: number
  ): Promise<Transcription> => {
    const now = new Date();
    const newTranscription: Transcription = {
      id: crypto.randomUUID(),
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      text,
      provider,
      audioPath,
      apiCost,
      originalText,
      postProcessMode,
      postProcessCost,
    };

    await invoke('save_transcription', { transcription: newTranscription });
    setTranscriptions(prev => [newTranscription, ...prev]);

    return newTranscription;
  };

  const deleteTranscription = async (id: string) => {
    await invoke('delete_transcription', { id });
    setTranscriptions(prev => prev.filter(t => t.id !== id));
  };

  const clearHistory = async () => {
    await invoke('clear_transcriptions');
    setTranscriptions([]);
  };

  const updateTranscription = async (id: string, updates: Partial<Transcription>) => {
    const existing = transcriptions.find(t => t.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    await invoke('update_transcription', { transcription: updated });
    setTranscriptions(prev => prev.map(t => t.id === id ? updated : t));
  };

  const searchTranscriptions = (query: string): Transcription[] => {
    if (!query.trim()) return transcriptions;
    const lowerQuery = query.toLowerCase();
    return transcriptions.filter(t =>
      t.text.toLowerCase().includes(lowerQuery) ||
      t.date.includes(query) ||
      t.time.includes(query)
    );
  };

  return {
    transcriptions,
    isLoading,
    addTranscription,
    deleteTranscription,
    clearHistory,
    updateTranscription,
    searchTranscriptions,
    reloadHistory: loadHistory,
  };
}
