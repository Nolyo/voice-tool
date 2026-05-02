# Threat model v3.0 — matrice d'implémentation

> **Statut** : généré le 2026-05-01 lors du pack GA readiness.
> **Source** : `00-threat-model.md` (figé 2026-04-22).
> **Rôle** : pour chaque mesure du threat model, pointer le code/config qui l'implémente. Permet une traçabilité instantanée pour audit interne ou externe.

---

## Mesures défensives Must-have v3.0

| # | Mesure | Statut | Implémentation (file:line) |
|---|---|---|---|
| 1 | RLS strict + tests cross-tenant | ✅ | `supabase/migrations/20260525000100_user_settings.sql` (policies), `20260525000200_user_dictionary_words.sql`, `20260525000300_user_snippets.sql`, `20260501000000_user_devices.sql`, `20260501000300_recovery_codes.sql`. Tests pgtap : `supabase/tests/rls_user_settings.sql`, `rls_user_dictionary_words.sql`, `rls_user_snippets.sql`, `rls_user_devices.sql`, `rls_recovery_codes.sql` |
| 2 | Service role key jamais côté client + audit CI | ✅ | `.github/workflows/secret-scan.yml`, `.github/scripts/scan-secrets-in-bundles.mjs` (patterns : `sb_secret_*`, JWT `service_role`, PEM, `lsq_*`). Intégré à `release.yml` (job `scan-release-artifacts`) |
| 3 | Rate limiting Edge Functions | 🟡 partiel | Table + RPC : `supabase/migrations/20260501000100_rate_limit_log.sql`, `20260601000000_rate_limit_hardening.sql`, `20260601000600_rate_limit_deletion_request.sql`. Helper Deno : `supabase/functions/_shared/rate-limit.ts`. **Non câblé client** — Supabase rate limits natifs suffisent en v3.0. À recâbler si signal de scraping. |
| 4 | Validation input stricte (Zod + Rust) | ✅ | Edge Functions : `supabase/functions/sync-push/schema.ts`, `account-export/index.ts` (Zod). Frontend : `src/lib/sync/schemas.ts` (validation runtime des payloads cloud). Rust deep-link : `src-tauri/src/auth.rs` (parsing nonce + JWT shape) |
| 5 | Logs serveur zéro PII | 🟡 politique | Pas d'email/contenu/JWT loggué dans les Edge Functions actuelles (audit manuel). **Pas de linter automatique** — à ajouter au sub-épique 03 quand des logs métier non-triviaux apparaîtront |
| 6 | Rotation des secrets documentée | ✅ | `docs/v3/runbooks/secrets-rotation.md` (couvre service_role, JWT secret, webhook LS futur, clé updater Tauri, DB password) |
| 7 | CSP stricte page auth-callback | ✅ | Repo séparé `voice-tool-auth-callback` déployé sur Cloudflare Pages (`lexena-auth-callback.pages.dev`). CSP + headers configurés via `_headers` |
| 8 | Headers de sécurité site web | 🟡 différé | Pas encore de site marketing live. Sera adressé au sous-épique 06 quand le domaine final + l'hébergeur seront figés |
| 9 | 2FA TOTP optionnel | ✅ | UI : `src/components/auth/TwoFactorActivationFlow.tsx`, `TwoFactorChallengeView.tsx`. Recovery codes : `supabase/migrations/20260501000300_recovery_codes.sql` (RPC `store_recovery_codes`, `consume_recovery_code`), Edge Function `consume-recovery-code/index.ts` (élève la session à AAL2 après validation). Fix critical : `20260601000500_consume_recovery_code_for.sql` |
| 10 | Email notification nouveau device | 🟡 partiel | Trigger DB + colonne `notified_at` : `supabase/migrations/20260501000400_new_device_trigger.sql`. Persistance `app_version` + `os_version` : `20260601000300_user_devices_length_limits.sql` + `src-tauri/src/commands/system.rs` (`device_info`). **Envoi email réel = Edge Function future** (ADR 0009 follow-up `send-new-device-email`) |
| 11 | Backup chiffré + test de restore | 🟡 partiel | Runbook : `docs/v3/runbooks/backup-restore-test.md`. **Première exécution non datée** — à planifier dans les 30 jours post-GA. PITR Supabase Pro à activer quand le projet passera Pro (cf. posture launch v3.0 free-tier first) |
| 12 | Plan réponse incident GDPR <72h | ✅ | `docs/v3/runbooks/incident-response.md` (timeline T+0 → T+72h, templates email FR, contacts CNIL/Supabase/GitHub) |
| 13 | 2FA tous comptes ops | ✅ checklist | `docs/v3/ops/accounts-checklist.md` (GitHub, Supabase, LS futur, Google Cloud, Cloudflare, registrar futur, gestionnaire mdp). Exécution réelle = action utilisateur. État coché = à confirmer manuellement |
| 14 | `cargo audit` + `pnpm audit` CI | ✅ | `.github/workflows/security-audit.yml` (jobs `pnpm-audit` + `cargo-audit`, niveau `high`, gate PR + cron quotidien 06:00 UTC). Validation 2026-05-01 : `pnpm audit --prod --audit-level high` → 0 vulnérabilité |

