# Lexena v3.0 — GA Readiness Report

> **Généré** : 2026-05-01 (nuit du 01 → 02 mai 2026), pack autonome A + B.
> **Version actuelle** : `3.0.0-beta.4` (publiée 2026-04-27).
> **Périmètre** : audit complet de l'état v3.0 sans toucher au code applicatif.

---

## Verdict

| Scénario de release | Verdict | Conditions |
|---|---|---|
| 🟢 **Bêta privée** (cercle proche, < 50 users) | **GO** | Aucune condition bloquante. Peut être ouverte aujourd'hui. |
| 🟡 **Soft launch / Public Beta** (< 500 users) | **GO conditionnel** | 4 conditions ci-dessous (semaine 1) |
| 🟠 **GA grand public** (annonce + marketing) | **GO conditionnel** | 7 conditions ci-dessous (sprint 2-3 semaines) |
| 🔴 **Release commerciale** (billing v3.2) | **NO-GO** | Audit sécurité externe + conditions GA + infra Supabase Pro |

---

## Validation technique 2026-05-01 (snapshot)

| Check | Résultat | Source |
|---|---|---|
| `pnpm audit --prod --audit-level high` | ✅ 0 vulnérabilité | exécuté ce soir |
| `pnpm test -- --run` (Vitest) | ✅ **90/90 tests passed** (14 fichiers) | exécuté ce soir |
| `cargo test --no-default-features --lib` | ✅ **30/30 tests passed** | exécuté ce soir |
| `pnpm tsc --noEmit` | ✅ 0 erreur | exécuté ce soir |
| `node .github/scripts/scan-secrets-in-bundles.mjs` | ✅ aucun pattern trouvé | exécuté ce soir |
| `grep TODO/FIXME/HACK src/ src-tauri/src/ supabase/` | ✅ aucun match | exécuté ce soir |
| `git status` | ✅ working tree clean (avant ce pack) | exécuté ce soir |

**Bilan** : la chaîne de tests et d'audits locaux est **100 % verte**. Aucune dette technique de propreté visible (zéro TODO/FIXME). La discipline TDD post-review fixes a payé.

---

## Conditions pour Soft Launch / Public Beta

### Bloquant (4 items)

1. **Publier la Privacy Policy + ToS + mentions légales en ligne**
   - 🟢 Drafts FR + EN livrés cette nuit dans `docs/v3/legal/`
   - 🟡 Reste à : remplir les `<placeholders>` (identité éditeur, domaine, contact DPO), faire relire par un juriste, héberger sur le site marketing (sous-épique 06).
   - **Effort utilisateur** : 2-3 heures de remplissage + 1 relecture juridique (1-2 j calendaires) + déploiement domaine.

2. **Configurer un SMTP custom (Resend ou Postmark)**
   - 🔴 Bloquant déjà identifié dans ADR 0009. Supabase Free limite à ~30 emails/h — observé en dev (429 après quelques magic links).
   - **Effort** : 1-2h (création compte Resend, ajout SPF/DKIM/DMARC sur le domaine, config Supabase Auth → SMTP Settings).
   - Permet aussi d'utiliser les 7 templates email rédigés cette nuit (`docs/v3/legal/email-templates.md`).

3. **Câbler l'Edge Function `send-new-device-email`**
   - 🟡 Trigger DB + colonne `notified_at` en place. Manque : Edge Function qui consomme le trigger et envoie l'email via SMTP custom.
   - **Effort** : 2-3h (Edge Function Deno, test, déploiement).
   - Sécurité user signal sans friction = important pour rassurer les early adopters.

4. **Compléter l'identité éditeur dans le registre GDPR + bootstraps**
   - 🟡 `compliance/registre-traitements.md` : champ "Responsable du traitement" en `<à remplir>`. À renseigner avant ouverture publique (obligation art. 30 RGPD).
   - 🟡 `ops/supabase-bootstrap.md` : section "Identifiants non-secrets" à renseigner (project ref, URL, anon key publique — non-secrets, OK à committer).
   - **Effort** : 30 min de remplissage.

### Recommandé (non-bloquant mais utile)

5. **Exécuter les 3 checklists E2E manuelles** (auth, sync, account deletion)
   - Sur **au moins 2 OS** différents (Windows + macOS si possible, sinon Windows + une VM Linux).
   - **Effort** : 2-3h par OS.
   - Permet de découvrir les bugs OS-specifics avant les users.

6. **Premier test de restore backup Supabase**
   - Runbook prêt, jamais exécuté. À planifier dans les 30 jours suivant le launch.
   - **Effort** : 1h.

---

## Conditions supplémentaires pour GA grand public

7. **Upgrade Supabase Free → Pro**
   - 🟡 Reporté post-traction selon posture launch v3.0 free-tier first.
   - Coût : ~25 $/mois.
   - Apporte : PITR (backup point-in-time), DPA officiel signé, sessions Time-box / Inactivity (configurables 60 j).
   - **Décision à prendre** : à quel seuil de users on bascule ? (50 users sync = recommandation mémoire utilisateur).

