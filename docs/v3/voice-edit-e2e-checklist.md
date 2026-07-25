# Checklist E2E — Voice Edit

> À dérouler manuellement (`pnpm tauri dev`) avant merge de `feat/voice-edit`.
> Prérequis : compte connecté + éligible cloud (trial ou abo). Raccourci par
> défaut **Ctrl+F9** (Réglages → Raccourcis).
>
> ⚠️ **Le cas 1 est bloquant** : il valide `SetForegroundWindow`, le seul point du
> design qui n'a pas pu être vérifié sans lancer l'application. S'il échoue, la
> capture et la lecture restent utilisables, mais le bouton « Remplacer » doit
> être revu (cf. `docs/superpowers/specs/2026-07-25-voice-edit-design.md` §4.2).

## Capture et remplacement

- [ ] 1. **Bloc-notes** — écrire une phrase, la sélectionner, Ctrl+F9, frapper `2`
  (Corriger). Le résultat s'affiche dans l'overlay ; « Remplacer » remplace bien
  la sélection dans le Bloc-notes et l'overlay se ferme.
- [ ] 2. **Chrome, zone en lecture seule** — sélectionner un paragraphe d'un article,
  Ctrl+F9, `1` (Traduire). « Copier » fonctionne. « Remplacer » échoue proprement :
  message explicite, texte toujours visible et déjà dans le presse-papiers, rien
  n'est perdu.
- [ ] 3. **VS Code** — sélectionner un commentaire, Ctrl+F9, `1`. Remplacement correct,
  indentation environnante intacte.
- [ ] 4. **Champ de saisie web** (barre de recherche, textarea Gmail) — capture et
  remplacement corrects.

## Traduction (cas d'usage principal)

- [ ] 5. Texte **anglais** sélectionné + `1` → traduction en français.
- [ ] 6. Texte **français** sélectionné + `1` → traduction en anglais (bascule auto).
- [ ] 7. Changer la langue principale en Réglages → Raccourcis → Voice Edit, refaire
  le cas 5 : la cible suit le réglage.

## Instruction dictée

- [ ] 8. Sélectionner un texte, Ctrl+F9, **dicter** « traduis-moi ça en gardant le ton
  formel », se taire. L'overlay passe en transcription (~800 ms après la fin de
  parole) puis affiche le résultat.
- [ ] 9. Dicter une instruction avec une **hésitation au milieu** (« reformule… euh…
  en plus court ») : l'instruction n'est pas coupée en deux.
- [ ] 10. Appuyer sur `1` **pendant** qu'on parle : l'action de palette gagne, le micro
  est coupé, aucune transcription parasite n'arrive après coup.
- [ ] 11. Ouvrir l'overlay et **ne rien dire pendant 30 s** : le compte à rebours
  descend jusqu'à 0, le micro se ferme tout seul, message « Aucune instruction
  entendue ».
- [ ] 11 bis. **Indicateur micro** — dès l'ouverture, les barres réagissent à la voix
  (et retombent au silence), et le compte à rebours démarre à 30 s. Dès qu'on se
  tait et que la transcription part, barres et jauge **disparaissent** : plus rien
  ne suggère un micro ouvert.

## Presse-papiers

- [ ] 12. Copier un texte témoin (« ABC »), puis faire un Voice Edit complet sur une
  autre sélection. Coller ensuite (Ctrl+V) ailleurs : **« ABC » est toujours là**
  tant qu'on n'a pas cliqué « Copier » ou « Remplacer ».
- [ ] 13. Même chose avec un **presse-papiers vide** au départ : le presse-papiers
  contient ensuite le texte sélectionné (comme après un Ctrl+C manuel). Le
  presse-papiers n'est jamais écrasé silencieusement par du vide.
- [ ] 14. Copier une **image** (capture d'écran), puis Ctrl+F9 sur une sélection de
  texte ailleurs. Revenir coller l'image : **elle est toujours là**. Un presse-papiers
  non textuel n'est jamais écrit par Voice Edit.

## États et bords

- [ ] 15. `Échap` à chaque état (écoute, transcription, traitement, résultat, erreur) :
  ferme sans rien modifier, aucune requête ne repeuple l'overlay après coup.
- [ ] 16. **Aucune sélection** (clic dans le vide puis Ctrl+F9) : bascule en dictée
  simple, message dédié, pas d'erreur.
- [ ] 17. **Sélection très longue** (> 15 000 caractères, p. ex. un article entier) :
  bandeau de troncature affiché avant l'appel.
- [ ] 18. **Relancer** depuis le résultat : rejoue la même action.
- [ ] 19. Ctrl+F9 **pendant un enregistrement en cours** (Ctrl+F11 actif) : ignoré,
  aucun overlay, la dictée continue normalement, et un toast explique pourquoi.
- [ ] 20. **Non éligible cloud** (se déconnecter) : l'overlay s'ouvre sur l'écran
  d'upsell, **aucun appel réseau** (vérifier l'onglet réseau / les logs).
- [ ] 21. Une erreur affichée (couper le réseau, lancer une action), puis **Relancer**
  avec le réseau rétabli : le message d'erreur **disparaît**, il ne reste pas
  affiché sous le résultat réussi.

## Cohabitation avec la dictée

- [ ] 22. Ctrl+F9, puis **Ctrl+F11 pendant que l'overlay écoute** : rien n'est collé
  dans l'application source. L'instruction n'est jamais traitée comme une dictée.
- [ ] 23. Overlay ouvert sur un résultat, lancer une dictée avec Ctrl+F11, puis
  **Échap** (l'overlay a le focus) : la dictée **continue**, elle n'est pas coupée.
- [ ] 24. Overlay ouvert sur un résultat, dictée en cours, appuyer sur `1` :
  la dictée n'est pas interrompue.

## Réglages

- [ ] 25. Vider le raccourci Voice Edit : le raccourci est désactivé, Ctrl+F9 ne fait
  plus rien, et le réglage survit à un redémarrage.
- [ ] 26. Assigner à Voice Edit un raccourci **déjà utilisé** (Ctrl+F11) : refusé avec
  un message de conflit, l'ancien raccourci reste actif.
- [ ] 27. Redémarrer l'app : le raccourci et les deux langues sont conservés.
- [ ] 28. **Chemin de mise à jour** — affecter Ctrl+F9 à la dictée, supprimer la clé
  `voice_edit_hotkey` du `settings.json` du profil, relancer : tous les raccourcis
  existants fonctionnent toujours (Voice Edit reste simplement désactivé).

## Overlay

- [ ] 29. Thème **sombre** puis **clair** : l'overlay suit, y compris s'il est ouvert
  au moment du changement.
- [ ] 30. Changer la langue de l'interface : les libellés de la palette de l'overlay
  suivent sans redémarrer l'application.

## Non couvert par ce lot

- La **personnalisation des actions de palette** (libellés et prompts éditables)
  n'est pas livrée : la palette est fixe (Traduire / Corriger / Reformuler /
  Résumer). Rien à tester ici.
