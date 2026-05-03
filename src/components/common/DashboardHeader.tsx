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
  BarChart3,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AudioVisualizer } from "./AudioVisualizer"
import { LexenaWordmark } from "./LexenaWordmark"
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator"
import { useSettings } from "@/hooks/useSettings"
import type { DashboardTabId } from "@/components/dashboard/DashboardSidebar"

interface DashboardHeaderProps {
  isRecording: boolean;
  isTranscribing?: boolean;
  onToggleRecording: () => void;
  updateAvailable?: boolean;
  onUpdateClick?: () => void;
  activeTab: DashboardTabId;
  sidebarCollapsed?: boolean;
}

const TAB_ICONS: Record<DashboardTabId, LucideIcon> = {
  historique: History,
  statistiques: BarChart3,
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
  sidebarCollapsed = false,
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
      <div className="px-5 h-[61px] flex items-center">
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0">
            {sidebarCollapsed && (
              <>
                <LexenaWordmark
                  variant={settings.theme === "light" ? "light" : "dark"}
                  height={24}
                  className="flex-shrink-0"
                />
                <div className="h-6 w-px bg-border flex-shrink-0" aria-hidden="true" />
              </>
            )}
            <div className="flex items-center gap-1.5 min-w-0 leading-tight">
              <TabIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground truncate">{t(`header.subtitle.${activeTab}`)}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 flex-shrink-0 flex items-center justify-center">
                <AudioVisualizer isRecording={isRecording} size={36} />
                <button
                  onClick={onToggleRecording}
                  disabled={isTranscribing}
                  className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70 ${
                    isRecording
                      ? "bg-destructive scale-110 shadow-[0_0_0_3px_oklch(from_var(--vt-danger)_l_c_h_/_0.25),0_8px_24px_-8px_oklch(from_var(--vt-danger)_l_c_h_/_0.6)]"
                      : "bg-primary hover:bg-primary/90 shadow-[var(--vt-shadow-primary-glow)]"
                  }`}
                >
                  <Mic
                    className={`w-4 h-4 ${
                      isRecording ? "text-primary-foreground" : "text-signal-green"
                    }`}
                  />
                </button>
                {isRecording && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-destructive opacity-60 vt-anim-pulse-ring pointer-events-none" />
                    <div className="absolute inset-0 rounded-full border-4 border-destructive animate-ping opacity-50 pointer-events-none" />
                  </>
                )}
              </div>

              <div className="hidden sm:flex flex-col leading-tight">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{statusLabel}</p>
                  {isRecording && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive vt-anim-pulse-dot" />
                      <span className="text-xs vt-mono text-muted-foreground">
                        {formatDuration(duration)}
                      </span>
                    </div>
                  )}
                </div>
                {!isRecording && !isTranscribing && (
                  <p className="text-[11px] text-muted-foreground/70 vt-mono mt-0.5">
                    {t('recording.shortcutsHint', {
                      toggle: settings.record_hotkey,
                      ptt: settings.ptt_hotkey,
                    })}
                  </p>
                )}
              </div>
            </div>

            <SyncStatusIndicator />

            {updateAvailable && (
              <Button
                variant="default"
                size="sm"
                onClick={onUpdateClick}
                className="gap-2 shadow-[var(--vt-shadow-primary-glow)]"
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
