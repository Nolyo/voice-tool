"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Mic,
  Download,
  FileText,
  History,
  ScrollText,
  Settings2,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AudioVisualizer } from "./AudioVisualizer"
import { useSettings } from "@/hooks/useSettings"
import type { DashboardTabId } from "@/components/dashboard/DashboardSidebar"

interface DashboardHeaderProps {
  isRecording: boolean;
  isTranscribing?: boolean;
  onToggleRecording: () => void;
  updateAvailable?: boolean;
  onUpdateClick?: () => void;
  activeTab: DashboardTabId;
}

const TAB_ICONS: Record<DashboardTabId, LucideIcon> = {
  historique: History,
  notes: FileText,
  parametres: Settings2,
  logs: ScrollText,
};

export function DashboardHeader({
  isRecording,
  isTranscribing = false,
  onToggleRecording,
  updateAvailable,
  onUpdateClick,
  activeTab,
}: DashboardHeaderProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setDuration(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const statusLabel = isTranscribing
    ? t('recording.transcribing')
    : isRecording
      ? t('recording.recording')
      : t('recording.clickToStart');

  const TabIcon = TAB_ICONS[activeTab];

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 flex-shrink-0">
              <TabIcon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">{t('header.title')}</h1>
              <p className="text-xs text-muted-foreground truncate">{t(`header.subtitle.${activeTab}`)}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center">
                <AudioVisualizer isRecording={isRecording} size={44} />
                <button
                  onClick={onToggleRecording}
                  disabled={isTranscribing}
                  className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70 ${
                    isRecording
                      ? "bg-destructive shadow-lg shadow-destructive/50 scale-110"
                      : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
                  }`}
                >
                  <Mic className="w-5 h-5 text-primary-foreground" />
                </button>
                {isRecording && (
                  <div className="absolute inset-0 rounded-full border-4 border-destructive animate-ping opacity-75" />
                )}
              </div>

              <div className="hidden sm:flex flex-col leading-tight">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{statusLabel}</p>
                  {isRecording && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatDuration(duration)}
                      </span>
                    </div>
                  )}
                </div>
                {!isRecording && !isTranscribing && (
                  <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
                    {t('recording.shortcutsHint', {
                      toggle: settings.record_hotkey,
                      ptt: settings.ptt_hotkey,
                    })}
                  </p>
                )}
              </div>
            </div>

            {updateAvailable && (
              <Button
                variant="default"
                size="sm"
                onClick={onUpdateClick}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                <Download className="w-4 h-4" />
                <span>{t('header.newVersion')}</span>
                <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0">
                  {t('common.new')}
                </Badge>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