**Bilan** : 11 ✅ / 3 🟡. Aucun 🔴.

---

## Conformité GDPR Must-have v3.0

| # | Mesure | Statut | Implémentation |
|---|---|---|---|
| 1 | Registre des traitements | ✅ | `docs/v3/compliance/registre-traitements.md` (T01-T06). Champ "Responsable du traitement" en placeholder — à remplir avant ouverture publique |
| 2 | Privacy policy publiée | 🟡 draft | Drafts FR + EN livrés `docs/v3/legal/privacy-policy-{fr,en}.md` (pack 2026-05-01). **Publication en ligne bloquée par sous-épique 06** (domaine final + site marketing) |
| 3 | Mentions légales publiées | 🟡 draft | Drafts via Privacy Policy (section identité éditeur). Idem bloqué sous-épique 06 |
| 4 | DPA signés | ✅ Supabase, ⏳ LS | Supabase Pro = DPA inclus. LS différé v3.2 |
| 5 | Droit à l'oubli effectif | ✅ | Migration : `supabase/migrations/20260501000500_account_deletion.sql`, `20260501000510_account_deletion_v2.sql`, `20260501000520_account_deletion_cron.sql`. Edge Function : `supabase/functions/purge-account-deletions/index.ts`. UI : `src/components/settings/sections/SecuritySection.tsx` (delete account flow). Cron 30j ADR 0011 |
| 6 | Data export JSON | ✅ | Edge Function : `supabase/functions/account-export/index.ts`. Client : `src/lib/sync/export.ts`. UI : Settings > Compte > "Exporter mes données" |
| 7 | Process notification fuite <72h | ✅ | `docs/v3/runbooks/incident-response.md` |
| 8 | Base légale documentée | ✅ | `docs/v3/compliance/base-legale.md` |

**Bilan** : 6 ✅ / 2 🟡 (publication, pas la rédaction). 0 🔴 après le pack 2026-05-01.

---

## Acteurs threat model — couverture

| Acteur | Statut | Mitigation principale | Pointer |
|---|---|---|---|
| A — Attaquant externe non-auth | 🟢 in-scope | RLS strict + Edge Functions PKCE + CORS allowlist | `supabase/functions/_shared/cors.ts`, RLS migrations |
| B — Attaquant externe authentifié (cross-tenant) | 🟢 in-scope | RLS strict + tests pgtap automatisés | `supabase/tests/rls_*.sql` (5 fichiers) |
| C — Compte tiers compromis | 🟢 in-scope | 2FA tous comptes ops + rotation runbook | `docs/v3/ops/accounts-checklist.md`, `docs/v3/runbooks/secrets-rotation.md` |
| D — Insider dev solo | 🔴 out-of-scope | Choix conscient. À rouvrir si embauche/prestataire | Threat model § acteurs |
| E — Insider Supabase | 🔴 out-of-scope | DPA + privacy policy explicite | DPA Supabase, privacy policy à publier |
| F — État/judiciaire | 🔴 out-of-scope | On coopère si subpoena | Privacy policy section "Coopération autorités" |
| G — Device user compromis | 🔴 out-of-scope | Keyring OS = défense en profondeur (pas barrière) | `src-tauri/src/auth.rs` (keyring), fallback Linux memory-only |

