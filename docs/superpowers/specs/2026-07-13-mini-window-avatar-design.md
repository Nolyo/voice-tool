# Mini window — avatar du profil actif (design)

**Date** : 2026-07-13 · **Statut** : validé (conversation) · **Suite de** : PR 5 série UX (avatars de profils, PR #81)

## Objectif

Afficher l'avatar du profil actif dans la mini window (visualiseur flottant) pour identifier
d'un coup d'œil le profil en cours de dictée. Fallback initiales pour les profils sans photo
(décision utilisateur — l'identification doit marcher photo ou pas).

## Contraintes

- Dépend de la PR #81 (`ProfileAvatar`, commandes `get_profile_avatar` etc.) — branche stackée
  sur `feat/profile-avatar` tant que #81 n'est pas mergée.
- Feature 100 % locale : aucune migration, aucune Edge Function, aucun changement sync.
- Toute string UI via react-i18next (fr + en).
- La mini window ne doit JAMAIS être cassée par un échec avatar (erreurs avalées).
- Aucune modification de `src-tauri/capabilities/mini.json` (la mini window invoke déjà des
  commandes custom : `set_translate_mode`, `close_mini_window`).

## Design

**Données** — nouveau hook `src/hooks/useActiveProfileInfo.ts` :

- Au montage : `invoke("get_active_profile")` → id, `invoke("list_profiles")` → nom,
  `invoke("get_profile_avatar", { id })` → data-URL ou null.
- Retourne `{ name: string | null, avatarUrl: string | null }` (null tant que non chargé ou
  en cas d'erreur — chaque étape est enveloppée, échec silencieux).
- Pas de listener : `switch_profile` recharge toutes les WebViews (`window.location.reload()`),
  donc un fetch au montage est toujours frais.

**Affichage** — dans `MiniShell` (`src/components/mini-window/MiniShell.tsx`) :

- `<ProfileAvatar avatarUrl={...} name={...} className={...} />` tout à gauche de la rangée
  principale (avant `MiniStreamingHud`/`MiniVisualizer`), rendu seulement si `name` est chargé.
- Visible en `idle` et `recording` (y compris streaming). Masqué dans la status row
  (processing/success/error — états transitoires de 2-3 s).
- Tailles par layout (`useMiniWindowSize`) : compact `h-5 w-5 text-[8px]`, standard/extended
  `h-6 w-6 text-[10px]`. `shrink-0` (déjà porté par ProfileAvatar).
- Wrapper avec `title` + `aria-label` = `t("mini.activeProfile", { name })` :
  fr « Profil actif : {{name}} », en « Active profile: {{name}} ». Non interactif
  (le drag de la fenêtre reste fonctionnel).

## Tests

- Vitest, hook `useActiveProfileInfo` (mock `@tauri-apps/api/core`) : (1) chargement nominal
  nom + avatar ; (2) profil sans photo → `avatarUrl` null, nom présent ; (3) invoke qui rejette
  → `{ null, null }` sans erreur non gérée. Base : 490/68 (branche #81) → attendu 493/69.
- Vérification manuelle : mini window en dictée, avatar visible ; switch profil → avatar mis à jour.

## Livraison

Branche `feat/mini-window-avatar` (base `feat/profile-avatar`), PR stackée — retarget
automatique vers main au merge de #81. CHANGELOG : étendre la bullet « Profile pictures »
existante de la section Unreleased (même release) avec la mention mini window — pas de
nouvelle bullet.
