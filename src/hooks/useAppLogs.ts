import { useState, useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';

export interface AppLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'trace';
  message: string;
}

const LOGS_KEY = 'app_logs';
const MAX_LOGS = 500;

export function useAppLogs() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load logs from store on mount
  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const store = await Store.load('settings.json');
      const storedLogs = await store.get<AppLog[]>(LOGS_KEY);

      if (storedLogs && Array.isArray(storedLogs)) {
        setLogs(storedLogs);
      }
    } catch (error) {
      console.error('Failed to load app logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveLogs = async (newLogs: AppLog[]) => {
    try {
      const store = await Store.load('settings.json');
      await store.set(LOGS_KEY, newLogs);
      await store.save();
    } catch (error) {
      console.error('Failed to save app logs:', error);
    }
  };

  // Listen for new logs from the backend
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setupListener = async () => {
      try {
        const listener = await listen<{
          timestamp: string;
          level: string;
          message: string;
        }>('app-log', (event) => {
          const newLog: AppLog = {
            id: crypto.randomUUID(),
            timestamp: event.payload.timestamp,
            level: event.payload.level as AppLog['level'],
            message: event.payload.message,
          };

          setLogs((prevLogs) => {
            // Add new log and keep only the last MAX_LOGS entries
            const updatedLogs = [newLog, ...prevLogs].slice(0, MAX_LOGS);

            // Save to store (async, don't block UI)
            saveLogs(updatedLogs);

            return updatedLogs;
          });
        });

        if (disposed) {
          listener();
        } else {
          unlisten = listener;
        }
      } catch (error) {
        console.error('Failed to register app-log listener:', error);
      }
    };

    setupListener();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, []);

  const clearLogs = async () => {
    setLogs([]);
    await saveLogs([]);
  };

  return {
    logs,
    isLoading,
    clearLogs,
  };
}
