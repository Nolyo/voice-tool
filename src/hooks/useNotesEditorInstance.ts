import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import i18n from "@/i18n";
import { type NoteData, type NoteMeta, deriveTitle } from "@/hooks/useNotes";
import { NoteLink } from "@/components/notes/NotesEditor/NoteLinkExtension";
import { buildNoteLinkSuggestion } from "@/components/notes/NotesEditor/NoteLinkSuggestion";

/** Layout the editor falls back to when a note has no persisted content.
 *  Surfaces a visible "title slot" so new users grasp the first-line-is-title
 *  convention without reading docs. Empty H1 + empty P produce no text nodes,
 *  so `editor.getText()` still returns `""` and the "delete-on-close-empty"
 *  policy in NotesEditor keeps working unchanged. */
const EMPTY_NOTE_SEED = "<h1></h1><p></p>";

/** Content strings that should be treated as "empty" and replaced by the
 *  seed. Covers the backend's literal empty file, whitespace, and the
 *  single-paragraph shape TipTap serialises for an empty doc. */
function isBlankContent(raw: string): boolean {
  if (!raw) return true;
  const stripped = raw.replace(/\s+/g, "");
  return stripped === "" || stripped === "<p></p>";
}

interface UseNotesEditorInstanceOptions {
  openNotes: NoteMeta[];
  activeNoteId: string | null;
  readNote: (id: string) => Promise<NoteData>;
  onUpdateNote: (id: string, content: string, title: string) => void;
  /**
   * Returns the *current* notes list + active note id for the @-suggestion
   * popup. Must stay identity-stable across renders; internally we read from
   * a ref so it's always fresh without rebuilding the editor.
   */
  getNoteLinkRefs: () => { notes: NoteMeta[]; activeNoteId: string | null };
  /** Bumped every time the active note's content is saved — used by the
   *  parent to refresh the backlinks panel when the user adds/removes links. */
  onContentSaved?: () => void;
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
  getNoteLinkRefs,
  onContentSaved,
}: UseNotesEditorInstanceOptions) {
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  // `loadedNoteId` is exposed to renderers so they can gate any UI that
  // derives from the editor's current document (live tab title, word count)
  // until TipTap has actually ingested the active note's content. Without
  // this, clicking a tab shows the previous note's title/word-count for one
  // paint because `activeNoteId` flips before `readNote()` resolves.
  const [loadedNoteId, setLoadedNoteId] = useState<string | null>(null);
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
        // Show placeholders on every empty node (not just the focused one)
        // so the seeded <h1> and <p> both display hints before the user
        // touches the doc.
        showOnlyCurrent: false,
        placeholder: ({ node, editor, pos }) => {
          const { doc } = editor.state;
          // Node at position 0 is the first child of the doc.
          if (pos === 0 && node.type.name === "heading" && node.attrs.level === 1) {
            return i18n.t("notes.editor.titlePlaceholder", {
              defaultValue: "Titre de la note",
            });
          }
          // The slot directly after an opening H1 gets the body hint.
          const first = doc.firstChild;
          if (
            first &&
            first.type.name === "heading" &&
            pos === first.nodeSize &&
            node.type.name === "paragraph"
          ) {
            return i18n.t("notes.editor.bodyPlaceholder", {
              defaultValue: "Commencez à écrire…",
            });
          }
          return "";
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      NoteLink.configure({
        HTMLAttributes: {},
        suggestion: buildNoteLinkSuggestion(getNoteLinkRefs),
      }),
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
          onContentSaved?.();
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
    // Clear the loaded flag so consumers don't trust the editor's document
    // while it still holds the previous note's content.
    setLoadedNoteId(null);
    readNote(activeNoteId)
      .then((data) => {
        // Swap empty/blank content for a title+body scaffold so new users
        // discover the "first line = title" convention visually. The seed
        // contains no text nodes, so `getText()` stays empty and the
        // auto-delete-on-close-empty policy is untouched.
        const blank = isBlankContent(data.content);
        const content = blank ? EMPTY_NOTE_SEED : data.content;
        // `emitUpdate: false` is critical: TipTap v3 defaults to emitting an
        // update event on setContent, which would schedule a debounced save
        // right after loading — re-writing the just-read content to disk and
        // potentially clobbering attributes that weren't round-tripped cleanly.
        editor.commands.setContent(content, { emitUpdate: false });
        // Drop the caret inside the empty H1 so the user can start typing
        // a title immediately. `focus()` emits selectionUpdate, not update,
        // so it doesn't trigger a save.
        if (blank) {
          editor.commands.focus("start");
        }
        loadedNoteIdRef.current = activeNoteId;
        setLoadedNoteId(activeNoteId);
      })
      .catch((err) => {
        console.error("Failed to load note:", err);
        editor.commands.setContent("", { emitUpdate: false });
      })
      .finally(() => setIsLoadingContent(false));
  }, [activeNoteId, editor, readNote]);

  // Reset loaded note when tab is closed
  useEffect(() => {
    const openIds = new Set(openNotes.map((n) => n.id));
    if (loadedNoteIdRef.current && !openIds.has(loadedNoteIdRef.current)) {
      loadedNoteIdRef.current = null;
      setLoadedNoteId(null);
    }
  }, [openNotes]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Synchronously cancel any pending debounced save and write the current
  // editor HTML to disk under the active note id. Needed before swapping the
  // active note (e.g. recreate-from-broken-link flow) so the pending write
  // isn't replaced by the new note's content when the timer fires.
  const flushSave = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    const noteId = activeNoteIdRef.current;
    if (noteId && editor) {
      const html = editor.getHTML();
      const title = deriveTitle(html);
      onUpdateNote(noteId, html, title);
      onContentSaved?.();
    }
  }, [editor, onUpdateNote, onContentSaved]);

  return { editor, isLoadingContent, loadedNoteId, flushSave };
}
