import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { FileText, Loader2 } from "lucide-react";
import type { useAiAssistant } from "@/hooks/useAiAssistant";
import type { useLinkEditor } from "@/hooks/useLinkEditor";
import type { NoteMeta } from "@/hooks/useNotes";
import type { FolderMeta } from "@/hooks/useFolders";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { TableFloatingToolbar } from "./TableFloatingToolbar";
import { NotesEditorAiPreview } from "./NotesEditorAiPreview";
import { NotesEditorHeader } from "./NotesEditorHeader";

interface NotesEditorContentProps {
  editor: Editor | null;
  hasActiveNote: boolean;
  isLoadingContent: boolean;
  loadedNoteId: string | null;
  activeNote: NoteMeta | null;
  activeFolder: FolderMeta | null;
  ai: ReturnType<typeof useAiAssistant>;
  linkEditor: ReturnType<typeof useLinkEditor>;
}

/**
 * Content slot that dispatches between the AI preview, the TipTap editor
 * (with bubble menu), a loading spinner, and the empty state.
 */
export function NotesEditorContent({
  editor,
  hasActiveNote,
  isLoadingContent,
  loadedNoteId,
  activeNote,
  activeFolder,
  ai,
  linkEditor,
}: NotesEditorContentProps) {
  const { t } = useTranslation();

  if (!hasActiveNote) {
    return (
      <div className="notes-empty vt-anim-fade-up">
        <div className="notes-empty-icon">
          <FileText className="w-5 h-5" />
        </div>
        <span className="vt-display text-[15px]" style={{ color: "var(--vt-fg-2)" }}>
          {t("notes.editor.noNote")}
        </span>
      </div>
    );
  }

  if (ai.state === "preview") {
    return (
      <NotesEditorAiPreview
        originalText={ai.originalText}
        result={ai.result}
        onAccept={ai.accept}
        onDismiss={ai.dismiss}
      />
    );
  }

  // The editor's document trails the active note for one paint after a tab
  // click (until `readNote()` resolves and `setContent()` runs). Only trust
  // editor-derived UI when `loadedNoteId` confirms the sync.
  const isEditorInSync =
    loadedNoteId !== null && activeNote !== null && loadedNoteId === activeNote.id;

  return (
    <div className="flex-1 relative overflow-auto" style={{ background: "var(--vt-bg)" }}>
      {/* Header stays mounted during loading so it doesn't flicker in/out on
          tab switch. It gates its own editor-derived bits on `isEditorInSync`. */}
      <NotesEditorHeader
        note={activeNote}
        folder={activeFolder}
        editor={editor}
        isEditorInSync={isEditorInSync}
      />
      {isLoadingContent ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--vt-fg-4)" }} />
        </div>
      ) : (
        <>
          {editor && <EditorBubbleMenu editor={editor} linkEditor={linkEditor} />}
          {editor && <TableFloatingToolbar editor={editor} />}
          <EditorContent
            editor={editor}
            className="[&_.tiptap_img]:max-w-full [&_.tiptap_img]:h-auto [&_.tiptap_img]:rounded-md [&_.tiptap_img]:my-2 [&_.tiptap_a]:cursor-text"
          />
        </>
      )}
      {ai.state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-[12px] px-3 py-1.5 rounded-md"
            style={{
              color: "var(--vt-fg-2)",
              background: "oklch(from var(--vt-panel-2) l c h / 0.9)",
              border: "1px solid var(--vt-border)",
            }}
          >
            {t("notes.editor.processing")}
          </span>
        </div>
      )}
    </div>
  );
}
