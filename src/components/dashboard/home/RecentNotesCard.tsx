import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileText, Plus, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "./SectionLabel";
import { useDateFormatters } from "@/lib/date-format";
import {
  countWords,
  htmlToText,
  leadingEmoji,
  stripLeadingEmoji,
} from "@/lib/note-text";
import type { NoteData, NoteMeta } from "@/hooks/useNotes";

interface RecentNotesCardProps {
  notes: NoteMeta[];
  readNote: (id: string) => Promise<NoteData>;
  onOpenNote: (note: NoteMeta) => void;
  onCreateNote: () => void;
  onViewAllNotes: () => void;
}

const MAX_RECENT = 5;

interface NoteDetail {
  snippet: string;
  words: number;
}

/**
 * "Recently edited notes" section: a grid of rich cards (icon, title, one-line
 * snippet, relative date + word count) plus a dashed "new note" tile. Snippets
 * and word counts require the note bodies, so we read content for the handful
 * of displayed notes once they (or their updatedAt) change.
 */
export function RecentNotesCard({
  notes,
  readNote,
  onOpenNote,
  onCreateNote,
  onViewAllNotes,
}: RecentNotesCardProps) {
  const { t } = useTranslation();
  const { dayLabel } = useDateFormatters();
  const [details, setDetails] = useState<Record<string, NoteDetail>>({});

  // readNote may not be referentially stable; keep a ref so the effect only
  // re-runs when the visible notes actually change.
  const readNoteRef = useRef(readNote);
  readNoteRef.current = readNote;

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

  const recentKey = recent.map((n) => `${n.id}:${n.updatedAt}`).join("|");

  useEffect(() => {
    if (recent.length === 0) {
      setDetails({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        recent.map(async (n): Promise<[string, NoteDetail]> => {
          try {
            const data = await readNoteRef.current(n.id);
            const text = htmlToText(data.content);
            return [n.id, { snippet: text, words: countWords(text) }];
          } catch {
            return [n.id, { snippet: "", words: 0 }];
          }
        }),
      );
      if (!cancelled) setDetails(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // recentKey captures the displayed notes + their updatedAt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentKey]);

  const viewAll =
    recent.length > 0 ? (
      <button
        type="button"
        onClick={onViewAllNotes}
        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--vt-fg-3)] hover:text-[var(--vt-accent)] transition-colors cursor-pointer normal-case tracking-normal"
      >
        {t("home.recentNotes.viewAll")}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    ) : undefined;

  return (
    <section>
      <SectionLabel action={viewAll}>{t("home.recentNotes.title")}</SectionLabel>

      {recent.length === 0 ? (
        <div className="vt-card-elevated flex flex-col items-center text-center py-8 px-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--vt-accent-soft)] text-[var(--vt-accent)]">
            <FileText className="w-5 h-5" />
          </div>
          <p className="mt-3 text-[13px] text-[var(--vt-fg-3)]">
            {t("home.recentNotes.empty")}
          </p>
          <Button className="mt-3" size="sm" variant="outline" onClick={onCreateNote}>
            <Plus className="w-4 h-4" />
            {t("home.recentNotes.createCta")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recent.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              detail={details[note.id]}
              dateLabel={note.updatedAt ? dayLabel(new Date(note.updatedAt)) : ""}
              onOpen={() => onOpenNote(note)}
            />
          ))}

          <button
            type="button"
            onClick={onCreateNote}
            className="group flex items-center gap-3 p-3.5 rounded-[10px] border border-dashed border-[var(--vt-border-strong)] hover:bg-[var(--vt-surface)] transition-colors text-left cursor-pointer"
          >
            <span className="flex items-center justify-center w-[34px] h-[34px] rounded-[9px] bg-[var(--vt-accent-soft)] text-[var(--vt-accent)] shrink-0">
              <Plus className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-[var(--vt-fg-2)]">
                {t("home.recentNotes.newNote")}
              </div>
              <div className="text-[11px] text-[var(--vt-fg-4)] mt-0.5">
                {t("home.recentNotes.newNoteDesc")}
              </div>
            </div>
          </button>
        </div>
      )}
    </section>
  );
}

function NoteCard({
  note,
  detail,
  dateLabel,
  onOpen,
}: {
  note: NoteMeta;
  detail?: NoteDetail;
  dateLabel: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const rawTitle = note.title?.trim() ?? "";
  const emoji = rawTitle ? leadingEmoji(rawTitle) : null;
  const displayTitle =
    (emoji ? stripLeadingEmoji(rawTitle) : rawTitle) ||
    t("notes.editor.untitled");

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex gap-3 p-3.5 rounded-[10px] border border-[var(--vt-border)] bg-[var(--vt-panel-2)] hover:bg-[var(--vt-surface)] hover:border-[var(--vt-border-strong)] transition-colors text-left cursor-pointer min-w-0"
    >
      <span
        className="flex items-center justify-center w-[34px] h-[34px] rounded-[9px] shrink-0 border border-[var(--vt-border)]"
        style={{
          background: emoji
            ? "color-mix(in oklab, var(--vt-bg) 40%, var(--vt-panel-2) 60%)"
            : "var(--vt-accent-soft)",
        }}
      >
        {emoji ? (
          <span className="text-[16px] leading-none">{emoji}</span>
        ) : (
          <FileText className="w-4 h-4 text-[var(--vt-accent)]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-[13.5px] font-medium text-[var(--vt-fg)]">
            {displayTitle}
          </span>
          {note.favorite && (
            <Star className="w-3 h-3 shrink-0 fill-[var(--vt-warn)] text-[var(--vt-warn)]" />
          )}
        </div>
        <p className="text-[12px] text-[var(--vt-fg-3)] mt-0.5 truncate">
          {detail?.snippet || " "}
        </p>
        <div className="vt-mono text-[10.5px] text-[var(--vt-fg-4)] mt-1.5">
          {dateLabel}
          {detail !== undefined && (
            <>
              <span className="opacity-50 mx-1">·</span>
              {t("home.recentNotes.wordCount", { count: detail.words })}
            </>
          )}
        </div>
      </div>
    </button>
  );
}