---

## Surfaces d'attaque — couverture

| Surface | Priorité | Mitigations en place | Pointer |
|---|---|---|---|
| API Supabase (PostgREST + RLS) | P1 | RLS deny by default + policies par table + tests pgtap cross-tenant | Migrations `20260525*` + `supabase/tests/rls_*` |
| Edge Functions Supabase | P1 | Validation Zod + CORS lock + service role server-only + rate limit RPC dispo | `supabase/functions/_shared/{auth,cors,rate-limit}.ts`, `sync-push/schema.ts` |
| Flow OAuth Google | P2 | `state` nonce one-time validé Rust + redirect URI strict côté Google Console | `src-tauri/src/auth.rs` (nonce), Google Cloud Console (manuel) |
| Flow Magic Link | P2 | Token one-time Supabase + TTL court + anti-enumeration (réponses identiques) | `src/components/auth/SignInPanel.tsx` (UX neutre), Supabase native |
| Webhook Lemon Squeezy | P2 | HMAC + idempotence (POC validé) | `docs/research/lemonsqueezy-poc/` — à recâbler v3.2 |
| Page web auth-callback | P2 | CSP stricte + zéro JS tiers + token nettoyé URL | Repo `voice-tool-auth-callback` (Cloudflare Pages) |
| Deep link `lexena://` | P3 | Validation Rust : nonce one-time + parsing JWT shape + anti-replay | `src-tauri/src/auth.rs` (11 tests unitaires) |
| App desktop Tauri (IPC commands) | P3 | Capabilities Tauri 2 limitées (`src-tauri/capabilities/default.json`, `mini.json`) | Capabilities files + audit dépendances `cargo audit` |
| Updater (tauri-plugin-updater) | P4 | Signature crypto + HTTPS-only + clé privée GitHub Secrets | `src-tauri/tauri.conf.json` (pubkey), `src-tauri/src/updater.rs` |

---

## Compromis acceptés — rappel et statut

| Compromis | Documentation publique requise ? |
|---|---|
| Fuite DB Supabase = lecture notes en clair | ✅ Privacy policy section "Sécurité" |
| Insider Supabase théoriquement possible | ✅ Privacy policy section "Sous-traitants" |
| Pas de E2E v3.0 | ✅ Privacy policy + FAQ |
| Pas d'audit log user v3.0 | 🟡 À mentionner dans la roadmap publique |
| Device compromis = game over | ✅ Standard, mentionné FAQ |
| Insider dev solo accepté | 🟡 Mentionné dans le DPA si tiers existe (pas le cas v3.0) |

---

## Validations CI/locales 2026-05-01 (snapshot)

| Check | Résultat | Commande |
|---|---|---|
| `pnpm audit --prod --audit-level high` | ✅ 0 vulnérabilité | `pnpm audit --prod --audit-level high` |
| Vitest | ✅ 90/90 passed (14 fichiers) | `pnpm test -- --run` |
| Cargo test | ✅ 30/30 passed | `cargo test --no-default-features --lib` |
| TypeScript strict | ✅ 0 erreur | `pnpm tsc --noEmit` |
| Secret scanner | ✅ aucun pattern trouvé | `node .github/scripts/scan-secrets-in-bundles.mjs` |
| TODO/FIXME/HACK | ✅ aucun dans `src/`, `src-tauri/src/`, `supabase/` | grep |

---

## Conclusion opérationnelle

**Pour une bêta privée / soft launch (cercle de testeurs proches, < 50 users)** : ✅ feu vert. Tous les must-have critiques sont en place ou couverts par défaut Supabase.

**Pour une ouverture publique large** : 🟡 conditionné à :
1. Publication privacy policy + mentions légales (drafts livrés, hébergement à faire)
2. Headers de sécurité site marketing (dépend du sous-épique 06)
3. Première exécution du runbook backup-restore (à planifier sous 30 jours)
4. Câblage Edge Function `send-new-device-email` (sécurité user signal sans friction)
5. Upgrade Supabase Pro (PITR + DPA + sessions Time-box)

**Pour une release commerciale (v3.2 billing ouvert)** : 🟡 audit sécurité externe recommandé (mesure post-release #6, reportée post-traction selon posture launch).
