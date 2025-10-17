"use client"

import { Mic, Copy, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Transcription } from "./transcription-list"

interface TranscriptionDetailsProps {
  transcription: Transcription | null
  onCopy: (text: string) => void
}

export function TranscriptionDetails({ transcription, onCopy }: TranscriptionDetailsProps) {
  return (
    <Card className="p-6 sticky top-24">
      <h3 className="text-sm font-semibold text-foreground mb-4">Détails</h3>
      {transcription ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Date et heure</p>
            <p className="text-sm font-mono text-foreground">
              {transcription.date} {transcription.time}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Transcription</p>
            <p className="text-sm text-foreground leading-relaxed bg-muted/50 p-4 rounded-lg">
              {transcription.text}
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-4">
            <Button onClick={() => onCopy(transcription.text)} className="w-full">
              <Copy className="w-4 h-4 mr-2" />
              Copier
            </Button>
            <Button variant="outline" className="w-full bg-transparent">
              <Play className="w-4 h-4 mr-2" />
              Écouter
            </Button>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <Mic className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Sélectionnez une transcription pour voir les détails</p>
        </div>
      )}
    </Card>
  )
}
