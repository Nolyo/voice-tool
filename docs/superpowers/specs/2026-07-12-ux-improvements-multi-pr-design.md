# Améliorations UX — série de 5 PR (design)

**Date** : 2026-07-12
**Statut** : validé (brainstorming du 2026-07-12)
**Portée** : 5 features indépendantes, livrées en 5 PR séparées, dans cet ordre :

| # | PR | Taille estimée | Touche la sync/DB |
|---|----|----------------|-------------------|
| 1 | Nettoyage des `...` en streaming | XS | non |
| 2 | Tout replier / tout déplier (sidebar notes) | XS | non |
| 3 | Toggle « note locale » (jamais synchronisée) | M | oui (comportement client, pas de migration) |
| 4 | Emoji par dossier (synchronisé) | M | oui (migration + Edge Functions) |
| 5 | Photo de profil (locale) | M | non |

Chaque PR suit le cycle habituel : branche → implémentation TDD → PR vers `main`
(branche protégée, jamais de commit direct).

---

## PR 1 — Nettoyage des `...` en streaming

### Problème

En mode streaming, les hésitations en cours de phrase produisent des chunks que
Whisper transcrit avec des points de suspension (`...` en fin de chunk coupé,
chunks entiers réduits à `...`). Résultat constaté :

> « ni le feu ni la glace ne serait... atteindre En intensité, ce qu'enferme un
> homme dans l'illusion. ... de son cœur. »

L'utilisateur doit rééditer chaque phrase, au point de désactiver le streaming.

### Décision

**Suppression totale** des ellipses, appliquée par chunk au moment de
l'assemblage — donc visible dans le live HUD **et** dans le texte final.

### Design

- Nouvelle fonction pure `stripEllipses(text: string): string` exportée depuis
  `src/lib/streaming/assembler.ts` :
  - supprime toute séquence de **3 points ou plus** (`\.{3,}`) et tout `…`
    (U+2026, y compris répété) ;
  - remplacement par un espace, puis renormalisation des espaces (le
    `assembled()` existant fait déjà `replace(/\s+/g, " ")` + `trim()`) ;
  - un chunk réduit à des ellipses devient chaîne vide → déjà filtré par
    `assembled()`.
- Appel dans `TranscriptAssembler.upsert(index, text)` : on stocke le texte
  nettoyé. Aucun autre point d'entrée à modifier (live et final passent tous
  deux par l'assembler).

### Hors périmètre

- Le mode batch (non-streaming) n'est pas modifié.
- On ne répare pas le reste de la ponctuation de Whisper (ex. le point orphelin
  dans « l'illusion. de son cœur » reste tel quel).

### Tests

Cas unitaires (Vitest, `assembler.test.ts` ou fichier dédié) :

- `serait... atteindre` → `serait atteindre` (ellipse collée au mot) ;
- ` ... ` isolé → espace unique ;
- `…` unicode et `……` ;
- chunk entièrement `...` → exclu de l'assemblage ;
- texte sans ellipse → inchangé ;
- `..` (deux points) → **conservé** (pas une ellipse) ;
- `?...` / `!...` → `?` / `!` conservés.

---

## PR 2 — Tout replier / tout déplier (sidebar notes)

### Décision

Un **seul bouton toggle** dans la barre d'outils de la sidebar notes, qui agit
sur **les dossiers ET les sections** (Favoris, Récents, Non classées).

### Design

- `useSidebarCollapseState` (`src/hooks/useSidebarCollapseState.ts`) gagne
  `setAll(collapsed: boolean, folderIds: string[])` : écrit d'un coup
  `favorites`, `recents`, `root` et une entrée par dossier. Persistance
  inchangée (store par profil, debounce 300 ms).
- `NotesSidebarSection.tsx` : bouton ajouté à côté de « + » et « nouveau
  dossier » :
  - si **au moins une** section ou un dossier est déplié → action « tout
    replier », icône `ChevronsDownUp` (lucide) ;
  - sinon → « tout déplier », icône `ChevronsUpDown`.
- i18n : `notes.collapseAll` / `notes.expandAll` dans **toutes** les locales
  existantes (title + aria-label — jamais de texte en dur).

---

## PR 3 — Toggle « note locale » (jamais synchronisée)

### Problème

Le titre d'une note est toujours **dérivé de la première ligne du contenu**
(`deriveTitle`) — il n'existe pas de champ titre séparé. L'idée initiale
« pas de titre → pas de sync » est donc inapplicable. Besoin réel : pouvoir
créer une note temporaire sans qu'elle parte dans le cloud (où sa suppression
laisserait un tombstone 30 jours).

