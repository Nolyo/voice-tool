# Notes — Tables et coloration syntaxique des blocs de code

**Date** : 2026-04-21
**Cible** : éditeur de notes (`src/components/notes/NotesEditor`)
**Stack** : TipTap v3, React 19, Tailwind v4

## 1. Contexte et objectif

L'éditeur de notes repose sur TipTap v3 avec `StarterKit`, `Image`, `TaskList`, `TextStyle`, `Color`, `Highlight`, et l'extension custom `NoteLink` (pour les `[[mentions]]` internes). Deux besoins exprimés par un utilisateur développeur :

1. Insérer des **tableaux** pour structurer des données.
2. Insérer des **blocs de code** avec **coloration syntaxique** selon le langage.

Le `StarterKit` fournit déjà un `codeBlock` sans coloration et la bubble menu expose `toggleCode` (code inline). Aucun mécanisme d'insertion de bloc au curseur n'existe : la bubble menu n'apparaît que sur une sélection.

## 2. Décisions produit

| Décision | Choix retenu | Raison |
|---|---|---|
| Mode d'insertion | Slash command `/` | Pattern standard pour devs (Notion, Obsidian), découvrable, extensible pour de futurs blocs |
| Moteur coloration | `@tiptap/extension-code-block-lowlight` + `lowlight` (highlight.js) | Officiel TipTap, léger, thèmes CSS simples — Shiki écarté à cause du poids WASM |
| Bundle langages | `common` de lowlight (~35 langages) | Couvre le quotidien d'un dev sans alourdir |
| Sélection du langage | Dropdown en haut à droite du bloc + raccourci markdown ` ``` ` + langage | Découvrable ET rapide au clavier |
| Édition des tableaux | Toolbar flottante au-dessus du tableau quand il est actif | Cohérent avec la bubble menu existante, découvrable, moins de polish visuel que les boutons de bord |
| Taille par défaut tableau | 3×3 avec ligne d'en-tête | Pas de dialogue intermédiaire, on ajuste via la toolbar |

## 3. Dépendances

À ajouter :

```
@tiptap/extension-code-block-lowlight
lowlight
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-header
@tiptap/extension-table-cell
```

Le thème highlight.js (`highlight.js/styles/github-dark.css`) sert de base, overridé ensuite par des règles CSS scopées `.vt-app .hljs-*` pour coller aux tokens OKLCH du design system.

Le `codeBlock` du `StarterKit` est désactivé (`codeBlock: false`) puisque remplacé par sa variante lowlight. Aucune autre extension existante n'est modifiée.

## 4. Architecture des composants

```
src/components/notes/NotesEditor/
├── SlashCommand/
│   ├── SlashCommandExtension.ts       ← extension TipTap basée sur @tiptap/suggestion
│   ├── SlashCommandList.tsx           ← popup React, navigation clavier
│   └── slashCommandItems.ts           ← liste des commandes (titre, icône, exec)
├── CodeBlockLanguageSelect.tsx        ← NodeView React : dropdown langage en coin du bloc
└── TableFloatingToolbar.tsx           ← toolbar affichée quand editor.isActive('table')
```

Chaque composant :

- a une responsabilité unique (insertion / sélection de langage / manipulation de tableau)
- communique avec l'éditeur uniquement via des commandes TipTap (`editor.chain()…run()`)
- peut être retiré sans affecter les autres

### 4.1 Slash command

Calqué sur `NoteLinkSuggestion.ts` (le mécanisme @-mentions déjà en place) pour réutiliser le pattern `@tiptap/suggestion` et la sous-structure React (popup avec `tippy.js` ou équivalent maison).

Caractère déclencheur : `/`. Ne se déclenche que sur une ligne vide ou en début de bloc paragraphe. Filtrage sur le champ `title` (insensible à la casse). Navigation clavier ↑/↓/⏎/Escape.

Items initiaux :

| Titre | Icône | Commande |
|---|---|---|
| Tableau | `TableIcon` | `insertTable({ rows: 3, cols: 3, withHeaderRow: true })` |
| Bloc de code | `Code2` | `setCodeBlock({ language: 'plaintext' })` |
| Titre 1 | `Heading1` | `setHeading({ level: 1 })` |
| Titre 2 | `Heading2` | `setHeading({ level: 2 })` |
| Titre 3 | `Heading3` | `setHeading({ level: 3 })` |
| Liste à puces | `List` | `toggleBulletList()` |
| Liste numérotée | `ListOrdered` | `toggleOrderedList()` |
| Liste à cocher | `ListChecks` | `toggleTaskList()` |

Le `/` tapé est supprimé automatiquement par le mécanisme de suggestion TipTap (`range` passé au callback `command`).

### 4.2 CodeBlockLanguageSelect (NodeView)

Branché via `CodeBlockLowlight.extend({ addNodeView() { return ReactNodeViewRenderer(...) } })`. Rend :

- Le `<pre><code>` original (via `NodeViewContent`)
- Un dropdown positionné `absolute top-1 right-1`, visible au hover/focus du bloc, opacité réduite sinon

Le dropdown liste les langages `common` de lowlight, avec un champ de recherche textuelle rapide. Sélection → `updateAttributes({ language: value })`. Affiche le langage courant en badge.

### 4.3 TableFloatingToolbar

Monté une fois dans `NotesEditorContent.tsx` à côté du `BubbleMenu`. Visibilité : `editor.isActive('table')`. Position : calculée à partir de la position DOM de la node `table` parente (`editor.view.domAtPos`), ancrée au-dessus du tableau, mise à jour sur `selectionUpdate` et `transaction`.

Boutons :

| Action | Commande TipTap |
|---|---|
| + ligne au-dessus | `addRowBefore()` |
| + ligne en dessous | `addRowAfter()` |
| + colonne à gauche | `addColumnBefore()` |
| + colonne à droite | `addColumnAfter()` |
| Supprimer la ligne | `deleteRow()` |
| Supprimer la colonne | `deleteColumn()` |
| Toggle header row | `toggleHeaderRow()` |
| Supprimer le tableau | `deleteTable()` |

## 5. Modifications de l'intégration existante

### `src/hooks/useNotesEditorInstance.ts`

Ajouts dans le tableau `extensions` de `useEditor({ extensions: [...] })` :

```ts
StarterKit.configure({
  codeBlock: false,                     // remplacé par lowlight
  link: { ... },                        // inchangé
})
CodeBlockLowlight.configure({
  lowlight: createLowlight(common),
  defaultLanguage: 'plaintext',
})
Table.configure({ resizable: true })
TableRow
TableHeader
TableCell
SlashCommand.configure({ suggestion: buildSlashSuggestion() })
```

### `src/components/notes/NotesEditor/NotesEditorContent.tsx`

Ajout d'un `<TableFloatingToolbar editor={editor} />` à côté de la `BubbleMenu` existante.

Aucune autre modification ailleurs (layout, hooks AI, link editor, persistance, etc.).

## 6. Persistance et sérialisation

TipTap sérialise les tableaux et code blocks en HTML standard :

- Tableau : `<table><tbody><tr><th>…</th><td>…</td></tr>…</tbody></table>`
- Bloc de code : `<pre><code class="language-ts">…</code></pre>`

**Aucune modification** nécessaire à :

- `readNote` / `onUpdateNote` — lisent et écrivent du HTML opaque
- `deriveTitle` — la première ligne reste un `<h1>`, les nouveaux blocs ne modifient pas cette règle
- Hook `useAiAssistant` — consomme la sélection, indépendant du type de bloc
- Extension `NoteLink` — `[[mentions]]` restent valides à l'intérieur des cellules de tableau

## 7. CSS et design system

Ajouts dans `src/App.css`, tous scopés `.vt-app` conformément au scope existant `vt-app` (ex `vt-settings`).

### Tableaux

```css
.vt-app .ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75em 0;
}
.vt-app .ProseMirror th,
.vt-app .ProseMirror td {
  border: 1px solid var(--vt-border);
  padding: 0.5em 0.75em;
  vertical-align: top;
}
.vt-app .ProseMirror th {
  background: var(--vt-bg-subtle);
  font-weight: 600;
}
.vt-app .ProseMirror .selectedCell::after {
  background: oklch(var(--vt-accent) / 0.15);
  /* overlay pour la sélection de plage */
}
.vt-app .ProseMirror .column-resize-handle {
  background: var(--vt-accent);
}
```

### Blocs de code

```css
.vt-app .ProseMirror pre {
  background: var(--vt-bg-code);
  color: var(--vt-fg);
  border-radius: 6px;
  padding: 0.75em 1em;
  overflow-x: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.875em;
  line-height: 1.6;
}
.vt-app .ProseMirror pre code { background: transparent; padding: 0; }
/* Override github-dark pour rester dans la palette OKLCH */
.vt-app .hljs-keyword { color: oklch(0.72 0.18 290); }
.vt-app .hljs-string  { color: oklch(0.78 0.14 140); }
.vt-app .hljs-comment { color: oklch(0.55 0.02 260); font-style: italic; }
.vt-app .hljs-number  { color: oklch(0.78 0.16 60); }
.vt-app .hljs-function, .vt-app .hljs-title { color: oklch(0.80 0.14 200); }
```

*Les valeurs OKLCH exactes ci-dessus sont indicatives et seront ajustées au rendu pour cohérence avec les tokens `--vt-*` existants.*

### Slash menu

Même structure que `.vt-note-link-suggestion` (mêmes règles de popup, ombre, bordure, hover).

## 8. Internationalisation

Nouvelles clés à ajouter dans les fichiers de locales existants (`fr`, `en`) :

```
notes.slashMenu.table
notes.slashMenu.codeBlock
notes.slashMenu.heading1 / heading2 / heading3
notes.slashMenu.bulletList
notes.slashMenu.orderedList
notes.slashMenu.taskList
notes.slashMenu.placeholder          ← texte du champ de filtre
notes.table.addRowAbove
notes.table.addRowBelow
notes.table.addColumnLeft
notes.table.addColumnRight
notes.table.deleteRow
notes.table.deleteColumn
notes.table.toggleHeader
notes.table.deleteTable
notes.codeBlock.selectLanguage
notes.codeBlock.searchLanguage
```

## 9. Tests manuels

Le projet n'a pas de framework de test automatisé. Validation manuelle :

1. **Slash menu** : taper `/` → popup, filtrer, naviguer, Enter insère ; Escape ferme.
2. **Tableau** : insertion via slash, édition au clavier (Tab pour passer à la cellule suivante, Shift+Tab en arrière), redimensionnement des colonnes à la souris, toolbar : chaque bouton a l'effet attendu.
3. **Bloc de code** : insertion via slash → langage par défaut `plaintext` ; ouvrir le dropdown → changer vers `typescript`, `rust`, `python` → la coloration change immédiatement ; fermer puis rouvrir la note → le langage et le contenu sont préservés.
4. **Markdown** : taper ` ```ts ` puis Entrée → crée un code block `typescript`.
5. **Persistance** : tableau + code block, fermer/rouvrir la note → tout est restauré.
6. **NoteLinks dans un tableau** : taper `@` dans une cellule → le suggest `[[…]]` existant s'ouvre et marche.
7. **Export/copie** : si l'utilisateur utilise la copie-vers-clipboard existante (`onCopyContent`), les tableaux et code blocks ressortent sous forme HTML/Markdown cohérente via `turndown` (déjà dépendance du projet).
8. **Thème** : en lumière ambiante du design system OKLCH, les couleurs de coloration restent lisibles.

