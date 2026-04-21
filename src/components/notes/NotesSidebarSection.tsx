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
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatingMenu, type FloatingMenuEntry } from "@/components/ui/floating-menu";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { FolderNameDialog } from "./FolderNameDialog";
import { type NoteMeta } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";
import { useSidebarCollapseState } from "@/hooks/useSidebarCollapseState";

type NoteDragData = {
  type: 'note';
  noteId: string;
  containerId: string; // folderId or 'root'
};

type FolderDragData = {
  type: 'folder';
  folderId: string;
};

type ContainerDroppableData = {
  type: 'container';
  containerId: string; // folderId or 'root'
};

type ContainerMap = Record<string, string[]>;

const ROOT_CONTAINER_ID = 'root';

function findContainerOf(containers: ContainerMap, noteId: string): string | null {
  for (const [containerId, ids] of Object.entries(containers)) {
    if (ids.includes(noteId)) return containerId;
  }
  return null;
}

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
  onMoveNoteToIndex: (
    noteId: string,
    targetFolderId: string | null,
    noteIdsInNewOrder: string[],
  ) => Promise<void>;
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
  containerId: string;
}

function SortableNoteItem({ sortableId, containerId, ...props }: SortableNoteItemProps) {
  const data: NoteDragData = { type: 'note', noteId: sortableId, containerId };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sortableId, data });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <NoteItem {...props} />
    </div>
  );
}

type FolderBodyDroppableProps = {
  containerId: string;
  children: React.ReactNode;
};

function FolderBodyDroppable({ containerId, children }: FolderBodyDroppableProps) {
  const data: ContainerDroppableData = { type: 'container', containerId };
  const { setNodeRef, isOver } = useDroppable({
    id: `container-${containerId}`,
    data,
  });
  return (
    <div
      ref={setNodeRef}
      data-container-id={containerId}
      data-over={isOver}
      className="min-h-[8px]"
    >
      {children}
    </div>
  );
}

type DragOverlayNoteCardProps = { note: NoteMeta | null };