### Décision

Toggle **explicite par note** : « note locale » (cloud-off). Tant qu'il est
actif, la note n'est jamais poussée. En bonus, une note au contenu vide n'est
plus poussée du tout.

### Design

**Modèle** :

- `notes.rs` : champ `local_only: bool` sur la note, `#[serde(default)]`
  (défaut `false`), exposé `localOnly` dans `NoteMeta` TS.
- Purement local : jamais mappé vers le cloud (`mapping.ts` ne le transporte
  pas), survit au backup/restore local (le restore passe par
  `import_note_for_backup` qui préserve la meta).

**Gate de sync** (même mécanique que le cap de taille `isNoteSyncable`) :

- `notes-store.ts` : `enqueueNoteUpsertIfSyncable` saute toute note
  `localOnly` ; le enqueue de création est sauté si `localOnly` **ou** contenu
  vide (le premier update non vide poussera — `sync-push` fait des upserts,
  pas de dépendance à une op de création).
- `SyncContext.fullPush` : le scan initial saute les notes `localOnly` et les
  notes vides.

**Sémantique de bascule** (validée) :

- **synced → locale** : enqueue `note-delete` → tombstone cloud 30 j, la note
  disparaît des autres appareils au pull. La copie locale de l'appareil
  courant est intacte.
- **locale → synced** : enqueue un upsert complet, la note repart normalement.
- Garde tombstone existante de `notes-store` : inchangée.

**UI** :

- Icône cloud / cloud-off dans l'en-tête de l'éditeur (`NotesEditorHeader`) ;
- entrée dans le menu contextuel des notes de la sidebar ;
- indicateur discret cloud-off sur l'item sidebar d'une note locale ;
- i18n complet (fr + autres locales).

**Interaction avec les compteurs** : `SyncActivationModal` et
`AccountSection::SyncedInventoryGrid` comptent des notes synchronisées — les
notes `localOnly` en sont exclues.

### Tests

- Rust : persistance du champ (`local_only` survit save/load + backup import).
- Vitest `notes-store` : pas d'enqueue quand `localOnly` ; pas d'enqueue à la
  création vide ; enqueue `note-delete` sur bascule synced → locale ; upsert
  sur bascule inverse.
- Le prédicat de push est extrait en helper pur (ex. `shouldPushNote(meta,
  content)` regroupant cap de taille + `localOnly` + contenu vide) et testé
  unitairement ; `notes-store` et `fullPush` consomment tous deux ce helper.

---

## PR 4 — Emoji par dossier (synchronisé)

### Décision

Icône de dossier = **emoji libre**, champ **synchronisé** (comme le nom).
Picker frugal : grille curatée + saisie libre, pas de lib lourde
(emoji-mart ≈ 500 Ko rejeté).

### Design

**Modèle** :

- `folders.rs` : `icon: Option<String>` (`#[serde(default)]`), exposé
  `icon?: string` dans `FolderMeta`.
- L'emoji voyage dans le row LWW existant (`updated_at`) — aucune logique de
  merge supplémentaire (`mergeFolderLWW` inchangé).

**DB / sync** :

- Migration Supabase additive : `ALTER TABLE user_folders ADD COLUMN icon
  TEXT;` (nullable, **timestamp réel** `YYYYMMDDHHMMSS`). RLS inchangé.
