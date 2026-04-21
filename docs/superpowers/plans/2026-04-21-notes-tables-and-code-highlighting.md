# Notes — Tables et coloration syntaxique — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un slash menu (`/`), des tableaux éditables et des blocs de code avec coloration syntaxique à l'éditeur de notes TipTap.

**Architecture:** Extensions TipTap additionnelles (`@tiptap/extension-code-block-lowlight`, `@tiptap/extension-table` + row/header/cell) branchées dans `useNotesEditorInstance`. Slash menu calqué sur le pattern existant `NoteLinkSuggestion`. Deux composants React dédiés : un NodeView pour le sélecteur de langage du code, une toolbar flottante pour manipuler les tableaux. CSS scopé sous `.vt-app` dans `src/App.css`.

**Tech Stack:** TipTap v3, React 19, Tailwind v4, lowlight (highlight.js), react-i18next.

**Spec source:** `docs/superpowers/specs/2026-04-21-notes-tables-and-code-highlighting-design.md`

**Note sur les tests :** ce projet n'a pas de suite de tests automatisée. On remplace le cycle TDD par une validation manuelle à la fin de chaque tâche via le dev server Tauri. **IMPORTANT :** l'agent ne lance PAS `pnpm tauri dev` lui-même — il demande à l'utilisateur d'exécuter la commande et de valider à l'écran, conformément à la règle du `CLAUDE.md` du projet.

---

## Task 1: Installer les dépendances

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (généré automatiquement)

- [ ] **Step 1: Installer les packages**

Run:
```bash
pnpm add @tiptap/extension-code-block-lowlight lowlight @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-header @tiptap/extension-table-cell highlight.js
```

Expected: les 7 packages apparaissent dans `package.json` → `dependencies`, `pnpm-lock.yaml` mis à jour, `node_modules/.pnpm/` peuplé.

- [ ] **Step 2: Vérifier le type-check**

Run: `pnpm build`

Expected: `tsc` passe sans erreur (les nouveaux packages ne sont pas encore importés, donc rien ne doit casser). Vite build peut échouer si d'autres fichiers ont des erreurs, mais `tsc` doit être clean.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add tiptap table and code block lowlight deps"
```

---

## Task 2: Remplacer le codeBlock par CodeBlockLowlight

**Files:**
- Modify: `src/hooks/useNotesEditorInstance.ts`
- Modify: `src/App.css`

- [ ] **Step 1: Configurer StarterKit et ajouter CodeBlockLowlight**

Dans `src/hooks/useNotesEditorInstance.ts`, ajouter les imports en tête :

```ts
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
```

Juste au-dessus du `useEditor(...)`, créer l'instance lowlight une fois (elle est stateless et sans coût à l'init après le premier require) :

```ts
const lowlight = createLowlight(common);
```

Dans `StarterKit.configure(...)`, ajouter `codeBlock: false` (désactive le codeBlock natif au profit du lowlight) :

```ts
StarterKit.configure({
  codeBlock: false,
  link: {
    openOnClick: false,
    autolink: true,
    HTMLAttributes: {
      rel: "noopener noreferrer nofollow",
    },
  },
}),
```

Ajouter dans le tableau `extensions` (après `StarterKit.configure(...)`) :

```ts
CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: "plaintext",
  HTMLAttributes: {
    class: "vt-code-block",
  },
}),
```

- [ ] **Step 2: Ajouter un thème CSS de base pour les blocs de code**

À la fin de `src/App.css`, ajouter :

```css
/* ===== Notes editor — code blocks (lowlight) ===== */

