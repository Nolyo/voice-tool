import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { Loader2 } from "lucide-react";
import type { useAiAssistant } from "@/hooks/useAiAssistant";
import type { useLinkEditor } from "@/hooks/useLinkEditor";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { NotesEditorAiPreview } from "./NotesEditorAiPreview";

interface NotesEditorContentProps {
  editor: Editor | null;
  hasActiveNote: boolean;
  isLoadingContent: boolean;
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
  ai,
  linkEditor,
}: NotesEditorContentProps) {
  if (!hasActiveNote) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Aucune note ouverte
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

  return (
    <div className="flex-1 relative overflow-auto">
      {isLoadingContent ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {editor && <EditorBubbleMenu editor={editor} linkEditor={linkEditor} />}
          <EditorContent
            editor={editor}
            className="h-full [&_.tiptap]:h-full [&_.tiptap]:overflow-auto [&_.tiptap_img]:max-w-full [&_.tiptap_img]:h-auto [&_.tiptap_img]:rounded-md [&_.tiptap_img]:my-2 [&_.tiptap_a]:cursor-text"
          />
        </>
      )}
      {ai.state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-muted-foreground bg-card/80 px-3 py-1.5 rounded-md">
            Traitement en cours...
          </span>
        </div>
      )}
    </div>
  );
}
