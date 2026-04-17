"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Mic } from "lucide-react"
import { Card } from "@/components/ui/card"
import { AudioVisualizer } from "./AudioVisualizer"
import { useSettings } from "@/hooks/useSettings"

interface RecordingCardProps {
  isRecording: boolean
  isTranscribing?: boolean
  onToggleRecording: () => void
}

export function RecordingCard({ isRecording, isTranscribing = false, onToggleRecording }: RecordingCardProps) {
  const { t } = useTranslation();
  const { settings } = useSettings()
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!isRecording) {
      setDuration(0)
      return
    }

    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setDuration(elapsed)
    }, 1000)

    return () => clearInterval(interval)
  }, [isRecording])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <Card className="p-4 border-2">
      <div className="flex flex-row items-center gap-5">
        {/* Mic button */}
        <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
          <AudioVisualizer isRecording={isRecording} size={56} />
          <button
            onClick={onToggleRecording}
            className={`relative z-10 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording
                ? "bg-destructive shadow-lg shadow-destructive/50 scale-110"
                : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
            }`}
          >
            <Mic className="w-6 h-6 text-primary-foreground" />
          </button>
          {isRecording && (
            <div className="absolute inset-0 rounded-full border-4 border-destructive animate-ping opacity-75" />
          )}
        </div>

        {/* Text content */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <p className="text-base font-medium text-foreground">
              {isTranscribing
                ? t('recording.transcribing')
                : isRecording
                  ? t('recording.recording')
                  : t('recording.clickToStart')}
            </p>
            {isRecording && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                <span className="text-xs font-mono text-muted-foreground">{formatDuration(duration)}</span>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isTranscribing
              ? t('recording.transcribingDetail')
              : isRecording
                ? t('recording.recordingDetail')
                : t('recording.idleDetail')}
          </p>
          {!isRecording && !isTranscribing && (
            <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
              {t('recording.shortcutsHint', {
                toggle: settings.record_hotkey,
                ptt: settings.ptt_hotkey,
              })}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
