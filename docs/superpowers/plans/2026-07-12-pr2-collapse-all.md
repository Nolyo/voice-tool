# PR 2 — Collapse/Expand All (notes sidebar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seul bouton toggle dans la barre d'outils de la sidebar notes qui replie ou déplie d'un coup tous les dossiers ET les sections (Favoris, Récents, Non classées).

**Architecture:** Un helper pur `isAnyExpanded(state, folderIds)` et une action `setAll(collapsed, folderIds)` ajoutés à `useSidebarCollapseState` (persistance existante inchangée — store per-profile, debounce 300 ms). Le bouton dans `NotesSidebarSection` bascule : au moins un élément déplié → tout replier (`ChevronsDownUp`), sinon tout déplier (`ChevronsUpDown`).

**Tech Stack:** TypeScript, React 19, Vitest + @testing-library/react (renderHook), lucide-react, react-i18next. Aucun changement Rust, aucune dépendance nouvelle.

**Spec:** `docs/superpowers/specs/2026-07-12-ux-improvements-multi-pr-design.md` (section PR 2)

## Global Constraints

- Branche `main` protégée : jamais de commit direct, la PR part d'une branche dédiée.
- Toute string UI passe par react-i18next — **title ET aria-label** compris, jamais de texte en dur.
- Locales existantes à couvrir : `src/locales/fr.json` et `src/locales/en.json` (les namespaces `cloud.json`/`billing.json` ne sont pas concernés).
- Sémantique de l'état existant : `true` = replié, `false`/absent = déplié (ne pas l'inverser).
- La persistance de `useSidebarCollapseState` (store per-profile, clé `"collapse"`, debounce 300 ms) n'est **pas** modifiée — `setAll` passe par le `setState` existant.
- CHANGELOG en anglais.
- Suite de tests : `pnpm test` ; ciblé : `pnpm exec vitest run src/hooks/useSidebarCollapseState.test.ts`.

## Setup (avant Task 1)

```bash
git checkout main
git pull
git checkout -b feat/notes-collapse-all
git add docs/superpowers/plans/2026-07-12-pr2-collapse-all.md
git commit -m "docs: add PR2 collapse-all plan"
```

---

### Task 1: `isAnyExpanded` + `setAll` dans `useSidebarCollapseState`

**Files:**
- Modify: `src/hooks/useSidebarCollapseState.ts`
- Create (Test): `src/hooks/useSidebarCollapseState.test.ts`

