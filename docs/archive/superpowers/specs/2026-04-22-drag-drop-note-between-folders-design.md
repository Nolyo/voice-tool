# Drag & Drop de notes entre dossiers — Design

**Date :** 2026-04-22
**Branche :** `vk/3c6d-drag-drop-note`

## Contexte

Actuellement, le sidebar des notes (`src/components/notes/NotesSidebarSection.tsx`) supporte :

- Le **drag-to-reorder des dossiers** (un `DndContext` au niveau liste des dossiers).
- Le **drag-to-reorder des notes à l'intérieur d'un dossier** (un `DndContext` par dossier).
- Le **drag-to-reorder des notes de la racine** (un `DndContext` dédié).

Il n'est **pas possible** de déplacer une note d'un dossier à un autre par drag-and-drop. Le seul moyen actuel est le menu contextuel clic-droit (`buildContextMenuItems` avec "Move to…").

Cette spec décrit la mise en place d'un drag-and-drop inter-conteneurs (dossiers + racine) avec précision de position, dans l'esprit de Notion.

## Objectifs

- Permettre à l'utilisateur de drag une note depuis son dossier d'origine (ou la racine) vers :
  - Un autre dossier.
  - La section racine/Unfiled.
- Positionnement **précis** : la note peut être déposée entre deux notes existantes du conteneur cible.
- Auto-expand d'un dossier replié survolé pendant le drag (~600ms).
- Feedback visuel soigné (DragOverlay + indicateur d'insertion + surlignage du conteneur cible).

## Non-objectifs

- Pas de drag depuis/vers les sections **Favoris** et **Récents** (vues en lecture, pas des conteneurs physiques).
- Pas de hiérarchie (dossiers imbriqués) — les dossiers restent à plat.
- Pas de drag multi-sélection.
- Pas de tests automatisés (le projet n'en a pas pour le moment).

## Architecture

### DndContext unique

Fusion des `DndContext` imbriqués actuels en **un `DndContext` global** placé au niveau racine du sidebar.

À l'intérieur de ce contexte unique, trois familles de `SortableContext` coexistent :

1. **Liste des dossiers** (reorder des dossiers, comportement préservé).
2. **Un `SortableContext` par dossier** pour ses notes.
3. **`SortableContext` racine** pour les notes non classées.

Chaque item sortable porte un champ `data` permettant au dispatcher de router correctement :

```ts
// Dossier
data: { type: 'folder', id: string }

// Note
data: { type: 'note', id: string, containerId: string | 'root' }
```

Le dispatcher dans `onDragStart / onDragOver / onDragEnd` inspecte `active.data.current.type` et exécute la logique appropriée (folder reorder vs note move).

Les sections **Favoris** et **Récents** restent hors de tout `SortableContext` : ni draguables, ni drop targets.

### Zones droppables "sentinelle"

Chaque conteneur (dossier et racine) expose un `useDroppable` sur son corps, y compris quand il est vide, pour permettre le dépôt dans un dossier sans notes. L'ID du droppable correspond au `containerId` (folderId ou `'root'`).

### État local "draft" pendant le drag

Pendant un drag, on maintient un état local :

```ts
type DraftContainers = Record<string, string[]>; // containerId -> ordered noteIds
```

Ce draft est initialisé à `onDragStart` depuis l'état réel (notes + folders du store). Toutes les mutations visuelles pendant le drag se font sur ce draft. Le backend n'est appelé qu'à `onDragEnd`.

## Flux de drag d'une note

### onDragStart

- Capture `activeId`, `activeType`, `originContainerId`.
- Si `activeType === 'note'`, initialise `draftContainers` à partir des notes affichées.
- Rend visible l'overlay (`DragOverlay` avec mini-card : titre + icône favori).

### onDragOver

Cœur du comportement multi-container (pattern standard dnd-kit) :

1. Déduit le `overContainerId` sous le curseur :
   - Si on survole une note → son `data.current.containerId`.
   - Si on survole une zone sentinelle (en-tête ou corps vide) → son `id`.
2. Si le container cible ≠ container actuel de la note dans le draft :
   - Retire la note de l'ancien container du draft.
   - L'insère dans le nouveau à l'index calculé (au-dessus ou en-dessous de l'item `over`, ou en fin si drop sur en-tête).
3. **Auto-expand** : si le container cible est replié et ≠ origine :
   - Démarre un `setTimeout(600ms)` → `toggleCollapsed(containerId)` via `useSidebarCollapseState`.
   - Si le curseur quitte cette cible avant expiration → `clearTimeout`.
   - Un seul timer actif à la fois.

### onDragEnd

Comparaison du container d'origine (`originContainerId`) et du container final (dernier `overContainerId` dans le draft) :

- **Même container** → `reorderNotes(folderId, noteIds)` (comportement existant préservé).
- **Container différent** → nouvel helper `moveNoteToFolderAtIndex(noteId, targetFolderId, index)` :
  1. Appelle backend `move_note_to_folder(noteId, targetFolderId)`.
  2. Enchaîne `reorder_notes_in_folder(targetFolderId, noteIdsInNewOrder)`.
  3. En cas d'échec d'une des deux étapes : rollback visuel + toast d'erreur i18n.

Puis reset du draft et fermeture du DragOverlay.

### onDragCancel (ESC)

- Reset du draft (retour visuel à l'état initial).
- `clearTimeout` de l'auto-expand.
- Aucun appel backend.

## Flux de drag de dossier (préservé)

Si `active.data.current.type === 'folder'`, le dispatcher route vers la logique existante de reorder des dossiers (`handleFolderDragEnd` → `onReorderFolders(ids)`). Aucune régression attendue.

## Feedback visuel

- **`DragOverlay`** : mini-card suivant le curseur avec titre de la note + icône étoile si favori. Évite les glitchs lors du passage entre `SortableContext`.
- **Item d'origine** : `opacity: 0.4` via `useSortable().isDragging` (déjà en place).
- **Indicateur d'insertion** : trait horizontal natif via `useSortable` (existant).
- **Surlignage conteneur cible** : classe CSS `vt-folder-header--drop-active` sur l'en-tête quand `overContainerId === thisFolderId`. Outline accent OKLCH cohérent avec le design system `.vt-app`.
- **Drag de dossier** : comportement visuel actuel préservé tel quel (pas de `DragOverlay` ajouté pour les dossiers dans cette feature).

## Cas limites

| Cas | Comportement |
|-----|--------------|
| Drop sur dossier vide | Zone droppable sentinelle dans le corps → insertion à l'index 0. |
| Drop sur racine vide | Idem, zone sentinelle racine. |
| Note déjà dans dossier cible | Reorder simple (pas d'appel `move_note_to_folder`). |
| Échec backend | Toast `notes.errors.moveFailed` + rollback visuel + refetch liste notes. |
| ESC pendant drag | `onDragCancel` : rollback, aucun call backend. |
| Drop exactement sur la position d'origine | Aucun appel backend (optimisation : comparer draft final à l'état initial). |
| Dossier supprimé pendant drag (multi-window) | Cas extrêmement improbable, ignoré. |

## Modifications de fichiers

### Frontend

- **`src/components/notes/NotesSidebarSection.tsx`** — refactor JSX : un seul `DndContext`, dispatcher par `type`, zones droppables sentinelles, `DragOverlay`, gestion du draft + auto-expand timer.
- **`src/hooks/useNotes.ts`** — nouveau helper `moveNoteToFolderAtIndex(noteId, targetFolderId, index)` qui enchaîne `move_note_to_folder` et `reorder_notes_in_folder` avec rollback.
- **`src/hooks/useSidebarCollapseState.ts`** — ajouter une méthode `expand(containerId)` idempotente (utilisée par le timer auto-expand ; ne fait rien si déjà déplié).
- **`src/locales/en.json`** et **`src/locales/fr.json`** — ajouter :
  - `notes.errors.moveFailed` — "Failed to move the note" / "Échec du déplacement de la note".
  - `notes.dnd.dragHandle` (aria-label) si pertinent.
- **CSS** : classe `vt-folder-header--drop-active` dans le scope `.vt-app` (outline accent via tokens OKLCH existants).

### Backend

**Aucune modification Rust.** Les commandes `move_note_to_folder` et `reorder_notes_in_folder` existent déjà et suffisent.

## Stratégie de test

Pas de suite de tests frontend dans le projet — validation manuelle en dev (`pnpm tauri dev` lancé par l'utilisateur) :

1. Drag note dossier A → dossier B, position précise (entre deux notes) → recharger l'app, vérifier persistance.
2. Drag note → dossier replié → auto-expand après ~600ms.
3. Drag note → quitter avant 600ms → dossier reste replié, pas d'expand.
4. Drag note → ESC → aucun changement persisté.
5. Drag note dossier A → racine, et racine → dossier A.
6. Reorder intra-dossier (non-régression).
7. Reorder des dossiers (non-régression).
8. Menu contextuel "Move to…" (non-régression).
9. Échec simulé (ex. mock `move_note_to_folder` rejetant) → toast + rollback visuel.

## Risques

- **Refactor invasif** de `NotesSidebarSection.tsx` (~720 lignes). Mitigation : commit séparé du refactor structurel avant d'ajouter la logique cross-container, pour isoler une éventuelle régression.
- **Performance du draft** si beaucoup de notes par dossier : l'`onDragOver` recompute à chaque event. Mitigation : immuabilité + identité stable des tableaux (React ne re-render que les `SortableContext` dont le contenu change réellement).
- **Race condition** `move_note_to_folder` / `reorder_notes_in_folder` : si la première réussit et la seconde échoue, la note se retrouve déplacée mais mal positionnée. Mitigation : dans le helper, sur échec du reorder, on refetch la liste notes pour réaligner le front avec l'état backend réel.
