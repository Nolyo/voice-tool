import { useState, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export interface AppLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug" | "trace";
  message: string;
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
        }>("app-log", (event) => {
          const newLog: AppLog = {
            id: crypto.randomUUID(),
            timestamp: event.payload.timestamp,
            level: event.payload.level as AppLog["level"],
            message: event.payload.message,
          };

          setLogs((prevLogs) => [newLog, ...prevLogs]);

          // Fire-and-forget save to backend
          invoke("save_log", { log: newLog }).catch((error) => {
            console.error("Failed to save log:", error);
          });
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
