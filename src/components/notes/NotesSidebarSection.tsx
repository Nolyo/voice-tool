import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type NoteMeta } from "@/hooks/useNotes";

interface NotesSidebarSectionProps {
  notes: NoteMeta[];
  activeNoteId: string | null;
  onOpenNote: (note: NoteMeta) => void;
  onCreateNote: () => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote: (id: string) => void;
  searchNotes: (query: string) => Promise<NoteMeta[]>;
}

interface NoteItemProps {
  note: NoteMeta;
  isActive: boolean;
  onOpen: (note: NoteMeta) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}

function NoteItem({ note, isActive, onOpen, onToggleFavorite, onDelete }: NoteItemProps) {
  return (
    <div
      className={`group relative flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors ${
        isActive
          ? "bg-accent text-foreground border-l-2 border-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
      onClick={() => onOpen(note)}
    >
      <FileText className="w-3.5 h-3.5 shrink-0" />
      <span className="text-xs flex-1 truncate">{note.title}</span>
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        <button
          className={`p-0.5 rounded hover:bg-background transition-colors ${
            note.favorite ? "text-yellow-400" : "text-muted-foreground/60 hover:text-yellow-400"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(note.id);
          }}
          title={note.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <Star className={`w-3 h-3 ${note.favorite ? "fill-current" : ""}`} />
        </button>
        <button
          className="p-0.5 rounded hover:bg-background text-muted-foreground/60 hover:text-destructive transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Supprimer cette note ?")) {
              onDelete(note.id);
            }
          }}
          title="Supprimer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function NotesSidebarSection({
  notes,
  activeNoteId,
  onOpenNote,
  onCreateNote,
  onToggleFavorite,
  onDeleteNote,
  searchNotes,
}: NotesSidebarSectionProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteMeta[] | null>(null);
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false);
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
        } catch {
          setSearchResults(null);
        }
      }, 300);
    },
    [searchNotes],
  );

  const handleToggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery("");
      setSearchResults(null);
    } else {
      setSearchOpen(true);
    }
  };

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const displayedNotes = searchResults ?? notes;
  const favoriteNotes = displayedNotes.filter((n) => n.favorite);
  const showFavoritesSection = favoriteNotes.length > 0 && !searchQuery;

  return (
    <div className="flex flex-col border-t border-border overflow-hidden flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center px-3 py-2 shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1 select-none">
          Notes
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={handleToggleSearch}
          title={searchOpen ? "Fermer la recherche" : "Rechercher"}
        >
          {searchOpen ? <X className="w-3 h-3" /> : <Search className="w-3 h-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 ml-0.5 text-muted-foreground hover:text-foreground"
          onClick={onCreateNote}
          title="Nouvelle note"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {/* Search input */}
      {searchOpen && (
        <div className="px-2 pb-2 shrink-0">
          <Input
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {/* Favorites section */}
        {showFavoritesSection && (
          <div>
            <button
              className="flex items-center gap-1.5 px-3 py-1 w-full text-left hover:bg-accent/30 transition-colors"
              onClick={() => setFavoritesCollapsed((v) => !v)}
            >
              {favoritesCollapsed ? (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              )}
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              <span className="text-xs text-muted-foreground select-none">
                Favoris
              </span>
            </button>
            {!favoritesCollapsed &&
              favoriteNotes.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  isActive={note.id === activeNoteId}
                  onOpen={onOpenNote}
                  onToggleFavorite={onToggleFavorite}
                  onDelete={onDeleteNote}
                />
              ))}
          </div>
        )}

        {/* Recents section */}
        <div>
          {showFavoritesSection && (
            <div className="px-3 pt-2 pb-1">
              <span className="text-xs text-muted-foreground select-none">
                Récents
              </span>
            </div>
          )}
          {displayedNotes.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {searchQuery ? "Aucune note trouvée" : "Aucune note"}
            </div>
          ) : (
            displayedNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                isActive={note.id === activeNoteId}
                onOpen={onOpenNote}
                onToggleFavorite={onToggleFavorite}
                onDelete={onDeleteNote}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
