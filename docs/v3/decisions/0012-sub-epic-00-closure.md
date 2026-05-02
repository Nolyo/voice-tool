# ADR 0012 — Clôture sous-épique 00-security-foundations

- **Statut**: Accepté
- **Date**: 2026-05-01

## Résumé

Sous-épique 00 livrée. Les 14 tasks du plan `2026-04-24-v3-sub-epic-00-security-foundations.md` sont matérialisées : workflows CI sécurité (`security-audit.yml`, `secret-scan.yml`) actifs sur `main`, scanner regex anti-leak intégré aux releases, runbooks (rotation secrets, backup-restore, incident GDPR <72h, account deletion purge, device fingerprint investigation) rédigés, registre des traitements GDPR + base légale en place, bootstraps Supabase EU + Cloudflare Pages documentés, checklist 2FA tous comptes ops figée.

Les fondations sécurité v3.0 — la couche "rien à voir avec le code applicatif mais bloquant pour ouvrir les comptes au public" — sont closes. Le sous-épique 01 (auth) puis 02 (sync) ont pu démarrer dessus sans dette.

## Ajustements vs spec initiale `00-threat-model.md`

- **CI Vitest + cargo test ajouté** (`ci.yml`) — pas dans le plan initial 00, ajouté en post-review fixes (vague 1, plan 2026-04-26). Couvre Vitest (90 tests), cargo test (11+ tests Rust), Deno tests Edge Functions. Renforce la mesure défensive #14 (audits CI bloquants) au-delà du seul `pnpm/cargo audit`.
- **Runbook account-deletion-purge** ajouté (non prévu dans le plan 00) — créé lors du sous-épique 01/02 pour documenter le cron 30 jours GDPR. Vit dans `runbooks/` parce que c'est une opération récurrente, pas un bootstrap.
- **Runbook device-fingerprint-investigation** ajouté — créé suite à la livraison de la persistance `app_version + os_version` dans `user_devices` (commit 179a604). Documente comment investiguer un device suspect.
- **ADRs intercalaires émis pendant l'implémentation** : 0008 (rate-limiting + sync-strategy, doublon de numéro à corriger en post-mortem), 0011 (account deletion + email canonical, idem doublon de numéro). Les doublons de numéros sont une dette mineure mais visible — à éviter pour les futurs sous-épiques.
- **DPA Supabase consulté** (mesure défensive #11 GDPR) — archivé hors-repo (contient données commerciales). Référencé en clair dans `compliance/registre-traitements.md`.
- **Registre GDPR** : section `Responsable du traitement` toujours en placeholder `<à remplir>` (nom légal de l'éditeur). À compléter au moment de la publication de la privacy policy publique (sous-épique 06). Non-bloquant pour la v3.0 GA tant que la sync n'est pas ouverte au public.
- **Bootstrap Supabase** : section `Identifiants non-secrets` (project ref, URL, anon key publique) toujours en `<à remplir>` dans le doc. Les valeurs réelles vivent dans `.env.local` (gitignored) + GitHub Secrets. À documenter en clair dans `supabase-bootstrap.md` pour faciliter un re-bootstrap d'urgence.
- **Premier test de restore backup** : runbook rédigé, **première exécution non encore datée** dans la table d'historique. À planifier dans les 30 jours suivant la GA v3.0 pour valider le runbook avant qu'il ne serve réellement.
- **Cargo audit policy** : `--deny warnings` retenu dans le workflow (option stricte). À assouplir si bruit excessif sur les advisories `unmaintained` (pas de patch dispo) — pour l'instant aucun blocage observé.

## Mesures défensives Must-have v3.0 — état réel

| # | Mesure | Statut | Source |
|---|---|---|---|
| 1 | RLS strict + tests cross-tenant pgtap | ✅ Livré sub-épique 02 | `supabase/migrations/20260525*`, `supabase/tests/` |
| 2 | Service role key jamais côté client + scanner CI | ✅ Livré | `secret-scan.yml`, `scan-secrets-in-bundles.mjs`, intégré dans `release.yml` |
| 3 | Rate limiting Edge Functions | 🟡 Partiel | Table `rate_limit_log` + RPC `check_rate_limit` livrées (sub-épique 01, ADR 0008-rate-limiting). **Pas câblée côté client** — Supabase rate limits natifs suffisent en v3.0 (cf. ADR 0009 follow-up). |
| 4 | Validation input Zod Edge + Tauri | ✅ Livré | `sync-push` + `account-export` valident Zod ; deep-link parsing Rust valide la shape JWT et le nonce (`auth.rs`) |
| 5 | Logs serveur zéro PII | ✅ Politique en place | Audit manuel des Edge Functions ; pas de linter automatique (TODO long terme) |
| 6 | Rotation des secrets documentée | ✅ Livré | `runbooks/secrets-rotation.md` (5 secrets couverts) |
| 7 | CSP stricte page auth-callback | ✅ Livré | Repo séparé `voice-tool-auth-callback` (Cloudflare Pages) |
| 8 | Headers de sécurité site web | 🟡 Différé v3.1 | Site marketing pas encore live — bloqué sur sous-épique 06 (domaine final) |
| 9 | 2FA TOTP optionnel | ✅ Livré | `TwoFactorActivationView.tsx` + recovery codes consommables (post-review fix) |
| 10 | Email notification nouveau device | 🟡 Partiel | Trigger DB en place + colonne `notified_at` ; envoi email réel = Edge Function future (cf. ADR 0009 follow-up `send-new-device-email`) |
| 11 | Backup chiffré + test restore | 🟡 Partiel | Runbook rédigé, premier test pas encore exécuté. **À faire dans les 30 jours post-GA.** |
| 12 | Plan réponse incident GDPR <72h | ✅ Livré | `runbooks/incident-response.md` |
| 13 | 2FA tous comptes ops | ✅ Checklist livrée | Exécution réelle = action utilisateur récurrente |
| 14 | `cargo audit` + `pnpm audit` CI | ✅ Livré | `security-audit.yml` actif sur PR + cron quotidien |

**Bilan must-have** : 11 ✅ / 3 🟡. Les 3 partiels ne sont pas bloquants pour une **bêta privée** ou une GA "soft" (peu de users), mais doivent être adressés avant ouverture publique large.

## Conformité GDPR Must-have v3.0 — état réel

| # | Mesure | Statut |
|---|---|---|
| 1 | Registre des traitements | ✅ Livré (`compliance/registre-traitements.md`) — responsable du traitement à compléter avant publication |
| 2 | Privacy policy publiée | 🔴 **Non livré** — bloquant ouverture publique. Draft à produire (sous-épique 06 ou via la nuit du 2026-05-01). |
| 3 | Mentions légales publiées | 🔴 **Non livré** — bloquant idem. Dépend du domaine final (sous-épique 06). |
| 4 | DPA signés | ✅ Supabase OK ; Lemon Squeezy reporté à v3.2 |
| 5 | Droit à l'oubli effectif | ✅ Livré (`account_deletion_requests` + cron 30j, ADR 0011) |
| 6 | Data export JSON | ✅ Livré (`account-export` Edge Function + bouton "Exporter mes données") |
| 7 | Process notification fuite <72h | ✅ Livré (`runbooks/incident-response.md`) |
| 8 | Base légale documentée | ✅ Livré (`compliance/base-legale.md`) |

**Bilan GDPR** : 6 ✅ / 2 🔴. Les 2 manques (privacy policy + mentions légales publics) sont **bloquants** pour une ouverture publique de la sync au-delà du cercle de testeurs proches. Drafts produits dans le pack du 2026-05-01.

## Follow-ups ouverts (reportés)

- **Mesure défensive #3** — Câblage du rate-limit custom côté client si signaux de scraping émergent. Pour l'instant Supabase natif suffit.
- **Mesure défensive #5** — Linter automatique de logs (regex anti-PII dans les Edge Functions). Faire au sous-épique 03 quand des logs métier non-triviaux apparaissent.
- **Mesure défensive #8** — Headers HSTS / X-Frame-Options / Permissions-Policy sur le site marketing dès qu'il existe.
- **Mesure défensive #10** — Edge Function `send-new-device-email` (déjà tracée dans ADR 0009 et 0010).
- **Mesure défensive #11** — Première exécution du runbook `backup-restore-test.md`. À planifier dans les 30 jours post-GA.
- **Privacy policy + mentions légales publiques** — sous-épique 06, drafts FR + EN livrés en `docs/v3/legal/` le 2026-05-01.
- **Audit sécurité externe** — Nice-to-have v3.x (mesure post-release #6). Reporté post-traction (>50 users sync) selon posture launch v3.0 free-tier first.
- **Premier post-mortem incident** — aucun à ce jour. À documenter dans `docs/v3/incidents/` au premier événement.
- **Numérotation ADR** — 0008 et 0011 ont chacun deux ADRs distincts. Renuméroter ne se fait pas en place (ADRs immutables) ; à signaler en tête de chaque ADR concerné si cela génère de la confusion.

## Critères d'acceptation Sub-épique 00 (rappel plan d'impl)

- [x] `docs/v3/ops/accounts-checklist.md` créé
- [x] Workflow `security-audit.yml` vert sur `main` (pnpm + cargo audit)
- [x] Workflow `secret-scan.yml` vert sur `main`
- [x] Scanner `scan-secrets-in-bundles.mjs` intégré à `release.yml`
- [x] Projet Supabase Pro EU `voice-tool-v3-prod` documenté (vérification PITR/backups = à confirmer côté dashboard)
- [x] Projet Cloudflare Pages `voice-tool-auth-callback` placeholder accessible (déployé pour de vrai dans sub-épique 01)
- [x] DPA Supabase consulté
- [x] Runbooks rédigés (5 au lieu de 3 : ajout account-deletion-purge + device-fingerprint-investigation)
- [x] Docs compliance rédigés (registre + base légale)
- [x] `docs/v3/README.md` et `00-threat-model.md` mis à jour
- [x] `CLAUDE.md` mis à jour (section "V3 Documentation" présente)
- [x] ADR de clôture (ce document)

## Processus de révision

ADR figé. Les ajustements ultérieurs sur la posture sécurité passeront par :
- Un nouvel ADR si la décision est structurante (nouvel acteur threat model, nouvelle mesure must-have).
- Une mise à jour du `00-threat-model.md` (living document) pour les ajustements opérationnels mineurs.
- Un nouveau runbook si une nouvelle procédure récurrente apparaît.
