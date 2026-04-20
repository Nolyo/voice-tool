import { useState, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export interface AppLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug" | "trace";
  message: string;
  /** Short source tag derived from the tracing target (e.g. "audio",
   * "transcription"). Logs persisted before this field was introduced have
   * no source — the UI falls back to "inconnu". */
  source?: string;
}

export function useAppLogs() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const result = await invoke<AppLog[]>("list_logs");
      setLogs(result);
    } catch (error) {
      console.error("Failed to load app logs:", error);
    } finally {
      setIsLoading(false);
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
          source?: string;
        }>("app-log", (event) => {
          const newLog: AppLog = {
            id: crypto.randomUUID(),
            timestamp: event.payload.timestamp,
            level: event.payload.level as AppLog["level"],
            message: event.payload.message,
            source: event.payload.source,
          };

          setLogs((prevLogs) => [newLog, ...prevLogs]);
          // Persistence is handled by the Rust tracing layer
          // (`logs::append_log`), so no `save_log` call here.
        });

        if (disposed) {
          listener();
        } else {
          unlisten = listener;
        }
      } catch (error) {
        console.error("Failed to register app-log listener:", error);
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
    await invoke("clear_logs");
    setLogs([]);
  };

  return {
    logs,
    isLoading,
    clearLogs,
  };
}