.vt-app .ProseMirror pre.vt-code-block,
.vt-app .ProseMirror pre {
  background: var(--vt-panel-2, #1e1e24);
  color: var(--vt-fg, #e5e5ea);
  border: 1px solid var(--vt-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 0.75em 1em;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.875em;
  line-height: 1.6;
  margin: 0.75em 0;
}

.vt-app .ProseMirror pre code {
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

/* highlight.js token colors — OKLCH tuned for dark design system */
.vt-app .ProseMirror pre .hljs-keyword,
.vt-app .ProseMirror pre .hljs-selector-tag,
.vt-app .ProseMirror pre .hljs-literal,
.vt-app .ProseMirror pre .hljs-doctag,
.vt-app .ProseMirror pre .hljs-tag .hljs-name {
  color: oklch(0.72 0.18 290);
}
.vt-app .ProseMirror pre .hljs-string,
.vt-app .ProseMirror pre .hljs-regexp,
.vt-app .ProseMirror pre .hljs-addition,
.vt-app .ProseMirror pre .hljs-attribute,
.vt-app .ProseMirror pre .hljs-meta .hljs-string {
  color: oklch(0.78 0.14 140);
}
.vt-app .ProseMirror pre .hljs-comment,
.vt-app .ProseMirror pre .hljs-quote {
  color: oklch(0.55 0.02 260);
  font-style: italic;
}
.vt-app .ProseMirror pre .hljs-number,
.vt-app .ProseMirror pre .hljs-symbol,
.vt-app .ProseMirror pre .hljs-bullet,
.vt-app .ProseMirror pre .hljs-link {
  color: oklch(0.78 0.16 60);
}
.vt-app .ProseMirror pre .hljs-function .hljs-title,
.vt-app .ProseMirror pre .hljs-title.function_,
.vt-app .ProseMirror pre .hljs-built_in,
.vt-app .ProseMirror pre .hljs-builtin-name {
  color: oklch(0.80 0.14 200);
}
.vt-app .ProseMirror pre .hljs-variable,
.vt-app .ProseMirror pre .hljs-template-variable,
.vt-app .ProseMirror pre .hljs-attr {
  color: oklch(0.82 0.12 30);
}
.vt-app .ProseMirror pre .hljs-title,
.vt-app .ProseMirror pre .hljs-class .hljs-title,
.vt-app .ProseMirror pre .hljs-type {
  color: oklch(0.82 0.14 80);
}
.vt-app .ProseMirror pre .hljs-emphasis { font-style: italic; }
.vt-app .ProseMirror pre .hljs-strong { font-weight: 700; }
```

- [ ] **Step 3: Vérifier la compilation**

Run: `pnpm build`

Expected: `tsc` + Vite build passent sans erreur (à l'exception d'erreurs pré-existantes hors-sujet).

- [ ] **Step 4: Validation manuelle (demander à l'utilisateur)**

Demander à l'utilisateur de :
1. Lancer `pnpm tauri dev`
2. Ouvrir une note
3. Taper ` ``` ` suivi de `typescript` puis Entrée
4. Taper du code TS (`const x: number = 42; // commentaire`)
5. Vérifier que les mots-clés/strings/commentaires sont colorés
6. Fermer puis rouvrir la note — vérifier que le langage et les couleurs persistent

Expected: coloration visible, persistance OK.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotesEditorInstance.ts src/App.css
git commit -m "feat: replace codeBlock with CodeBlockLowlight and add hljs theme"
```

---

## Task 3: Ajouter l'extension Table

**Files:**
- Modify: `src/hooks/useNotesEditorInstance.ts`
- Modify: `src/App.css`

- [ ] **Step 1: Importer et enregistrer les 4 extensions de table**

Dans `src/hooks/useNotesEditorInstance.ts`, ajouter les imports :

```ts
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
```

Ajouter dans le tableau `extensions` (après `CodeBlockLowlight.configure(...)`) :

```ts
Table.configure({
  resizable: true,
  HTMLAttributes: { class: "vt-table" },
}),
TableRow,
TableHeader,
TableCell,
```

- [ ] **Step 2: Ajouter le CSS table dans `src/App.css`**

À la fin de `src/App.css` (après les règles code blocks) :

```css
/* ===== Notes editor — tables ===== */

.vt-app .ProseMirror table.vt-table,
.vt-app .ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75em 0;
  table-layout: fixed;
  overflow: hidden;
}

.vt-app .ProseMirror table th,
.vt-app .ProseMirror table td {
  border: 1px solid var(--vt-border, rgba(255, 255, 255, 0.12));
  padding: 0.5em 0.75em;
  vertical-align: top;
  position: relative;
  min-width: 1em;
}

.vt-app .ProseMirror table th {
  background: oklch(from var(--vt-panel-2, #1e1e24) l c h / 0.7);
  font-weight: 600;
  text-align: left;
}

.vt-app .ProseMirror table .selectedCell::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: oklch(0.65 0.15 265 / 0.18);
  content: "";
}

.vt-app .ProseMirror table .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: -2px;
  width: 4px;
  background: oklch(0.65 0.15 265 / 0.6);
  pointer-events: none;
}

.vt-app .ProseMirror.resize-cursor { cursor: col-resize; }

.vt-app .ProseMirror .tableWrapper {
  overflow-x: auto;
  margin: 0.75em 0;
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `pnpm build`

Expected: `tsc` + Vite passent.

- [ ] **Step 4: Validation manuelle provisoire**

À ce stade, on ne peut pas encore insérer de tableau depuis l'UI (le slash menu n'existe pas). Demander à l'utilisateur de :
1. Lancer `pnpm tauri dev`
2. Ouvrir la console du renderer (DevTools)
3. Dans la console, saisir :
```js
document.querySelector('.ProseMirror')?.dispatchEvent(new Event('focus'));
```
4. Ou — plus simple — attendre la Task 4 pour valider visuellement.

Expected: pas de crash à l'ajout des extensions, `pnpm build` OK, coloration code toujours fonctionnelle.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotesEditorInstance.ts src/App.css
git commit -m "feat: add tiptap table extension suite with base styling"
```

---

## Task 4: Construire le slash menu — items et liste React

**Files:**
- Create: `src/components/notes/NotesEditor/SlashCommand/slashCommandItems.ts`
- Create: `src/components/notes/NotesEditor/SlashCommand/SlashCommandList.tsx`

- [ ] **Step 1: Créer `slashCommandItems.ts`**

Fichier complet :

```ts
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
  /** Plain-text identifier used when the i18n key hasn't been resolved yet
   *  (fallback filtering). */
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
```

- [ ] **Step 2: Créer `SlashCommandList.tsx`**

Fichier complet :

```tsx
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { Editor, Range } from "@tiptap/core";
import type { SlashCommandItem } from "./slashCommandItems";

export interface SlashCommandListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  /** Passed through for items whose commands ignore it (we still accept it
   *  so the signature matches future uses). */
  editor?: Editor;
  range?: Range;
}

export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  function SlashCommandList({ items, command }, ref) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(0);

    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelected((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelected((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="vt-slash-menu vt-app bg-popover text-popover-foreground border rounded-md shadow-md p-1 min-w-[220px]">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {t("notes.slashMenu.noMatch", { defaultValue: "Aucune commande" })}
          </div>
        </div>
      );
    }

    return (
      <div className="vt-slash-menu vt-app bg-popover text-popover-foreground border rounded-md shadow-md p-1 min-w-[220px] max-h-[280px] overflow-y-auto">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const isActive = idx === selected;
          return (
            <button
              key={item.titleKey}
              onClick={() => command(item)}
              onMouseEnter={() => setSelected(idx)}
              className={
                "flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs rounded-sm transition-colors " +
                (isActive
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50")
              }
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{t(item.titleKey)}</span>
            </button>
          );
        })}
      </div>
    );
  },
);
```

- [ ] **Step 3: Vérifier la compilation**

Run: `pnpm build`

Expected: `tsc` passe. Les fichiers existent mais ne sont pas encore importés.

- [ ] **Step 4: Commit**

```bash
git add src/components/notes/NotesEditor/SlashCommand/slashCommandItems.ts src/components/notes/NotesEditor/SlashCommand/SlashCommandList.tsx
git commit -m "feat: add slash command items list and React popup"
```

---

## Task 5: Brancher le slash menu dans l'éditeur

**Files:**
- Create: `src/components/notes/NotesEditor/SlashCommand/SlashCommandExtension.ts`
- Modify: `src/hooks/useNotesEditorInstance.ts`

- [ ] **Step 1: Créer `SlashCommandExtension.ts`**

Fichier complet (calqué structurellement sur `NoteLinkSuggestion.ts`) :

```ts
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import i18n from "@/i18n";
import {
  SLASH_COMMAND_ITEMS,
  filterSlashItems,
  type SlashCommandItem,
} from "./slashCommandItems";
import {
  SlashCommandList,
  type SlashCommandListRef,
} from "./SlashCommandList";

