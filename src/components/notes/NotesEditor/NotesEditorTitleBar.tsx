import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import {
  ChevronDown,
  FileText,
  Folder,
  FolderPlus,
  Plus,
  X,
} from "lucide-react";
import { FloatingMenu, type FloatingMenuEntry } from "@/components/ui/floating-menu";
import { type NoteMeta, deriveTitle } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";

interface NotesEditorTitleBarProps {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  /** Id of the note whose content currently lives in the TipTap editor.
   *  When it doesn't match `activeNoteId`, the editor still holds the old
   *  document — don't derive any UI from it (title, word count) until it
   *  catches up, or tabs flicker to the previous note's title for one paint. */
  loadedNoteId: string | null;
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
  loadedNoteId,
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
  const isEditorInSync = loadedNoteId !== null && loadedNoteId === activeNoteId;
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
              {t("notes.folders.moveToRoot")}
            </span>
          ),
          onClick: () => {
            void onMoveNote(activeNote.id, null);
          },
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
              onClick: () => {
                void onMoveNote(activeNote.id, folder.id);
              },
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
              {t("notes.folders.newFolderAndMove")}
            </span>
          ),
          onClick: () => {
            const name = window.prompt(t("notes.folders.namePrompt"));
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
    <div className="notes-tabbar flex items-stretch select-none shrink-0">
      {/* Tabs row (scrollable) */}
      <div
        className="flex items-stretch overflow-x-auto flex-1 min-w-0"
        style={{ overflowY: "hidden" }}
      >
        {openNotes.map((note) => {
          const isActive = note.id === activeNoteId;
          // Only trust the editor's derived title for the active tab when the
          // editor has actually ingested this note's content. Otherwise the
          // tab would briefly display the previous note's title.
          const displayTitle =
            isActive && isEditorInSync && editorText
              ? deriveTitle(editor?.getHTML() ?? "")
              : note.title || t("notes.editor.untitled");
          return (
            <div
              key={note.id}
              className="notes-tab"
              data-active={isActive}
              onClick={() => onActivateNote(note.id)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onTabClose(note.id);
                }
              }}
            >
              <span className="notes-tab-dot" />
              <FileText className="notes-tab-icon w-3 h-3" />
              <span className="notes-tab-title">{displayTitle}</span>
              <span
                className="notes-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(note.id);
                }}
              >
                <X className="w-3 h-3" />
              </span>
            </div>
          );
        })}

        <button
          type="button"
          className="notes-tab-new"
          onClick={onCreateNote}
          title={t("notes.newNote")}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right cluster: folder badge */}
      {activeNote && (
        <div className="flex items-center gap-2 px-3 shrink-0">
          <button
            ref={badgeButtonRef}
            type="button"
            onClick={openBadgeMenu}
            className="notes-folder-badge"
            title={t("notes.folders.moveTo")}
          >
            <Folder className="notes-folder-badge-icon w-3 h-3" />
            <span className="truncate">
              {activeFolder ? activeFolder.name : t("notes.folders.unfiled")}
            </span>
            <ChevronDown className="notes-folder-badge-icon w-3 h-3" />
          </button>
        </div>
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
