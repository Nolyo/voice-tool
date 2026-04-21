import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import i18n from "@/i18n";
import {
  SLASH_COMMAND_ITEMS,
  filterSlashItems,
  type SlashCommandItem,
} from "@/components/notes/NotesEditor/SlashCommand/slashCommandItems";
import {
  SlashCommandList,
  type SlashCommandListRef,
} from "@/components/notes/NotesEditor/SlashCommand/SlashCommandList";

/** Floating popup (same pattern as NoteLinkSuggestion — no tippy.js). */
function createPopup() {
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
      const popupH = container.getBoundingClientRect().height || 200;
      const belowY = rect.bottom + 6;
      const wouldOverflow = belowY + popupH > window.innerHeight - 8;
      const top = wouldOverflow ? Math.max(8, rect.top - popupH - 6) : belowY;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - 260);
      container.style.top = `${top}px`;
      container.style.left = `${left}px`;
    },
    destroy() {
      container.remove();
    },
  };
}

function buildSlashSuggestion(): Omit<SuggestionOptions<SlashCommandItem>, "editor"> {
  return {
    char: "/",
    allowSpaces: false,
    items: ({ query }) =>
      filterSlashItems(SLASH_COMMAND_ITEMS, (k) => i18n.t(k), query),
    command: ({ editor, range, props }) => {
      // Each item carries its own command that knows how to replace the
      // matched range with the target node.
      props.command({ editor, range });
    },
    render: () => {
      let popup: ReturnType<typeof createPopup> | null = null;
      let root: Root | null = null;
      let listRef: SlashCommandListRef | null = null;

      const renderList = (props: SuggestionProps<SlashCommandItem>) => {
        const filtered = filterSlashItems(
          SLASH_COMMAND_ITEMS,
          (k) => i18n.t(k),
          props.query,
        );
        root?.render(
          createElement(SlashCommandList, {
            ref: (r: SlashCommandListRef | null) => {
              listRef = r;
            },
            items: filtered,
            command: (item: SlashCommandItem) => {
              // Forward the chosen item to the suggestion pipeline; the
              // outer `command` above invokes item.command with the range.
              props.command(item);
            },
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

/** Standalone extension that owns a single `/` suggestion plugin. */
export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...buildSlashSuggestion(),
      }),
    ];
  },
});
