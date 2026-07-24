# Fenêtres de notes détachables — Design

**Date** : 2026-07-24
**Statut** : validé (brainstorming complet avec l'utilisateur)
**Périmètre** : détacher une note dans sa propre fenêtre OS (façon Bloc-notes Windows), la réattacher, en avoir plusieurs côte à côte.

## 1. Contexte et objectif

L'éditeur de notes est docké dans la fenêtre principale, en onglets (`openNoteIds` dans
`useNotesWorkflow.ts`). On ne peut voir qu'une note à la fois. Objectif : pouvoir
détacher une note dans une fenêtre native indépendante — pour comparer deux notes,
ou garder une note flottante à l'écran pendant que le dashboard est dans le tray —
puis la réattacher en onglet.

L'app a déjà un précédent multi-fenêtres éprouvé : la mini window (entrée Vite
`mini.html`, création Rust `create_mini_window` dans `src-tauri/src/window.rs:351`,
capability dédiée, synchro thème/langue par événements broadcast). Ce design en est
le décalque, étendu au cas « N fenêtres dynamiques ».

## 2. Décisions de cadrage (validées)

| Question | Décision |
|---|---|
| Édition dans la fenêtre détachée | **Éditable, propriété exclusive** : l'onglet disparaît du main tant que la note est détachée. Zéro conflit d'édition par construction. |
| Nombre de fenêtres | **Plusieurs** — une fenêtre par note, sans limite artificielle. |
| Périmètre fonctionnel | **Édition riche complète** (tout TipTap : formatage, tableaux, checklists, code, slash commands, wiki-links) **sans IA, partage ni backlinks** — ces actions restent dans le main. |
| Redémarrage de l'app | Les notes détachées **reviennent en onglets** dans le main (pas de restauration des fenêtres). |
| Style de fenêtre | **Native** (décorations Windows standard, snap gratuit) + bouton **épingle** (always-on-top) + bouton **réattacher**. |
| Geste de détachement | **Drag-out « au lâcher »** (niveau VS Code : fantôme pendant le drag, fenêtre créée au point de lâcher) + **icône sur l'onglet actif** en déclencheur secondaire. Pas de tear-off façon Chrome (fenêtre suivant le curseur) — trop risqué dans Tauri. |
| Fermeture de fenêtre (X natif) | **Réattachement silencieux** : l'onglet est restauré dans le main sans le faire apparaître (s'il est dans le tray, il y reste). |
| Bouton « réattacher » | Même restauration d'onglet **+ affichage/focus du main** sur l'onglet Notes, note activée. |