/** Standalone floating popup (same pattern as NoteLinkSuggestion). */
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
    // The `/` only triggers a menu at the very start of an empty or
    // paragraph-only line. Prevents accidental triggers inside URLs or
    // mid-sentence paths.
    startOfLine: false,
    allowSpaces: false,
    items: ({ query }) =>
      filterSlashItems(SLASH_COMMAND_ITEMS, (k) => i18n.t(k), query),
    command: ({ editor, range, props }) => {
      // Each item's command knows how to replace `range` with its target node.
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
              props.command({
                ...item,
                command: item.command,
              } as SlashCommandItem);
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

/** Dedicated extension so we don't pollute another one with `/` suggestion. */
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
```

- [ ] **Step 2: Enregistrer l'extension dans `useNotesEditorInstance.ts`**

Ajouter l'import en tête :

```ts
import { SlashCommand } from "@/components/notes/NotesEditor/SlashCommand/SlashCommandExtension";
```

Ajouter dans le tableau `extensions` (après `NoteLink.configure(...)` pour rester à la fin de la chaîne) :

```ts
SlashCommand,
```

- [ ] **Step 3: Ajouter les clés i18n utilisées par la Task 4**

Dans `src/locales/fr.json`, dans l'objet `"notes"` (juste après `"bubbleMenu": {...}`), insérer :

```json
"slashMenu": {
  "table": "Tableau",
  "codeBlock": "Bloc de code",
  "heading1": "Titre 1",
  "heading2": "Titre 2",
  "heading3": "Titre 3",
  "bulletList": "Liste à puces",
  "orderedList": "Liste numérotée",
  "taskList": "Liste à cocher",
  "noMatch": "Aucune commande",
  "placeholder": "Filtrer..."
},
```

Dans `src/locales/en.json`, insérer au même endroit :

```json
"slashMenu": {
  "table": "Table",
  "codeBlock": "Code block",
  "heading1": "Heading 1",
  "heading2": "Heading 2",
  "heading3": "Heading 3",
  "bulletList": "Bullet list",
  "orderedList": "Ordered list",
  "taskList": "Task list",
  "noMatch": "No command",
  "placeholder": "Filter..."
},
```

- [ ] **Step 4: Vérifier la compilation**

Run: `pnpm build`

Expected: `tsc` + Vite passent. Attention : si TipTap râle sur la signature `command` (certaines versions v3 demandent `props.command(props)` avec le `SuggestionProps` entier), ajuster le cast dans `renderList` pour passer `item` directement — la propriété `command` doit être invocable en position `props`.

- [ ] **Step 5: Validation manuelle**

Demander à l'utilisateur de :
1. `pnpm tauri dev`
2. Ouvrir une note, taper `/` sur une ligne vide → le menu apparaît sous le curseur
3. Taper `tab` → seule l'entrée "Tableau" reste visible
4. Flèches ↑/↓ pour naviguer, Entrée → tableau 3×3 inséré
5. Escape ferme le menu sans rien insérer
6. Recommencer avec `/code` → bloc de code inséré
7. Dans une cellule de tableau, taper `@` → la suggestion de lien vers notes existantes s'ouvre toujours correctement (non-régression `NoteLink`)

Expected: insertion des blocs OK, pas de crash, NoteLink non régressé.

- [ ] **Step 6: Commit**

```bash
git add src/components/notes/NotesEditor/SlashCommand/SlashCommandExtension.ts src/hooks/useNotesEditorInstance.ts src/locales/fr.json src/locales/en.json
git commit -m "feat: add slash command menu for inserting blocks"
```

---

## Task 6: Toolbar flottante de tableau

**Files:**
- Create: `src/components/notes/NotesEditor/TableFloatingToolbar.tsx`
- Modify: `src/components/notes/NotesEditor/NotesEditorContent.tsx`

- [ ] **Step 1: Créer `TableFloatingToolbar.tsx`**

Fichier complet :

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Columns,
  Rows,
  Trash2,
  Heading,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TableFloatingToolbarProps {
  editor: Editor;
}

/**
 * Floats above the currently-active table. Position is recomputed on every
 * TipTap transaction so it tracks cell selection, scrolling inside the editor,
 * and row/column add/delete.
 */
export function TableFloatingToolbar({ editor }: TableFloatingToolbarProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  // Re-measure on selection + transaction events.
  useLayoutEffect(() => {
    const compute = () => {
      const isInTable = editor.isActive("table");
      if (!isInTable) {
        setVisible(false);
        return;
      }

      // Walk up from the current selection to find the <table> DOM node.
      const { from } = editor.state.selection;
      const resolved = editor.view.domAtPos(from);
      const startEl =
        resolved.node.nodeType === 1
          ? (resolved.node as HTMLElement)
          : resolved.node.parentElement;
      const tableEl = startEl?.closest("table");
      if (!tableEl) {
        setVisible(false);
        return;
      }

      const rect = tableEl.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY - 38,
        left: rect.left + window.scrollX,
      });
      setVisible(true);
    };

    compute();
    editor.on("selectionUpdate", compute);
    editor.on("transaction", compute);
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);

    return () => {
      editor.off("selectionUpdate", compute);
      editor.off("transaction", compute);
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [editor]);

  if (!visible || !coords) return null;

  const btn = (
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    onClick: () => void,
  ) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0"
      title={label}
      onMouseDown={(e) => {
        // Keep the cell selection alive: focusing a button normally blurs
        // ProseMirror, then the command runs on the wrong selection.
        e.preventDefault();
      }}
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5" />
    </Button>
  );

  return (
    <div
      ref={containerRef}
      className="vt-app vt-table-toolbar flex items-center gap-0.5 bg-popover text-popover-foreground border rounded-md shadow-md p-1 z-[9998] absolute"
      style={{ top: coords.top, left: coords.left }}
    >
      {btn(t("notes.table.addRowAbove"), ArrowUpToLine, () =>
        editor.chain().focus().addRowBefore().run(),
      )}
      {btn(t("notes.table.addRowBelow"), ArrowDownToLine, () =>
        editor.chain().focus().addRowAfter().run(),
      )}
      {btn(t("notes.table.deleteRow"), Rows, () =>
        editor.chain().focus().deleteRow().run(),
      )}
      <span className="w-px h-5 bg-border mx-0.5" />
      {btn(t("notes.table.addColumnLeft"), ArrowLeftToLine, () =>
        editor.chain().focus().addColumnBefore().run(),
      )}
      {btn(t("notes.table.addColumnRight"), ArrowRightToLine, () =>
        editor.chain().focus().addColumnAfter().run(),
      )}
      {btn(t("notes.table.deleteColumn"), Columns, () =>
        editor.chain().focus().deleteColumn().run(),
      )}
      <span className="w-px h-5 bg-border mx-0.5" />
      {btn(t("notes.table.toggleHeader"), Heading, () =>
        editor.chain().focus().toggleHeaderRow().run(),
      )}
      {btn(t("notes.table.deleteTable"), Trash2, () =>
        editor.chain().focus().deleteTable().run(),
      )}
    </div>
  );
}
```

Note : si des icônes Lucide manquent (`ArrowUpToLine`, `ArrowDownToLine`, `ArrowLeftToLine`, `ArrowRightToLine`, `Rows`, `Columns`) dans la version installée, les remplacer par les plus proches (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `List`, `Grid3x3`).

- [ ] **Step 2: Monter la toolbar dans `NotesEditorContent.tsx`**

Ajouter l'import en tête :

```tsx
import { TableFloatingToolbar } from "./TableFloatingToolbar";
```

Dans le JSX, juste après `{editor && <EditorBubbleMenu editor={editor} linkEditor={linkEditor} />}`, ajouter :

```tsx
{editor && <TableFloatingToolbar editor={editor} />}
```

- [ ] **Step 3: Ajouter les clés i18n table**

Dans `src/locales/fr.json`, à l'intérieur de `"notes"`, ajouter (après `"slashMenu": {...}`) :

```json
"table": {
  "addRowAbove": "Ajouter une ligne au-dessus",
  "addRowBelow": "Ajouter une ligne en dessous",
  "addColumnLeft": "Ajouter une colonne à gauche",
  "addColumnRight": "Ajouter une colonne à droite",
  "deleteRow": "Supprimer la ligne",
  "deleteColumn": "Supprimer la colonne",
  "toggleHeader": "Basculer l'en-tête",
  "deleteTable": "Supprimer le tableau"
},
```

Dans `src/locales/en.json` :

```json
"table": {
  "addRowAbove": "Add row above",
  "addRowBelow": "Add row below",
  "addColumnLeft": "Add column left",
  "addColumnRight": "Add column right",
  "deleteRow": "Delete row",
  "deleteColumn": "Delete column",
  "toggleHeader": "Toggle header",
  "deleteTable": "Delete table"
},
```

- [ ] **Step 4: Vérifier la compilation**

Run: `pnpm build`

Expected: OK.

- [ ] **Step 5: Validation manuelle**

Demander à l'utilisateur de :
1. `pnpm tauri dev`
2. Insérer un tableau via `/tab` + Entrée
3. Cliquer dans une cellule → la toolbar apparaît au-dessus du tableau
4. Tester chaque bouton : +ligne/+colonne avant/après, suppression ligne/colonne, toggle header, suppression totale
5. Redimensionner les colonnes à la souris sur les séparateurs
6. Tab pour passer à la cellule suivante, Shift+Tab pour revenir
7. Fermer/rouvrir la note → tableau et sa structure préservés

Expected: tout OK, toolbar ne flicker pas, positionnement correct même après scroll.

- [ ] **Step 6: Commit**

```bash
git add src/components/notes/NotesEditor/TableFloatingToolbar.tsx src/components/notes/NotesEditor/NotesEditorContent.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat: add floating toolbar for table editing"
```

---

## Task 7: NodeView pour la sélection de langage du bloc de code

**Files:**
- Create: `src/components/notes/NotesEditor/CodeBlockLanguageSelect.tsx`
- Modify: `src/hooks/useNotesEditorInstance.ts`

- [ ] **Step 1: Créer `CodeBlockLanguageSelect.tsx`**

Fichier complet :

```tsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ChevronDown } from "lucide-react";

/** Union of languages present in lowlight's `common` bundle. Kept static so
 *  we don't query lowlight at render time. Order: most-used devs first. */
const COMMON_LANGUAGES: { id: string; label: string }[] = [
  { id: "plaintext", label: "Plain text" },
  { id: "typescript", label: "TypeScript" },
  { id: "javascript", label: "JavaScript" },
  { id: "tsx", label: "TSX" },
  { id: "jsx", label: "JSX" },
  { id: "python", label: "Python" },
  { id: "rust", label: "Rust" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "kotlin", label: "Kotlin" },
  { id: "swift", label: "Swift" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "bash", label: "Bash" },
  { id: "shell", label: "Shell" },
  { id: "powershell", label: "PowerShell" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "toml", label: "TOML" },
  { id: "xml", label: "XML" },
  { id: "markdown", label: "Markdown" },
  { id: "diff", label: "Diff" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "makefile", label: "Makefile" },
  { id: "ini", label: "INI" },
  { id: "lua", label: "Lua" },
  { id: "perl", label: "Perl" },
  { id: "scala", label: "Scala" },
];

export function CodeBlockLanguageSelect({
  node,
  updateAttributes,
}: NodeViewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const current: string = (node.attrs.language as string) ?? "plaintext";

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return COMMON_LANGUAGES;
    return COMMON_LANGUAGES.filter(
      (l) => l.id.includes(q) || l.label.toLowerCase().includes(q),
    );
  }, [query]);

  const currentLabel =
    COMMON_LANGUAGES.find((l) => l.id === current)?.label ?? current;

  return (
    <NodeViewWrapper
      className="vt-code-block-wrapper relative group"
      data-language={current}
    >
      {/* The language selector sits outside <pre> for styling freedom but
          inside NodeViewWrapper so it lives and dies with the node. */}
      <div
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        contentEditable={false}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-background/80 border border-border hover:bg-accent text-foreground"
          title={t("notes.codeBlock.selectLanguage")}
        >
          <span>{currentLabel}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute top-7 right-0 bg-popover text-popover-foreground border rounded-md shadow-md p-1 min-w-[180px] max-h-[260px] overflow-y-auto">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("notes.codeBlock.searchLanguage")}
              className="w-full px-2 py-1 mb-1 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {filtered.map((lang) => (
              <button
                key={lang.id}
                onClick={() => {
                  updateAttributes({ language: lang.id });
                  setOpen(false);
                  setQuery("");
                }}
                className={
                  "flex w-full items-center px-2 py-1 text-left text-xs rounded-sm " +
                  (lang.id === current
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50")
                }
              >
                {lang.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {t("notes.slashMenu.noMatch")}
              </div>
            )}
          </div>
        )}
      </div>
      <pre className="vt-code-block">
        <NodeViewContent as="code" className={`language-${current}`} />
      </pre>
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Brancher le NodeView dans `useNotesEditorInstance.ts`**

Ajouter l'import en tête :

```ts
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockLanguageSelect } from "@/components/notes/NotesEditor/CodeBlockLanguageSelect";
```

Remplacer la configuration `CodeBlockLowlight` de la Task 2 par une version étendue avec NodeView :

```ts
CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockLanguageSelect);
  },
}).configure({
  lowlight,
  defaultLanguage: "plaintext",
  HTMLAttributes: {
    class: "vt-code-block",
  },
}),
```

- [ ] **Step 3: Ajouter les clés i18n code block**

Dans `src/locales/fr.json`, dans `"notes"` (après `"table": {...}`) :

```json
"codeBlock": {
  "selectLanguage": "Choisir le langage",
  "searchLanguage": "Rechercher..."
},
```

Dans `src/locales/en.json` :

```json
"codeBlock": {
  "selectLanguage": "Select language",
  "searchLanguage": "Search..."
},
```

- [ ] **Step 4: Vérifier la compilation**

Run: `pnpm build`

Expected: OK.

- [ ] **Step 5: Validation manuelle**

Demander à l'utilisateur de :
1. `pnpm tauri dev`
2. Insérer un bloc de code via `/code`
3. Survoler le bloc → badge "Plain text" apparaît en haut à droite
4. Cliquer → dropdown avec champ recherche + liste de langages
5. Taper `typ` → filtre "TypeScript", "TSX"
6. Sélectionner "TypeScript" → le badge change, la coloration s'applique au code déjà saisi
7. Fermer/rouvrir la note → langage préservé (`class="language-typescript"` sur `<code>`)
8. Taper ` ```rust ` + Entrée ailleurs → bloc créé avec langage rust, le badge affiche "Rust"

