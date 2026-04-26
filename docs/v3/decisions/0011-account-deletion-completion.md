# 0011 — Account deletion: closure of the 30-day purge pipeline

**Date** : 2026-04-25
**Statut** : décidé
**Clôt** : reports tracés dans 0009 et 0010 ("Edge Function purge-account-deletions cron 30j")

## Contexte

L'épique v3 ne peut pas sortir publiquement avec un bouton "Supprimer mon compte" qui ne supprime rien. Le pipeline de purge avait été reporté lors des sub-épiques 01 et 02 ; ce sous-chantier le ferme.

## Décisions

- **Grace period** : 30 jours, conforme RGPD.
- **Mécanisme de purge** : `pg_cron` quotidien (03:00 UTC) → Edge Function `purge-account-deletions` → `auth.admin.deleteUser(uid)` pour chaque tombstone expirée → cascade FK sur toutes les tables user.
- **AAL2** : `request_account_deletion` et `cancel_account_deletion` exigent AAL2 quand un facteur MFA `verified` existe.
- **Sessions** : `signOut({ scope: 'global' })` au moment de la demande révoque tous les refresh tokens.
- **Re-login** : bloqué pendant la fenêtre via `DeletionPendingScreen` (proposant annuler ou logout).
- **Données locales** : purge agressive des caches cloud (sync stores + backups), conservation des données 100% locales (transcriptions, recordings).

## Conséquences

- Suppression effective et irréversible au J+30.
- Filet de sécurité : annulation possible à tout moment dans la fenêtre via re-login + AAL2.
- Race annulation/cron au J+30 03:00 UTC : fenêtre de quelques ms par jour, acceptable.
- L'envoi d'emails (confirmation, rappel J-3) reste reporté tant que le SMTP custom n'est pas livré.

## Spec & plan

- Spec : `docs/superpowers/specs/2026-04-25-account-deletion-completion-design.md`
- Plan : `docs/superpowers/plans/2026-04-25-account-deletion-completion.md`