- `schemas.ts` : `CloudUserFolderRowSchema` + champ `icon` nullable.
- `mapping.ts` : transport `icon` dans les deux sens.
- Edge Functions : `sync-push` stampe `icon` sur les `folder-upsert` ;
  `account-export` inclut la colonne. Redéploiement des deux requis.
- Rétro-compat : anciens clients ignorent la colonne ; `icon` absent → `null`.

**UI** :

- `FolderNameDialog` (création **et** renommage) : grille d'environ 24 emojis
  courants + champ de saisie libre (un emoji tapé/collé, ex. via Win+.) +
  bouton « aucun » (retour à l'icône dossier par défaut).
- Affichage : partout où `<Folder>` (lucide) représente un dossier nommé —
  sidebar (`FolderSection`), menu contextuel « déplacer vers », fil d'ariane
  de l'éditeur. Fallback : icône `Folder` actuelle si `icon` absent.
- i18n pour les nouveaux libellés du dialog.

**Déploiement** (à exécuter pendant la PR, état explicite en fin de PR) :

1. `pnpm exec supabase db push` (migration additive) ;
2. `pnpm exec supabase functions deploy sync-push` ;
3. `pnpm exec supabase functions deploy account-export`.

### Tests

- Vitest : mapping aller-retour avec/sans `icon`, schéma Zod (null / absent /
  string).
- Deno Edge : `folder-upsert` avec `icon` persisté ; export inclut `icon`.
- Rust : persistance locale du champ.
- pgtap : artefact mis à jour si les tests folders référencent les colonnes.

---

## PR 5 — Photo de profil (locale)

### Décision

Avatar **local uniquement** (les profils sont locaux — `profiles.json` ; pas de
Supabase Storage). Image croppée/redimensionnée côté frontend, stockée dans le
dossier du profil.

### Design

**Stockage** :

- Fichier `profiles/<id>/avatar.png`, 256×256 px.
- La présence du fichier fait foi — **aucun champ** ajouté à `ProfileMeta` /
  `profiles.json`.
- La suppression d'un profil emporte son dossier, donc son avatar (comportement
  existant).

**Commandes Rust** (`commands/profiles.rs`) :

- `set_profile_avatar(profile_id, bytes: Vec<u8>)` — écrit le PNG (valide que
  le profil existe dans le manifest) ;
- `get_profile_avatar(profile_id) -> Option<String>` — data-URL base64
  (≈ 30-80 Ko) ou `None` si absent ;
- `clear_profile_avatar(profile_id)` — supprime le fichier.

**Traitement d'image (frontend)** :

- File picker (input file image/*) → `FileReader` → `Image` → canvas :
  crop carré centré + resize 256×256 → `toBlob("image/png")` → bytes vers
  `set_profile_avatar`. Aucune dépendance image côté Rust.

**UI** :

- `ProfilesManageDialog` : changer / retirer la photo par profil.
- `ProfileSwitcher` : l'avatar (bouton principal 28 px + liste du dropdown
  24 px) affiche l'image si présente, sinon les initiales actuelles
  (`getInitials`).
- L'avatar du **compte** (cercle initiales-email en haut du dropdown) n'est
  pas concerné.
- i18n pour les nouveaux libellés.

### Tests

- Rust : set/get/clear + profil inexistant → erreur.
- Vitest : utilitaire de crop/resize si extrait en fonction pure testable
  (sinon vérification manuelle).

---

## Risques et points d'attention transverses

- **PR 3** : c'est la seule PR avec une sémantique cloud non triviale
  (tombstone à la bascule). Bien vérifier sur un second appareil que la note
  disparaît au pull sans toucher la copie locale de l'appareil source.
- **PR 4** : migration prod directe (pas de DB de test) — additive et
  nullable, risque faible ; déployer les Edge Functions dans la même fenêtre
  que le `db push` pour éviter un `sync-push` qui ignore `icon`.
- **i18n** : toute string UI passe par react-i18next (title/aria-label
  compris) — vaut pour les 5 PR.
- **CHANGELOG** : en anglais, une entrée par PR.