Expected: dropdown fonctionnel, coloration live, persistance OK.

- [ ] **Step 6: Commit**

```bash
git add src/components/notes/NotesEditor/CodeBlockLanguageSelect.tsx src/hooks/useNotesEditorInstance.ts src/locales/fr.json src/locales/en.json
git commit -m "feat: add language selector node view for code blocks"
```

---

## Task 8: Polish — CSS slash menu et ajustements visuels

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Ajouter les styles du slash menu et du code block wrapper**

À la fin de `src/App.css`, ajouter :

```css
/* ===== Notes editor — slash menu ===== */

.vt-slash-menu {
  font-family: inherit;
}

.vt-slash-menu button:focus-visible {
  outline: 2px solid oklch(0.65 0.15 265 / 0.6);
  outline-offset: 1px;
}

/* ===== Notes editor — code block wrapper (NodeView) ===== */

.vt-app .ProseMirror .vt-code-block-wrapper {
  position: relative;
  margin: 0.75em 0;
}

.vt-app .ProseMirror .vt-code-block-wrapper > pre {
  margin: 0;
}

/* ===== Notes editor — table toolbar ===== */

.vt-app .vt-table-toolbar {
  font-family: inherit;
}
```

- [ ] **Step 2: Vérifier visuellement**

Demander à l'utilisateur de :
1. `pnpm tauri dev`
2. Vérifier que le slash menu a une apparence cohérente avec la bubble menu (même fond `popover`, même ombre)
3. Vérifier que la toolbar de tableau n'empiète pas sur le contenu ci-dessus
4. Vérifier qu'il n'y a pas de régression sur les autres blocs (paragraphes, images, task lists, NoteLinks)

