# 00 — Threat model & sécurité fondations

> **Statut**: ✅ Figé le 2026-04-22.
> **Cible**: v3.0 (bloquant).
> **Dépendances**: EPIC-07 (audit sécurité du code existant) doit être terminé en parallèle ou avant la sortie publique.

---

## Pourquoi ce document

Toutes les décisions techniques en aval (chiffrement, auth, schéma DB, RLS, gating premium) sont des **réponses à un threat model**. Sans threat model écrit, on prend des décisions sans savoir contre quoi on se défend — donc on sur-protège ou sous-protège.

Ce document cadre **qui on défend contre quoi**, **quels actifs on protège**, et **ce qu'on accepte explicitement de ne pas couvrir**. Il sert de référence pour toutes les décisions sécu de la v3 et des versions suivantes.

C'est un **living document**: il est révisé à chaque clôture de sous-épique v3 et à chaque release majeure.

---

## Posture globale

Voice Tool v3 adopte une **posture "style Notion"** (cf. [ADR 0002](decisions/0002-server-side-encryption.md)): server-side encryption, recovery utilisateur simple, UX proche des SaaS classiques. Ce n'est **pas** un produit ultra-privacy revendiqué (tel Signal, Proton, Bitwarden).

L'argument de confiance principal et vérifiable publiquement est: **les clés API utilisateur ne quittent jamais le device** (cf. [ADR 0003](decisions/0003-api-keys-device-local.md)). Cette promesse est **constructive** (par architecture) et non déclarative, ce qui la rend forte.

Les promesses explicites autour de la v3 sont:

- "Nous ne voyons jamais vos clés API." — vrai par construction
- "Nous chiffrons vos données en transit (TLS) et au repos (Postgres)." — vrai
- "Vous pouvez continuer à utiliser Voice Tool 100% localement, sans compte." — vrai, le mode local reste gratuit et fonctionnel
- "2FA TOTP disponible" — vrai dès v3.0 (optionnel)

Ce qu'on ne promet **pas**:

- Zéro accès au contenu des notes (serait faux: posture server-side)
- Chiffrement bout-en-bout (non implémenté)
- Audit log utilisateur ("qui a accédé à mes notes") — reporté post-v3.0

---

## Acteurs — contre qui on se défend

