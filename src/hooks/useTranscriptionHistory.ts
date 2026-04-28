import { useCallback, useEffect, useMemo, useState } from 'react';
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
  /** Vendor used for transcription ("OpenAI", "Groq", "Local", "Google"). Absent on legacy records. */
  transcriptionProvider?: string;
  /** Raw Whisper output before post-process. Set only when post-process modified the text. */
  originalText?: string;
  /** Mode applied by the post-process step ("auto", "list", "email", ...). */
  postProcessMode?: string;
  /** USD cost of the post-process LLM call (separate from `apiCost` which covers Whisper). */
  postProcessCost?: number;
  /**
   * ISO timestamp set when the user pins this transcription. `null`/absent
   * means not pinned. Pinned rows always sort before non-pinned ones, ordered
   * by `pinnedAt` desc.
   */
  pinnedAt?: string | null;
}

/**
 * Stable sort: pinned rows first (most recently pinned first), then the rest
 * by date+time desc. Pure function — exported for unit testing.
 */
export function sortTranscriptions(items: Transcription[]): Transcription[] {
  const dt = (t: Transcription) => `${t.date} ${t.time}`;
  return [...items].sort((a, b) => {
    const ap = a.pinnedAt ?? null;
    const bp = b.pinnedAt ?? null;
    if (ap && !bp) return -1;
    if (!ap && bp) return 1;
    if (ap && bp && ap !== bp) {
      // Most recently pinned first.
      return ap < bp ? 1 : -1;
    }
    // Both pinned at the same instant, or both unpinned: fall back to
    // date+time desc (matches backend list_transcriptions ordering).
    return dt(b).localeCompare(dt(a));
  });
}

export function useTranscriptionHistory(historyKeepLast?: number) {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const result = await invoke<Transcription[]>('list_transcriptions');
      setTranscriptions(sortTranscriptions(result));
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
    postProcessCost?: number,
    duration?: number,
    transcriptionProvider?: string,
  ): Promise<Transcription> => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const newTranscription: Transcription = {
      id: crypto.randomUUID(),
      // Local-date components (not toISOString) so the day matches the
      // `time` field, which is already local. Using UTC here caused
      // post-midnight entries in UTC+2 to land on the previous day.
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      text,
      provider,
      duration,
      audioPath,
      apiCost,
      transcriptionProvider,
      originalText,
      postProcessMode,
      postProcessCost,
    };

    await invoke('save_transcription', {
      transcription: newTranscription,
      historyKeepLast: historyKeepLast ?? null,
    });
    setTranscriptions(prev => {
      const next = sortTranscriptions([newTranscription, ...prev]);
      if (typeof historyKeepLast === 'number' && next.length > historyKeepLast) {
        // Trim the oldest *unpinned* rows first so a user-pinned record is
        // never silently evicted by the keep-last cap.
        return capHistoryPreservingPins(next, historyKeepLast);
      }
      return next;
    });

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
    setTranscriptions(prev =>
      sortTranscriptions(prev.map(t => (t.id === id ? updated : t))),
    );
  };

  const togglePin = useCallback(async (id: string) => {
    // Compute optimistic next state from the current closure value so we don't
    // depend on a stale reference inside concurrent callers.
    const existing = transcriptions.find(t => t.id === id);
    if (!existing) return;
    const isPinned = Boolean(existing.pinnedAt);
    const nextPinnedAt = isPinned ? null : new Date().toISOString();
    const updated: Transcription = { ...existing, pinnedAt: nextPinnedAt };
    setTranscriptions(prev =>
      sortTranscriptions(prev.map(t => (t.id === id ? updated : t))),
    );
    try {
      await invoke('update_transcription', { transcription: updated });
    } catch (error) {
      // Revert on failure so the UI never silently lies to the user.
      console.error('Failed to toggle pin:', error);
      setTranscriptions(prev =>
        sortTranscriptions(prev.map(t => (t.id === id ? existing : t))),
      );
      throw error;
    }
  }, [transcriptions]);

  const pinnedCount = useMemo(
    () => transcriptions.reduce((acc, t) => acc + (t.pinnedAt ? 1 : 0), 0),
    [transcriptions],
  );

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
    togglePin,
    pinnedCount,
    searchTranscriptions,
    reloadHistory: loadHistory,
  };
}

/**
 * Trim `items` down to `keepLast`, preserving every pinned row even if doing
 * so means the unpinned tail is shorter than expected. Pinned rows are not
 * counted against the cap because the user explicitly asked to keep them.
 *
 * Pure function — exported for unit testing.
 */
export function capHistoryPreservingPins(
  items: Transcription[],
  keepLast: number,
): Transcription[] {
  if (keepLast <= 0) return items.filter(t => Boolean(t.pinnedAt));
  if (items.length <= keepLast) return items;
  const pinned: Transcription[] = [];
  const unpinned: Transcription[] = [];
  for (const t of items) {
    if (t.pinnedAt) pinned.push(t);
    else unpinned.push(t);
  }
  const remaining = Math.max(0, keepLast - pinned.length);
  return sortTranscriptions([...pinned, ...unpinned.slice(0, remaining)]);
}