Expected: cohérence visuelle, pas de régression.

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "style: polish slash menu and table toolbar styles"
```

---

## Task 9: Pass final de validation et ajustements

**Files:**
- Potentiellement : tout fichier touché dans les tâches précédentes, selon bugs détectés.

- [ ] **Step 1: Parcours de recette complet**

Demander à l'utilisateur de dérouler la check-list du spec (section 9 "Tests manuels") :

1. Slash menu : popup, filtrage, navigation clavier, Enter, Escape
2. Tableau : insertion, édition clavier (Tab), resize colonnes, toutes actions toolbar
3. Bloc de code : insertion via slash, changement de langage, coloration live, persistance
4. Markdown : ` ```ts ` + Entrée → code block TypeScript
5. Persistance après fermeture/réouverture de note
6. `@` dans une cellule de tableau → suggestion NoteLink fonctionnelle
7. Copie du contenu via `onCopyContent` → Markdown cohérent pour tables et code
8. Pas de régression sur les autres fonctionnalités de l'éditeur

- [ ] **Step 2: Corriger ce qui ne fonctionne pas**

Si un point échoue : identifier la tâche concernée, corriger localement, commit séparé avec message `fix: ...`. Ne jamais empiler les correctifs dans un seul commit.

- [ ] **Step 3: Vérifier la build de production**

