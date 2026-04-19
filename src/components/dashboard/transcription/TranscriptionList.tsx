"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

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
      <div>
        {/* Search + Clear (sticky) */}
        <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-3 bg-card/95 supports-[backdrop-filter]:bg-card/80 backdrop-blur px-6 pt-6 pb-3 border-b rounded-t-xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('history.search')}
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
                      t('history.deleteAllConfirm', { count: transcriptions.length })
                    )
                  ) {
                    onClearAll();
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('history.deleteAll')}
              </Button>
            )}
          </div>
        </div>

        {/* Transcriptions */}
        <div className="space-y-1.5">
          {filteredTranscriptions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p>
                {searchQuery
                  ? t('history.emptySearch')
                  : t('history.empty')}
              </p>
              <p className="text-sm mt-2">
                {t('history.emptySubtitle')}
              </p>
            </div>
          ) : (
            filteredTranscriptions.map((transcription) => (
              <button
                key={transcription.id}
                onClick={() => onSelectTranscription(transcription)}
                className={`w-full text-left px-3 py-2 rounded-md border transition-all hover:border-primary/50 hover:bg-accent/5 ${
                  selectedId === transcription.id
                    ? "border-primary bg-accent/10"
                    : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono px-1.5 py-0 h-4 leading-none"
                      >
                        {transcription.time}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {transcription.date}
                      </span>
                      <p className="text-xs text-foreground truncate leading-snug">
                        {transcription.text}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      className="h-7 w-7 p-0 dark:hover:text-blue-800"
                      variant="ghost"
                      size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onCopy(transcription.text);
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {onDelete && (
                      <Button
                        className="h-7 w-7 p-0 dark:hover:text-red-800"
                        variant="ghost"
                        size="sm"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          if (confirm(t('history.deleteConfirm'))) {
                            onDelete(transcription.id);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer count */}
        {transcriptions.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <span className="text-sm text-muted-foreground">
              {t('history.count', { count: transcriptions.length })}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
