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
    <div className="shrink-0 border-t bg-muted/20 px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
        <Link2 className="w-3 h-3" />
        {t("notes.link.mentionedIn", { count: backlinks.length })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {backlinks.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => onOpen(note.id)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-background border hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <FileText className="w-3 h-3 text-muted-foreground" />
            <span className="truncate max-w-[12rem]">
              {note.title || t("notes.editor.untitled")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
