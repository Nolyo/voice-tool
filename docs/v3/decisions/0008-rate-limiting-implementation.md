# ADR 0008 — Rate limiting techno : table Postgres

- **Statut**: Accepté
- **Date**: 2026-04-24
- **Contexte**: 01-auth.md exige du rate limiting sur magic link (3/h/email), reset password (3/h/email), login E/P (5 échecs → blocage 15 min/email).

## Décision

Implémentation via une **table Postgres `rate_limit_log`** + fonction SQL `check_rate_limit(key text, window_seconds int, max_count int)` appelée depuis les edge functions Supabase (et potentiellement des triggers côté auth).

## Justification

- Zéro infra supplémentaire (on est déjà sur Supabase).
- Volume < 10k DAU en v3.0 → Postgres tient.
- Pas de dépendance Cloudflare Workers (peut être ajoutée plus tard sans casser).
- Simplicité d'audit : un `SELECT` suffit pour voir l'historique.

## Conséquences

- Table `rate_limit_log` indexée par `(key, created_at)` pour perfs.
- Purge quotidienne des entrées > 24h via cron Supabase (ou fonction `pg_cron` si activée).
- Visibilité logs centralisée dans Supabase (pratique pour incident response).

## Décision reportée

Migration vers Cloudflare Workers si le volume dépasse 10k DAU (v3.x).
