"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePlus2, FileText, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listNotes } from "@/lib/sync/notes-store";
import type { LocalNoteMeta } from "@/lib/sync/types";

interface SaveToNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Create a brand-new note seeded with the transcription. */
  onCreateNew: () => void;
  /** Append the transcription to the chosen existing note. */
  onSelectExisting: (note: LocalNoteMeta) => void;
}

/**
 * Picker shown from a transcription's "Vers une note…" action. Offers a single
 * "create new note" affordance at the top, then a searchable list of existing
 * notes to append to. Notes are loaded fresh each time the dialog opens so the
 * list reflects edits made elsewhere.
 */
export function SaveToNoteDialog({
  open,
  onOpenChange,
  onCreateNew,
  onSelectExisting,
}: SaveToNoteDialogProps) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<LocalNoteMeta[]>([]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    let cancelled = false;
    void (async () => {
      try {
        const list = await listNotes();
        if (!cancelled) setNotes(list.filter((n) => !n.deletedAt));
      } catch (e) {
        console.error("[SaveToNoteDialog] failed to list notes", e);
        if (!cancelled) setNotes([]);
      }
    })();
    const focusId = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(focusId);
    };
  }, [open]);

  const filtered = useMemo(() => {
    // Most-recently-updated first, matching the notes sidebar ordering.
    const sorted = [...notes].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((n) => (n.title || "").toLowerCase().includes(q));
  }, [notes, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("saveToNote.title")}</DialogTitle>
          <DialogDescription>{t("saveToNote.subtitle")}</DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={onCreateNew}
          className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <FilePlus2 className="h-4 w-4" />
          {t("saveToNote.createNew")}
        </button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t("saveToNote.orExisting")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("saveToNote.searchPlaceholder")}
            aria-label={t("saveToNote.searchPlaceholder")}
            autoComplete="off"
            className="pl-8"
          />
        </div>

        <div className="-mx-1 max-h-60 space-y-0.5 overflow-y-auto px-1">
          {notes.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("saveToNote.empty")}
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("saveToNote.noResults")}
            </p>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onSelectExisting(note)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {note.title || t("notes.editor.untitled")}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
