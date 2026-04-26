# Sub-épique 02 — Sync Settings : Checklist E2E manuelle

> **Précondition** : 2 devices (ou 2 utilisateurs OS différents, ou 1 device + 1 VM). Un compte Supabase. Projet déployé avec migrations 20260525* + Edge Functions `sync-push` et `account-export`.

## Scénario 1 — Activation sync + upload initial
1. Device A : Lancer l'app, créer un compte (signup magic link ou E/P).
2. Device A : Settings > Vocabulaire > ajouter 5 mots dico + 2 snippets.
3. Device A : Settings > Raccourcis > changer "Toggle" en `Ctrl+Shift+R`.
4. Device A : Settings > Compte > "Activer". Modale apparaît, choix "Upload". Backup local doit être créé (vérifier Settings > Compte > Backups locaux).
5. Attendre ≤ 5s que l'icône header passe à ✅.
6. Vérifier dans Supabase Studio que `user_settings`, `user_dictionary_words`, `user_snippets` contiennent la data du user.

## Scénario 2 — Pull sur device B
1. Device B : Lancer l'app (fresh install, aucun setup).
2. Device B : Créer un compte **avec les mêmes identifiants** (ou login si signup est fait).
3. Device B : Settings > Compte > "Activer". Modale doit indiquer "état local quasi-vide" → "Upload" auto.
4. Observer que les 5 mots + 2 snippets + hotkey apparaissent dans ~2-3s.

## Scénario 3 — LWW par item
1. Device A et B tous deux connectés et sync activée.
2. Device A : modifier le snippet X → contenu "A".
3. Device B (offline, couper wifi) : modifier le même snippet → contenu "B".
4. Device B : rebrancher wifi. Attendre le flush queue.
5. Résultat attendu : Device A voit "B" (le push offline a un `updated_at` serveur plus récent).

## Scénario 4 — Delete vs update conflict
1. Device A : supprimer snippet X à 10:00.
2. Device B : modifier le même snippet X à 10:00:30 (la propagation du delete n'est pas encore arrivée).
3. Après sync des deux : soit delete gagne, soit update — c'est le `updated_at` le plus récent qui gagne (LWW).
4. Vérifier que le résultat est cohérent (pas de "zombie row").

## Scénario 5 — Offline / reconnexion
1. Device A : couper wifi.
2. Ajouter 3 mots dico + supprimer 1 snippet.
3. Vérifier icône header : ⚠️/📶 (offline) avec count = 4 dans la tooltip.
4. Rebrancher wifi. Icône passe à 🔄 puis ✅.
5. Device B : vérifier que les 3 mots apparaissent + snippet supprimé.

## Scénario 6 — Cross-tenant (sécurité)
1. Avec 2 users A et B, vérifier manuellement dans Supabase Studio que :
   - Requête `select * from user_settings` en tant que A ne retourne que sa row.
   - Aucune query de A ne retourne quoi que ce soit de B.
2. (Déjà couvert par pgtap Task 5 mais re-vérifier manuellement en prod au moins une fois.)

## Scénario 7 — Export GDPR
1. Device A : Settings > Compte > "Exporter mes données".
2. Fichier `voice-tool-export_YYYY-MM-DD_HHmmss.json` doit apparaître dans Downloads.
3. Ouvrir le JSON, vérifier présence de `user_settings`, `user_dictionary_words`, `user_snippets`, `user_devices`.

## Scénario 8 — Delete account
1. Device A : Settings > Sécurité > "Supprimer mon compte" → taper "SUPPRIMER" → confirmer.
2. App se déconnecte.
3. Vérifier dans Supabase Studio : la row `account_deletion_requests` est créée.
4. Les données `user_settings/snippets/dictionary` sont toujours présentes (purge effective post-cron 30j).

## Scénario 9 — Restore backup local
1. Device A : avant tout, noter snippets + dico.
2. Device A : Settings > Compte > Backups locaux > choisir le plus récent → Restaurer.
3. Vérifier que l'état est identique au snapshot pré-sync.

## Scénario 10 — Quota (option manuelle, lourd)
1. Device A : ajouter ~6 MB de données (snippets gros payloads).
2. Observer que le push rejette avec HTTP 413 et message "quota exceeded".
3. Supprimer quelques snippets → push repasse.

## Scénario 11 — Multi-profils warning
1. Device A : créer un 2e profil (Settings > Profils > Ajouter).
2. Retour sur le profil initial, sync déjà activée.
3. Vérifier qu'un encart amber "La synchronisation couvre uniquement ton profil actif (…)" est affiché dans Settings > Compte.
4. Bascule vers le 2e profil : le setup est complètement différent (local only), et l'activation de sync dans ce profil fera un upload indépendant (FIFO avec le profil #1 : les données de #2 écrasent partiellement celles de #1 côté cloud).

## Scénario 12 — Legacy migration (users déjà installés)
1. Utiliser un profil avec données dans `settings.snippets` / `settings.dictionary` (pre-sub-épique 02).
2. Lancer la nouvelle version.
3. Sans activer la sync : ouvrir Settings > Vocabulaire → les snippets et mots legacy doivent apparaître (migration one-shot au mount de `useRecordingWorkflow`).
4. Dicter un snippet trigger → vérifier que le replacement est bien inséré (preuve que le recording workflow lit le nouveau store).

## Tests cross-OS (obligatoires pour v3.0 GA)
- Windows 11 ↔ Windows 11
- Windows 11 ↔ macOS Sonoma (si environnement dispo)
- Linux (si environnement dispo)
