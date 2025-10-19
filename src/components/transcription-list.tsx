"use client";

import { useState, useMemo } from "react";
import { Search, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SettingTabs } from "./setting-tabs";
import { LogsTab } from "./logs-tab";
import { type Transcription } from "@/hooks/useTranscriptionHistory";
import { useAppLogs } from "@/hooks/useAppLogs";

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
  const { logs, clearLogs } = useAppLogs();

  // Filter transcriptions based on search query
  const filteredTranscriptions = useMemo(() => {
    if (!searchQuery.trim()) return transcriptions;

    const lowerQuery = searchQuery.toLowerCase();
    return transcriptions.filter(
      (t) =>
        t.text.toLowerCase().includes(lowerQuery) ||
        t.date.includes(searchQuery) ||
        t.time.includes(searchQuery)
    );
  }, [transcriptions, searchQuery]);

  return (
    <Card className="p-6">
      <Tabs defaultValue="historique" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger
            value="historique"
            className="cursor-pointer dark:hover:bg-neutral-900"
          >
            Historique
          </TabsTrigger>
          <TabsTrigger
            value="parametres"
            className="cursor-pointer dark:hover:bg-neutral-900"
          >
            Paramètres
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="cursor-pointer dark:hover:bg-neutral-900"
          >
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historique" className="space-y-4">
          {/* Search + Clear */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher dans les transcriptions..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchQuery(e.target.value)
                }
                className="pl-10 sm:max-w-none"
              />
            </div>
            {onClearAll && transcriptions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="sm:w-auto sm:flex-none w-full sm:min-w-[140px] dark:hover:border-red-800 dark:hover:bg-red-500"
                onClick={() => {
                  if (
                    confirm(
                      `Supprimer toutes les ${transcriptions.length} transcriptions ?`
                    )
                  ) {
                    onClearAll();
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Tout effacer
              </Button>
            )}
          </div>

          {/* Transcriptions */}
          <div className="space-y-2">
            {filteredTranscriptions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p>
                  {searchQuery
                    ? "Aucune transcription trouvée"
                    : "Aucune transcription pour le moment"}
                </p>
                <p className="text-sm mt-2">
                  Enregistrez votre premier audio pour commencer
                </p>
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
                        className="dark:hover:text-blue-800"
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
                          className="dark:hover:text-red-800"
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
              ))
            )}
          </div>

          {/* Actions */}
          {transcriptions.length > 0 && (
            <div className="pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {transcriptions.length} transcription
                {transcriptions.length > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="parametres" className="space-y-6">
          <SettingTabs />
        </TabsContent>

        <TabsContent value="logs">
          <LogsTab logs={logs} onClearLogs={clearLogs} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
