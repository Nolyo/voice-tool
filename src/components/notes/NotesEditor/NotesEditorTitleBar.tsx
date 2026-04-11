import type { Editor } from "@tiptap/react";
import { Columns2, Maximize2, Minimize2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type NoteMeta, deriveTitle } from "@/hooks/useNotes";

interface NotesEditorTitleBarProps {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  editor: Editor | null;
  isMaximized: boolean;
  isHalfScreen: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onToggleMaximize: () => void;
  onToggleHalfScreen: () => void;
  onActivateNote: (id: string) => void;
  onTabClose: (id: string) => void;
  onCreateNote: () => void;
  onModalClose: () => void;
}

export function NotesEditorTitleBar({
  openNotes,
  activeNoteId,
  editor,
  isMaximized,
  isHalfScreen,
  onDragStart,
  onToggleMaximize,
  onToggleHalfScreen,
  onActivateNote,
  onTabClose,
  onCreateNote,
  onModalClose,
}: NotesEditorTitleBarProps) {
  const editorText = editor?.getText() ?? "";

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 bg-muted/50 border-b select-none shrink-0"
      onMouseDown={onDragStart}
      onDoubleClick={onToggleMaximize}
    >
      {/* Close */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-foreground hover:text-destructive"
        onClick={onModalClose}
      >
        <X className="w-3.5 h-3.5" />
      </Button>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto ml-1">
        {openNotes.map((note) => (
          <div
            key={note.id}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer shrink-0 max-w-[140px] ${
              note.id === activeNoteId
                ? "bg-background text-foreground"
                : "text-foreground/60 hover:text-foreground hover:bg-background/50"
            }`}
            onMouseDown={(e) => {
              e.stopPropagation();
              onActivateNote(note.id);
            }}
          >
            <span className="truncate">
              {note.id === activeNoteId && editorText
                ? deriveTitle(editor?.getHTML() ?? "")
                : note.title}
            </span>
            <button
              className="text-foreground/70 hover:text-destructive shrink-0"
              onMouseDown={(e) => e.stopPropagation()}
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
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onCreateNote}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Half screen */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 shrink-0 ${
          isHalfScreen ? "text-primary" : "text-foreground"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onToggleHalfScreen}
        title="Demi-écran"
      >
        <Columns2 className="w-3.5 h-3.5" />
      </Button>

      {/* Maximize */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0 text-foreground"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onToggleMaximize}
      >
        {isMaximized ? (
          <Minimize2 className="w-3.5 h-3.5" />
        ) : (
          <Maximize2 className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  );
}
