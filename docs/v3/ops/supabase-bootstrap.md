# Bootstrap — projet Supabase EU Pro

## Objectif

Créer le projet Supabase de production v3 avec les paramètres figés par ADR 0007 et le threat model.

## Préconditions

- Compte Supabase avec 2FA activé (cf. [`accounts-checklist.md`](accounts-checklist.md))
- Carte bancaire pour le plan Pro (~25 $/mois)
- Email de contact technique défini

## Paramètres figés

| Paramètre | Valeur | Source |
|---|---|---|
| Nom projet | `voice-tool-v3-prod` | — |
| Plan | Pro | ADR 0007 |
| Région | `eu-central-1` (Frankfurt) ou `eu-west-2` (London) | Threat model (hébergement EU pour GDPR) |
| Password DB | généré aléatoirement ≥32 chars, stocké gestionnaire mdp | Standard |
| Enable Point-in-Time Recovery (PITR) | ✅ oui (7 jours min) | Threat model mesure #11 |
| Daily backups | ✅ activé (rétention 7 jours Pro) | Idem |

## Procédure

1. Se connecter à https://supabase.com/dashboard
2. `New Project` → organisation personnelle → nom `voice-tool-v3-prod`
3. Choisir région EU (Frankfurt de préférence, plus proche des users FR)
4. Générer et copier le `Database password` dans le gestionnaire de mots de passe (entrée `voice-tool-v3-prod-db-password`)
5. Upgrader le projet au plan Pro (`Settings` → `Billing` → `Change subscription plan` → Pro)
6. Activer PITR : `Settings` → `Database` → `Point-in-time Recovery` → Enable
7. Vérifier que les daily backups sont actifs : `Database` → `Backups`
8. Noter l'URL du projet et l'`anon key` **publique** dans `docs/v3/ops/supabase-bootstrap.md` (section "Identifiants non-secrets" ci-dessous)
9. **Ne jamais commiter** le `service_role key` ni le DB password

## Identifiants non-secrets

- Project ref : `prmznlqsvzrfxckuxfhq`
- Project URL : `https://prmznlqsvzrfxckuxfhq.supabase.co`
- Publishable key : `sb_publishable_F29xyZYw8BVpgpIC3rxQvA_iAob8N6z` (nouveau format Supabase 2025, remplace l'ancien `anon` JWT)
- Région : `West EU (Ireland) — eu-west-1`
- Date de création : 2026-04-24
- Plan : Free (upgrade Pro planifié avant mise en prod réelle — cf. ADR 0007 pour PITR + DPA obligatoires en prod)

## Config auth v3.0 (appliquée 2026-04-24)

### URL Configuration
- Site URL : `https://voice-tool-auth-callback.pages.dev`
- Redirect URLs : `https://voice-tool-auth-callback.pages.dev/**`, `voice-tool://auth/callback`

### Sessions (plan Free)
- Detect and revoke potentially compromised refresh tokens : ON (rotation rolling)
- Refresh token reuse interval : 10 s
- Time-box user sessions / Inactivity timeout : `never` (Pro only — à régler à l'upgrade pour coller à l'ADR 0007 = 60 jours)

### Email provider
- Confirm email : ON (obligatoire avant login E/P)
- Secure email change / Secure password change : ON si disponibles
- Magic link / OTP expiration : 900 s (15 min)

### MFA
- TOTP : ON
- Phone / SMS : OFF (SIM-swap, ADR 0007)
- Max enrolled factors per user : 10

### OAuth providers
- Google : enabled. Client ID : `560560444964-t4uh4qkvc926mmu96j4c9krudbns1q6o.apps.googleusercontent.com` — Google Cloud project `voice-tool-v3`, OAuth client "Voice Tool Supabase", mode Testing, scopes `openid email profile`. Client Secret stocké dans le gestionnaire de mdp perso uniquement.
- Callback URL autorisée côté Google : `https://prmznlqsvzrfxckuxfhq.supabase.co/auth/v1/callback`
- Autres providers (GitHub, Apple, …) : désactivés v3.0.

## Identifiants secrets — où ils vivent

| Secret | Stockage | Usage |
|---|---|---|
| `service_role` key | GitHub Secrets (`SUPABASE_SERVICE_ROLE_KEY`) + gestionnaire mdp perso | Edge functions, tests d'intégration (jamais côté client) |
| DB password | Gestionnaire mdp perso uniquement | Accès DB admin exceptionnel |
| Project ref | Peut être commité (non secret) | Config app |

## DPA (Data Processing Agreement)

Sur le plan Pro, le DPA est automatiquement inclus et accessible depuis `Settings` → `Billing` → `Data Processing Agreement`.

- [ ] DPA Supabase consulté et archivé localement : `docs/v3/compliance/dpa-supabase-YYYY-MM-DD.pdf` (ne pas commiter si le DPA contient des données commerciales — archiver ailleurs et référencer en texte).

## Vérification

- [ ] Projet accessible depuis le dashboard Supabase
- [ ] Région confirmée EU (vérifier `Settings` → `General`)
- [ ] PITR actif
- [ ] Backups quotidiens actifs
- [ ] `service_role` key ajoutée à GitHub Secrets (mais **pas utilisée** pour l'instant — sera consommée par sous-épique 01)
- [ ] DPA consulté

## Rollback

- Supprimer le projet via `Settings` → `General` → `Delete project`
- Annuler l'abonnement Pro via `Settings` → `Billing`

## Historique d'exécution

| Date | Opérateur | Notes |
|---|---|---|
| 2026-04-24 | nolyo | Bootstrap initial en plan Free (EU West Ireland). Upgrade Pro prévu avant mise en prod réelle. |