**Interfaces:**
- Consumes: `SidebarCollapseState` existant (`{ favorites, recents, root, folders: Record<string, boolean> }`).
- Produces (utilisés par Task 2) :
  - `export function isAnyExpanded(state: SidebarCollapseState, folderIds: string[]): boolean` — `true` si au moins une des trois sections ou un des dossiers listés est déplié (entrée absente du map = déplié).
  - `setAll(collapsed: boolean, folderIds: string[]): void` retourné par le hook — écrit d'un coup `favorites`, `recents`, `root` et **reconstruit** le map `folders` à partir de `folderIds` uniquement (les ids obsolètes de dossiers supprimés sont purgés au passage).

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/hooks/useSidebarCollapseState.test.ts` :

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const storeMock = {
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
};
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: vi.fn(async () => storeMock) },
}));

import {
  useSidebarCollapseState,
  isAnyExpanded,
  type SidebarCollapseState,
} from "./useSidebarCollapseState";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue("fake/notes-sidebar.json");
  storeMock.get.mockReset();
  storeMock.get.mockResolvedValue(undefined);
  storeMock.set.mockReset();
  storeMock.save.mockReset();
});

const collapsedState = (
  folders: Record<string, boolean> = {},
): SidebarCollapseState => ({
  favorites: true,
  recents: true,
  root: true,
  folders,
});

describe("isAnyExpanded", () => {
  it("is true for the default state (everything expanded)", () => {
    const state: SidebarCollapseState = {
      favorites: false,
      recents: false,
      root: false,
      folders: {},
    };
    expect(isAnyExpanded(state, [])).toBe(true);
  });

  it("is false when all sections are collapsed and there are no folders", () => {
    expect(isAnyExpanded(collapsedState(), [])).toBe(false);
  });

  it("is true when one section is still expanded", () => {
    expect(
      isAnyExpanded({ ...collapsedState(), recents: false }, []),
    ).toBe(true);
  });

  it("treats a folder missing from the map as expanded", () => {
    expect(isAnyExpanded(collapsedState({ f1: true }), ["f1", "f2"])).toBe(
      true,
    );
  });

  it("is false when all sections and all listed folders are collapsed", () => {
    expect(
      isAnyExpanded(collapsedState({ f1: true, f2: true }), ["f1", "f2"]),
    ).toBe(false);
  });

  it("is true when a folder is explicitly expanded (false in the map)", () => {
    expect(isAnyExpanded(collapsedState({ f1: false }), ["f1"])).toBe(true);
  });
});

describe("useSidebarCollapseState.setAll", () => {
  it("collapses the three sections and every listed folder at once", async () => {
    const { result } = renderHook(() => useSidebarCollapseState());
    await act(async () => {});
    act(() => {
      result.current.setAll(true, ["f1", "f2"]);
    });
    expect(result.current.state).toEqual({
      favorites: true,
      recents: true,
      root: true,
      folders: { f1: true, f2: true },
    });
  });

  it("expands everything back", async () => {
    const { result } = renderHook(() => useSidebarCollapseState());
    await act(async () => {});
    act(() => {
      result.current.setAll(true, ["f1"]);
    });
    act(() => {
      result.current.setAll(false, ["f1"]);
    });
    expect(result.current.state).toEqual({
      favorites: false,
      recents: false,
      root: false,
      folders: { f1: false },
    });
  });

  it("rebuilds the folders map from the given ids (stale ids are dropped)", async () => {
    const { result } = renderHook(() => useSidebarCollapseState());
    await act(async () => {});
    act(() => {
      result.current.setAll(true, ["old"]);
    });
    act(() => {
      result.current.setAll(true, ["new"]);
    });
    expect(result.current.state.folders).toEqual({ new: true });
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm exec vitest run src/hooks/useSidebarCollapseState.test.ts`
Expected: FAIL — `isAnyExpanded` n'est pas exporté et `result.current.setAll` n'existe pas.

- [ ] **Step 3: Implémenter**

Dans `src/hooks/useSidebarCollapseState.ts` :

1. Ajouter au-dessus de la fonction `useSidebarCollapseState` (après `getSidebarStore`) :

```ts
/**
 * True when at least one section (favorites/recents/root) or one of the
 * given folders is currently expanded. A folder missing from the map counts
 * as expanded (the default).
 */
export function isAnyExpanded(
  state: SidebarCollapseState,
  folderIds: string[],
): boolean {
  if (!state.favorites || !state.recents || !state.root) return true;
  return folderIds.some((id) => !state.folders[id]);
}
```

2. Ajouter dans le hook, après le callback `expandRoot` :

```ts
  const setAll = useCallback((collapsed: boolean, folderIds: string[]) => {
    setState({
      favorites: collapsed,
      recents: collapsed,
      root: collapsed,
      folders: Object.fromEntries(folderIds.map((id) => [id, collapsed])),
    });
  }, []);
```

3. Ajouter `setAll,` à l'objet retourné par le hook (après `expandRoot,`).

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm exec vitest run src/hooks/useSidebarCollapseState.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSidebarCollapseState.ts src/hooks/useSidebarCollapseState.test.ts
git commit -m "feat: add setAll and isAnyExpanded to sidebar collapse state"
```

---

### Task 2: Bouton toggle dans la barre d'outils + i18n + CHANGELOG

**Files:**
- Modify: `src/components/notes/NotesSidebarSection.tsx`
- Modify: `src/locales/fr.json`
- Modify: `src/locales/en.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `isAnyExpanded(state, folderIds)` et `setAll(collapsed, folderIds)` de Task 1 ; `collapseState` déjà destructuré dans le composant ; prop `folders: FolderMeta[]` existante.
- Produces: rien de nouveau — UI uniquement.

