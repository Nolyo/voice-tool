"use client"

import { useState } from "react"
import { Mic, Copy, Play, Search, Trash2, Download, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

interface Transcription {
  id: string
  date: string
  time: string
  text: string
}

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTranscription, setSelectedTranscription] = useState<Transcription | null>(null)

  // Sample data - replace with real data
  const transcriptions: Transcription[] = [
    {
      id: "1",
      date: "2025-10-17",
      time: "13:07:10",
      text: "Des applications, des bases de données, etc. C'est très moderne.",
    },
    {
      id: "2",
      date: "2025-10-17",
      time: "13:06:49",
      text: "C'est une application open source qui permet de gérer plusieurs services dans son site web.",
    },
    {
      id: "3",
      date: "2025-10-17",
      time: "13:06:09",
      text: "C'est une application open source qui permet.",
    },
  ]

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleToggleRecording = () => {
    setIsRecording(!isRecording)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                <Mic className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Voice Tool</h1>
                <p className="text-xs text-muted-foreground">Transcription vocale intelligente</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recording Card */}
            <Card className="p-8 border-2">
              <div className="flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <button
                    onClick={handleToggleRecording}
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

            {/* Transcriptions List */}
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
                        onClick={() => setSelectedTranscription(transcription)}
                        className={`w-full text-left p-4 rounded-lg border transition-all hover:border-primary/50 hover:bg-accent/5 ${
                          selectedTranscription?.id === transcription.id
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
                                handleCopy(transcription.text)
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
                    <p>Paramètres de l'application</p>
                  </div>
                </TabsContent>

                <TabsContent value="logs">
                  <div className="py-8 text-center text-muted-foreground">
                    <p>Journaux système</p>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          {/* Sidebar - Details */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-24">
              <h3 className="text-sm font-semibold text-foreground mb-4">Détails</h3>
              {selectedTranscription ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Date et heure</p>
                    <p className="text-sm font-mono text-foreground">
                      {selectedTranscription.date} {selectedTranscription.time}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Transcription</p>
                    <p className="text-sm text-foreground leading-relaxed bg-muted/50 p-4 rounded-lg">
                      {selectedTranscription.text}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 pt-4">
                    <Button onClick={() => handleCopy(selectedTranscription.text)} className="w-full">
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
          </div>
        </div>
      </div>
    </div>
  )
}
