"use client";

import { useState, useMemo } from "react";
import { Search, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SettingTabs } from "./setting-tabs";
import { type Transcription } from "@/hooks/useTranscriptionHistory";

interface TranscriptionListProps {
  transcriptions: Transcription[];
  selectedId?: string;
  onSelectTranscription: (transcription: Transcription) => void;
  onCopy: (text: string) => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
}

export function TranscriptionList({
  transcriptions,
  selectedId,
  onSelectTranscription,
  onCopy,
  onDelete,
  onClearAll,
}: TranscriptionListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter transcriptions based on search query
  const filteredTranscriptions = useMemo(() => {
    if (!searchQuery.trim()) return transcriptions;

    const lowerQuery = searchQuery.toLowerCase();
    return transcriptions.filter(t =>
      t.text.toLowerCase().includes(lowerQuery) ||
      t.date.includes(searchQuery) ||
      t.time.includes(searchQuery)
    );
  }, [transcriptions, searchQuery]);

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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(e.target.value)
              }
              className="pl-10"
            />
          </div>

          {/* Transcriptions */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredTranscriptions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p>{searchQuery ? "Aucune transcription trouvée" : "Aucune transcription pour le moment"}</p>
                <p className="text-sm mt-2">Enregistrez votre premier audio pour commencer</p>
              </div>
            ) : (
              filteredTranscriptions.map((transcription) => (
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
                      <span className="text-xs text-muted-foreground">
                        {transcription.date}
                      </span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2 leading-relaxed">
                      {transcription.text}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onCopy(transcription.text);
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          if (confirm("Supprimer cette transcription ?")) {
                            onDelete(transcription.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </button>
            )))}
          </div>

          {/* Actions */}
          {transcriptions.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {transcriptions.length} transcription{transcriptions.length > 1 ? 's' : ''}
              </span>
              {onClearAll && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Supprimer toutes les ${transcriptions.length} transcriptions ?`)) {
                      onClearAll();
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Tout effacer
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="parametres" className="space-y-6">
          <SettingTabs />
        </TabsContent>

        <TabsContent value="logs">
          <div className="py-8 text-center text-muted-foreground">
            <p>Journaux système</p>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