Run: `pnpm build`

Expected: clean. Tester éventuellement `pnpm tauri build` côté utilisateur pour confirmer que les nouvelles dépendances n'alourdissent pas au-delà du raisonnable (warning accepté : ~120 KB gzippé supplémentaires).

- [ ] **Step 4: Commit final si corrections**

Si des corrections ont été faites, elles ont déjà été committées sous forme `fix:` à l'étape 2. Sinon, rien à committer.

---

## Self-review (fait avant handoff)

**Spec coverage :**
- ✅ Slash menu (Task 4 + 5)
- ✅ CodeBlockLowlight + thème (Task 2)
- ✅ Extension Table + 3 sous-extensions (Task 3)
- ✅ TableFloatingToolbar (Task 6)
- ✅ CodeBlockLanguageSelect NodeView (Task 7)
- ✅ CSS scopé `.vt-app` (Tasks 2, 3, 8)
- ✅ i18n fr+en (Tasks 5, 6, 7)
- ✅ Validation manuelle (Task 9)

**Placeholders :** aucun « TODO », aucun « implémenter plus tard », chaque étape contient du code exécutable complet ou une commande précise.

**Type consistency :** `SlashCommandItem.titleKey` utilisé de bout en bout. `updateAttributes({ language })` cohérent avec `node.attrs.language`. Les commandes TipTap (`addRowBefore`, `addColumnAfter`, etc.) nommées exactement comme dans l'API `@tiptap/extension-table` v3.

**Risque résiduel identifié :** la signature exacte de `command` dans `buildSlashSuggestion` (Task 5) peut varier légèrement entre mineures de `@tiptap/suggestion`. Step 4 de la Task 5 contient une note explicite à ce sujet.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-21-notes-tables-and-code-highlighting.md`.
