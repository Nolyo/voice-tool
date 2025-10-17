"use client"

import { Mic } from "lucide-react"
import { Card } from "@/components/ui/card"

interface RecordingCardProps {
  isRecording: boolean
  onToggleRecording: () => void
}

export function RecordingCard({ isRecording, onToggleRecording }: RecordingCardProps) {
  return (
    <Card className="p-8 border-2">
      <div className="flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <button
            onClick={onToggleRecording}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording
                ? "bg-destructive shadow-lg shadow-destructive/50 scale-110"
                : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
            }`}
          >
            <Mic className="w-10 h-10 text-primary-foreground" />
          </button>
          {isRecording && (
            <div className="absolute inset-0 rounded-full border-4 border-destructive animate-ping" />
          )}
        </div>
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-foreground">
            {isRecording ? "Enregistrement en cours..." : "Cliquez pour commencer"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isRecording
              ? "Parlez clairement dans votre microphone"
              : "Votre transcription apparaîtra automatiquement"}
          </p>
        </div>
        {isRecording && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-mono text-muted-foreground">00:15</span>
          </div>
        )}
      </div>
    </Card>
  )
}
