import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type NoteData, type NoteMeta } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";
import { useNotesEditorInstance } from "@/hooks/useNotesEditorInstance";
import { useAiAssistant } from "@/hooks/useAiAssistant";
import { useLinkEditor } from "@/hooks/useLinkEditor";
import { NotesEditorTitleBar } from "./NotesEditorTitleBar";
import { NotesEditorContent } from "./NotesEditorContent";
import { NotesEditorFooter } from "./NotesEditorFooter";

interface NotesEditorProps {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  folders: FolderMeta[];
  onActivateNote: (id: string) => void;
  onCloseNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, content: string, title: string) => void;
  onCreateNote: () => void;
  onCopyContent: (text: string) => void;
  onMoveNote: (noteId: string, folderId: string | null) => Promise<void>;
  onCreateFolder: (name: string) => Promise<FolderMeta>;
  apiKey: string;
  readNote: (id: string) => Promise<NoteData>;
}

/**
 * Docked notes editor. Fills the entire main content area.
 * Composes three hooks (TipTap editor, AI assistant, link editor) with four
 * subcomponents (title bar, content, bubble menu, footer). The orchestrator
 * only handles delete confirmation and the "close empty note" policy.
 */
export function NotesEditor({
  openNotes,
  activeNoteId,
  folders,
  onActivateNote,
  onCloseNote,
  onDeleteNote,
  onUpdateNote,
  onCreateNote,
  onCopyContent,
  onMoveNote,
  onCreateFolder,
  apiKey,
  readNote,
}: NotesEditorProps) {
  const { t } = useTranslation();
  const { editor, isLoadingContent } = useNotesEditorInstance({
    openNotes,
    activeNoteId,
    readNote,
    onUpdateNote,
  });

  const ai = useAiAssistant(editor, apiKey);
  const linkEditor = useLinkEditor(editor);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const hasActiveNote = openNotes.some((n) => n.id === activeNoteId);

  const isActiveNoteEmpty = (id: string): boolean => {
    if (id !== activeNoteId) return false;
    if (!editor) return false;
    return editor.getText().trim() === "";
  };

  const handleTabClose = (id: string) => {
    if (isActiveNoteEmpty(id)) {
      onDeleteNote(id);
    } else {
      onCloseNote(id);
    }
  };

  const handleConfirmDelete = () => {
    if (activeNoteId) {
      onDeleteNote(activeNoteId);
    }
    setConfirmDeleteOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      <NotesEditorTitleBar
        openNotes={openNotes}
        activeNoteId={activeNoteId}
        folders={folders}
        editor={editor}
        onActivateNote={onActivateNote}
        onTabClose={handleTabClose}
        onCreateNote={onCreateNote}
        onMoveNote={onMoveNote}
        onCreateFolder={onCreateFolder}
      />

      <NotesEditorContent
        editor={editor}
        hasActiveNote={hasActiveNote}
        isLoadingContent={isLoadingContent}
        ai={ai}
        linkEditor={linkEditor}
      />

      {/* Error banner */}
      {ai.state === "error" && ai.error && (
        <div
          className="px-3 py-1.5 text-xs text-destructive bg-destructive/10 border-t border-destructive/20 cursor-pointer"
          onClick={ai.dismiss}
        >
          {ai.error}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30 shrink-0">
        <NotesEditorFooter
          editor={editor}
          hasActiveNote={hasActiveNote}
          isAiLoading={ai.state === "loading"}
          onAiAction={ai.processSelection}
          onCopyContent={onCopyContent}
          onRequestDelete={() => setConfirmDeleteOpen(true)}
        />
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('notes.editor.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('notes.editor.deleteConfirmDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              <Trash2 className="w-4 h-4 mr-1" />
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
