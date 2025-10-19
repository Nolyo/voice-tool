import { useState, useEffect } from 'react';
import { Store } from '@tauri-apps/plugin-store';

export interface Transcription {
  id: string;
  date: string;
  time: string;
  text: string;
  provider?: 'whisper' | 'deepgram';
  duration?: number;
  isStreaming?: boolean;
  audioPath?: string;
  apiCost?: number; // Cost in USD
}

const HISTORY_KEY = 'transcription_history';

export function useTranscriptionHistory() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load history from Tauri Store on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const store = await Store.load('settings.json');
      const history = await store.get<Transcription[]>(HISTORY_KEY);

      if (history && Array.isArray(history)) {
        // Sort by date/time descending (most recent first)
        const sorted = history.sort((a, b) => {
          const dateTimeA = new Date(`${a.date} ${a.time}`).getTime();
          const dateTimeB = new Date(`${b.date} ${b.time}`).getTime();
          return dateTimeB - dateTimeA;
        });
        setTranscriptions(sorted);
      }
    } catch (error) {
      console.error('Failed to load transcription history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveHistory = async (newHistory: Transcription[]) => {
    try {
      const store = await Store.load('settings.json');
      await store.set(HISTORY_KEY, newHistory);
      await store.save();
    } catch (error) {
      console.error('Failed to save transcription history:', error);
    }
  };

  const addTranscription = async (
    text: string,
    provider: 'whisper' | 'deepgram' = 'whisper',
    audioPath?: string,
    apiCost?: number
  ) => {
    const now = new Date();
    const newTranscription: Transcription = {
      id: crypto.randomUUID(),
      date: now.toISOString().split('T')[0], // YYYY-MM-DD
      time: now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      text,
      provider,
      audioPath,
      apiCost,
    };

    const newHistory = [newTranscription, ...transcriptions];
    setTranscriptions(newHistory);
    await saveHistory(newHistory);

    return newTranscription;
  };

  const deleteTranscription = async (id: string) => {
    const newHistory = transcriptions.filter(t => t.id !== id);
    setTranscriptions(newHistory);
    await saveHistory(newHistory);
  };

  const clearHistory = async () => {
    setTranscriptions([]);
    await saveHistory([]);
  };

  const updateTranscription = async (id: string, updates: Partial<Transcription>) => {
    const newHistory = transcriptions.map(t =>
      t.id === id ? { ...t, ...updates } : t
    );
    setTranscriptions(newHistory);
    await saveHistory(newHistory);
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
