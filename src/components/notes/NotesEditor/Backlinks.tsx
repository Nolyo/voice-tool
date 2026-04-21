import { useTranslation } from "react-i18next";
import { FileText, Link2 } from "lucide-react";
import { useBacklinks } from "@/hooks/useBacklinks";

interface BacklinksProps {
  noteId: string | null;
  refreshKey: number;
  onOpen: (id: string) => void;
}

export function Backlinks({ noteId, refreshKey, onOpen }: BacklinksProps) {
  const { t } = useTranslation();
  const { backlinks } = useBacklinks(noteId, refreshKey);

  if (!noteId || backlinks.length === 0) {
    return null;
  }

  return (
    <div className="notes-backlinks">
      <div className="notes-backlinks-head">
        <Link2 className="w-3 h-3" />
        <span>{t("notes.link.mentionedIn", { count: backlinks.length })}</span>
      </div>
      <div className="notes-backlinks-list">
        {backlinks.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => onOpen(note.id)}
            className="notes-backlink-chip"
          >
            <FileText className="w-3 h-3" style={{ color: "var(--vt-fg-4)", flex: "none" }} />
            <span>{note.title || t("notes.editor.untitled")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
