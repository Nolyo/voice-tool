"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import type { AppLog } from "@/hooks/useAppLogs";

interface LogsTabProps {
  logs: AppLog[];
  onClearLogs: () => void;
}

export function LogsTab({ logs, onClearLogs }: LogsTabProps) {
  const { t, i18n } = useTranslation();
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getLevelColor = (level: AppLog["level"]) => {
    switch (level) {
      case "error":
        return "text-red-500";
      case "warn":
        return "text-yellow-500";
      case "info":
        return "text-blue-500";
      case "debug":
        return "text-gray-500";
      case "trace":
        return "text-purple-500";
      default:
        return "text-foreground";
    }
  };

  const getLevelBadge = (level: AppLog["level"]) => {
    const colorClass = getLevelColor(level);
    return (
      <span className={`font-bold ${colorClass} w-14 inline-block`}>
        [{level.toUpperCase()}]
      </span>
    );
  };

  const locale = i18n.language === 'en' ? 'en-US' : 'fr-FR';

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
      } as any);
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with clear button */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {logs.length} log{logs.length !== 1 ? "s" : ""}
          {logs.length >= 500 && ` ${t('logs.limitReached')}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => invoke("open_app_data_dir")}
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            {t('logs.openFolder')}
          </Button>
          {logs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(t('logs.deleteAllConfirm', { count: logs.length }))) {
                  onClearLogs();
                }
              }}
              className="dark:hover:border-red-800 dark:hover:bg-red-500"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('logs.deleteAll')}
            </Button>
          )}
        </div>
      </div>

      {/* Logs display */}
      <div className="bg-black/90 rounded-lg p-4 max-h-[500px] overflow-y-auto font-mono text-xs">
        {logs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>{t('logs.empty')}</p>
            <p className="text-xs mt-2">
              {t('logs.emptySubtitle')}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Display logs in reverse order (newest at bottom) */}
            {[...logs].reverse().map((log) => (
              <div key={log.id} className="text-gray-300 leading-relaxed">
                <span className="text-gray-500">
                  [{formatTimestamp(log.timestamp)}]
                </span>{" "}
                {getLevelBadge(log.level)} {log.message}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
