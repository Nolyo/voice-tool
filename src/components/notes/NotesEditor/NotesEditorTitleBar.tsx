import type { Editor } from "@tiptap/react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type NoteMeta, deriveTitle } from "@/hooks/useNotes";

interface NotesEditorTitleBarProps {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  editor: Editor | null;
  onActivateNote: (id: string) => void;
  onTabClose: (id: string) => void;
  onCreateNote: () => void;
}

export function NotesEditorTitleBar({
  openNotes,
  activeNoteId,
  editor,
  onActivateNote,
  onTabClose,
  onCreateNote,
}: NotesEditorTitleBarProps) {
  const editorText = editor?.getText() ?? "";

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
          title="Nouvelle note"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
