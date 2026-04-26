import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { Clock, Folder } from "lucide-react";
import { type NoteMeta } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";

interface NotesEditorHeaderProps {
  note: NoteMeta | null;
  folder: FolderMeta | null;
  editor: Editor | null;
  /** `false` while the editor is still loading a tab switch — suppresses the
   *  word count so it doesn't briefly show the previous note's count. */
  isEditorInSync: boolean;
}

function formatRelative(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return t("notes.header.justNow", { defaultValue: "À l'instant" });
  if (diffMin < 60)
    return t("notes.header.minutesAgo", {
      count: diffMin,
      defaultValue: `Il y a ${diffMin} min`,
    });
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24)
    return t("notes.header.hoursAgo", {
      count: diffHour,
      defaultValue: `Il y a ${diffHour} h`,
    });
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7)
    return t("notes.header.daysAgo", {
      count: diffDay,
      defaultValue: `Il y a ${diffDay} j`,
    });
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NotesEditorHeader({ note, folder, editor, isEditorInSync }: NotesEditorHeaderProps) {
  const { t } = useTranslation();
  const [wordCount, setWordCount] = useState(0);

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

  const readingTime = Math.max(1, Math.ceil(wordCount / 220));
  const folderLabel = folder?.name ?? t("notes.folders.unfiled");
  const titlePreview = note?.title || t("notes.editor.untitled");
  const updated = note?.updatedAt ? formatRelative(note.updatedAt, t) : "";

  return (
    <div className="note-doc-header">
      <div className="note-breadcrumb">
        <Folder className="note-breadcrumb-icon w-3 h-3" />
        <span>{folderLabel}</span>
        <span className="note-breadcrumb-sep">/</span>
        <span className="note-breadcrumb-current truncate max-w-[340px]">
          {titlePreview}
        </span>
      </div>

      <div className="note-meta">
        {updated && (
          <span className="note-meta-item">
            <Clock className="w-3 h-3" />
            <span>{updated}</span>
          </span>
        )}
        {wordCount > 0 && (
          <>
            <span className="dot" aria-hidden />
            <span className="note-meta-item">
              <span className="vt-mono">
                {t("notes.header.wordsAndReading", {
                  count: wordCount,
                  minutes: readingTime,
                  defaultValue: `${wordCount} mots · ${readingTime} min de lecture`,
                })}
              </span>
            </span>
          </>
        )}
      </div>

      <div className="note-doc-divider" />
    </div>
  );
}
