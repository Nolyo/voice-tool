import { useMemo } from "react";
import { ArrowRight, FileText, Plus, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useDateFormatters } from "@/lib/date-format";
import type { NoteMeta } from "@/hooks/useNotes";

interface RecentNotesCardProps {
  notes: NoteMeta[];
  onOpenNote: (note: NoteMeta) => void;
  onCreateNote: () => void;
  onViewAllNotes: () => void;
}

const MAX_RECENT = 5;

/**
 * Compact list of the most recently edited notes on the home screen. Renders
 * small clickable cards (title + relative date), not the note bodies. Sorted
 * by updatedAt desc. Empty state offers a create-note CTA.
 */
export function RecentNotesCard({
  notes,
  onOpenNote,
  onCreateNote,
  onViewAllNotes,
}: RecentNotesCardProps) {
  const { t } = useTranslation();
  const { dayLabel } = useDateFormatters();

  const recent = useMemo(
    () =>
      [...notes]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, MAX_RECENT),
    [notes],
  );

  return (
    <div className="vt-card-elevated p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--vt-fg-3)]" />
          <h3 className="vt-display text-[15px] font-semibold text-[var(--vt-fg)]">
            {t("home.recentNotes.title")}
          </h3>
        </div>
        {recent.length > 0 && (
          <button
            type="button"
            onClick={onViewAllNotes}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--vt-accent)] hover:underline cursor-pointer"
          >
            {t("home.recentNotes.viewAll")}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <div className="mt-4 flex flex-col items-center text-center py-6">
          <p className="text-[13px] text-[var(--vt-fg-3)]">
            {t("home.recentNotes.empty")}
          </p>
          <Button className="mt-3" size="sm" variant="outline" onClick={onCreateNote}>
            <Plus className="w-4 h-4" />
            {t("home.recentNotes.createCta")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {recent.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onOpenNote(note)}
              className="group flex items-center gap-3 text-left px-3 py-2.5 rounded-lg bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-colors cursor-pointer min-w-0"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--vt-surface)] shrink-0">
                <FileText className="w-3.5 h-3.5 text-[var(--vt-fg-3)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate text-[13px] font-medium text-[var(--vt-fg)]">
                    {note.title?.trim() || t("notes.editor.untitled")}
                  </span>
                  {note.favorite && (
                    <Star className="w-3 h-3 shrink-0 fill-[var(--vt-warn)] text-[var(--vt-warn)]" />
                  )}
                </div>
                <span className="text-[11.5px] text-[var(--vt-fg-3)]">
                  {note.updatedAt ? dayLabel(new Date(note.updatedAt)) : ""}
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--vt-fg-3)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
