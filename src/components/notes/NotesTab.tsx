import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Plus, Trash2, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type NoteMeta } from "@/hooks/useNotes";

interface NotesTabProps {
  notes: NoteMeta[];
  onCreateNote: () => void;
  onOpenNote: (note: NoteMeta) => void;
  onDeleteNote: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onReload: () => void;
  searchNotes: (query: string) => Promise<NoteMeta[]>;
}

export function NotesTab({
  notes,
  onCreateNote,
  onOpenNote,
  onDeleteNote,
  onToggleFavorite,
  onReload,
  searchNotes,
}: NotesTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteMeta[] | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      clearTimeout(debounceRef.current);

      if (!query.trim()) {
        setSearchResults(null);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const results = await searchNotes(query);
          setSearchResults(results);
        } catch (err) {
          console.error("Search failed:", err);
          setSearchResults(null);
        }
      }, 300);
    },
    [searchNotes],
  );

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const baseNotes = searchResults ?? notes;
  const displayedNotes = showFavoritesOnly ? baseNotes.filter(n => n.favorite) : baseNotes;

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
        <div className="relative w-full sm:flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher dans les notes..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleSearch(e.target.value)
              }
              className="pl-10 sm:max-w-none"
            />
          </div>
          <Button
            variant={showFavoritesOnly ? "default" : "outline"}
            size="sm"
            className="shrink-0 px-3"
            onClick={() => setShowFavoritesOnly(v => !v)}
            title="Afficher les favoris uniquement"
          >
            <Star className={`w-4 h-4 ${showFavoritesOnly ? "fill-current" : ""}`} />
          </Button>
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
        {displayedNotes.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>
              {showFavoritesOnly
                ? "Aucun favori pour le moment"
                : searchQuery
                ? "Aucune note trouvée"
                : "Aucune note pour le moment"}
            </p>
            {!showFavoritesOnly && !searchQuery && (
              <p className="text-sm mt-2">
                Cliquez sur "Nouvelle note" pour commencer
              </p>
            )}
          </div>
        ) : (
          displayedNotes.map((note) => (
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
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(note.updatedAt)} à {formatTime(note.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={note.favorite ? "text-yellow-400 hover:text-yellow-500" : "text-muted-foreground/40 hover:text-yellow-400"}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onToggleFavorite(note.id);
                    }}
                  >
                    <Star className={`w-4 h-4 ${note.favorite ? "fill-current" : ""}`} />
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
