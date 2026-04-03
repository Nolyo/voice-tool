import { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, Copy, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Note, deriveTitle } from "@/hooks/useNotes";

interface NotesEditorProps {
  openNotes: Note[];
  activeNoteId: string | null;
  onActivateNote: (id: string) => void;
  onCloseNote: (id: string) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onCreateNote: () => void;
  onCopyContent: (text: string) => void;
  onClose: () => void;
}

const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 400;

export function NotesEditor({
  openNotes,
  activeNoteId,
  onActivateNote,
  onCloseNote,
  onUpdateNote,
  onCreateNote,
  onCopyContent,
  onClose,
}: NotesEditorProps) {
  const [position, setPosition] = useState(() => ({
    x: Math.max(0, (window.innerWidth - DEFAULT_WIDTH) / 2),
    y: Math.max(0, (window.innerHeight - DEFAULT_HEIGHT) / 2),
  }));
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaxState, setPreMaxState] = useState<{
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null>(null);

  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [localContent, setLocalContent] = useState<string>("");
  const activeNoteIdRef = useRef(activeNoteId);

  const activeNote = openNotes.find((n) => n.id === activeNoteId);

  // Sync local content when active note changes
  useEffect(() => {
    if (activeNote) {
      setLocalContent(activeNote.content);
    }
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId, activeNote]);

  const handleContentChange = useCallback(
    (newContent: string) => {
      setLocalContent(newContent);

      clearTimeout(saveTimerRef.current);
      const noteId = activeNoteIdRef.current;
      saveTimerRef.current = setTimeout(() => {
        if (noteId) {
          const title = deriveTitle(newContent);
          onUpdateNote(noteId, { content: newContent, title });
        }
      }, 500);
    },
    [onUpdateNote],
  );

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Drag handling
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        e.preventDefault();
        setPosition({
          x: e.clientX - dragRef.current.startX + dragRef.current.startPosX,
          y: e.clientY - dragRef.current.startY + dragRef.current.startPosY,
        });
      }
      if (resizeRef.current) {
        e.preventDefault();
        const newW = Math.max(320, resizeRef.current.startW + e.clientX - resizeRef.current.startX);
        const newH = Math.max(250, resizeRef.current.startH + e.clientY - resizeRef.current.startY);
        setSize({ width: newW, height: newH });
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    if (isMaximized) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (isMaximized) return;
    e.stopPropagation();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
  };

  const toggleMaximize = () => {
    if (isMaximized) {
      if (preMaxState) {
        setPosition(preMaxState.position);
        setSize(preMaxState.size);
      }
      setIsMaximized(false);
    } else {
      setPreMaxState({ position, size });
      setPosition({ x: 0, y: 0 });
      setSize({ width: window.innerWidth, height: window.innerHeight });
      setIsMaximized(true);
    }
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
      {/* Title bar */}
      <div
        className="flex items-center gap-1 px-3 py-2 bg-muted/50 border-b select-none shrink-0"
        onMouseDown={handleDragStart}
        onDoubleClick={toggleMaximize}
      >
        {/* Close + Duplicate */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-foreground hover:text-destructive"
          onClick={onClose}
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
                {note.id === activeNoteId && localContent
                  ? deriveTitle(localContent)
                  : note.title}
              </span>
              <button
                className="text-foreground/70 hover:text-destructive shrink-0"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseNote(note.id);
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

        {/* Maximize */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-foreground"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleMaximize}
        >
          {isMaximized ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* Content */}
      {activeNote ? (
        <textarea
          className="flex-1 w-full p-4 bg-transparent text-foreground text-sm leading-relaxed resize-none focus:outline-none placeholder:text-muted-foreground"
          placeholder="Commencez à écrire..."
          value={localContent}
          onChange={(e) => handleContentChange(e.target.value)}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Aucune note ouverte
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30 shrink-0">
        <span className="text-xs text-foreground/50">
          Ctrl + F12 pour dicter
        </span>
        <div className="flex items-center gap-1">
          {activeNote && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-foreground"
              onClick={() => onCopyContent(localContent)}
            >
              <Copy className="w-3.5 h-3.5" />
              Copier
            </Button>
          )}
        </div>

        {/* Resize handle */}
        {!isMaximized && (
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
    </div>
  );
}