**Pourquoi pas de test composant :** `NotesSidebarSection` n'a pas de harnais de test (DndContext + nombreuses props Tauri-dépendantes) ; la logique décisionnelle est entièrement dans `isAnyExpanded`/`setAll`, testés en Task 1. Vérification : compilation + smoke test manuel.

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/locales/fr.json`, objet `"notes"`, après la ligne `"empty": "Aucune note",` :

```json
    "collapseAll": "Tout replier",
    "expandAll": "Tout déplier",
```

Dans `src/locales/en.json`, objet `"notes"`, après la ligne `"empty": "No notes",` :

```json
    "collapseAll": "Collapse all",
    "expandAll": "Expand all",
```

- [ ] **Step 2: Câbler le hook dans le composant**

Dans `src/components/notes/NotesSidebarSection.tsx` :

1. Étendre l'import lucide-react existant (ligne ~8, qui contient déjà `FolderPlus`) avec `ChevronsDownUp` et `ChevronsUpDown`.

2. Ajouter `isAnyExpanded` à l'import du hook :

```ts
import { isAnyExpanded, useSidebarCollapseState } from "@/hooks/useSidebarCollapseState";
```

3. Dans la destructuration du hook (ligne ~558-566), ajouter `setAll,` après `expandRoot,` :

```ts
  const {
    state: collapseState,
    toggleFavorites,
    toggleRecents,
    toggleRoot,
    toggleFolder: toggleFolderCollapsed,
    expandFolder,
    expandRoot,
    setAll,
  } = useSidebarCollapseState();
```

4. Après la ligne `const rootCollapsed = collapseState.root;` (ligne ~569), ajouter :

```ts
  const folderIdsForCollapse = useMemo(() => folders.map((f) => f.id), [folders]);
  const anyExpanded = isAnyExpanded(collapseState, folderIdsForCollapse);
```

- [ ] **Step 3: Ajouter le bouton dans la barre d'outils**

Dans le bloc `{/* Search input + new-note button + new-folder button */}` (ligne ~851-880), après le `<Button>` FolderPlus, ajouter :

```tsx
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          style={{ color: "var(--vt-fg-3)" }}
          onClick={() => setAll(anyExpanded, folderIdsForCollapse)}
          title={anyExpanded ? t('notes.collapseAll') : t('notes.expandAll')}
          aria-label={anyExpanded ? t('notes.collapseAll') : t('notes.expandAll')}
        >
          {anyExpanded ? (
            <ChevronsDownUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronsUpDown className="w-3.5 h-3.5" />
          )}
        </Button>
```

Mettre à jour le commentaire du bloc en `{/* Search input + new-note + new-folder + collapse-all buttons */}`.

- [ ] **Step 4: Vérifier compilation et suite complète**

Run: `pnpm build` puis `pnpm test`
Expected: build OK, suite complète verte (436 tests attendus : 427 avant cette PR + 9 ajoutés en Task 1 ; Task 2 n'ajoute aucun test).

- [ ] **Step 5: Entrée CHANGELOG**

Dans `CHANGELOG.md`, sous `## [Unreleased]` → `### Added`, ajouter à la fin de la section :

```markdown
- **Notes sidebar** — new toolbar button to collapse or expand all folders and sections (Favorites, Recents, Unfiled) at once.
```

- [ ] **Step 6: Commit**

```bash
git add src/components/notes/NotesSidebarSection.tsx src/locales/fr.json src/locales/en.json CHANGELOG.md
git commit -m "feat: collapse/expand all button in notes sidebar"
```

---

### Vérification finale (avant PR)

- [ ] `pnpm test` — suite complète verte.
- [ ] `pnpm build` — compilation TypeScript + Vite OK.
- [ ] Smoke test manuel (nécessite `pnpm tauri dev` lancé par l'utilisateur — ne pas le lancer soi-même) : avec des dossiers + favoris + notes non classées, cliquer le bouton → tout se replie, icône passe à `ChevronsUpDown` ; recliquer → tout se déplie ; déplier un seul dossier → l'icône repasse à « tout replier » ; l'état survit à un redémarrage (persistance per-profile).
- [ ] Ouvrir la PR vers `main` : `feat/notes-collapse-all`.
