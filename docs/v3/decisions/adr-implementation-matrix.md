# ADR v3 — matrice d'implémentation

> **Statut** : généré 2026-05-01 (pack GA readiness).
> **Rôle** : pour chaque ADR figé, vérifier que la décision est respectée dans le code livré et pointer le code source. Sert de base à un audit interne ou externe.

| ADR | Décision | Statut | Implémentation |
|---|---|---|---|
| **0001** — Lemon Squeezy MoR | Billing via Lemon Squeezy (pas Stripe direct, pas Paddle) | ⏳ v3.2 | POC : `docs/research/lemonsqueezy-poc/`. Pas câblé en v3.0 (billing décalé). Décision toujours valide. |
| **0002** — Server-side encryption (style Notion) | Encryption at rest Postgres + TLS in transit, pas de E2E v3.0 | ✅ | Supabase managé (encryption at rest natif), TLS forcé client `src/lib/supabase.ts`. Documenté threat model § Compromis acceptés. |
| **0003** — Clés API device-local | Clés OpenAI/Groq jamais syncées, jamais en transit serveur | ✅ | Filtre sync : `src/lib/sync/mapping.ts` (whitelist 9 clés scalaires, exclut `openai_api_key`, `groq_api_key`, etc.). Stockage local : Tauri Store (chiffré côté OS pour les valeurs sensibles via keyring quand applicable). Test : `mapping.test.ts`. |
| **0004** — Méthodes auth | Email/password + Magic link + Google OAuth | ✅ | Composants : `src/components/auth/SignInPanel.tsx` (E/P + magic link), `AuthModal.tsx`. OAuth Google : configuré côté Supabase Dashboard + callback handler `src-tauri/src/auth.rs`. Tests : `cargo test` couvre nonce + JWT shape. |
| **0005** — Flow callback web page + deep link | Page web Cloudflare Pages → deep link `lexena://auth/callback?...` | ✅ | Repo séparé `voice-tool-auth-callback` déployé sur `lexena-auth-callback.pages.dev`. Scheme registered : `tauri-plugin-deep-link`. Parsing Rust : `src-tauri/src/auth.rs` (validation type, nonce, JWT shape, anti-replay). 11 tests unitaires. |
| **0006** — Threat model figé | Acteurs A-G classifiés, mesures must-have v3.0 listées | ✅ | Cf. `00-threat-model-implementation-matrix.md` (livré 2026-05-01). 11 mesures must-have ✅, 3 partielles documentées. |
| **0007** — Auth configuration | Supabase Auth + Postgres EU + 2FA TOTP optionnel + recovery codes + sessions Pro | 🟡 partiel | Supabase opérationnel. Région EU à confirmer côté dashboard. **Plan Free** actuellement (Pro reporté post-traction selon posture launch). 2FA TOTP : ✅ livré. Recovery codes : ✅ livré (consommation post-fix `20260601000500`). Sessions Time-box/Inactivity Pro : différé à l'upgrade Pro. |
| **0008** — Rate limiting Postgres | Table `rate_limit_log` + RPC `check_rate_limit` | ✅ | Migrations : `20260501000100_rate_limit_log.sql`, `20260601000000_rate_limit_hardening.sql`, `20260601000600_rate_limit_deletion_request.sql`. Helper Deno : `supabase/functions/_shared/rate-limit.ts`. Câblage client : limité, Supabase native suffit en v3.0 (cf. ADR 0009 follow-up). |
| **0008** — Stratégie sync Y3 (doublon de numéro) | Settings étendus + 5 tables séparées + LWW + soft-delete | ✅ ajusté | Tables livrées : 3 sur 5 (`user_settings`, `user_dictionary_words`, `user_snippets`). Reportées : `user_prompts`, `user_translation_presets` (features pas encore existantes — cf. ADR 0010). LWW + soft-delete : implémenté `src/lib/sync/merge.ts`. |
| **0009** — Closure sub-épique 01-auth | 7 décisions émergentes consolidées + follow-ups | ✅ | Tous les follow-ups bloquants traités : recovery codes consommables (`20260601000500`), Turnstile au signup (`b337e4a`), CORS Edge Functions verrouillé (`3825ffe`), MFA admin recovery flow (`458a06e`). Restants non bloquants : SMTP custom, email templates FR/EN — différés post-GA. |
| **0010** — Closure sub-épique 02-sync | 9 décisions émergentes consolidées + follow-ups | ✅ | Tous les follow-ups bloquants traités. Sync mono-profil : ✅ ; warning UI multi-profils : ✅ (`src/components/settings/sections/AccountSection.tsx`). Restants non bloquants : multi-profils cloud, prompts/presets, compression gzip — différés v3.x. |
| **0011** — Account deletion completion | Tombstone + grace 30j + cron pg_cron + AAL2 obligatoire si MFA | ✅ | Migrations : `20260501000500_account_deletion.sql`, `20260501000510_account_deletion_v2.sql`, `20260501000520_account_deletion_cron.sql`, `20260601000400_account_deletion_requests_idx.sql`. Edge Function : `supabase/functions/purge-account-deletions/index.ts`. UI : `src/components/auth/DeletionPendingScreen.tsx`, `src/components/settings/sections/SecuritySection.tsx`. Runbook : `docs/v3/runbooks/account-deletion-purge.md`. |
| **0011** — Email canonical (doublon de numéro) | `normalize_email()` SQL anti-Gmail-aliasing | ✅ | Migration : `supabase/migrations/20260601000100_email_canonical.sql`. Test pgtap : `supabase/tests/email_canonical.sql`. Marker UI : `src/components/auth/SignInPanel.tsx` (`CANONICAL_COLLISION_ERROR_MARKER`, refacto `aba4dd0`). Runbook : `docs/v3/runbooks/device-fingerprint-investigation.md` (corollaire). |
| **0012** — Closure sub-épique 00 | Fondations sécurité livrées + état réel des 14 mesures must-have | ✅ | Cf. ce document + `00-threat-model-implementation-matrix.md`. Livré 2026-05-01. |

