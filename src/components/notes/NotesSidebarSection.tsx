import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatingMenu, type FloatingMenuEntry } from "@/components/ui/floating-menu";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { type NoteMeta } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";
import { useSidebarCollapseState } from "@/hooks/useSidebarCollapseState";

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
  onReorderFolders: (ids: string[]) => Promise<void>;
  onReorderNotes: (folderId: string | null, noteIds: string[]) => Promise<void>;
  onMoveNote: (noteId: string, folderId: string | null) => Promise<void>;
}

interface NoteItemProps {
  note: NoteMeta;
  isActive: boolean;
  indented?: boolean;
  onOpen: (note: NoteMeta) => void;
  onToggleFavorite: (id: string) => void;
  onRequestDelete: (note: NoteMeta) => void;
  onContextMenu: (e: React.MouseEvent, note: NoteMeta) => void;
  t: (key: string) => string;
}

interface SortableNoteItemProps extends NoteItemProps {
  sortableId: string;
}

function SortableNoteItem({ sortableId, ...props }: SortableNoteItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sortableId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <NoteItem {...props} />
    </div>
  );
}

function NoteItem({ note, isActive, indented = false, onOpen, onToggleFavorite, onRequestDelete, onContextMenu, t }: NoteItemProps) {
  return (
    <div
      className={`group relative flex items-center gap-1.5 ${indented ? "pl-8 pr-3" : "px-3"} py-1.5 cursor-pointer transition-colors ${
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
            onRequestDelete(note);
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
  onRequestDeleteNote: (note: NoteMeta) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteMeta) => void;
  onRename: (id: string, currentName: string) => void;
  onRequestDelete: (folder: FolderMeta) => void;
  onCreateNoteIn: (folderId: string) => void;
  onReorderNotes: (folderId: string | null, noteIds: string[]) => Promise<void>;
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
  onRequestDeleteNote,
  onNoteContextMenu,
  onRename,
  onRequestDelete,
  onCreateNoteIn,
  onReorderNotes,
  t,
}: FolderSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const noteSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const handleNoteDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = notes.findIndex((n) => n.id === active.id);
    const newIndex = notes.findIndex((n) => n.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...notes];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    void onReorderNotes(folder.id, next.map((n) => n.id));
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className="group flex items-center gap-1.5 px-3 py-1 hover:bg-accent/30 transition-colors"
        {...listeners}
      >
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
              onRequestDelete(folder);
            }}
            title={t('notes.folders.delete')}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <DndContext
          sensors={noteSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleNoteDragEnd}
        >
          <SortableContext
            items={notes.map((n) => n.id)}
            strategy={verticalListSortingStrategy}
          >
            {notes.map((note) => (
              <SortableNoteItem
                key={note.id}
                sortableId={note.id}
                note={note}
                isActive={note.id === activeNoteId}
                indented
                onOpen={onOpenNote}
                onToggleFavorite={onToggleFavorite}
                onRequestDelete={onRequestDeleteNote}
                onContextMenu={onNoteContextMenu}
                t={t}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
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
  onReorderFolders,
  onReorderNotes,
  onMoveNote,
}: NotesSidebarSectionProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const rootNoteSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleFolderDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = folders.findIndex((f) => f.id === active.id);
    const newIndex = folders.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...folders];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    void onReorderFolders(next.map((f) => f.id));
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteMeta[] | null>(null);
  const {
    state: collapseState,
    toggleFavorites,
    toggleRecents,
    toggleRoot,
    toggleFolder: toggleFolderCollapsed,
  } = useSidebarCollapseState();
  const favoritesCollapsed = collapseState.favorites;
  const recentsCollapsed = collapseState.recents;
  const rootCollapsed = collapseState.root;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: NoteMeta } | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<NoteMeta | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<FolderMeta | null>(null);
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

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    const id = folderToDelete.id;
    setFolderToDelete(null);
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

  // "Récents" shows the 10 most recently updated notes across all folders.
  // `displayedNotes` is already sorted by updatedAt desc by the backend.
  const recentNotes = useMemo(
    () => displayedNotes.slice(0, 10),
    [displayedNotes],
  );

  // Group notes by folder (only valid folder ids; orphan folder_id falls back to root).
  // Within each group, sort by `order` ASC then `updatedAt` DESC so un-reordered notes
  // keep their "most recently modified first" feel.
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

    const cmp = (a: NoteMeta, b: NoteMeta) =>
      a.order - b.order || b.updatedAt.localeCompare(a.updatedAt);
    for (const list of byFolder.values()) list.sort(cmp);
    root.sort(cmp);

    return { notesByFolder: byFolder, rootNotes: root };
  }, [displayedNotes, folders]);

  const showFavoritesSection = favoriteNotes.length > 0 && !isSearching;
  const showRecentsSection = recentNotes.length > 0 && !isSearching;

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
    <div className="vt-notes-tree flex flex-col border-t border-border overflow-hidden flex-1 min-h-0">
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
                onRequestDelete={setNoteToDelete}
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
                  onClick={toggleFavorites}
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
                      indented
                      onOpen={onOpenNote}
                      onToggleFavorite={onToggleFavorite}
                      onRequestDelete={setNoteToDelete}
                      onContextMenu={handleNoteContextMenu}
                      t={t}
                    />
                  ))}
              </div>
            )}

            {/* Recents section — virtual, non-reorderable, top 10 by updatedAt */}
            {showRecentsSection && (
              <div>
                <button
                  className="flex items-center gap-1.5 px-3 py-1 w-full text-left hover:bg-accent/30 transition-colors"
                  onClick={toggleRecents}
                >
                  {recentsCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  )}
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground select-none">
                    {t('notes.recent')}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 select-none">
                    ({recentNotes.length})
                  </span>
                </button>
                {!recentsCollapsed &&
                  recentNotes.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      isActive={note.id === activeNoteId}
                      indented
                      onOpen={onOpenNote}
                      onToggleFavorite={onToggleFavorite}
                      onRequestDelete={setNoteToDelete}
                      onContextMenu={handleNoteContextMenu}
                      t={t}
                    />
                  ))}
              </div>
            )}

            {/* Folders (drag-reorderable) */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFolderDragEnd}
            >
              <SortableContext
                items={folders.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {folders.map((folder) => (
                  <FolderSection
                    key={folder.id}
                    folder={folder}
                    notes={notesByFolder.get(folder.id) ?? []}
                    activeNoteId={activeNoteId}
                    collapsed={collapseState.folders[folder.id] ?? false}
                    onToggle={() => toggleFolderCollapsed(folder.id)}
                    onOpenNote={onOpenNote}
                    onToggleFavorite={onToggleFavorite}
                    onRequestDeleteNote={setNoteToDelete}
                    onNoteContextMenu={handleNoteContextMenu}
                    onRename={handleRenameFolder}
                    onRequestDelete={setFolderToDelete}
                    onCreateNoteIn={(id) => onCreateNote(id)}
                    onReorderNotes={onReorderNotes}
                    t={t}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Root / unfiled notes */}
            {(rootNotes.length > 0 || folders.length === 0) && (
              <div>
                {folders.length > 0 && (
                  <button
                    className="flex items-center gap-1.5 px-3 py-1 w-full text-left hover:bg-accent/30 transition-colors"
                    onClick={toggleRoot}
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
                {!rootCollapsed && rootNotes.length > 0 && (
                  <DndContext
                    sensors={rootNoteSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      const { active, over } = event;
                      if (!over || active.id === over.id) return;
                      const oldIndex = rootNotes.findIndex((n) => n.id === active.id);
                      const newIndex = rootNotes.findIndex((n) => n.id === over.id);
                      if (oldIndex < 0 || newIndex < 0) return;
                      const next = [...rootNotes];
                      const [moved] = next.splice(oldIndex, 1);
                      next.splice(newIndex, 0, moved);
                      void onReorderNotes(null, next.map((n) => n.id));
                    }}
                  >
                    <SortableContext
                      items={rootNotes.map((n) => n.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {rootNotes.map((note) => (
                        <SortableNoteItem
                          key={note.id}
                          sortableId={note.id}
                          note={note}
                          isActive={note.id === activeNoteId}
                          indented={folders.length > 0}
                          onOpen={onOpenNote}
                          onToggleFavorite={onToggleFavorite}
                          onRequestDelete={setNoteToDelete}
                          onContextMenu={handleNoteContextMenu}
                          t={t}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
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

      <ConfirmDeleteDialog
        open={noteToDelete !== null}
        title={t('notes.editor.deleteConfirmTitle')}
        description={t('notes.editor.deleteConfirmDesc')}
        onOpenChange={(open) => { if (!open) setNoteToDelete(null); }}
        onConfirm={() => {
          if (noteToDelete) onDeleteNote(noteToDelete.id);
          setNoteToDelete(null);
        }}
      />

      <ConfirmDeleteDialog
        open={folderToDelete !== null}
        title={t('notes.folders.deleteConfirmTitle')}
        description={t('notes.folders.deleteConfirmDesc')}
        onOpenChange={(open) => { if (!open) setFolderToDelete(null); }}
        onConfirm={confirmDeleteFolder}
      />
    </div>
  );
}
