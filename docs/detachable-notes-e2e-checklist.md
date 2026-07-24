# Fenêtres de notes détachables — Checklist E2E manuelle

Spec : `docs/superpowers/specs/2026-07-24-detachable-notes-design.md`.
À dérouler sur un build dev (`pnpm tauri dev`) avant merge, puis sur le build
packagé avant release.

## PR 1 — Fondation

- [ ] Détacher via l'icône de l'onglet actif → fenêtre native ouverte, note
      éditable, onglet disparu du main.
- [ ] Titre de la fenêtre = titre de la note, mis à jour pendant la frappe.
- [ ] Éditer dans la fenêtre détachée → titre + date se rafraîchissent dans
      la sidebar du main ; contenu retrouvé après réattachement.
- [ ] Deux notes détachées côte à côte, édition des deux.
- [ ] Détacher une note déjà détachée (icône ou clic sidebar) → focus de la
      fenêtre existante, pas de doublon.
- [ ] X natif : onglet restauré dans le main SANS que le main s'affiche
      (tester main visible ET main dans le tray).
- [ ] Bouton « réattacher » : onglet restauré + main affiché/focus, onglet
      Notes actif, note active.
- [ ] Épingle : always-on-top on/off, état visuel du bouton.
- [ ] Suppression depuis la fenêtre détachée (footer) → confirmation → note
      supprimée, fenêtre fermée, pas d'onglet fantôme.
- [ ] Suppression depuis la sidebar du main d'une note détachée → fenêtre
      fermée, pas d'onglet fantôme.
- [ ] Fermer le main (tray) avec des notes détachées → elles restent
      ouvertes et éditables ; sauvegarde OK.
- [ ] Quitter l'app (tray → Quitter) avec des notes détachées → au
      redémarrage, elles reviennent en onglets dans le main.
- [ ] Tuer le process (crash simulé) → même résultat au redémarrage.
- [ ] Changement de profil → toutes les fenêtres notes se ferment.
- [ ] Thème light/dark switché dans le main → appliqué en direct dans les
      fenêtres détachées. Langue idem.
- [ ] Wiki-link `[[note]]` cliqué dans une fenêtre détachée → la cible
      s'ouvre en onglet dans le main (ou focus sa fenêtre si détachée).
- [ ] Toggle « local uniquement » dans la fenêtre détachée → icône mise à
      jour, état reflété dans le main.
- [ ] (Sync active) Éditer une note détachée → push cloud visible après ~2 s
      (vérifier `user_notes.updated_at` ou les logs sync du main).
- [ ] Mode compact / petite fenêtre note (320×240) → toolbar + footer
      utilisables.
- [ ] Régression mini window : thème + langue toujours synchronisés en
      direct après le refactor bootstrap (Task 4).

## PR 2 — Drag-out

- [ ] Glisser un onglet hors de la fenêtre principale → fantôme pendant le
      drag, fenêtre créée au point de lâcher.
- [ ] Lâcher DANS la fenêtre principale → annulation, rien ne se passe,
      le clic simple active toujours l'onglet.
- [ ] Échap pendant le drag → annulation.
- [ ] Drag vers un second écran (DPI différent si possible) → la fenêtre
      apparaît près du curseur.
- [ ] Clic molette sur un onglet ferme toujours l'onglet (régression).