## 10. Hors périmètre (YAGNI)

- Export des tableaux en CSV
- Import CSV → tableau
- Collage depuis Excel → tableau formaté
- Numérotation de lignes dans les blocs de code
- Diff de code / comparaison
- Plus de 35 langages (bundle `all` de lowlight)
- Thèmes Shiki / VS Code
- Boutons "+" sur les bords du tableau type Notion
- Slash menu avec sous-menus ou catégories

Ces éléments peuvent être ajoutés dans un futur spec si le besoin est confirmé.

## 11. Risques et points de vigilance

| Risque | Mitigation |
|---|---|
| Casser les dépendances existantes (feedback utilisateur explicite) | Aucune modification des extensions existantes — on ajoute, on ne touche pas. `codeBlock: false` dans StarterKit est la seule altération, strictement requise. |
| Popup slash en conflit avec le suggest `@` de `NoteLink` | Caractères déclencheurs différents (`/` vs `@`) et mêmes mécanismes de suggestion, pas de collision possible. |
| Perf du NodeView React sur de gros blocs de code | Lowlight tokenise seulement à l'update ; `ReactNodeViewRenderer` est memoizé par TipTap. À surveiller au test manuel sur un bloc de ~500 lignes. |
| CSS highlight.js qui fuit hors du scope `.vt-app` | Importer le CSS du thème uniquement dans `App.css`, et préfixer toutes les règles `.hljs-*` par `.vt-app` dans les overrides. |
| Bundle size | Bundle `common` de lowlight + 4 packages TipTap ≈ +120 KB gzippé estimé. Acceptable pour une app Tauri locale. |