Approche retenue : **entrée frontend dédiée légère + création de fenêtre côté Rust**
(approche A du brainstorming). Rejetées : création côté JS (`WebviewWindow`,
élargit les capabilities du main pour un gain nul) et réutilisation de l'app complète
en « mode note » (chaque fenêtre monterait son propre `SyncProvider` → files de sync
dupliquées, exactement la classe de bug corrigée par l'isolation par profil de juin 2026).

## 3. Architecture

### 3.1 Rust (`src-tauri/src/window.rs` + `commands/window.rs`)

- **`open_note_window(note_id: String, position: Option<(f64, f64)>)`** :
  - Valide `note_id` (format UUID + existence de la note sur disque) avant toute
    construction de label — pas de label arbitraire injectable.
  - Label : `note-<note_id>`. Si la fenêtre existe déjà → `show` + `set_focus`
    (garde anti-doublon), pas de recréation.
  - Sinon : `WebviewWindowBuilder` avec URL `note.html?noteId=<id>`, décorations
    natives, redimensionnable, ~520×640 par défaut (min ~320×240). Position :
    coordonnées physiques fournies (drag-out) sinon centrée avec décalage en
    cascade selon le nombre de fenêtres notes ouvertes.
- **`close_note_window(note_id: String)`** : fermeture par label. Utilisée par le
  main (suppression de note, réattachement explicite) et par `switch_profile`.
- **Événement `Destroyed`** : un handler `on_window_event` posé à la création émet
  `note-window-closed { noteId }` (broadcast) — c'est le signal unique de
  réattachement (cf. §4).
- **`switch_profile`** : ferme toutes les fenêtres dont le label commence par
  `note-` avant de basculer de profil.

Pas de persistance de géométrie des fenêtres notes (décision « retour en onglets
au redémarrage ») — contrairement à la mini window.

### 3.2 Frontend — nouvelle entrée

- **`note.html`** → **`src/note-window.tsx`** : 3e entrée Vite
  (`vite.config.ts` `rollupOptions.input`). Shell React minimal **sans** la pile de
  providers (pas d'Auth/Cloud/Sync/Updater), pattern mini window : import `./i18n`,
  fonts, classe `vt-app` sur body (fenêtre opaque native → le background opaque de
  `.vt-app` est correct ici), lecture de `?noteId=`.
- **`src/lib/window-bootstrap.ts`** *(refactor ciblé)* : extraction du bootstrap
  impératif déjà écrit dans `useMiniWindowState.ts:112-181` — chargement des
  settings du profil actif (thème, langue) via le store, application du thème,
  abonnements aux broadcasts `theme-changed` / `language-changed`. Utilisé par la
  fenêtre note **et** par la mini (déduplication, comportement inchangé).
- **`src/components/note-window/DetachedNoteShell.tsx`** : composition —
  fine barre d'outils (épingle + réattacher) au-dessus de l'éditeur plein cadre.
- **`src/hooks/useDetachedNote.ts`** : chargement de la note (`read_note`) et de la
  liste des notes (`list_notes`, pour l'autocomplétion `[[wiki-links]]` ;
  rafraîchie au focus de la fenêtre), câblage sauvegarde + événements (cf. §5),
  mise à jour du titre de fenêtre (`setTitle`) quand le titre de la note change.
- **Réutilisation de l'éditeur** : `useNotesEditorInstance` monté avec
  `openNotes = [laNote]` ; `NotesEditorContent` (sans preview IA), bubble menu,
  slash commands, `NoteLinkProvider` (clic sur lien → routé vers le main, cf. §5),
  footer avec compteur de mots + bouton supprimer (routé vers le main),
  `NoteSizeWarning` (>3 Mo) conservé. Pas de barre d'onglets : une fenêtre = une note.

### 3.3 Capability `src-tauri/capabilities/note.json`

```json
{
  "identifier": "note",
  "description": "Capability for detached note windows",
  "windows": ["note-*"],
  "permissions": [
    "core:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "store:default",
    "opener:default",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-title"
  ]
}
```

(`core:default` couvre `close`/`hide` ; les noms exacts des permissions
additionnelles seront vérifiés contre le schéma Tauri au moment du plan.)

## 4. Cycle de vie

Principe central : **la fermeture de fenêtre EST le signal de réattachement.**
Un seul chemin, tous les cas convergent.

État persisté : le store `tabs` existant (per-profil,
`get_active_profile_notes_tabs_path`) est étendu :
`{ openNoteIds, activeNoteId, detachedNoteIds }`.

| Cas | Comportement |
|---|---|
| **Détacher** (drag-out ou icône) | `invoke('open_note_window')` → le main retire l'id de `openNoteIds`, l'ajoute à `detachedNoteIds`. |
| **X natif** | Rust émet `note-window-closed` → le main restaure l'onglet **silencieusement** (pas de show du main). |
| **Bouton réattacher** | La fenêtre émet `note-reattach-request {id}` → le main restaure l'onglet, **s'affiche et se focus** (onglet Notes, note active), puis `close_note_window(id)`. Le `note-window-closed` qui suit trouve l'id déjà absent de `detachedNoteIds` → no-op. Pas de dépendance à l'ordre des événements. |
| **Suppression d'une note détachée** (depuis le main ou le bouton supprimer de la fenêtre, routé vers le main) | Le main retire l'id de `detachedNoteIds` **avant** `close_note_window` → le handler de fermeture ne ressuscite pas l'onglet. |
| **Main caché dans le tray** | Les fenêtres notes survivent et restent fonctionnelles (le webview du main caché continue de tourner — pattern déjà éprouvé par l'enregistrement via hotkey). Usage post-it assumé. |
| **Redémarrage / crash / quit tray** | Au chargement du store `tabs`, le main fusionne `detachedNoteIds` dans `openNoteIds` (avec filtrage des ids invalides, dédoublonnage) puis vide `detachedNoteIds`. Idempotent — couvre arrêt propre et crash. |
| **Changement de profil** | `switch_profile` ferme toutes les fenêtres `note-*`. |
| **Détacher une note déjà détachée** / clic sidebar sur note détachée | Focus de la fenêtre existante. |
| **Réattacher explicitement** quand l'id n'est plus valide (note supprimée entre-temps) | Restauration filtrée par existence dans la liste des notes → no-op propre. |

## 5. Flux de données et sync

**Sauvegarde** — pipeline à deux étages, fenêtre détachée en amont, main en aval :

1. Frappe TipTap → debounce 500 ms (existant dans `useNotesEditorInstance`) →
   `invoke('update_note')` : **écriture disque directe** depuis la fenêtre détachée
   (les commandes notes sont agnostiques à la fenêtre). La donnée est en sécurité
   à ce stade.
2. La fenêtre émet `note-detached-updated { id, title, updatedAt }` → le main
   (même caché) : rafraîchit les métadonnées en mémoire (sidebar : titre, date)
   **et** programme le push cloud via le `scheduleNoteUpdatePush` existant
   (debounce 2 s). **La file de sync reste mono-propriétaire dans le main** —
   aucun état sync dans les fenêtres détachées (le singleton de queue est par
   webview ; on ne le duplique jamais).

**Wiki-links** :
- Autocomplétion `[[...]]` : liste chargée via `list_notes` à l'ouverture,
  rafraîchie au focus de la fenêtre (pas de flux temps réel en v1).
- Clic sur `[[note]]` → `note-open-request { id }` vers le main → il s'affiche et
  ouvre l'onglet cible ; si la cible est elle-même détachée → focus de sa fenêtre.
- Lien cassé → dialogue de recréation existant conservé (`create_note` invocable
  partout) ; la note recréée s'ouvre dans le main.

**Note modifiée par un pull sync pendant détachement** : aujourd'hui
`applyRemoteNote` (notes-store.ts) écrit sur disque sans notifier personne (bug
latent qui touche déjà l'éditeur docké). Ce design ajoute l'événement manquant :
après chaque application distante, le main émet `note-remote-updated { id, updatedAt }`.
Fenêtre détachée : éditeur **propre** → rechargement silencieux du contenu ;
éditeur **dirty** (frappe non sauvée) → on garde la version locale, la prochaine
sauvegarde repart vers le cloud et le LWW tranche (comportement standard de la
sync). Le branchement de l'éditeur docké sur ce même événement est un **suivi
séparé**, hors de cette feature.

**Métadonnées pendant détachement** : favori, déplacement de dossier, renommage de
dossier restent faisables depuis la sidebar sans conflit — la propriété exclusive
porte sur le **contenu**. Le toggle « local uniquement » reste disponible dans la
fenêtre détachée (émet `note-detached-updated` pour que le main rafraîchisse).

### Récapitulatif des événements

| Événement | Émetteur → Récepteur | Payload |
|---|---|---|
| `note-window-closed` | Rust (Destroyed) → main | `{ noteId }` |
| `note-reattach-request` | fenêtre note → main | `{ id }` |
| `note-detached-updated` | fenêtre note → broadcast | `{ id, title, updatedAt }` |
| `note-detached-delete-request` | fenêtre note → main | `{ id }` |
| `note-open-request` | fenêtre note → main | `{ id }` |
| `note-toggle-local-only-request` | fenêtre note → main | `{ id }` |
| `note-meta-updated` | main → broadcast | `{ meta: NoteMeta }` |
| `note-remote-updated` | main → broadcast | `{ id, updatedAt }` |
| `theme-changed`, `language-changed` | main → broadcast *(existants)* | inchangés |

## 6. Drag-out (niveau 1, « au lâcher »)

- `pointerdown` sur un onglet + déplacement au-delà d'un seuil → mode drag :
  un **fantôme** (petit rectangle avec le titre de la note) suit le curseur.
- `pointerup` **hors des limites de la fenêtre principale** → conversion des
  coordonnées écran CSS (`screenX/screenY`) en coordonnées **physiques**
  (scale factor du moniteur courant — le code de positionnement de la mini window
  gère déjà les moniteurs) → `open_note_window(id, { x, y })` → détachement
  standard (§4).
- `pointerup` **dans** la fenêtre → annulation (le réordonnancement d'onglets par
  drag est un non-goal, cf. §8). `Escape` annule le drag en cours.
- L'icône « détacher » sur l'onglet actif reste le déclencheur secondaire
  (découvrabilité, accessibilité, fallback).
- Les calculs de coordonnées/seuils sont extraits en fonctions pures testables ;
  le geste lui-même relève de la checklist manuelle.

## 7. UI/UX

**Fenêtre principale** :
- Icône « détacher » (lucide, ~14 px) sur l'onglet actif de `NotesEditorTitleBar`,
  tooltip i18n « Ouvrir dans une fenêtre séparée ».
- Sidebar : les notes détachées gardent leur place dans l'arborescence avec un
  **indicateur icône** (lucide `AppWindow` ou équivalent, ~12-14 px, aligné à
  droite, même vocabulaire visuel que les indicateurs favori/local-only — jamais
  de texte ; libellé uniquement en tooltip). Clic → focus de la fenêtre.

**Fenêtre détachée** :
- Barre de titre native (titre de la note, mis à jour en direct).
- Fine barre d'outils : **épingle** (toggle `setAlwaysOnTop`, état visuel actif/inactif)
  et **réattacher**. Éditeur plein cadre en dessous.
- Thème light/dark + langue appliqués au chargement et en direct (helper
  `window-bootstrap` partagé).

**i18n** : toutes les nouvelles strings (tooltips, boutons, dialogue de
suppression) via react-i18next, fr + en. Aucun texte en dur.

## 8. Non-goals (v1)

- Tear-off façon Chrome (fenêtre suivant le curseur pendant le drag).
- Réordonnancement des onglets par drag.
- Actions IA, partage public, backlinks dans la fenêtre détachée.
- Restauration des fenêtres détachées au redémarrage (retour en onglets à la place).
- Édition simultanée d'une même note dans deux fenêtres (propriété exclusive).
- Drag-out depuis la sidebar (seulement depuis les onglets).
- Persistance de la géométrie des fenêtres notes.

## 9. Tests

- **Vitest** : logique détacher/réattacher/fusion-au-démarrage/suppression-pendant-
  détachement extraite en fonctions pures (extension de `useNotesWorkflow`) ;
  handlers d'événements de `useDetachedNote` avec `invoke`/`listen` mockés ;
  calculs de coordonnées du drag-out.
- **Rust** : tests unitaires sur la validation de `note_id` (format UUID,
  existence) et la construction du label, logique extraite des commandes (pattern
  des tests existants de `notes.rs`).
- **Checklist E2E manuelle** (`docs/` — pattern des checklists existantes) :
  détacher (drag-out + icône), éditer des deux côtés (notes différentes), X vs
  bouton réattacher avec main visible et main dans le tray, redémarrage (retour en
  onglets), suppression d'une note détachée (depuis le main et depuis la fenêtre),
  changement de profil, épingle, thème/langue en direct, deux notes détachées
  côte à côte, multi-écrans/DPI pour le drag-out.

## 10. Estimation et découpage

Chantier moyen-plus. Découpage recommandé en **2 PR** :

1. **Fondation** : commande Rust + entrée `note.html` + capability + shell +
   cycle de vie complet via l'icône de détachement + événements + sync +
   indicateur sidebar + tests.
2. **Drag-out + polish** : geste de drag, fantôme, coordonnées multi-écrans,
   checklist E2E finale.

Fichiers principaux touchés : `src-tauri/src/window.rs`,
`src-tauri/src/commands/window.rs`, `src-tauri/src/commands/profiles.rs`
(fermeture au switch), `src-tauri/capabilities/note.json` (nouveau),
`note.html` (nouveau), `src/note-window.tsx` (nouveau),
`src/components/note-window/*` (nouveau), `src/hooks/useDetachedNote.ts`
(nouveau), `src/lib/window-bootstrap.ts` (nouveau, extrait de
`useMiniWindowState`), `src/hooks/useNotesWorkflow.ts`,
`src/components/notes/NotesEditor/NotesEditorTitleBar.tsx`,
`src/components/notes/NotesSidebarSection.tsx`, `src/components/Dashboard.tsx`,
`src/lib/sync/notes-store.ts` (émission `note-remote-updated`),
`vite.config.ts`, locales i18n fr/en.