---

## Synthèse par sub-épique

| Sub-épique | ADRs | Statut implémentation | Bloquants restants |
|---|---|---|---|
| 00 — Sécurité fondations | 0006, 0012 | ✅ Livré | 3 mesures partielles non bloquantes pour bêta privée |
| 01 — Auth | 0004, 0005, 0007, 0008-rate-limiting, 0009, 0011-email-canonical | ✅ Livré | 0 bloquant. Follow-ups SMTP custom + emails FR/EN différés |
| 02 — Sync settings | 0002, 0003, 0008-sync-strategy, 0010 | ✅ Livré | 0 bloquant. Follow-ups multi-profils cloud différés v3.x |
| Account deletion | 0011-account-deletion | ✅ Livré | 0 bloquant |
| 03 — Notes (v3.1) | — | 📝 Stub | Hors scope v3.0 |
| 04 — Billing (v3.2) | 0001 | 📝 Stub + POC | Hors scope v3.0 |
| 05 — Managed transcription (v3.3) | — | 📝 Stub | Hors scope v3.0 |
| 06 — Onboarding (v3.1) | — | 📝 Stub | Privacy/ToS publics = bloquants ouverture publique v3.0 (drafts livrés 2026-05-01) |

---

## ADRs jamais "supersédés"

Tous les ADRs listés sont **figés et toujours valides**. Aucun n'a été remplacé par un ADR ultérieur. Les ajustements opérationnels mineurs sont consignés dans les ADRs de clôture (0009, 0010, 0011-deletion, 0012) sans casser les ADRs initiaux.

## Dette à signaler

- **Doublons de numéro 0008 et 0011** : ADRs immutables une fois acceptés, donc pas de renumérotation. Les futurs sous-épiques doivent prendre `0013+`.
- **`0007-auth-configuration` partiellement implémenté** : plan Free au lieu de Pro (PITR + DPA + sessions Pro). Conscient (posture launch v3.0 free-tier first), à rouvrir post-traction.
