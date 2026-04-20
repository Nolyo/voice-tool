import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import type { NoteMeta } from "@/hooks/useNotes";
import {
  NoteLinkSuggestionList,
  type NoteLinkSuggestionListRef,
} from "./NoteLinkSuggestionList";

type NoteRefSource = () => { notes: NoteMeta[]; activeNoteId: string | null };

/**
 * Fuzzy match on title: "starts with" first, then "contains".
 * Case-insensitive. Excludes the currently active note.
 */
function matchNotes(notes: NoteMeta[], query: string, excludeId: string | null): NoteMeta[] {
  const q = query.toLowerCase().trim();
  const filtered = notes.filter((n) => n.id !== excludeId);

  if (!q) {
    return filtered.slice(0, 8);
  }

  const starts: NoteMeta[] = [];
  const contains: NoteMeta[] = [];
  for (const note of filtered) {
    const t = note.title.toLowerCase();
    if (t.startsWith(q)) starts.push(note);
    else if (t.includes(q)) contains.push(note);
  }
  return [...starts, ...contains].slice(0, 8);
}

/**
 * Minimal floating popup without tippy.js. Positions a DOM node at the
 * client rect of the trigger character and repositions on updates.
 */
function createPopup(): {
  mount: (el: HTMLElement) => void;
  move: (rect: DOMRect) => void;
  destroy: () => void;
} {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.zIndex = "9999";
  container.style.pointerEvents = "auto";
  document.body.appendChild(container);

  return {
    mount(el: HTMLElement) {
      container.innerHTML = "";
      container.appendChild(el);
    },
    move(rect: DOMRect) {
      // Place below by default, flip above if near bottom edge.
      const popupH = container.getBoundingClientRect().height || 200;
      const belowY = rect.bottom + 6;
      const wouldOverflow = belowY + popupH > window.innerHeight - 8;
      const top = wouldOverflow ? Math.max(8, rect.top - popupH - 6) : belowY;
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - 300,
      );
      container.style.top = `${top}px`;
      container.style.left = `${left}px`;
    },
    destroy() {
      container.remove();
    },
  };
}

export function buildNoteLinkSuggestion(
  getRefs: NoteRefSource,
): Omit<SuggestionOptions<{ id: string; title: string }>, "editor"> {
  return {
    char: "@",
    allowSpaces: false,
    startOfLine: false,
    items: ({ query }: { query: string }) => {
      const { notes, activeNoteId } = getRefs();
      return matchNotes(notes, query, activeNoteId).map((n) => ({
        id: n.id,
        title: n.title,
      }));
    },
    command: ({ editor, range, props }) => {
      // Replace the @query with the note-link node + a trailing space.
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "noteLink",
            attrs: { id: props.id, title: props.title },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: () => {
      let popup: ReturnType<typeof createPopup> | null = null;
      let root: Root | null = null;
      let listRef: NoteLinkSuggestionListRef | null = null;

      const renderList = (props: SuggestionProps<{ id: string; title: string }>) => {
        const { notes, activeNoteId } = getRefs();
        const items = matchNotes(notes, props.query, activeNoteId);
        root?.render(
          createElement(NoteLinkSuggestionList, {
            ref: (r: NoteLinkSuggestionListRef | null) => {
              listRef = r;
            },
            items,
            query: props.query,
            command: props.command,
          }),
        );
      };

      return {
        onStart: (props) => {
          popup = createPopup();
          const host = document.createElement("div");
          popup.mount(host);
          root = createRoot(host);
          renderList(props);
          // Position after mount so the popup has dimensions.
          requestAnimationFrame(() => {
            const rect = props.clientRect?.();
            if (rect && popup) popup.move(rect);
          });
        },
        onUpdate: (props) => {
          renderList(props);
          const rect = props.clientRect?.();
          if (rect && popup) popup.move(rect);
        },
        onKeyDown: (props) => {
          // Let the suggestion plugin handle Escape to close the popup.
          if (props.event.key === "Escape") return false;
          return listRef?.onKeyDown(props.event) ?? false;
        },
        onExit: () => {
          root?.unmount();
          root = null;
          popup?.destroy();
          popup = null;
          listRef = null;
        },
      };
    },
  };
}