function DragOverlayNoteCard({ note }: DragOverlayNoteCardProps) {
  if (!note) return null;
  return (
    <div className="vt-app flex items-center gap-2 px-3 py-1.5 rounded-md bg-background border shadow-lg text-sm max-w-[240px]">
      <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
      <span className="truncate flex-1">{note.title || "Untitled"}</span>
      {note.favorite ? <Star className="w-3 h-3 fill-current text-yellow-500" /> : null}
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
  t,
}: FolderSectionProps) {
  const data: FolderDragData = { type: 'folder', folderId: folder.id };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id, data });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
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
        <FolderBodyDroppable containerId={folder.id}>
          <SortableContext
            items={notes.map((n) => n.id)}
            strategy={verticalListSortingStrategy}
          >
            {notes.map((note) => (
              <SortableNoteItem
                key={note.id}
                sortableId={note.id}
                containerId={folder.id}
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
        </FolderBodyDroppable>
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
  onMoveNoteToIndex,
}: NotesSidebarSectionProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingExpandTargetRef = useRef<string | null>(null);

  const AUTO_EXPAND_DELAY_MS = 600;

  const clearExpandTimer = () => {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
    pendingExpandTargetRef.current = null;
  };

  const schedulePossibleExpand = (containerId: string | null) => {
    if (!containerId) {
      clearExpandTimer();
      return;
    }
    const isCollapsed =
      containerId === ROOT_CONTAINER_ID
        ? collapseState.root === true
        : collapseState.folders[containerId] === true;
    if (!isCollapsed) {
      clearExpandTimer();
      return;
    }
    if (pendingExpandTargetRef.current === containerId) return; // already pending
    clearExpandTimer();
    pendingExpandTargetRef.current = containerId;
    expandTimerRef.current = setTimeout(() => {
      if (pendingExpandTargetRef.current !== containerId) return;
      if (containerId === ROOT_CONTAINER_ID) {
        expandRoot();
      } else {
        expandFolder(containerId);
      }
      expandTimerRef.current = null;
      pendingExpandTargetRef.current = null;
    }, AUTO_EXPAND_DELAY_MS);
  };

  const resetDragState = () => {
    clearExpandTimer();
    setActiveId(null);
    setActiveType(null);
    setOriginContainerId(null);
    setDraftContainers(null);
    setOverContainerId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as NoteDragData | FolderDragData | undefined;
    if (!data) return;
    setActiveId(String(event.active.id));
    setActiveType(data.type);
    if (data.type === 'note') {
      setOriginContainerId(data.containerId);
      setDraftContainers({ ...liveContainers });
    }
  };

  const resolveOverContainerId = (
    over: DragEndEvent['over'] | null,
  ): string | null => {
    if (!over) return null;
    const data = over.data.current as
      | NoteDragData
      | ContainerDroppableData
      | FolderDragData
      | undefined;
    if (!data) return null;
    if (data.type === 'note') return data.containerId;
    if (data.type === 'container') return data.containerId;
    return null; // folder-type drop target is not accepted for notes
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as NoteDragData | FolderDragData | undefined;
    if (!activeData || activeData.type !== 'note') {
      setOverContainerId(null);
      return;
    }

    const overId = over ? String(over.id) : null;
    const nextContainerId = resolveOverContainerId(over);
    setOverContainerId(nextContainerId);
    schedulePossibleExpand(nextContainerId);
    if (!nextContainerId || !draftContainers) return;

    const activeNoteId = activeData.noteId;
    const currentContainerId = findContainerOf(draftContainers, activeNoteId);
    if (!currentContainerId) return;

    const overIsNote =
      over?.data.current &&
      (over.data.current as { type: string }).type === 'note';

    if (currentContainerId === nextContainerId) {
      // Same-container reorder during hover — reflect over-position
      if (!overIsNote || !overId) return;
      const items = draftContainers[currentContainerId];
      const activeIndex = items.indexOf(activeNoteId);
      const overIndex = items.indexOf(overId);
      if (activeIndex === overIndex || overIndex < 0) return;
      const nextItems = [...items];
      nextItems.splice(activeIndex, 1);
      nextItems.splice(overIndex, 0, activeNoteId);
      setDraftContainers({ ...draftContainers, [currentContainerId]: nextItems });
      return;
    }

    // Cross-container move
    const fromItems = draftContainers[currentContainerId].filter((id) => id !== activeNoteId);
    const toItemsOriginal = draftContainers[nextContainerId] ?? [];
    const insertAt =
      overIsNote && overId ? toItemsOriginal.indexOf(overId) : toItemsOriginal.length;
    const toItems = [...toItemsOriginal];
    toItems.splice(insertAt >= 0 ? insertAt : toItems.length, 0, activeNoteId);

    setDraftContainers({
      ...draftContainers,
      [currentContainerId]: fromItems,
      [nextContainerId]: toItems,
    });
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    resetDragState();
  };

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'note' | 'folder' | null>(null);
  const [originContainerId, setOriginContainerId] = useState<string | null>(null);
  const [draftContainers, setDraftContainers] = useState<ContainerMap | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);
  void originContainerId;
  void overContainerId;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteMeta[] | null>(null);
  const {
    state: collapseState,
    toggleFavorites,
    toggleRecents,
    toggleRoot,
    toggleFolder: toggleFolderCollapsed,
    expandFolder,
    expandRoot,
  } = useSidebarCollapseState();
  const favoritesCollapsed = collapseState.favorites;
  const recentsCollapsed = collapseState.recents;
  const rootCollapsed = collapseState.root;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: NoteMeta } | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<NoteMeta | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<FolderMeta | null>(null);
  type FolderDialogState =
    | { mode: "create" }
    | { mode: "rename"; id: string; currentName: string }
    | { mode: "createAndMove"; noteId: string };
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null);
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

  useEffect(() => () => clearExpandTimer(), []);

  const handleNoteContextMenu = (e: React.MouseEvent, note: NoteMeta) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, note });
  };

  const handleCreateFolder = () => {
    setFolderDialog({ mode: "create" });
  };

  const handleRenameFolder = (id: string, currentName: string) => {
    setFolderDialog({ mode: "rename", id, currentName });
  };

  const handleFolderDialogSubmit = async (name: string) => {
    if (!folderDialog) return;
    try {
      if (folderDialog.mode === "create") {
        await onCreateFolder(name);
      } else if (folderDialog.mode === "rename") {
        await onRenameFolder(folderDialog.id, name);
      } else if (folderDialog.mode === "createAndMove") {
        const folder = await onCreateFolder(name);
        await onMoveNote(folderDialog.noteId, folder.id);
      }
    } catch (error) {
      console.error('Folder action failed:', error);
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

  const liveContainers: ContainerMap = useMemo(() => {
    const map: ContainerMap = { [ROOT_CONTAINER_ID]: rootNotes.map((n) => n.id) };
    for (const folder of folders) {
      map[folder.id] = (notesByFolder.get(folder.id) ?? []).map((n) => n.id);
    }
    return map;
  }, [rootNotes, folders, notesByFolder]);

  const containersForRender = draftContainers ?? liveContainers;

  const noteById = useMemo(() => {
    const map = new Map<string, NoteMeta>();
    for (const n of displayedNotes) map.set(n.id, n);
    return map;
  }, [displayedNotes]);

  const notesForFolder = (folderId: string): NoteMeta[] => {
    const ids = containersForRender[folderId] ?? [];
    const out: NoteMeta[] = [];
    for (const id of ids) {
      const n = noteById.get(id);
      if (n) out.push(n);
    }
    return out;
  };

  const rootNotesForRender = notesForFolder(ROOT_CONTAINER_ID);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as NoteDragData | FolderDragData | undefined;

    const resetDragState = () => {
      clearExpandTimer();
      setActiveId(null);
      setActiveType(null);
      setOriginContainerId(null);
      setDraftContainers(null);
      setOverContainerId(null);
    };

    if (!activeData) {
      resetDragState();
      return;
    }

    // Folder reorder (unchanged behavior)
    if (activeData.type === 'folder') {
      if (over && active.id !== over.id) {
        const oldIndex = folders.findIndex((f) => f.id === active.id);
        const newIndex = folders.findIndex((f) => f.id === over.id);
        if (oldIndex >= 0 && newIndex >= 0) {
          const next = [...folders];
          const [moved] = next.splice(oldIndex, 1);
          next.splice(newIndex, 0, moved);
          void onReorderFolders(next.map((f) => f.id));
        }
      }
      resetDragState();
      return;
    }

    // Note drop
    if (activeData.type === 'note' && draftContainers && originContainerId) {
      const noteId = activeData.noteId;
      const finalContainerId = findContainerOf(draftContainers, noteId);
      if (!finalContainerId) {
        resetDragState();
        return;
      }

      const finalIds = draftContainers[finalContainerId];
      const originIds = liveContainers[originContainerId] ?? [];

      // No-op detection: note stayed in origin AND order unchanged
      if (finalContainerId === originContainerId) {
        const unchanged =
          finalIds.length === originIds.length &&
          finalIds.every((id, i) => id === originIds[i]);
        if (unchanged) {
          resetDragState();
          return;
        }
        const folderId = finalContainerId === ROOT_CONTAINER_ID ? null : finalContainerId;
        try {
          await onReorderNotes(folderId, finalIds);
        } catch (error) {
          console.error('Reorder failed:', error);
          toast.error(t('notes.errors.moveFailed'));
        }
        resetDragState();
        return;
      }

      // Cross-container move
      const targetFolderId = finalContainerId === ROOT_CONTAINER_ID ? null : finalContainerId;
      try {
        await onMoveNoteToIndex(noteId, targetFolderId, finalIds);
      } catch (error) {
        console.error('Cross-container move failed:', error);
        toast.error(t('notes.errors.moveFailed'));
      }
      resetDragState();
      return;
    }

    resetDragState();
  };

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
        setFolderDialog({ mode: "createAndMove", noteId: note.id });
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
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
            <SortableContext
              items={folders.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              {folders.map((folder) => (
                <FolderSection
                  key={folder.id}
                  folder={folder}
                  notes={notesForFolder(folder.id)}
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
                  t={t}
                />
              ))}
            </SortableContext>

            {/* Root / unfiled notes */}
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
              {!rootCollapsed && (rootNotes.length > 0 || folders.length > 0) && (
                <FolderBodyDroppable containerId={ROOT_CONTAINER_ID}>
                  <SortableContext
                    items={rootNotesForRender.map((n) => n.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {rootNotesForRender.map((note) => (
                      <SortableNoteItem
                        key={note.id}
                        sortableId={note.id}
                        containerId={ROOT_CONTAINER_ID}
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
                </FolderBodyDroppable>
              )}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeId && activeType === 'note' ? (
                <DragOverlayNoteCard note={noteById.get(activeId) ?? null} />
              ) : null}
            </DragOverlay>
          </DndContext>
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

      <FolderNameDialog
        open={folderDialog !== null}
        mode={folderDialog?.mode === "rename" ? "rename" : "create"}
        initialValue={folderDialog?.mode === "rename" ? folderDialog.currentName : ""}
        onOpenChange={(open) => { if (!open) setFolderDialog(null); }}
        onSubmit={handleFolderDialogSubmit}
      />
    </div>
  );
}
