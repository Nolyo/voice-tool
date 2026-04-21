import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { Check, Copy, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiActionMenu } from "@/components/notes/AiActionMenu";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

/** Wait this long after the last keystroke before showing "Sauvegardée". */
const SAVE_BADGE_APPEAR_MS = 2000;
/** Then leave the badge on screen this long before fading it back out. */
const SAVE_BADGE_VISIBLE_MS = 2000;

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
  onRequestDelete: () => void;
}

export function NotesEditorFooter({
  editor,
  hasActiveNote,
  loadedNoteId,
  activeNoteId,
  isAiLoading,
  onAiAction,
  onRequestDelete,
}: NotesEditorFooterProps) {
  const { t } = useTranslation();
  const { copy, justCopied } = useCopyToClipboard();
  const [wordCount, setWordCount] = useState(0);
  const [showSaveBadge, setShowSaveBadge] = useState(false);
  const appearTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  // Transient "Sauvegardée" badge: reveal it after a meaningful idle window
  // (so it confirms "you paused, your work is on disk"), then fade it out.
  // A keystroke during the visible window hides it immediately — the user
  // is back in flow and shouldn't see a lingering status pill.
  useEffect(() => {
    if (!editor || !isEditorInSync) {
      clearTimeout(appearTimerRef.current);
      clearTimeout(hideTimerRef.current);
      setShowSaveBadge(false);
      return;
    }
    const handleUpdate = () => {
      clearTimeout(appearTimerRef.current);
      clearTimeout(hideTimerRef.current);
      setShowSaveBadge(false);
      appearTimerRef.current = setTimeout(() => {
        setShowSaveBadge(true);
        hideTimerRef.current = setTimeout(
          () => setShowSaveBadge(false),
          SAVE_BADGE_VISIBLE_MS,
        );
      }, SAVE_BADGE_APPEAR_MS);
    };
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      clearTimeout(appearTimerRef.current);
      clearTimeout(hideTimerRef.current);
      setShowSaveBadge(false);
    };
  }, [editor, isEditorInSync]);

  const editorText = editor?.getText() ?? "";

  const handleCopy = async () => {
    if (!editor) return;
    await copy(editorText, { html: editor.getHTML() });
  };

  return (
    <div className="notes-footer">
      {hasActiveNote && (
        <>
          {showSaveBadge && (
            <>
              <span className="footer-save footer-save-transient">
                <span className="save-led" />
                <span>
                  {t("notes.footer.saved", { defaultValue: "Sauvegardée" })}
                </span>
              </span>
              <span className="footer-dot" aria-hidden />
            </>
          )}
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
              <span>{justCopied ? t("common.copied") : t("common.copy")}</span>
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
