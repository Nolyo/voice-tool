# E2E Checklist — Account deletion

## User sans MFA

- [ ] Connexion → Settings → Compte → "Supprimer mon compte" → tape le mot de confirmation
- [ ] Alerte "purge sous 30 jours" affichée
- [ ] Vérifier en DB : ligne dans `account_deletion_requests` avec le bon `user_id`
- [ ] L'app a fait un signOut, retour écran login
- [ ] Re-login : on atterrit sur `DeletionPendingScreen`, dates affichées correctement
- [ ] Click "Annuler" → DB : ligne supprimée, app normale apparaît

## User avec MFA enrolled

- [ ] Demande de suppression → si déjà AAL2, succès direct (cas normal)
- [ ] Edge case AAL1 + MFA : RPC retourne `aal2_required`, l'erreur est affichée, MFA challenge déclenché
- [ ] Annulation déclenche le même flow si AAL1
- [ ] Recovery code utilisable comme alternative au TOTP pour atteindre AAL2

## Sessions actives multi-devices

- [ ] App ouverte sur PC1 ET PC2, demande de suppression sur PC1
- [ ] PC2 : au plus tard 1h après, refresh token KO → écran login → DeletionPendingScreen

## Cron de purge

- [ ] Backdate manuel d'une tombstone à -31j : `update account_deletion_requests set requested_at = now() - interval '31 days' where user_id = '<uid>'`
- [ ] Trigger manuel : `select cron.run('purge-account-deletions-daily')`
- [ ] Vérifier : `auth.users` ne contient plus l'uid, toutes les tables user (snippets, dictionary, settings, devices, recovery_codes) ne contiennent plus de ligne pour cet uid

## Données locales

- [ ] Avant suppression : présence de `sync-snippets.json`, `sync-dictionary.json`, etc. dans `%APPDATA%/com.nolyo.voice-tool/`
- [ ] Après suppression : ces fichiers sont absents/vides
- [ ] Backups dans `%APPDATA%/com.nolyo.voice-tool/backups/` : tous supprimés
- [ ] Recordings et historique transcriptions : **conservés** (intentionnel)
