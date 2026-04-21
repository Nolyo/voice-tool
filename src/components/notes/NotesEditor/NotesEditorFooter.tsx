import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { Check, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { AiActionMenu } from "@/components/notes/AiActionMenu";

interface NotesEditorFooterProps {
  editor: Editor | null;
  hasActiveNote: boolean;
  /** Id of the note TipTap is currently displaying. */
  loadedNoteId: string | null;
  /** Id of the note the user selected (may trail `loadedNoteId` during a
   *  tab switch while `readNote()` resolves). */
  activeNoteId: string | null;
  isAiLoading: boolean;
  onAiAction: (systemPrompt: string) => void;
  onCopyContent: (text: string) => void;
  onRequestDelete: () => void;
}

export function NotesEditorFooter({
  editor,
  hasActiveNote,
  loadedNoteId,
  activeNoteId,
  isAiLoading,
  onAiAction,
  onCopyContent,
  onRequestDelete,
}: NotesEditorFooterProps) {
  const { t } = useTranslation();
  const [justCopied, setJustCopied] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  const isEditorInSync =
    loadedNoteId !== null && loadedNoteId === activeNoteId;

  useEffect(() => {
    if (!editor || !isEditorInSync) {
      setWordCount(0);
      return;
    }
    const recompute = () => {
      const text = editor.getText().trim();
      setWordCount(text ? text.split(/\s+/).length : 0);
    };
    recompute();
    editor.on("update", recompute);
    editor.on("selectionUpdate", recompute);
    return () => {
      editor.off("update", recompute);
      editor.off("selectionUpdate", recompute);
    };
  }, [editor, isEditorInSync]);

  const editorText = editor?.getText() ?? "";

  const handleCopy = async () => {
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
    setJustCopied(true);
    toast.success(t("notes.editor.copiedToClipboard"));
    clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = setTimeout(() => setJustCopied(false), 1500);
  };

  return (
    <div className="notes-footer">
      <span className="inline-flex items-center gap-1.5">
        <kbd className="vt-kbd">Ctrl + F12</kbd>
        <span>{t("notes.footer.dictateInline", { defaultValue: "pour dicter dans la note" })}</span>
      </span>

      {hasActiveNote && (
        <>
          <span className="footer-dot" aria-hidden />
          <span className="footer-save">
            <span className="save-led" />
            <span>{t("notes.footer.saved", { defaultValue: "Sauvegardée" })}</span>
          </span>
          <span className="footer-dot" aria-hidden />
          <span className="vt-mono">
            {t("notes.footer.wordCount", {
              count: wordCount,
              defaultValue: `${wordCount} mots`,
            })}
          </span>
        </>
      )}

      <div className="notes-footer-actions">
        {hasActiveNote && (
          <>
            <AiActionMenu
              onAction={onAiAction}
              isLoading={isAiLoading}
              disabled={!editorText.trim()}
            />
            <button
              type="button"
              className="footer-action"
              onClick={handleCopy}
              disabled={!editorText.trim()}
            >
              {justCopied ? (
                <Check className="w-3 h-3" style={{ color: "var(--vt-ok)" }} />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>{justCopied ? t("notes.editor.copied") : t("common.copy")}</span>
            </button>
            <button
              type="button"
              className="footer-action is-danger"
              onClick={onRequestDelete}
              title={t("notes.editor.deleteNote")}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
