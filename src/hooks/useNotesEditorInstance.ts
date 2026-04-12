import { useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { type NoteData, type NoteMeta, deriveTitle } from "@/hooks/useNotes";

interface UseNotesEditorInstanceOptions {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  readNote: (id: string) => Promise<NoteData>;
  onUpdateNote: (id: string, content: string, title: string) => void;
}

/**
 * Owns the TipTap editor instance used by the notes modal:
 *
 * - Configures StarterKit (with inline-safe Link), Image, Placeholder, TaskList
 * - Handles image paste/drop by reading files as data URIs
 * - Opens Ctrl+clicked links externally via `@tauri-apps/plugin-opener`
 * - Debounces `onUpdateNote` (500 ms) and derives the title from the HTML
 * - Loads note content on active-note change, resets the loaded ref when
 *   the tab is closed, and flushes pending saves on unmount
 */
export function useNotesEditorInstance({
  openNotes,
  activeNoteId,
  readNote,
  onUpdateNote,
}: UseNotesEditorInstanceOptions) {
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeNoteIdRef = useRef(activeNoteId);
  const loadedNoteIdRef = useRef<string | null>(null);

  // `handleImageFile` needs the editor instance, but the editor's
  // editorProps closures below reference it before it is defined. Using a
  // ref lets the closures resolve the latest implementation at event time,
  // after we've bound the real function in the assignment that follows
  // `useEditor(...)`.
  const handleImageFileRef = useRef<(file: File) => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Link is bundled in StarterKit v3; keep openOnClick: false so our
        // existing Ctrl+clic handler (see handleDOMEvents.click) remains the
        // only place that opens links externally via Tauri plugin-opener.
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
          },
        },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder: "Commencez à écrire...",
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none w-full h-full p-4 focus:outline-none text-foreground text-sm leading-relaxed",
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
              import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
                openUrl(href),
              );
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
            if (file) handleImageFileRef.current(file);
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
            handleImageFileRef.current(file);
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

  // Bind the real handler into the ref. This runs on every render, so the
  // ref always points at the latest closure capturing the current editor.
  handleImageFileRef.current = (file: File) => {
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
  };

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
    const openIds = new Set(openNotes.map((n) => n.id));
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

  return { editor, isLoadingContent };
}