| # | Acteur | Statut | Rationale |
|---|---|---|---|
| A | Attaquant externe non-authentifié (scan de masse, bot, script kiddie) | 🟢 **IN-SCOPE** | Base obligatoire pour toute API exposée sur Internet |
| B | Attaquant externe authentifié (a un compte légitime, tente d'accéder aux données d'un autre user via IDOR, fuite RLS, etc.) | 🟢 **IN-SCOPE** | Risque #1 d'un produit multi-tenant. Un RLS mal configuré = breach cross-tenant. |
| C | Compte tiers compromis (Supabase / Lemon Squeezy / GitHub / DNS piraté côté opérateur) | 🟢 **IN-SCOPE** | Mitigation: 2FA obligatoire sur tous les comptes ops, rotation documentée des secrets |
| D | Insider dev solo (l'opérateur lui-même, ou prestataire futur ayant accès au backend) | 🔴 **OUT-OF-SCOPE v3.0** | Dev solo éthique, pas d'équipe. **À revisiter dès qu'un tiers (employé, prestataire) aura accès à la prod**. Ce choix est conscient, pas un oubli. |
| E | Insider Supabase (employé Supabase ayant accès aux DB clients) | 🔴 **OUT-OF-SCOPE** | Cohérent avec la posture server-side (ADR 0002). Documenté en clair dans la privacy policy: on fait confiance au SLA et aux pratiques internes Supabase. |
| F | État / autorité judiciaire avec subpoena | 🔴 **OUT-OF-SCOPE** | On n'est pas Signal. On coopère si requête légale. Documenté dans la privacy policy. |
| G | Attaquant ayant compromis le device de l'utilisateur (malware) | 🔴 **OUT-OF-SCOPE** | Game over standard de toute app desktop. Le keyring OS offre une défense en profondeur mais ne résiste pas à un malware admin. |

**Note importante sur l'acteur D**: si un jour un tiers rejoint le projet (employé, prestataire, co-fondateur), ce threat model doit être **réouvert** et les mitigations ajoutées: audit log opérateur, accès lecture seule en prod par défaut, séparation des responsabilités, etc.

---

## Actifs — quoi on protège

| Actif | Sensibilité | Stockage | Rationale / Mitigation |
|---|---|---|---|
| Hash password + secrets auth (JWT secret, webhook secret Lemon Squeezy, Supabase service role) | 🔴 **CRITIQUE** | Supabase managé (hash bcrypt) + variables d'environnement (secrets) | Fuite = account takeover massif. Rotation documentée obligatoire. |
| Sessions actives (refresh tokens) | 🔴 **CRITIQUE** | Keyring OS côté client (Windows Credential Manager / macOS Keychain / Linux Secret Service), Supabase côté serveur | Vol = session hijack. Ne JAMAIS logger le JWT. |
| Email utilisateur | 🟠 **ÉLEVÉE** | Supabase Auth | Identifiant + vecteur de phishing ciblé. **Ne jamais logger côté serveur, même pour debug.** |
| Notes texte utilisateur | 🟠 **ÉLEVÉE** | DB Supabase chiffrée at rest (ADR 0002) | Sensible mais pas catastrophique. Une fuite DB = lecture en clair (compromis accepté, cf. plus bas). |
| Settings utilisateur (sauf clés API) | 🟡 **MOYENNE** | DB Supabase chiffrée at rest | Préférences UI, hotkeys, langue. Peu sensible individuellement. |
| Métadonnées (last_sync_at, device_count, plan) | 🟢 **FAIBLE** | DB Supabase | Peu exploitable seul. |
| Données de paiement | ⚫ **HORS SCOPE** | Lemon Squeezy uniquement (Merchant of Record) | On ne stocke rien. DPA signé avec LS couvre la responsabilité. |
| Clés API utilisateur (OpenAI, Groq, etc.) | ⚫ **HORS SCOPE backend** | Device-local uniquement (ADR 0003) | Jamais en transit, jamais en DB. Argument marketing principal. |
| Transcriptions / audio | ⚫ **HORS SCOPE v3.0** | Device-local | Non syncés en v3.0. **Si re-introduits plus tard** (ex: service managé v3.2), reclassification obligatoire probablement en 🔴 CRITIQUE (contenu potentiellement très sensible). |

---

## Surfaces d'attaque — où on peut nous taper

| Surface | Priorité | Pourquoi |
|---|---|---|
| API Supabase (PostgREST + RLS) | 🔴 **P1** | Point d'entrée de l'acteur B. Un RLS mal foutu = accès cross-tenant. **LE point le plus critique.** Tests automatisés cross-tenant obligatoires. |
| Edge Functions Supabase | 🔴 **P1** | Logique custom = bugs custom. Validation input Zod obligatoire, rate limiting, pas de service role key exposée. |
| Flow OAuth Google (callback) | 🟠 **P2** | `state` parameter obligatoire (CSRF), validation stricte du redirect URI côté Google Console. |
| Flow Magic Link (email → callback) | 🟠 **P2** | Token one-time, TTL court, anti-replay, anti-enumeration (réponse identique email connu/inconnu). |
| Webhook Lemon Squeezy | 🟠 **P2** | HMAC déjà prouvé dans le POC, idempotence déjà testée. Risque résiduel: rotation du secret mal gérée. |
| Page web auth-callback | 🟠 **P2** | XSS sur cette page = leak de token. CSP stricte, zéro JS tiers, token nettoyé de l'URL dès lecture. |
| Deep link `voice-tool://` | 🟡 **P3** | Injection possible si on ne valide pas. Attaquant doit déjà avoir un accès au device → moins critique, mais validation stricte obligatoire. |
| App desktop Tauri (IPC commands) | 🟡 **P3** | Surface interne. Risque si une lib tierce (ex: cpal, whisper-rs) a une vuln exploitable via input audio/fichier. |
| Updater (tauri-plugin-updater) | 🟢 **P4** | Déjà bien couvert: signature cryptographique, HTTPS-only. Risque résiduel = compromission de la clé privée GitHub Secrets → d'où 2FA obligatoire sur GitHub. |

---

## Compromis acceptés explicitement

À documenter en clair pour que personne (dev solo inclus dans 6 mois) ne soit surpris:

- 🟡 **Fuite de la DB Supabase = lecture des notes en clair.** Cohérent avec la posture server-side (ADR 0002). Mitigations: backup chiffré, RLS strict, DPA Supabase, plan de réponse à incident.
- 🟡 **Insider Supabase théoriquement possible.** On fait confiance au SLA Supabase. Documenté dans la privacy policy.
- 🟡 **Pas de chiffrement bout-en-bout en v3.0.** Reporté si un signal utilisateur fort émerge, mais implique une migration lourde (cf. ADR 0002).
- 🟡 **Pas d'audit log utilisateur en v3.0** ("qui a accédé à mes notes, quand, depuis où"). Nice-to-have v3.x.
- 🔴 **Device utilisateur compromis = game over.** Standard de toute app desktop. Le keyring OS est une défense en profondeur, pas une barrière absolue.
- 🟡 **Insider dev solo accepté pour v3.0** (cf. acteur D ci-dessus). À revisiter si un tiers accède à la prod.

---

## Mesures défensives — Must-have v3.0 (bloquant release)

1. **RLS strict sur toutes les tables** — deny by default, policies explicites, tests automatisés cross-tenant (user A ≠ user B sur chaque table syncée)
2. **Service role key jamais côté client** — audit CI qui fail si la clé est trouvée dans les bundles frontend ou dans les binaires Tauri
3. **Rate limiting Edge Functions** — table `rate_limit_log` côté Postgres, ou Cloudflare devant. À trancher au niveau techno dans les sous-épiques 01/02/04.
4. **Validation input stricte** — Zod côté Edge Functions, type checks Rust côté Tauri, rejet hard en cas de schema mismatch
5. **Logs serveur zéro PII** — règle explicite: pas d'email, pas de contenu notes, pas de JWT dans les logs. Linter ou règle manuelle au code review.
6. **Rotation des secrets documentée** — runbook dédié: webhook Lemon Squeezy, JWT secret, Supabase service role key, clé privée updater GitHub Secrets
7. **CSP stricte sur la page auth-callback** — `default-src 'none'; script-src 'self'`, zéro JS tiers (pas d'analytics, pas de tag manager)
8. **Headers de sécurité sur le site web** — HSTS (avec preload après validation), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
9. **2FA TOTP optionnel** — supporté nativement par Supabase Auth, activable dans les settings
10. **Email de notification à chaque nouveau device connecté** — signal de sécurité sans friction obligatoire
11. **Backup chiffré + test de restauration** — configuration Supabase + test de restore documenté trimestriellement
12. **Plan de réponse à incident écrit** — qui prévenir, comment notifier les utilisateurs, délai GDPR <72h, template de communication
13. **2FA obligatoire sur tous les comptes ops** — GitHub, Supabase, Lemon Squeezy, Google Cloud, registrar DNS, hébergeur site marketing
14. **`cargo audit` + `pnpm audit` en CI** — gate bloquant sur les CVE HIGH et CRITICAL, triage manuel pour MEDIUM

---

## Mesures défensives — Nice-to-have v3.x (post-release)

1. **Audit log utilisateur** — table `access_log` par user, consultable dans les settings ("qui a accédé à mes notes, quand, depuis quel device")
2. **2FA obligatoire** (upgrade de l'optionnel) — probablement pour les comptes payants d'abord
3. **Recovery codes autogénérés au signup** — une fois 2FA obligatoire
4. **WAF devant Supabase** (Cloudflare ou équivalent) — défense en profondeur contre DDoS et scans
5. **Bug bounty public** — plateforme type HackerOne ou Intigriti, budget dédié
6. **Audit sécurité externe** — **bloquant avant la sortie publique v3.0**. Budget à chiffrer (ordre de grandeur: quelques k€ pour un audit ciblé). Doit couvrir: RLS, Edge Functions, flow auth, updater, deep link.

---

## Conformité GDPR — Must-have v3.0 (bloquant release)

1. **Registre des traitements** rédigé (doc interne, pas public) — liste des données collectées, finalité, base légale, durée de conservation, sous-traitants
2. **Privacy policy publiée** avant la release v3.0 — URL stable sur le site marketing, langue principale française + anglaise
3. **Mentions légales** publiées — identité éditeur, hébergeur, contact
4. **DPA signés** — Supabase (fourni automatiquement sur le plan Pro), Lemon Squeezy (template disponible sur leur site)
5. **Droit à l'oubli effectif** — le `delete account` purge réellement: notes, settings synchronisés, sessions actives, row `auth.users`, logs contenant l'email. Test automatisé qui vérifie la purge complète.
6. **Data export** — l'utilisateur peut télécharger toutes ses données synchronisées en JSON depuis les settings
7. **Process notification de fuite <72h** documenté — intégré au plan de réponse à incident (mesure défensive #12)
8. **Base légale du traitement documentée** — contrat (exécution du service) pour le payant, consentement explicite au signup pour le gratuit

---

## Revue et mise à jour

Ce document est un **living document**:

- Révision complète à chaque release majeure (v3.0, v3.1, v3.2, v4.0…)
- Révision ciblée à chaque clôture de sous-épique v3 (01, 02, 03, 04, 05, 06)
- Révision immédiate en cas d'incident de sécurité ou de découverte de vulnérabilité majeure
- Révision immédiate si un tiers (employé, prestataire) accède à la prod (réactive l'acteur D)

Les ADRs associés sont **figés** une fois acceptés. Les révisions d'ADR se font par **nouvel ADR** qui supersede l'ancien (jamais d'édition en place d'un ADR accepté).

---

## Livrables

### Spec (session 2026-04-22)

1. ✅ `00-threat-model.md` — threat model complet et figé
2. ✅ `SECURITY.md` à la racine — politique publique de divulgation
3. ✅ `decisions/0006-threat-model.md` — ADR figeant les choix structurants

### Implémentation (plan 2026-04-24)

4. ✅ `ops/accounts-checklist.md` + exécution 2FA tous comptes ops
5. ✅ `.github/workflows/security-audit.yml` — pnpm + cargo audit bloquants
6. ✅ `.github/workflows/secret-scan.yml` + script `scan-secrets-in-bundles.mjs`
7. ✅ `ops/supabase-bootstrap.md` + projet Supabase Pro EU créé
8. ✅ `ops/cloudflare-pages-bootstrap.md` + projet placeholder créé
9. ✅ `runbooks/secrets-rotation.md`
10. ✅ `runbooks/backup-restore-test.md` + premier test exécuté
11. ✅ `runbooks/incident-response.md` (GDPR 72h)
12. ✅ `compliance/registre-traitements.md`
13. ✅ `compliance/base-legale.md`

---

## Liens

- [EPIC v3](EPIC.md) — document chapeau
- [ADR 0001 — Lemon Squeezy](decisions/0001-lemonsqueezy-vs-stripe.md)
- [ADR 0002 — Server-side encryption](decisions/0002-server-side-encryption.md)
- [ADR 0003 — Clés API device-local](decisions/0003-api-keys-device-local.md)
- [ADR 0004 — Méthodes d'authentification](decisions/0004-auth-methods.md)
- [ADR 0005 — Flow callback auth](decisions/0005-callback-flow-web-page.md)
- [ADR 0006 — Threat model v3.0](decisions/0006-threat-model.md)
- [Backlog général](../BACKLOG.md) — EPIC-07 (audit sécu) et EPIC-08
- [POC Lemon Squeezy](../research/lemonsqueezy-poc/)
