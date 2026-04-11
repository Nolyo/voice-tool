import { useState } from "react";
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
import { useNotesWindow } from "@/hooks/useNotesWindow";
import { useNotesEditorInstance } from "@/hooks/useNotesEditorInstance";
import { useAiAssistant } from "@/hooks/useAiAssistant";
import { useLinkEditor } from "@/hooks/useLinkEditor";
import { NotesEditorTitleBar } from "./NotesEditorTitleBar";
import { NotesEditorContent } from "./NotesEditorContent";
import { NotesEditorFooter } from "./NotesEditorFooter";

interface NotesEditorProps {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  onActivateNote: (id: string) => void;
  onCloseNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, content: string, title: string) => void;
  onCreateNote: () => void;
  onCopyContent: (text: string) => void;
  onClose: () => void;
  apiKey: string;
  readNote: (id: string) => Promise<NoteData>;
}

const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 400;

/**
 * Floating notes modal. Composes four hooks (window state, TipTap editor,
 * AI assistant, link editor) with five subcomponents (title bar, content,
 * bubble menu, AI preview, footer). The orchestrator itself only handles
 * delete confirmation and the "close empty note" policy.
 */
export function NotesEditor({
  openNotes,
  activeNoteId,
  onActivateNote,
  onCloseNote,
  onDeleteNote,
  onUpdateNote,
  onCreateNote,
  onCopyContent,
  onClose,
  apiKey,
  readNote,
}: NotesEditorProps) {
  const {
    position,
    size,
    isMaximized,
    isHalfScreen,
    handleDragStart,
    handleResizeStart,
    toggleMaximize,
    toggleHalfScreen,
  } = useNotesWindow({
    defaultWidth: DEFAULT_WIDTH,
    defaultHeight: DEFAULT_HEIGHT,
  });

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

  // True when the given id is the active note AND its editor content is empty.
  // Inactive tabs are not inspected (we only cleanup on the active-tab path).
  const isActiveNoteEmpty = (id: string): boolean => {
    if (id !== activeNoteId) return false;
    if (!editor) return false;
    return editor.getText().trim() === "";
  };

  // Tab close: delete the note if it's the active empty one, otherwise just close.
  const handleTabClose = (id: string) => {
    if (isActiveNoteEmpty(id)) {
      onDeleteNote(id);
    } else {
      onCloseNote(id);
    }
  };

  // Modal close (header X): delete the active note if empty, then close.
  const handleModalClose = () => {
    if (activeNoteId && isActiveNoteEmpty(activeNoteId)) {
      onDeleteNote(activeNoteId);
    }
    onClose();
  };

  const handleConfirmDelete = () => {
    if (activeNoteId) {
      onDeleteNote(activeNoteId);
    }
    setConfirmDeleteOpen(false);
  };

  const style: React.CSSProperties = {
    position: "fixed",
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
    zIndex: 9999,
  };

  return (
    <div
      style={style}
      className="flex flex-col bg-card border rounded-lg shadow-xl overflow-hidden"
    >
      <NotesEditorTitleBar
        openNotes={openNotes}
        activeNoteId={activeNoteId}
        editor={editor}
        isMaximized={isMaximized}
        isHalfScreen={isHalfScreen}
        onDragStart={handleDragStart}
        onToggleMaximize={toggleMaximize}
        onToggleHalfScreen={toggleHalfScreen}
        onActivateNote={onActivateNote}
        onTabClose={handleTabClose}
        onCreateNote={onCreateNote}
        onModalClose={handleModalClose}
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

        {/* Resize handle */}
        {!isMaximized && !isHalfScreen && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
            onMouseDown={handleResizeStart}
          >
            <svg
              className="w-3 h-3 text-muted-foreground/50 absolute bottom-0.5 right-0.5"
              viewBox="0 0 12 12"
              fill="currentColor"
            >
              <circle cx="9" cy="9" r="1.5" />
              <circle cx="5" cy="9" r="1.5" />
              <circle cx="9" cy="5" r="1.5" />
            </svg>
          </div>
        )}
      </div>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm z-[10000]">
          <DialogHeader>
            <DialogTitle>Supprimer cette note ?</DialogTitle>
            <DialogDescription>
              Cette action est définitive. La note sera supprimée du disque.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              <Trash2 className="w-4 h-4 mr-1" />
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
