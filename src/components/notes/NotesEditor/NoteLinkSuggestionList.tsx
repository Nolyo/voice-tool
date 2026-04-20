import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import type { NoteMeta } from "@/hooks/useNotes";

export interface NoteLinkSuggestionListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export interface NoteLinkSuggestionListProps {
  items: NoteMeta[];
  command: (item: { id: string; title: string }) => void;
  query: string;
}

export const NoteLinkSuggestionList = forwardRef<
  NoteLinkSuggestionListRef,
  NoteLinkSuggestionListProps
>(({ items, command, query }, ref) => {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    command({ id: item.id, title: item.title });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((prev) => (prev + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="w-72 max-h-64 overflow-y-auto bg-popover text-popover-foreground border rounded-md shadow-lg p-1 z-[9999]">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {query
          ? t("notes.link.searchResults", { query })
          : t("notes.link.recentNotes")}
      </div>
      {items.length === 0 ? (
        <div className="px-2 py-3 text-xs text-muted-foreground text-center">
          {t("notes.link.noMatch")}
        </div>
      ) : (
        items.map((note, index) => (
          <button
            key={note.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              selectItem(index);
            }}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded-sm transition-colors ${
              index === selectedIndex ? "bg-accent text-accent-foreground" : ""
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {note.title || t("notes.editor.untitled")}
            </span>
          </button>
        ))
      )}
    </div>
  );
});

NoteLinkSuggestionList.displayName = "NoteLinkSuggestionList";