8. **Headers de sécurité site marketing**
   - HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
   - Bloqué sur sous-épique 06 (domaine + stack site figés).

9. **Onboarding post-signup minimal**
   - Modale opt-in sync avec rappel "clés API non syncées" + lien doc.
   - Effort : 4-6h frontend.
   - Sub-épique 06 minimaliste (le tour intro 06a est en pause, dépend de 04+05).

---

## Conditions supplémentaires pour Release commerciale (v3.2 billing)

10. **Audit sécurité externe**
    - Recommandé par threat model (mesure post-release #6).
    - Reporté post-traction (>50 users sync) selon posture launch.
    - Périmètre minimum : RLS, Edge Functions, flow auth, updater, deep link.
    - Budget ordre de grandeur : 3-8 k€ pour un audit ciblé indépendant.

11. **DPA Lemon Squeezy signé**

12. **CGU article 12 activé** (section "Service payant" actuellement marquée non applicable)

13. **Webhook LS recâblé depuis le POC** (`docs/research/lemonsqueezy-poc/`)

---

## Couverture Threat Model v3.0

(Cf. `00-threat-model-implementation-matrix.md` pour la matrice détaillée par mesure et par fichier.)

| Catégorie | Total | ✅ Livré | 🟡 Partiel | 🔴 Manquant |
|---|---|---|---|---|
| Mesures sécurité Must-have | 14 | 11 | 3 | 0 |
| Conformité GDPR Must-have | 8 | 6 | 2 | 0 |
| Acteurs threat model | 7 | 7 (3 in-scope + 4 hors-scope conscients) | 0 | 0 |
| Surfaces d'attaque | 9 | 9 | 0 | 0 |

**Bilan** : aucun 🔴. Les 5 partiels sont tous documentés et chiffrés en effort dans les conditions ci-dessus.

---

## Couverture ADR

(Cf. `decisions/adr-implementation-matrix.md` pour la matrice détaillée.)

| ADR | Décision | Statut |
|---|---|---|
| 0001 | Lemon Squeezy MoR | ⏳ v3.2 (POC validé) |
| 0002 | Server-side encryption | ✅ |
| 0003 | Clés API device-local | ✅ |
| 0004 | Méthodes auth (E/P + Magic + Google) | ✅ |
| 0005 | Flow callback web + deep link | ✅ |
| 0006 | Threat model figé | ✅ |
| 0007 | Auth configuration | 🟡 Free vs Pro |
| 0008 (rate-limiting) | Postgres rate_limit_log | ✅ |
| 0008 (sync-strategy) | Y3 + 5 tables | ✅ ajusté à 3 tables (cf. ADR 0010) |
| 0009 | Closure 01-auth | ✅ |
| 0010 | Closure 02-sync | ✅ |
| 0011 (account-deletion) | Tombstone + cron 30j | ✅ |
| 0011 (email-canonical) | normalize_email() | ✅ |
| 0012 | Closure 00-security (livré ce soir) | ✅ |

**Aucun ADR n'a été supersédé.** Tous restent valides.

---

## Récap pack 2026-05-01 livré cette nuit

### A — GA Readiness

| Livrable | Fichier |
|---|---|
| ✅ Sync README v3 (statuts 00 + 02) | `docs/v3/README.md` |
| ✅ ADR closure sub-épique 00 | `docs/v3/decisions/0012-sub-epic-00-closure.md` |
| ✅ Matrice threat model → impl | `docs/v3/00-threat-model-implementation-matrix.md` |
| ✅ Matrice ADR → impl | `docs/v3/decisions/adr-implementation-matrix.md` |
| ✅ Audits locaux verts (pnpm/cargo/vitest/tsc/secret-scan) | sortie capturée ce soir |
| ✅ TODO/FIXME = 0 | grep validé |
| ✅ CHANGELOG v3.0.0 draft | `CHANGELOG.md` |
| ✅ Rapport go/no-go (ce document) | `docs/v3/GA-READINESS-2026-05-01.md` |

### B — Privacy + ToS + Pricing + Emails

| Livrable | Fichier |
|---|---|
| ✅ Privacy Policy FR | `docs/v3/legal/privacy-policy-fr.md` |
| ✅ Privacy Policy EN | `docs/v3/legal/privacy-policy-en.md` |
| ✅ Terms of Service FR | `docs/v3/legal/terms-fr.md` |
| ✅ Terms of Service EN | `docs/v3/legal/terms-en.md` |
| ✅ Page pricing draft (FR + EN) | `docs/v3/legal/pricing-page-draft.md` |
| ✅ 7 templates emails transactionnels (FR + EN) | `docs/v3/legal/email-templates.md` |

---

## Action items prioritaires (par ordre)

### Cette semaine (bloquant Soft Launch)

1. [ ] **Remplir les `<placeholders>`** dans les drafts legal (identité éditeur, contacts, domaine final). Effort : 2h.
2. [ ] **Faire relire par un juriste** la Privacy Policy + ToS FR. Effort externe : 1-2 j calendaires.
3. [ ] **Configurer SMTP custom** Resend ou Postmark + DNS (SPF/DKIM/DMARC). Effort : 2h.
4. [ ] **Câbler Edge Function `send-new-device-email`**. Effort : 3h.
5. [ ] **Compléter le registre GDPR** (champ "Responsable du traitement"). Effort : 15 min.
6. [ ] **Mettre à jour `supabase-bootstrap.md`** avec project ref + anon key publique. Effort : 15 min.

### Sprint suivant (bloquant GA grand public)

7. [ ] **Choisir le domaine final + monter le site marketing minimal** (sub-épique 06).
8. [ ] **Implémenter onboarding post-signup minimal** (modale opt-in sync).
9. [ ] **Exécuter les 3 checklists E2E** sur 2-3 OS.
10. [ ] **Décider seuil d'upgrade Supabase Pro** + planifier migration.
11. [ ] **Premier test de restore backup**.

### Long terme (avant v3.2 commercial)

12. [ ] Audit sécurité externe.
13. [ ] DPA Lemon Squeezy.
14. [ ] Activer section 12 des CGU.
15. [ ] Recâbler webhook LS depuis le POC.

---

## Risques résiduels — à surveiller post-launch

| Risque | Mitigation actuelle | Plan si signal détecté |
|---|---|---|
| Scraping / abus signup | Turnstile + canonical email + pwned password | Activer rate limit custom (RPC `check_rate_limit` déjà dispo) |
| Quota dépassé masse | Banner UI + DLQ après 5 retries | Augmenter quota OU pousser vers Premium v3.2 |
| Supabase Free limite emails | SMTP custom (action #3) | Resend ou Postmark plan payant si volume > 100 emails/j |
| RLS regression sur PR | Tests pgtap CI bloquants | Review obligatoire des migrations `supabase/migrations/` |
| Update updater compromise | Signature crypto + CI scanner | Runbook `secrets-rotation.md` §4 + désactivation feed updates |
| Account takeover par leak password | Pwned + Turnstile + 2FA optionnel | Rendre 2FA obligatoire pour comptes payants v3.2 (mesure post-release #2) |
| Insider Supabase | DPA + posture documentée | Hors-scope assumé v3.0, évaluer E2E si signal user fort |

---

## Appendice — Inventaire `docs/v3/`

```
docs/v3/
├── 00-threat-model.md                              ✅ figé
├── 00-threat-model-implementation-matrix.md        ✅ NEW (nuit 2026-05-01)
├── 01-auth.md                                      ✅ figé
├── 01-auth-e2e-checklist.md                        ⏳ à exécuter manuellement
├── 02-sync-settings.md                             ✅ figé
├── 02-sync-settings-e2e-checklist.md               ⏳ à exécuter manuellement
├── 03-account-deletion-e2e-checklist.md            ⏳ à exécuter manuellement
├── 03-sync-notes.md                                📝 stub (v3.1)
├── 04-billing.md                                   📝 stub + POC (v3.2)
├── 05-managed-transcription.md                     📝 stub (v3.3)
├── 06-onboarding.md                                📝 stub (v3.1)
├── 06-onboarding-intro-tour.md                     🧊 en pause
├── EPIC.md                                         ✅ doc chapeau
├── README.md                                       ✅ resync nuit 2026-05-01
├── GA-READINESS-2026-05-01.md                      ✅ NEW (ce document)
├── compliance/
│   ├── README.md                                   ✅
│   ├── base-legale.md                              ✅
│   └── registre-traitements.md                     🟡 1 placeholder à remplir
├── decisions/
│   ├── 0001 → 0011                                 ✅ tous figés
│   ├── 0012-sub-epic-00-closure.md                 ✅ NEW (nuit 2026-05-01)
│   └── adr-implementation-matrix.md                ✅ NEW (nuit 2026-05-01)
├── legal/                                          ✅ NEW (nuit 2026-05-01)
│   ├── privacy-policy-fr.md
│   ├── privacy-policy-en.md
│   ├── terms-fr.md
│   ├── terms-en.md
│   ├── pricing-page-draft.md
│   └── email-templates.md
├── ops/
│   ├── README.md                                   ✅
│   ├── accounts-checklist.md                       ⏳ exécution manuelle
│   ├── cloudflare-pages-bootstrap.md               ✅
│   └── supabase-bootstrap.md                       🟡 identifiants à remplir
└── runbooks/
    ├── README.md                                   ✅
    ├── account-deletion-purge.md                   ✅
    ├── backup-restore-test.md                      ⏳ première exécution à planifier
    ├── device-fingerprint-investigation.md         ✅
    ├── incident-response.md                        ✅
    └── secrets-rotation.md                         ✅
```

---

*Pack généré dans la nuit du 2026-05-01 → 2026-05-02. Branche : `chore/v3-ga-readiness-night`. PR à valider au réveil.*
