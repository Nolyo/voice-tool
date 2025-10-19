"use client"

import { useState, useEffect } from "react"
import { Mic } from "lucide-react"
import { Card } from "@/components/ui/card"
import { AudioVisualizer } from "./audio-visualizer"

interface RecordingCardProps {
  isRecording: boolean
  isTranscribing?: boolean
  onToggleRecording: () => void
}

export function RecordingCard({ isRecording, isTranscribing = false, onToggleRecording }: RecordingCardProps) {
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
    <Card className="p-8 border-2">
      <div className="flex flex-col items-center justify-center space-y-6">
        <div className="relative w-32 h-32 flex items-center justify-center">
          {/* Audio Visualizer */}
          <AudioVisualizer isRecording={isRecording} size={120} />

          {/* Mic Button */}
          <button
            onClick={onToggleRecording}
            className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording
                ? "bg-destructive shadow-lg shadow-destructive/50 scale-110"
                : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
            }`}
          >
            <Mic className="w-10 h-10 text-primary-foreground" />
          </button>

          {/* Pulse animation ring */}
          {isRecording && (
            <div className="absolute inset-0 rounded-full border-4 border-destructive animate-ping opacity-75" />
          )}
        </div>

        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-foreground">
            {isTranscribing
              ? "Transcription en cours..."
              : isRecording
                ? "Enregistrement en cours..."
                : "Cliquez pour commencer"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isTranscribing
              ? "Traitement de votre audio avec OpenAI Whisper..."
              : isRecording
                ? "Parlez clairement dans votre microphone"
                : "Votre transcription apparaîtra automatiquement"}
          </p>
        </div>

        {isRecording && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-mono text-muted-foreground">{formatDuration(duration)}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
