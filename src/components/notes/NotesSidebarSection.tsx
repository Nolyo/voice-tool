import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatingMenu, type FloatingMenuEntry } from "@/components/ui/floating-menu";
import { type NoteMeta } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";

interface NotesSidebarSectionProps {
  notes: NoteMeta[];
  folders: FolderMeta[];
  activeNoteId: string | null;
  onOpenNote: (note: NoteMeta) => void;
  onCreateNote: (folderId?: string | null) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote: (id: string) => void;
  searchNotes: (query: string) => Promise<NoteMeta[]>;
  onCreateFolder: (name: string) => Promise<FolderMeta>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveNote: (noteId: string, folderId: string | null) => Promise<void>;
}

interface NoteItemProps {
  note: NoteMeta;
  isActive: boolean;
  onOpen: (note: NoteMeta) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, note: NoteMeta) => void;
  t: (key: string) => string;
}

function NoteItem({ note, isActive, onOpen, onToggleFavorite, onDelete, onContextMenu, t }: NoteItemProps) {
  return (
    <div
      className={`group relative flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors ${
        isActive
          ? "bg-accent text-foreground border-l-2 border-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
      onClick={() => onOpen(note)}
      onContextMenu={(e) => onContextMenu(e, note)}
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
          title={note.favorite ? t('notes.removeFavorite') : t('notes.addFavorite')}
        >
          <Star className={`w-3 h-3 ${note.favorite ? "fill-current" : ""}`} />
        </button>
        <button
          className="p-0.5 rounded hover:bg-background text-muted-foreground/60 hover:text-destructive transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(t('notes.deleteConfirm'))) {
              onDelete(note.id);
            }
          }}
          title={t('notes.deleteButton')}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

interface FolderSectionProps {
  folder: FolderMeta;
  notes: NoteMeta[];
  activeNoteId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onOpenNote: (note: NoteMeta) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteMeta) => void;
  onRename: (id: string, currentName: string) => void;
  onDelete: (id: string) => void;
  onCreateNoteIn: (folderId: string) => void;
  t: (key: string) => string;
}

function FolderSection({
  folder,
  notes,
  activeNoteId,
  collapsed,
  onToggle,
  onOpenNote,
  onToggleFavorite,
  onDeleteNote,
  onNoteContextMenu,
  onRename,
  onDelete,
  onCreateNoteIn,
  t,
}: FolderSectionProps) {
  return (
    <div>
      <div className="group flex items-center gap-1.5 px-3 py-1 hover:bg-accent/30 transition-colors">
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          )}
          <Folder className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground select-none truncate">
            {folder.name}
          </span>
          <span className="text-[10px] text-muted-foreground/60 select-none shrink-0">
            ({notes.length})
          </span>
        </button>
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button
            className="p-0.5 rounded hover:bg-background text-muted-foreground/60 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onCreateNoteIn(folder.id);
            }}
            title={t('notes.newNote')}
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-background text-muted-foreground/60 hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onRename(folder.id, folder.name);
            }}
            title={t('notes.folders.rename')}
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-background text-muted-foreground/60 hover:text-destructive transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(folder.id);
            }}
            title={t('notes.folders.delete')}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {!collapsed && notes.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          isActive={note.id === activeNoteId}
          onOpen={onOpenNote}
          onToggleFavorite={onToggleFavorite}
          onDelete={onDeleteNote}
          onContextMenu={onNoteContextMenu}
          t={t}
        />
      ))}
    </div>
  );
}

export function NotesSidebarSection({
  notes,
  folders,
  activeNoteId,
  onOpenNote,
  onCreateNote,
  onToggleFavorite,
  onDeleteNote,
  searchNotes,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveNote,
}: NotesSidebarSectionProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteMeta[] | null>(null);
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false);
  const [rootCollapsed, setRootCollapsed] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: NoteMeta } | null>(null);
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

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const toggleFolderCollapsed = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNoteContextMenu = (e: React.MouseEvent, note: NoteMeta) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, note });
  };

  const handleCreateFolder = async () => {
    const name = window.prompt(t('notes.folders.namePrompt'));
    if (!name || !name.trim()) return;
    try {
      await onCreateFolder(name.trim());
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleRenameFolder = async (id: string, currentName: string) => {
    const name = window.prompt(t('notes.folders.namePrompt'), currentName);
    if (!name || !name.trim() || name.trim() === currentName) return;
    try {
      await onRenameFolder(id, name.trim());
    } catch (error) {
      console.error('Failed to rename folder:', error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm(t('notes.folders.deleteConfirm'))) return;
    try {
      await onDeleteFolder(id);
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const displayedNotes = searchResults ?? notes;
  const isSearching = searchQuery.trim().length > 0;

  const favoriteNotes = useMemo(
    () => displayedNotes.filter((n) => n.favorite),
    [displayedNotes],
  );

  // Group notes by folder (only valid folder ids; orphan folder_id falls back to root)
  const { notesByFolder, rootNotes } = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    const byFolder = new Map<string, NoteMeta[]>();
    const root: NoteMeta[] = [];

    for (const note of displayedNotes) {
      if (note.folderId && folderIds.has(note.folderId)) {
        const list = byFolder.get(note.folderId) ?? [];
        list.push(note);
        byFolder.set(note.folderId, list);
      } else {
        root.push(note);
      }
    }

    return { notesByFolder: byFolder, rootNotes: root };
  }, [displayedNotes, folders]);

  const showFavoritesSection = favoriteNotes.length > 0 && !isSearching;

  // Build context menu items for a given note
  const buildContextMenuItems = (note: NoteMeta): FloatingMenuEntry[] => {
    const items: FloatingMenuEntry[] = [];
    items.push({
      label: (
        <span className="flex items-center gap-1.5">
          <Folder className="w-3 h-3" />
          {t('notes.folders.moveToRoot')}
        </span>
      ),
      onClick: () => { void onMoveNote(note.id, null); },
      active: !note.folderId,
      disabled: !note.folderId,
    });
    if (folders.length > 0) {
      items.push({ separator: true });
      for (const folder of folders) {
        items.push({
          label: (
            <span className="flex items-center gap-1.5">
              <Folder className="w-3 h-3" />
              {folder.name}
            </span>
          ),
          onClick: () => { void onMoveNote(note.id, folder.id); },
          active: note.folderId === folder.id,
          disabled: note.folderId === folder.id,
        });
      }
    }
    items.push({ separator: true });
    items.push({
      label: (
        <span className="flex items-center gap-1.5">
          <FolderPlus className="w-3 h-3" />
          {t('notes.folders.newFolderAndMove')}
        </span>
      ),
      onClick: () => {
        const name = window.prompt(t('notes.folders.namePrompt'));
        if (!name || !name.trim()) return;
        void onCreateFolder(name.trim()).then((folder) => onMoveNote(note.id, folder.id));
      },
    });
    return items;
  };

  return (
    <div className="flex flex-col border-t border-border overflow-hidden flex-1 min-h-0">
      {/* Search input + new-note button + new-folder button */}
      <div className="flex items-center gap-1 px-2 py-2 shrink-0">
        <Input
          placeholder={t('notes.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="h-7 text-xs text-foreground flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onCreateNote(null)}
          title={t('notes.newNote')}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleCreateFolder}
          title={t('notes.folders.newFolder')}
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {/* Search results: flat list, ignores folder grouping */}
        {isSearching ? (
          displayedNotes.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t('notes.emptySearch')}
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
                onContextMenu={handleNoteContextMenu}
                t={t}
              />
            ))
          )
        ) : (
          <>
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
                    {t('notes.favorites')}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 select-none">
                    ({favoriteNotes.length})
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
                      onContextMenu={handleNoteContextMenu}
                      t={t}
                    />
                  ))}
              </div>
            )}

            {/* Folders */}
            {folders.map((folder) => (
              <FolderSection
                key={folder.id}
                folder={folder}
                notes={notesByFolder.get(folder.id) ?? []}
                activeNoteId={activeNoteId}
                collapsed={collapsedFolders.has(folder.id)}
                onToggle={() => toggleFolderCollapsed(folder.id)}
                onOpenNote={onOpenNote}
                onToggleFavorite={onToggleFavorite}
                onDeleteNote={onDeleteNote}
                onNoteContextMenu={handleNoteContextMenu}
                onRename={handleRenameFolder}
                onDelete={handleDeleteFolder}
                onCreateNoteIn={(id) => onCreateNote(id)}
                t={t}
              />
            ))}

            {/* Root / unfiled notes */}
            {(rootNotes.length > 0 || folders.length === 0) && (
              <div>
                {folders.length > 0 && (
                  <button
                    className="flex items-center gap-1.5 px-3 py-1 w-full text-left hover:bg-accent/30 transition-colors"
                    onClick={() => setRootCollapsed((v) => !v)}
                  >
                    {rootCollapsed ? (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground select-none">
                      {t('notes.folders.unfiled')}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 select-none">
                      ({rootNotes.length})
                    </span>
                  </button>
                )}
                {!rootCollapsed && rootNotes.length === 0 && folders.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {t('notes.empty')}
                  </div>
                )}
                {!rootCollapsed &&
                  rootNotes.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      isActive={note.id === activeNoteId}
                      onOpen={onOpenNote}
                      onToggleFavorite={onToggleFavorite}
                      onDelete={onDeleteNote}
                      onContextMenu={handleNoteContextMenu}
                      t={t}
                    />
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Context menu for notes */}
      {contextMenu && (
        <FloatingMenu
          open={true}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={buildContextMenuItems(contextMenu.note)}
        />
      )}
    </div>
  );
}
