# Checklist E2E — Mode streaming (transcription en continu)

> À dérouler manuellement (`pnpm tauri dev`) avant merge de `feat/streaming-transcription`.
> Prérequis : compte connecté + éligible cloud (trial ou abo), provider **Lexena Cloud**,
> setting **Transcription en continu** activé (Réglages → Dictée → Transcription).

## Activation & gating

- [ ] 1. Provider **Local** : la rangée « Transcription en continu » est désactivée avec
  le badge « Exclusif Lexena Cloud » ; impossible de l'activer.
- [ ] 2. Provider **LexenaCloud** + éligible : le toggle s'active et persiste après
  redémarrage de l'app.
- [ ] 3. Streaming activé puis retour provider **Local** : l'enregistrement suivant est
  un batch local classique (aucun événement streaming, aucune requête cloud).

## Dictée nominale

- [ ] 4. **Bouton** (carte héro Accueil) : démarrer, dicter 3-4 phrases avec des pauses
  naturelles. Le texte apparaît phrase par phrase dans la carte héro (~1-2 s après
  chaque pause). Stop → l'entrée d'historique contient le texte complet, provider
  « Cloud », et le collage suit `insertion_mode`.
- [ ] 5. **Hotkey toggle** (Ctrl+F11) avec fenêtre principale cachée (tray) : le mini
  window affiche le texte live à la place du visualiseur (point rouge + timer
  restent). Second Ctrl+F11 → succès, texte collé, entrée d'historique unique
  (pas de double transcription).
- [ ] 6. **PTT** (Ctrl+F12 maintenu) : phrase courte, relâcher. Un seul segment (flush),
  résultat identique au batch.
- [ ] 7. **Monologue long** (> 15 s sans pause) : coupe forcée — le texte arrive par
  blocs, pas de mot manifestement coupé en deux dans le résultat final.
- [ ] 8. **Post-process activé** : le texte live reste brut pendant la dictée ; à l'arrêt,
  la phase violette « post-traitement » s'affiche et le texte final est reformulé.
  `originalText` visible dans les détails de la transcription.

## Cas limites

- [ ] 9. **Silence total** (enregistrer 5 s sans parler) : aucun chunk envoyé (vérifier
  les logs Rust : « 0 chunks »), toast « Aucun son détecté », pas d'entrée d'historique.
- [ ] 10. **Annulation** (Échap pendant la dictée) : rien n'est collé, aucune entrée
  d'historique, mini window se cache, session marquée cancelled dans les logs.
- [ ] 11. **Longue pause** (parler, se taire 20 s, reparler) : pas de chunk pendant le
  silence, la dictée reprend correctement, texte complet à la fin.
- [ ] 12. **Coupure réseau en cours de dictée** (couper le Wi-Fi après la 1re phrase) :
  après 3 échecs consécutifs, toast d'erreur, l'enregistrement s'arrête proprement.
  Réactiver le réseau → l'app reste fonctionnelle (batch suivant OK).
- [ ] 13. **Micro-test des settings** (Réglages → Audio → test du micro) : ne déclenche
  JAMAIS de session streaming (aucun log « Streaming session started »).
- [ ] 14. **Streaming désactivé** (toggle off) : l'enregistrement cloud est un batch
  classique — parité de comportement avec la version précédente.

## Facturation & quotas

- [ ] 15. Après une dictée streaming de ~1 min : l'usage du mois (Réglages → Compte)
  augmente d'environ la durée réelle parlée (somme des segments, pas plus).
- [ ] 16. Trial/quota épuisé (ou simulé) : toast quota existant, l'enregistrement
  s'arrête, pas de boucle d'erreurs.

## Rate-limit worker (à vérifier côté infra avant beta)

- [ ] 17. Confirmer que le rate-limit `/transcribe` du worker tolère ~6 req/min/user
  (dictée continue) — la file d'upload est séquentielle donc ≤ 1 req en vol.
