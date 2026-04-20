import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { NoteLinkNodeView } from "./NoteLinkNodeView";

export interface NoteLinkOptions {
  suggestion: Omit<SuggestionOptions<{ id: string; title: string }>, "editor">;
  HTMLAttributes: Record<string, unknown>;
}

/**
 * Inline atomic node that represents a link to another note. Serialized in
 * HTML as `<a data-note-link="true" data-note-id="{uuid}" data-note-title="{title}">{title}</a>`
 * so it round-trips through `content.html` unchanged. Rendering is delegated
 * to `NoteLinkNodeView` which reads `NoteLinkContext` to decide valid vs broken.
 */
export const NoteLink = Node.create<NoteLinkOptions>({
  name: "noteLink",

  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      suggestion: {
        char: "@",
      },
      HTMLAttributes: {},
    } as NoteLinkOptions;
  },

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-note-id") ?? "",
        renderHTML: (attrs) => ({ "data-note-id": attrs.id }),
      },
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-note-title") ?? el.textContent ?? "",
        renderHTML: (attrs) => ({ "data-note-title": attrs.title }),
      },
    };
  },

  parseHTML() {
    return [
      {
        // Higher priority than StarterKit's Link mark (which matches `a[href]`)
        // so that an `<a data-note-link>` round-trips as a NoteLink node, not a
        // Link mark — otherwise data-note-id would be stripped on re-save.
        tag: "a[data-note-link]",
        priority: 1000,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // Intentionally no `href` here: the chip is clicked via the React NodeView,
    // and omitting `href` prevents the Link mark's `a[href]` parse rule from
    // competing with this node on reload.
    return [
      "a",
      mergeAttributes(
        this.options.HTMLAttributes,
        {
          "data-note-link": "true",
          class: "note-link",
        },
        HTMLAttributes,
      ),
      node.attrs.title as string,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.title}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkNodeView);
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
