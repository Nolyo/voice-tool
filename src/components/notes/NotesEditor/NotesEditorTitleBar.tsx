import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { ChevronDown, Folder, FolderPlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingMenu, type FloatingMenuEntry } from "@/components/ui/floating-menu";
import { type NoteMeta, deriveTitle } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";

interface NotesEditorTitleBarProps {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  folders: FolderMeta[];
  editor: Editor | null;
  onActivateNote: (id: string) => void;
  onTabClose: (id: string) => void;
  onCreateNote: () => void;
  onMoveNote: (noteId: string, folderId: string | null) => Promise<void>;
  onCreateFolder: (name: string) => Promise<FolderMeta>;
}

export function NotesEditorTitleBar({
  openNotes,
  activeNoteId,
  folders,
  editor,
  onActivateNote,
  onTabClose,
  onCreateNote,
  onMoveNote,
  onCreateFolder,
}: NotesEditorTitleBarProps) {
  const { t } = useTranslation();
  const editorText = editor?.getText() ?? "";
  const [badgeMenu, setBadgeMenu] = useState<{ x: number; y: number } | null>(null);
  const badgeButtonRef = useRef<HTMLButtonElement>(null);

  const activeNote = openNotes.find((n) => n.id === activeNoteId) ?? null;
  const activeFolder = activeNote?.folderId
    ? folders.find((f) => f.id === activeNote.folderId) ?? null
    : null;

  const openBadgeMenu = () => {
    const rect = badgeButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBadgeMenu({ x: rect.left, y: rect.bottom + 4 });
  };

  const badgeMenuItems: FloatingMenuEntry[] = activeNote
    ? (() => {
        const items: FloatingMenuEntry[] = [];
        items.push({
          label: (
            <span className="flex items-center gap-1.5">
              <Folder className="w-3 h-3" />
              {t('notes.folders.moveToRoot')}
            </span>
          ),
          onClick: () => { void onMoveNote(activeNote.id, null); },
          active: !activeNote.folderId,
          disabled: !activeNote.folderId,
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
              onClick: () => { void onMoveNote(activeNote.id, folder.id); },
              active: activeNote.folderId === folder.id,
              disabled: activeNote.folderId === folder.id,
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
            void onCreateFolder(name.trim()).then((folder) =>
              onMoveNote(activeNote.id, folder.id),
            );
          },
        });
        return items;
      })()
    : [];

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-muted/50 border-b select-none shrink-0">
      {/* Tabs */}
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
        {openNotes.map((note) => (
          <div
            key={note.id}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer shrink-0 max-w-[160px] ${
              note.id === activeNoteId
                ? "bg-background text-foreground"
                : "text-foreground/60 hover:text-foreground hover:bg-background/50"
            }`}
            onClick={() => onActivateNote(note.id)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onTabClose(note.id);
              }
            }}
          >
            <span className="truncate">
              {note.id === activeNoteId && editorText
                ? deriveTitle(editor?.getHTML() ?? "")
                : note.title}
            </span>
            <button
              className="text-foreground/70 hover:text-destructive shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(note.id);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-foreground"
          onClick={onCreateNote}
          title={t('notes.newNote')}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Folder badge (only for active note) */}
      {activeNote && (
        <button
          ref={badgeButtonRef}
          type="button"
          onClick={openBadgeMenu}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-background/50 shrink-0 max-w-[160px]"
          title={t('notes.folders.moveTo')}
        >
          <Folder className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {activeFolder ? activeFolder.name : t('notes.folders.unfiled')}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
      )}

      {badgeMenu && (
        <FloatingMenu
          open={true}
          x={badgeMenu.x}
          y={badgeMenu.y}
          onClose={() => setBadgeMenu(null)}
          items={badgeMenuItems}
        />
      )}
    </div>
  );
}
