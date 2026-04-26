import type { Editor, Range } from "@tiptap/core";
import {
  Table as TableIcon,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  type LucideIcon,
} from "lucide-react";

export interface SlashCommandItem {
  /** i18n key used for display and filtering. */
  titleKey: string;
  /** Plain-text identifiers used as a fallback when filtering (covers both
   *  FR and EN terms so the menu stays usable regardless of locale). */
  keywords: string[];
  icon: LucideIcon;
  command: (props: { editor: Editor; range: Range }) => void;
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    titleKey: "notes.slashMenu.table",
    keywords: ["tableau", "table", "grid"],
    icon: TableIcon,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    titleKey: "notes.slashMenu.codeBlock",
    keywords: ["code", "bloc", "snippet"],
    icon: Code2,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCodeBlock({ language: "plaintext" })
        .run();
    },
  },
  {
    titleKey: "notes.slashMenu.heading1",
    keywords: ["titre1", "h1", "heading"],
    icon: Heading1,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    titleKey: "notes.slashMenu.heading2",
    keywords: ["titre2", "h2"],
    icon: Heading2,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    titleKey: "notes.slashMenu.heading3",
    keywords: ["titre3", "h3"],
    icon: Heading3,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    titleKey: "notes.slashMenu.bulletList",
    keywords: ["liste", "puces", "bullet"],
    icon: List,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    titleKey: "notes.slashMenu.orderedList",
    keywords: ["liste", "numero", "ordered"],
    icon: ListOrdered,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    titleKey: "notes.slashMenu.taskList",
    keywords: ["tache", "cocher", "task", "todo"],
    icon: ListChecks,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
];

/** Case-insensitive match: query against (translated title + keywords). */
export function filterSlashItems(
  items: SlashCommandItem[],
  translate: (key: string) => string,
  query: string,
): SlashCommandItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return items;
  return items.filter((item) => {
    const title = translate(item.titleKey).toLowerCase();
    if (title.includes(q)) return true;
    return item.keywords.some((kw) => kw.includes(q));
  });
}
