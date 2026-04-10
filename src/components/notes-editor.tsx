import { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, Copy, Maximize2, Minimize2, Columns2, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type NoteMeta, type NoteData, deriveTitle } from "@/hooks/useNotes";
import { useAiProcess } from "@/hooks/useAiProcess";
import { AiActionMenu } from "@/components/ai-action-menu";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";

interface NotesEditorProps {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  onActivateNote: (id: string) => void;
  onCloseNote: (id: string) => void;
  onUpdateNote: (id: string, content: string, title: string) => void;
  onCreateNote: () => void;
  onCopyContent: (text: string) => void;
  onClose: () => void;
  apiKey: string;
  readNote: (id: string) => Promise<NoteData>;
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
  apiKey,
  readNote,
}: NotesEditorProps) {
  const [position, setPosition] = useState(() => ({
    x: Math.max(0, (window.innerWidth - DEFAULT_WIDTH) / 2),
    y: Math.max(0, (window.innerHeight - DEFAULT_HEIGHT) / 2),
  }));
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHalfScreen, setIsHalfScreen] = useState(false);
  const [preMaxState, setPreMaxState] = useState<{
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeNoteIdRef = useRef(activeNoteId);
  const loadedNoteIdRef = useRef<string | null>(null);

  const { state: aiState, result: aiResult, error: aiError, processText, accept, dismiss } = useAiProcess();
  const [aiOriginalText, setAiOriginalText] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder: "Commencez à écrire...",
      }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none w-full h-full p-4 focus:outline-none text-foreground text-sm leading-relaxed",
      },
      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target as HTMLElement;
          const link = target.closest("a");
          if (!link) return false;

          event.preventDefault();

          if (event.ctrlKey || event.metaKey) {
            const href = link.getAttribute("href");
            if (href) {
              import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(href));
            }
          }
          return true;
        },
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) handleImageFile(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        for (const file of files) {
          if (file.type.startsWith("image/")) {
            event.preventDefault();
            handleImageFile(file);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimerRef.current);
      const noteId = activeNoteIdRef.current;
      saveTimerRef.current = setTimeout(() => {
        if (noteId) {
          const html = editor.getHTML();
          const title = deriveTitle(html);
          onUpdateNote(noteId, html, title);
        }
      }, 500);
    },
  });

  const handleImageFile = useCallback((file: File) => {
    if (!editor) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result;
      if (typeof dataUri === "string") {
        editor.chain().focus().setImage({ src: dataUri }).run();
      }
    };
    reader.onerror = () => {
      console.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  }, [editor]);

  // Load content when active note changes
  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;

    if (!activeNoteId || !editor) return;

    // Don't reload if already loaded
    if (loadedNoteIdRef.current === activeNoteId) return;

    setIsLoadingContent(true);
    readNote(activeNoteId)
      .then((data) => {
        editor.commands.setContent(data.content);
        loadedNoteIdRef.current = activeNoteId;
      })
      .catch((err) => {
        console.error("Failed to load note:", err);
        editor.commands.setContent("");
      })
      .finally(() => setIsLoadingContent(false));
  }, [activeNoteId, editor, readNote]);

  // Reset loaded note when tab is closed
  useEffect(() => {
    const openIds = new Set(openNotes.map(n => n.id));
    if (loadedNoteIdRef.current && !openIds.has(loadedNoteIdRef.current)) {
      loadedNoteIdRef.current = null;
    }
  }, [openNotes]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (aiState !== "error") return;
    const timer = setTimeout(() => dismiss(), 5000);
    return () => clearTimeout(timer);
  }, [aiState, dismiss]);

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
    if (isMaximized || isHalfScreen) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (isMaximized || isHalfScreen) return;
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
      setIsHalfScreen(false);
    } else {
      setPreMaxState({ position, size });
      setPosition({ x: 0, y: 0 });
      setSize({ width: window.innerWidth, height: window.innerHeight });
      setIsMaximized(true);
      setIsHalfScreen(false);
    }
  };

  const toggleHalfScreen = () => {
    if (isHalfScreen) {
      if (preMaxState) {
        setPosition(preMaxState.position);
        setSize(preMaxState.size);
      }
      setIsHalfScreen(false);
    } else {
      setPreMaxState({ position, size });
      const halfW = Math.round(window.innerWidth / 2);
      const halfH = Math.round(window.innerHeight * 0.75);
      setSize({ width: halfW, height: halfH });
      setPosition({
        x: Math.round((window.innerWidth - halfW) / 2),
        y: Math.round((window.innerHeight - halfH) / 2),
      });
      setIsHalfScreen(true);
      setIsMaximized(false);
    }
  };

  const handleAiAction = (systemPrompt: string) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const text = hasSelection
      ? editor.state.doc.textBetween(from, to)
      : editor.getText();
    setAiOriginalText(text);
    processText(text, systemPrompt, apiKey);
  };

  const handleAccept = () => {
    if (!editor) return;
    const text = accept();
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    if (hasSelection) {
      editor.chain().focus().deleteSelection().insertContent(text).run();
    } else {
      editor.commands.setContent(`<p>${text}</p>`);
    }
  };

  const activeNote = openNotes.find((n) => n.id === activeNoteId);
  const editorText = editor?.getText() ?? "";

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
        {/* Close */}
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
                {note.id === activeNoteId && editorText
                  ? deriveTitle(editor?.getHTML() ?? "")
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

        {/* Half screen */}
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 shrink-0 ${isHalfScreen ? "text-primary" : "text-foreground"}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleHalfScreen}
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
        aiState === "preview" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Preview toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-primary/10 border-b">
              <span className="text-xs text-primary font-medium">
                Aperçu du résultat
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1 text-primary hover:text-primary"
                  onClick={handleAccept}
                >
                  <Check className="w-3.5 h-3.5" />
                  Accepter
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1 text-muted-foreground"
                  onClick={dismiss}
                >
                  <X className="w-3.5 h-3.5" />
                  Annuler
                </Button>
              </div>
            </div>
            {/* Split view: original + result */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Original */}
              <div className="flex-1 min-h-0 flex flex-col border-b">
                <div className="px-3 py-1 bg-muted/40 border-b">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Original</span>
                </div>
                <div className="flex-1 overflow-auto p-3 text-foreground/50 text-sm leading-relaxed whitespace-pre-wrap">
                  {aiOriginalText}
                </div>
              </div>
              {/* Result */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="px-3 py-1 bg-primary/5 border-b">
                  <span className="text-[10px] uppercase tracking-wider text-primary font-medium">Résultat</span>
                </div>
                <div className="flex-1 overflow-auto p-3 bg-primary/5 text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {aiResult}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative overflow-auto">
            {isLoadingContent ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <EditorContent
                editor={editor}
                className="h-full [&_.tiptap]:h-full [&_.tiptap]:overflow-auto [&_.tiptap_img]:max-w-full [&_.tiptap_img]:h-auto [&_.tiptap_img]:rounded-md [&_.tiptap_img]:my-2 [&_.tiptap_a]:cursor-text"
              />
            )}
            {aiState === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm text-muted-foreground bg-card/80 px-3 py-1.5 rounded-md">
                  Traitement en cours...
                </span>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Aucune note ouverte
        </div>
      )}

      {/* Error banner */}
      {aiState === "error" && aiError && (
        <div
          className="px-3 py-1.5 text-xs text-destructive bg-destructive/10 border-t border-destructive/20 cursor-pointer"
          onClick={dismiss}
        >
          {aiError}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30 shrink-0">
        <span className="text-xs text-foreground/50">
          Ctrl + F12 pour dicter
        </span>
        <div className="flex items-center gap-1">
          {activeNote && (
            <>
              <AiActionMenu
                onAction={handleAiAction}
                isLoading={aiState === "loading"}
                disabled={!editorText.trim()}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-foreground"
                onClick={async () => {
                  if (!editor) return;
                  try {
                    const html = editor.getHTML();
                    const blob = new Blob([html], { type: "text/html" });
                    const textBlob = new Blob([editorText], { type: "text/plain" });
                    await navigator.clipboard.write([
                      new ClipboardItem({
                        "text/html": blob,
                        "text/plain": textBlob,
                      }),
                    ]);
                  } catch {
                    onCopyContent(editorText);
                  }
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                Copier
              </Button>
            </>
          )}
        </div>

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
    </div>
  );
}
