import { useState, useMemo } from "react";
import { Search, Plus, Copy, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Note } from "@/hooks/useNotes";

interface NotesTabProps {
  notes: Note[];
  onCreateNote: () => void;
  onOpenNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onCopyContent: (text: string) => void;
  onReload: () => void;
}

export function NotesTab({
  notes,
  onCreateNote,
  onOpenNote,
  onDeleteNote,
  onCopyContent,
  onReload,
}: NotesTabProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;

    const lowerQuery = searchQuery.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(lowerQuery) ||
        n.content.toLowerCase().includes(lowerQuery)
    );
  }, [notes, searchQuery]);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      {/* Search + Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher dans les notes..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className="pl-10 sm:max-w-none"
          />
        </div>
        <div className="flex gap-2 sm:flex-none">
          <Button
            variant="outline"
            size="sm"
            className="dark:hover:bg-neutral-900"
            onClick={onReload}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={onCreateNote}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle note
          </Button>
        </div>
      </div>

      {/* Notes List */}
      <div className="space-y-2">
        {filteredNotes.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>
              {searchQuery
                ? "Aucune note trouvée"
                : "Aucune note pour le moment"}
            </p>
            <p className="text-sm mt-2">
              Cliquez sur "Nouvelle note" pour commencer
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => onOpenNote(note)}
              className="w-full text-left p-4 rounded-lg border transition-all hover:border-primary/50 hover:bg-accent/5 border-border"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground line-clamp-1 mb-1">
                    {note.title}
                  </p>
                  {note.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {note.content}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDate(note.updatedAt)} à {formatTime(note.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    className="dark:hover:text-blue-800"
                    variant="ghost"
                    size="sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onCopyContent(note.content);
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    className="dark:hover:text-red-800"
                    variant="ghost"
                    size="sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (confirm("Supprimer cette note ?")) {
                        onDeleteNote(note.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      {notes.length > 0 && (
        <div className="pt-4 border-t">
          <span className="text-sm text-muted-foreground">
            {notes.length} note{notes.length > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
