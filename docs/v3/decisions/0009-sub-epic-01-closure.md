# ADR 0009 — Clôture sous-épique 01-auth

- **Statut**: Accepté
- **Date**: 2026-04-24

## Résumé des décisions émergentes

- **Clé Supabase nouveau format (2025)** : la spec initiale (ADR 0007) parlait d'`anon` JWT ; Supabase a migré vers `Publishable Key` (`sb_publishable_*`) et `Secret Key` (`sb_secret_*`). Nous avons adopté les nouveaux formats dès le départ — plus de migration à prévoir.
- **Plan Supabase** : démarré en Free plutôt que Pro. Upgrade Pro obligatoire avant mise en prod réelle (PITR, DPA, backups quotidiens) — cf. ADR 0007. Sessions avancées (Time-box, Inactivity timeout) sont Pro-only, elles seront configurées à l'upgrade.
- **Email templates** : restés en anglais default Supabase pour v3.0. FR différé à v3.x (nécessite SMTP custom type Resend, hors scope maintenant).
- **Emails nouveau device** : `user_devices.notified_at` + trigger DB placeholder. Envoi réel différé à une Edge Function (sub-épique 02+).
- **Delete account** : tombstone `account_deletion_requests` + cron 30 jours (hors scope sub-épique 01, à livrer sub-épique 02). GDPR-conforme (30j max).
- **Recovery codes** : gérés via RPCs maison `store_recovery_codes` / `consume_recovery_code` (SHA-256 côté serveur). Supabase n'a pas d'API first-party recovery codes.
- **Deep link** : plugin officiel `tauri-plugin-deep-link` (Tauri 2). Scheme `voice-tool://auth/callback?type=...`. Validation Rust anti-CSRF (nonce one-time) + anti-replay + JWT shape check avant emit vers le frontend.
- **Fallback keyring Linux** : implémenté (memory-only) avec message UI explicite dans Settings → Sécurité.
- **Rate limiting** : table Postgres `rate_limit_log` + fonction SQL `check_rate_limit` (ADR 0008). Consommé par une Edge Function dédiée — non consommé directement par l'app client en v3.0 (les rate limits Supabase natifs suffisent pour le volume initial).

## Ajustements vs 01-auth.md initial

- Ajout migration `recovery_codes` (table + 2 RPCs) — non mentionnée explicitement dans le spec initial, nécessaire à l'implémentation.
- Ajout migration `account_deletion_requests` + RPC `request_account_deletion` — pattern tombstone.
- Migration `new_device_trigger` simplifiée : trigger no-op + colonne `notified_at` ; envoi d'email délégué à Edge Function future.
- Tests RLS cross-tenant **non automatisés** en v3.0 — report sous-épique 02 (pgtap setup + fixtures users).
- Tests E2E manuels documentés dans `docs/v3/01-auth-e2e-checklist.md` (pas de Playwright/Tauri driver en v3.0).

## Follow-ups ouverts (reportés)

- **SMTP custom (Resend ou Postmark)** — Supabase Free limite à ~30 emails/h sur le projet + ~3-4 `/recover` par email/h. Observé en dev (2026-04-24) : hit 429 après quelques enchaînements magic link + reset password. **Bloquant avant ouverture publique** ; permet aussi les templates FR/EN custom.
- **Recovery codes consumption non branché** (découvert 2026-04-24) — La table `recovery_codes` et les RPCs `store_recovery_codes` / `consume_recovery_code` existent et fonctionnent (après fix migration `20260501000600_fix_recovery_codes_pgcrypto.sql`). Mais `TwoFactorChallengeView.tsx` n'appelle que `supabase.auth.mfa.challengeAndVerify` qui n'accepte que les TOTP 6-chiffres. La branche `isRecovery` du composant est unreachable. **Conséquence : un utilisateur qui perd son device d'authentification est lock-out malgré ses recovery codes**. Bloquant avant ouverture publique. Solution : détecter input non-6-chiffres → appeler `consume_recovery_code` RPC → si succès, élever la session à AAL2 (probablement via une Edge Function qui crée une session aal2 côté serveur, ou via un challenge custom — à investiguer avec l'API Supabase).
- **Edge Function** "send-new-device-email" (sub-épique 02)
- **Edge Function** "purge-account-deletions" cron 30j (sub-épique 02)
- **Edge Function** rate-limit bridge (quand on consommera `check_rate_limit` depuis des endpoints custom)
- **Email templates FR/EN** custom via SMTP Resend (v3.x — dépend du SMTP custom ci-dessus)
- **Tests RLS cross-tenant** pgtap (sub-épique 02)
- **Upgrade plan Pro** + config Sessions (Time-box 60j, Inactivity 60j) avant mise en prod publique
- **Documentation utilisateur** (privacy policy, conditions d'utilisation) — sub-épique 06

## Processus de révision

ADR figé. Tout ajustement ultérieur nécessaire passera par un nouvel ADR ou sera traité dans les sub-épiques 02+.
