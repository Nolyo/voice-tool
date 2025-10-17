"use client"

import { useState } from "react"
import { Search, Copy, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

export interface Transcription {
  id: string
  date: string
  time: string
  text: string
}

interface TranscriptionListProps {
  transcriptions: Transcription[]
  selectedId?: string
  onSelectTranscription: (transcription: Transcription) => void
  onCopy: (text: string) => void
}

export function TranscriptionList({
  transcriptions,
  selectedId,
  onSelectTranscription,
  onCopy,
}: TranscriptionListProps) {
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <Card className="p-6">
      <Tabs defaultValue="historique" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="historique">Historique</TabsTrigger>
          <TabsTrigger value="parametres">Paramètres</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="historique" className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher dans les transcriptions..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Transcriptions */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {transcriptions.map((transcription) => (
              <button
                key={transcription.id}
                onClick={() => onSelectTranscription(transcription)}
                className={`w-full text-left p-4 rounded-lg border transition-all hover:border-primary/50 hover:bg-accent/5 ${
                  selectedId === transcription.id
                    ? "border-primary bg-accent/10"
                    : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs font-mono">
                        {transcription.time}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{transcription.date}</span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2 leading-relaxed">{transcription.text}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation()
                        onCopy(transcription.text)
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Play className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            <Button variant="outline" size="sm">
              <Trash2 className="w-4 h-4 mr-2" />
              Tout effacer
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="parametres">
          <div className="py-8 text-center text-muted-foreground">
            <p>Paramètres de l&apos;application</p>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <div className="py-8 text-center text-muted-foreground">
            <p>Journaux système</p>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
