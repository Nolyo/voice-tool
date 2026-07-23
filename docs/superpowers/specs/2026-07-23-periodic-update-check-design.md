# Vérification périodique des mises à jour — Design

**Date** : 2026-07-23
**Statut** : validé

## Problème

Le check de mise à jour ne s'exécute qu'une seule fois, 10 secondes après le démarrage
(`UpdaterContext.tsx`, verrou `hasCheckedOnStartup`). Or l'application reste couramment
ouverte plusieurs jours d'affilée (PC mis en veille la nuit, jamais redémarré) : une
release publiée après le démarrage n'est jamais détectée tant que l'app n'est pas
relancée.

## Objectif

Détecter une mise à jour disponible au plus tard ~1 heure après sa publication, même
quand l'app tourne depuis des jours, sans aucune interruption pour l'utilisateur.

## Décisions

- **Intervalle** : 1 heure, codé en dur. Pas de nouveau setting — le comportement est
  contrôlé par le setting existant `auto_check_updates` (comme le check startup).
- **Notification** : identique au check startup — `updateAvailable = true` → bannière
  sidebar + bouton header. Jamais de modal spontanée.
- **Approche retenue** : frontend uniquement, tick court + comparaison de timestamp
  (approche A). Rejetées : `setInterval(1h)` naïf (timer suspendu pendant la veille,
  écart réel imprévisible au réveil — précisément le cas d'usage visé) et tâche tokio
  côté Rust (duplication de logique, lecture du setting côté Rust, event supplémentaire
  — overkill pour un check horaire).

## Conception

Tout se passe dans `src/contexts/UpdaterContext.tsx`. Aucun changement Rust, aucune
nouvelle string i18n.

### Mécanisme

- Un ref `lastCheckTimeRef: number | null` mémorise l'horodatage (`Date.now()`) du
  dernier check terminé, quelle que soit son origine (startup, périodique, manuel via
  le `checkForUpdates` exposé par le contexte).
- Un effet monte un `setInterval` de 60 s, actif seulement si `isLoaded` et
  `settings.auto_check_updates` sont vrais. Cleanup au démontage et quand le setting
  passe à faux.
- À chaque tick, le check est déclenché si et seulement si :
  - `Date.now() - lastCheckTime >= 3_600_000` (ou `lastCheckTime` null) ;
  - aucune update n'est déjà détectée (`updateAvailable` faux) — inutile de re-checker,
    et cela évite d'écraser l'état pendant que l'utilisateur regarde la modal ;
  - aucun download en cours (`isDownloading` faux) ;
  - aucun check déjà en cours (`isChecking` faux).
- Le check périodique est silencieux : erreurs loguées en console uniquement, même
  politique que le check startup. Un échec met quand même à jour `lastCheckTimeRef`
  (pas de retry rapproché : le prochain essai aura lieu une heure plus tard).

### Robustesse veille / arrière-plan

- Pendant la veille PC, les timers JS sont suspendus ; au réveil, le tick suivant
  (≤ 1 min, éventuellement quelques minutes si WebView2 throttle la fenêtre cachée)
  compare les timestamps et rattrape immédiatement si plus d'une heure s'est écoulée.
- La fenêtre principale cachée dans le tray garde son webview vivant : le mécanisme
  fonctionne aussi app « fermée » dans le tray.

### Interactions avec l'existant

- Le check startup existant (timer 10 s) reste inchangé, il alimente simplement
  `lastCheckTimeRef` à sa complétion.
- Le `checkForUpdates` exposé par le contexte (utilisé par le bouton manuel des
  Settings) met aussi à jour `lastCheckTimeRef`, pour ne pas re-checker une heure
  après un check manuel.
- Le mock dev (`VITE_MOCK_UPDATE_AVAILABLE`) est orthogonal : il force l'UI mais ne
  touche pas au polling. Rien à changer.

## Gestion des erreurs

Échec réseau ou updater indisponible (dev/portable) → erreur loguée en console,
aucune UI, prochain essai à l'heure suivante. `useUpdater.checkForUpdates` gère déjà
l'indisponibilité en amont (`is_updater_available`).

## Tests

Pas de harnais de test frontend pour les contextes actuellement (les Vitest existants
couvrent `src/lib/`). La logique « faut-il checker maintenant ? » est extraite en
fonction pure exportée (`shouldCheckNow(state): boolean` ou équivalent) dans un module
`src/lib/updater/periodic-check.ts` pour être testable en Vitest ; le contexte ne fait
que la brancher sur le `setInterval`. Tests unitaires : seuil d'une heure, update déjà
détectée, download en cours, check en cours, premier passage (`lastCheckTime` null).

Validation manuelle : intervalle temporairement réduit (constante) + mock ou release
réelle, vérifier bannière sidebar après détection en cours de session.
