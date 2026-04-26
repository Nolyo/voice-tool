# Runbook — test de restauration backup Supabase

## Fréquence

**Trimestrielle.** Ajouter un rappel calendrier récurrent.

## Objectif

Garantir qu'un backup Supabase Pro est effectivement restaurable, pas juste présent.

## Préconditions

- Projet Supabase Pro `voice-tool-v3-prod` créé (cf. [`../ops/supabase-bootstrap.md`](../ops/supabase-bootstrap.md))
- Accès owner au projet
- PITR activé

## Procédure

1. Dans le dashboard Supabase : `Database` → `Backups`
2. Identifier le backup le plus récent (daily)
3. Noter son timestamp
4. Option A (recommandée) : créer un **nouveau projet de staging** `voice-tool-v3-restore-test-YYYY-MM-DD` et restaurer le backup dedans via `Restore to new project`
5. Option B (si non supporté par la UI) : utiliser PITR pour restaurer en place vers un timestamp dans les 7 derniers jours (attention : cela impacte la prod — à ne faire qu'en période creuse ou avec maintenance prévue)
6. Une fois restauré :
   - Se connecter en SQL : `select count(*) from auth.users;`
   - Vérifier que les comptes de test existent
   - Si sous-épique 02 déjà déployée : `select count(*) from user_settings;` doit retourner ≥ 1 ligne par user
   - Si sous-épique 03 déjà déployée : `select count(*) from notes;` doit être > 0
7. Supprimer le projet de staging une fois la vérif faite (éviter de payer pour rien)

## Vérification

- [ ] Backup restauré sans erreur
- [ ] Requêtes SQL de contrôle renvoient des résultats cohérents
- [ ] Projet de staging supprimé

## Rollback

Si la restauration échoue : ouvrir un ticket support Supabase **immédiatement**. Un backup non restaurable = incident CRITIQUE.

## Historique d'exécution

| Date | Opérateur | Résultat | Notes |
|---|---|---|---|
| <à remplir> | | | |
