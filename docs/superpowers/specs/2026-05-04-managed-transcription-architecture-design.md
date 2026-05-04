# Service managé transcription — Architecture phase 1

**Date** : 2026-05-04
**Branche cible** : `docs/05-managed-transcription-design` puis intégration dans le chantier v3.2
**Statut** : design approuvé (brainstorming 2026-05-04), prêt à être planifié
**Sous-épique principal** : `05-managed-transcription` (cible v3.2, livré conjointement avec `04-billing` cf. premium offer 2026-04-27)
**Sous-épiques touchés** : `04-billing`, `01-auth` (réutilisation JWT), `06-onboarding`
**ADR à créer** : `0012-managed-transcription-stack.md`

---

## 1. Contexte et problème

Le spec premium offer du 2026-04-27 (`docs/superpowers/specs/2026-04-27-v3-premium-offer-design.md`) a acté que les plans Starter (5€/mois, 400 min) et Pro (9€/mois, 1000 min) reposent sur un **service de transcription managée + post-process IA** côté Lexena. Sans ce service, l'offre payante n'existe pas. Conséquence : le sous-épique `05-managed-transcription`, initialement cadré pour v3.3, est ramené en v3.2 et livré simultanément avec le billing.

Le présent document fige les **5 décisions architecturales fondamentales** qui débloquent l'écriture du plan d'implémentation v3.2. Il couvre **uniquement la phase 1** (proxy léger sans modèle hébergé). Une éventuelle phase 2 (self-host Whisper sur GPU) est mentionnée comme orientation post-launch sans engagement de design.

Contraintes de cadrage retenues :
- **Posture launch** "free-tier first" du projet — pas d'investissement infra significatif tant qu'on n'a pas validé la traction.
- **Promesse de confiance** Lexena — le mode local 100% gratuit reste la voie sans compromis. Le service managé est une commodité pour ceux qui ne veulent pas gérer leurs propres clés ou modèles.
- **Time-to-market v3.2** — l'offre payante doit pouvoir sortir avec une infra opérationnelle, observable, et facile à exploiter en solo.

---

## 2. Décisions de design

| # | Sujet | Décision |
|---|---|---|
| Q1 | Architecture proxy vs self-host | **Hybride différé** : phase 1 = proxy d'un provider tiers ; bascule self-host envisagée plus tard si volume/marge le justifient. Phase 1 seule fait l'objet du présent design. |
| Q2 | Hébergement du proxy | **Cloudflare Workers** sur le sous-domaine `api.lexena.app`. Plan payant ($5/mois) pour les limites payload et CPU production. |
| Q3 | Provider transcription | **Groq Whisper turbo** (`whisper-large-v3-turbo`) seul. Pas de fallback transcription en phase 1 (note post-launch en section 12). |
| Q4 | Provider post-process IA | **OpenAI** (`gpt-4o-mini` par défaut, `gpt-4o` pour les tâches identifiées comme exigeantes). Llama écarté sur retour d'expérience direct. |
| Q5 | Stockage audio | **Zero-retention strict**. L'audio passe en mémoire dans le Worker, est relayé à Groq, jeté dès la réponse reçue. Aucune persistance disque ni Supabase. |

---

## 3. Architecture phase 1

### 3.1 Vue d'ensemble

```
┌──────────────────┐    HTTPS + JWT     ┌─────────────────────────────────┐
│  Lexena Tauri    │ ─────────────────► │ Cloudflare Worker (api.lexena)  │
│  Desktop App     │                    │   POST /transcribe              │
└────────┬─────────┘                    │   POST /post-process            │
         │                              └────┬───────────────┬────────────┘
         │ subscription state cachée         │               │
         │ (refresh login + démarrage        │ verify JWT    │ debit usage
         │  + action cloud)                  │ check quota   │ (event log)
         │                                   ▼               ▼
         │                       ┌───────────────────────────────────────┐
         │                       │ Supabase Postgres EU                  │
         └─────── auth ─────────►│   auth.users  +  subscriptions        │
                                 │   usage_events (append-only)          │
                                 │   usage_summary (vue matérialisée)    │
                                 └───────────────────────────────────────┘
                                                     ▲
                                                     │ webhook subscription_*
                                                     │
                                  Cloudflare Worker──┘
                                  (déjà existant 04-billing : Lemon Squeezy webhook)


   Worker /transcribe ──── audio (multipart) ───► Groq API (US)
                       ◄──── transcript + duration ────

   Worker /post-process ── prompt + text ────────► OpenAI API (US)
                       ◄──── completion + tokens ───
```

Tout le code applicatif vit dans **un seul Worker** déployé sur `api.lexena.app`. Pas de séparation par sous-domaine ni par projet Cloudflare. Deux endpoints, runtime partagé, secrets partagés.

### 3.2 Pourquoi Cloudflare Workers (résumé)

- POPs mondiaux (l'utilisateur tape l'edge la plus proche, Tokyo ou Paris ou Toronto).
- Cold start ~5ms (vs 100-500ms Lambda, 1-3s Fly.io scale-to-zero).
- Plan payant à $5/mois suffit pour le volume cible v3.2 (10M requêtes incluses).
- Cohérent avec la stack existante (page callback auth déjà sur Cloudflare Pages).
- Le runtime est suffisant pour un proxy stateless ; on ne fait tourner aucun modèle dans le Worker.

Limites à respecter (toutes confortables pour le périmètre) :
- Payload requête : 100 MB max. Audio 30s WAV mono 16kHz = ~960 KB. MP3 64 kbps 30s = ~240 KB. Largement sous la limite même pour des fichiers de plusieurs minutes.
- CPU per request : 30s par défaut sur le plan payant. Pure activité réseau (I/O wait non comptée). Sans souci pour un proxy.
- Wall time : Workers attend tranquillement le retour Groq (typiquement <1s pour 30s d'audio).

### 3.3 Pourquoi Groq Whisper turbo

- Latence ~0,3-0,5s pour 30s d'audio (10-50x plus rapide qu'OpenAI Whisper).
- Coût ~$0,001/min — laisse une marge nette confortable sur Starter (~4,35€/user à 100% du quota) et Pro (~7,55€/user, cf. modélisation 4.2 du spec premium).
- API compatible OpenAI Whisper (`/v1/audio/transcriptions`) — pas de SDK custom à écrire.
- Disponible mondialement avec POP US, latence acceptable depuis l'EU (RTT ~80-100ms).

### 3.4 Pourquoi OpenAI pour le post-process

Décision tranchée par retour d'expérience direct du porteur du projet : Llama 3 a donné des résultats catastrophiques sur les tâches de reformulation/correction/mail. OpenAI (`gpt-4o-mini` à $0,15/M input, $0,60/M output) reste le seul provider validé pour ces tâches en multilingue (notamment français). Anthropic Claude n'a pas été testé et reste une option pour plus tard si la qualité GPT-4o-mini s'avérait insuffisante sur certaines tâches.

### 3.5 Pourquoi zero-retention strict

- Aligné avec la promesse de confiance Lexena (mode local = aucune donnée envoyée ; mode cloud = données envoyées mais pas conservées par nous).
- DPA Lexena ↔ user simplifié : on n'est pas data controller pour l'audio, on est uniquement data processor pendant la durée de l'appel.
- Élimine une catégorie entière de risques (fuite de stockage, demande légale de production, droit à l'oubli sur audio).
- Le coût "debug aveugle" est mitigé en loggant l'**identifiant de requête** retourné par Groq (sans le contenu) pour corréler les incidents support avec leurs traces upstream.

---

## 4. Composants

### 4.1 Worker `POST /transcribe`

**Entrée** : `multipart/form-data`
- `audio` : fichier (wav/mp3/flac/m4a, formats Whisper supportés)
- `language` : optionnel, code ISO-639-1 (`fr`, `en`...)

**Header** : `Authorization: Bearer <Supabase JWT>`

**Traitement** :
1. Vérification JWT via clé publique Supabase (cachée en variable d'environnement Worker, refresh manuel si rotation).
2. Extraction `user_id` du JWT (sub claim).
3. Lecture quota disponible côté Supabase (table `subscriptions` + agrégation `usage_summary`). Reject 402 si quota épuisé hors fenêtre de dépassement autorisé.
4. Relais audio vers Groq `/v1/audio/transcriptions` avec la clé serveur Lexena (jamais celle de l'user).
5. À la réception du transcript : calcul minutes consommées (durée audio à la seconde près, arrondie à la seconde — cf. section 4.4 du spec premium offer).
6. Append `usage_events` avec `provider_request_id` Groq (sans contenu).
7. Retour `200` avec `{ text, duration_ms, request_id }`.

**Réponses non-200** :
- `401` : JWT invalide / expiré
- `402` : quota épuisé hors fenêtre autorisée (hard cap)
- `413` : audio trop volumineux (cap à fixer dans le plan d'impl, ex 50 MB)
- `502` : provider Groq en erreur (5xx ou timeout >25s)
- `503` : maintenance / circuit breaker

### 4.2 Worker `POST /post-process`

**Entrée** : `application/json`
- `task` : enum (`reformulate`, `correct`, `email`, `summarize`, autres à figer dans le plan)
- `text` : string
- `language` : optionnel
- `model_tier` : optionnel, `mini` (défaut) ou `full`

**Header** : `Authorization: Bearer <Supabase JWT>`

**Traitement** :
1. Vérif JWT + user_id (idem /transcribe).
2. Lecture quota — note : le post-process consomme un compteur **séparé** des minutes de transcription (cf. section 5).
3. Construction du prompt selon `task` (templates côté Worker, versionnés, pas configurables par l'user).
4. Appel OpenAI `/v1/chat/completions` avec `gpt-4o-mini` (ou `gpt-4o` si `model_tier=full`).
5. Append `usage_events` avec tokens IN/OUT et `provider_request_id` OpenAI.
6. Retour `200` avec `{ text, tokens_in, tokens_out, request_id }`.

### 4.3 Client Tauri (intégration)

Les commandes Tauri actuelles `transcribe_audio` et le post-process IA existant sont étendues pour router vers le service managé quand l'utilisateur est en mode cloud actif (signed-in + abonnement valide). Routing :

```
        ┌─ transcribe_audio_cloud(audio, jwt) ──► Worker /transcribe
mode    │
cloud ──┼─ post_process_cloud(task, text, jwt) ──► Worker /post-process
        │
        └─ on 4xx/5xx → propagation erreur, pas de fallback silencieux
                       cloud → local (cf. section 8)

mode    ┌─ transcribe_audio_local(audio) ──► whisper-rs (existant)
local ──┤
        └─ post_process — non disponible (cf. spec premium 7.3)
```

Le mode est déterminé par le state subscription en cache local (refresh login + démarrage app + action cloud). Cf. section 7.5 du spec premium.

### 4.4 Schéma DB Supabase (vue d'ensemble)

| Table | Rôle | Modèle |
|---|---|---|
| `usage_events` | Append-only ledger de chaque appel cloud (transcription ou post-process). Source de vérité pour audit, debug, support. | `id`, `user_id`, `kind` (`transcription`/`post_process`), `units` (minutes ou tokens selon kind), `provider_request_id`, `model`, `created_at`, `idempotency_key` |
| `usage_summary` | Table d'agrégat par `(user_id, year_month, kind)` mise à jour par trigger après insert dans `usage_events` (UPSERT atomique). Lue à chaque appel pour vérifier quota. Pas une `MATERIALIZED VIEW` Postgres, qui imposerait un `REFRESH` global incompatible avec une lecture à chaque requête. | Hot path quota check : `SELECT total FROM usage_summary WHERE user_id=? AND year_month=? AND kind='transcription'`. |
| `subscriptions` | Existante (POC Lemon Squeezy 04-billing). Référence le plan, le quota inclus, le statut. | Inchangée. |
| `trial_credits` | Solde et expiration des 60 min / 30 jours offerts au signup (cf. spec premium section 5). | `user_id`, `minutes_remaining`, `started_at`, `expires_at` |

Détail exact (colonnes, index, contraintes, RLS) à figer dans le plan d'implémentation. Le présent design fixe **la séparation event-sourced + agrégat** comme posture (audit + perf), pas le DDL complet.

**Note sur le spec premium** : la section 11.9 du spec premium 2026-04-27 mentionnait une table unique `usage_minutes`. Le découpage proposé ici (`usage_events` append-only + `usage_summary` agrégée) est plus solide : il sépare la source de vérité (audit/debug) du compteur chaud (perf hot path), il évite les races de concurrence sur un compteur unique, et il permet de couvrir transcription **et** post-process avec la même structure (le spec premium se focalisait uniquement sur les minutes). Ce design supersede donc cette ligne du livrable 11.9 du spec premium.

### 4.5 Authentification & rate limiting

- **Auth** : JWT Supabase signé par Supabase Auth, vérifié par le Worker via clé publique cachée en var d'env Worker. Pas d'aller-retour Supabase à chaque requête.
- **Rate limit applicatif** : géré par le compteur `usage_summary` (le quota mensuel agit déjà comme rate limit naturel).
- **Rate limit anti-DoS** : Cloudflare Rate Limiting Rules en amont du Worker (ex. 30 req/min/IP, 100 req/min/JWT). Configuration à figer dans le plan.
- **Hard cap "fair use"** : 5h/mois mentionné dans le spec premium 12.1 comme plafond soft (alerte admin, pas blocage). À figer dans le plan d'impl.

---

## 5. Compteurs et quotas

### 5.1 Deux compteurs séparés

- **Transcription** : compté en **minutes** (durée audio Groq retournée, arrondie à la seconde, convertie en min). Quota défini par le plan (400 / 1000 min/mois) + crédit trial (60 min).
- **Post-process** : compté en **tokens** (input + output OpenAI). Pas de quota explicite côté user en v3.2, mais comptabilisé pour modéliser le coût réel et calibrer les futurs plans.

Rationale séparation : les deux ont des unités, des coûts marginaux et des providers différents. Les unifier (par exemple en "crédits") rendrait l'UX du compteur opaque et compliquerait l'accounting interne.

### 5.2 Hiérarchie de consommation

À chaque appel transcription :
1. Si l'user a un trial actif (60 min restantes ET 30 jours non écoulés) → débit sur `trial_credits`.
2. Sinon, si abonnement actif et quota mensuel non épuisé → débit sur quota inclus.
3. Sinon, si abonnement actif et quota épuisé → débit sur "dépassement" (facturé `0,02-0,03€/min` selon plan via Lemon Squeezy add-on, à déclencher en fin de mois).
4. Sinon → `402` retour Worker, popup paywall côté client.

Hard cap fair use (ex 5h/mois total dépassement) : alerte admin par mail / Slack si franchi, **sans blocage automatique** en v3.2 — cf. spec premium 12.1.

### 5.3 Idempotence

Chaque appel Worker reçoit (ou génère) un `Idempotency-Key` que le client peut renvoyer en cas de retry réseau. Le Worker check `usage_events.idempotency_key UNIQUE` pour éviter le double-débit. Détail à fixer dans le plan.

---

## 6. Sécurité & RGPD

### 6.1 Posture zero-retention

- Audio : transit mémoire uniquement. Aucune écriture disque dans le Worker (Workers n'a pas de FS persistent de toute façon). Aucune persistance Supabase.
- Texte transcrit : retourné au client, jamais stocké côté Lexena. Le client peut décider de le sauvegarder localement (note transcription, etc.) — c'est sa responsabilité.
- Texte post-process input/output : idem, retourné au client, jamais stocké.
- Logs : seulement `user_id`, `kind`, `units`, `provider_request_id`, `created_at`. **Pas** de contenu, pas de prompt, pas de transcript.

### 6.2 Chaîne de sous-traitance

- **Lexena** est data controller pour l'événement de consommation (qui a appelé quoi quand).
- **Lexena** est data processor (transit) pour l'audio et le texte, pendant la durée de l'appel uniquement.
- **Groq** et **OpenAI** sont sous-traitants ultérieurs. DPA à signer avec chacun. Privacy policy Lexena doit les nommer.
- Les deux providers sont US-based : transfer hors EU déclaré dans la privacy policy + base légale (consentement + nécessité contractuelle pour exécuter le service).

### 6.3 Secrets

| Secret | Stockage | Rotation |
|---|---|---|
| `GROQ_API_KEY` | Var d'env Worker (Cloudflare Secrets) | Manuelle, runbook à écrire |
| `OPENAI_API_KEY` | Var d'env Worker | Manuelle, runbook à écrire |
| `SUPABASE_JWT_PUBLIC_KEY` | Var d'env Worker | À synchroniser avec rotation Supabase (rare) |
| `SUPABASE_SERVICE_ROLE_KEY` | Var d'env Worker (pour écrire `usage_events`) | Manuelle |

Pas de secret exposé au client Tauri. Le client n'a que le JWT user.

---

## 7. Performances et SLA cible

| Métrique | Cible v3.2 | Mesure |
|---|---|---|
| Latence end-to-end transcription (30s audio depuis EU) | <2s P95 | Métrique Cloudflare Analytics + ping client |
| Latence end-to-end post-process (texte ~500 tokens) | <3s P95 | Idem |
| Disponibilité Worker | 99,5% mensuel | Cloudflare SLA edge + uptime monitoring externe (UptimeRobot ou équivalent) |
| Erreur 5xx hors maintenance | <0,5% | Cloudflare logs |

Pas de pénalité contractuelle vis-à-vis de l'user en v3.2 — les SLA sont des objectifs internes, pas des engagements.

---

## 8. Gestion d'erreur et fallback

### 8.1 Erreurs côté Worker

| Cas | Code | Comportement client |
|---|---|---|
| JWT invalide | 401 | Logout + popup login |
| Quota épuisé hors dépassement | 402 | Popup paywall (cf. spec premium 7.2) |
| Audio trop volumineux | 413 | Toast erreur ("fichier trop long, max X min") |
| Provider Groq 5xx ou timeout | 502 | Toast erreur ("service de transcription temporairement indisponible") + suggestion bascule manuelle local si modèle installé |
| Provider OpenAI 5xx ou timeout | 502 (post-process) | Toast erreur ("post-process temporairement indisponible"), pas de fallback |
| Maintenance | 503 + `Retry-After` | Toast informatif |

### 8.2 Pas de fallback automatique cloud → local

Décision : en cas d'erreur cloud (incident provider, quota), l'app **ne bascule pas silencieusement** sur le mode local pour la transcription. Raisons :
- Risque de débit caché (l'user pense être en cloud, l'app utilise le local sans le dire).
- Comportement local + cloud peuvent diverger (qualité whisper-rs vs Groq, pas de post-process en local).
- Mieux vaut une erreur explicite + bouton manuel "essayer en local maintenant" qu'un fallback opaque.

Le bouton manuel apparaît dans le toast d'erreur si le user a un modèle local installé.

### 8.3 Retry réseau côté client

Le client retente automatiquement les erreurs réseau transitoires (DNS, connexion refusée, timeout TCP) **avec le même `Idempotency-Key`** pour éviter le double-débit. Pas de retry automatique sur 4xx ni 5xx applicatifs (c'est à l'user de relancer).

---

## 9. Coûts opérationnels et marge

### 9.1 Coût fixe phase 1

| Poste | Coût mensuel |
|---|---|
| Cloudflare Workers Paid | $5 |
| Cloudflare DNS / Pages (déjà en place) | $0 |
| Supabase (déjà en place — projet v3 prod) | $0 (free tier) → $25 (Pro tier) selon traction |
| Domain `api.lexena.app` (déjà acheté avec lexena.app) | $0 |
| **Total fixe** | **$5-30/mois** selon Supabase tier |

### 9.2 Coût variable

- Groq Whisper turbo : ~$0,001/min audio
- OpenAI gpt-4o-mini : $0,15/M input, $0,60/M output (post-process moyen ~500 tokens IN, ~500 tokens OUT = ~$0,000375 par appel)
- OpenAI gpt-4o (tier full) : $2,50/M input, $10/M output (~$0,00625 par appel équivalent)

### 9.3 Marge par user payant (rappel section 4.2 du spec premium)

| Plan | Revenu | Coût direct provider | Frais Lemon Squeezy | Marge nette |
|---|---|---|---|---|
| Starter | 5€ | ~0,40€ | ~0,25€ | ~4,35€ |
| Pro | 9€ | ~1,00€ | ~0,45€ | ~7,55€ |

Modélisation à raffiner après les premiers users payants (ratio post-process / transcription, taux de dépassement réel).

---

## 10. Implications pour les autres sous-épiques

### 10.1 Sous-épique `04-billing`

- Table `subscriptions` existante (POC Lemon Squeezy) inchangée structurellement.
- Ajout des tables `usage_events`, `usage_summary` (vue), `trial_credits` — à intégrer dans le plan v3.2 conjoint.
- Lemon Squeezy "overage charge" déclenché en fin de mois sur la base de `usage_summary` : flow webhook + script à figer dans le plan v3.2.

### 10.2 Sous-épique `01-auth`

- Aucune modification structurelle. Le Worker valide les JWT existants via clé publique Supabase.
- Confirmer dans le plan que la durée de vie JWT (1h par défaut Supabase) est OK pour des appels cloud — l'app refresh le JWT côté Tauri quand nécessaire.

### 10.3 Sous-épique `06-onboarding`

- Privacy policy doit lister Groq et OpenAI comme sous-traitants.
- Page pricing peut afficher "Transcription cloud propulsée par Groq Whisper turbo, post-process IA propulsé par OpenAI" pour transparence.

### 10.4 ADR à créer

| ADR | Sujet |
|---|---|
| `0012-managed-transcription-stack.md` | Récap des 5 décisions du présent design (architecture proxy hybride différée, Cloudflare Workers, Groq, OpenAI, zero-retention). |

---

## 11. Livrables du plan d'implémentation v3.2 (vue d'ensemble)

À détailler dans le plan d'implémentation, livré conjointement avec les livrables 04-billing :

1. **Worker Cloudflare** déployé sur `api.lexena.app` avec endpoints `/transcribe` et `/post-process`.
2. **Vérification JWT Supabase** côté Worker (clé publique en var d'env).
3. **Table `usage_events`** (append-only ledger) + RLS.
4. **Vue matérialisée `usage_summary`** + trigger refresh.
5. **Table `trial_credits`** + logique d'init à la vérif email (cf. spec premium section 5).
6. **Templates de prompts post-process** versionnés côté Worker (reformulate, correct, email, summarize).
7. **Commandes Tauri étendues** : `transcribe_audio_cloud`, `post_process_cloud`.
8. **Routing client** mode cloud vs local selon état subscription.
9. **Compteurs UI** côté app (header + settings) pour minutes restantes et expiration trial.
10. **Cloudflare Rate Limiting Rules** (anti-DoS).
11. **Suppression UI BYOK** (déjà listée dans le spec premium 11.14 ; mentionnée ici pour cohérence).
12. **Runbook ops** : rotation des clés Groq/OpenAI, monitoring, incident response.
13. **DPA Groq + DPA OpenAI** signés.
14. **Privacy policy** mise à jour (sous-traitants, transfert hors EU).
15. **Tests E2E** : flow transcription cloud + post-process + débit usage + popup paywall sur 402.
16. **ADR 0012**.

---

## 12. Notes post-launch (hors-périmètre v3.2)

À acter en sessions de brainstorming dédiées **après** le lancement v3.2, en fonction des signaux observés :

### 12.1 Fallback OpenAI Whisper pour la transcription

Décision actée pendant la session : on lance avec Groq seul. L'ajout d'un fallback OpenAI Whisper (en cas de panne Groq prolongée ou d'écart qualité observé) est noté comme **à acter post-launch** si :
- Incident Groq significatif (>30 min downtime sur un mois) observé en prod.
- OU plaintes qualité corrélées à des langues / contextes spécifiques.

Implémentation envisagée : feature flag côté Worker + circuit breaker. Pas de code à écrire en v3.2.

### 12.2 Phase 2 — self-host Whisper sur GPU

À envisager si :
- Volume mensuel >100h transcription cloud (à mesurer après 6 mois v3.2).
- ET marge brute Groq devient un frein à la croissance.
- ET la complexité ops d'un cluster GPU est financièrement/humainement absorbable.

Pistes évoquées pendant le brainstorming : Modal, Replicate, RunPod, Lambda Labs (cloud GPU à la demande) ou Fly.io + GPU dédié. Aucune décision prise. Une session de brainstorming dédiée sera lancée le moment venu.

### 12.3 Provider post-process IA alternatif

Anthropic Claude Haiku reste un candidat non testé. À envisager si GPT-4o-mini montre des limites sur certaines tâches identifiées (rédaction très formelle, langues mineures, contextes métier spécifiques).

---

## 13. Risques et mitigations

| Risque | Mitigation |
|---|---|
| **Panne Groq prolongée** sans fallback | Communication user transparente + bouton manuel "essayer en local". Note 12.1 réévalue post-launch. |
| **Coût OpenAI explose** sur post-process abusé | Compteur tokens en place dès v3.2 → re-tarification possible si pattern d'abus observé. |
| **Latence dégradée** depuis l'EU vers Groq US | Cloudflare Workers minimise le trajet user→edge. Trajet edge→Groq fixe. À monitorer ; si insuffisant, envisager déploiement Worker EU exclusif (mais cela perd l'avantage POP global). |
| **Cap fair use atteint par un user légitime** | Alerte admin + contact user proposant upgrade ou conversation. Pas de blocage automatique en v3.2. |
| **Faille de sécurité côté Worker** (leak JWT public key, mauvaise vérif) | Code review serré ; pentest léger envisageable post-traction. |
| **Demande RGPD de production de l'audio** | Réponse standard : zero-retention, aucune donnée à produire au-delà des métadonnées (`usage_events`). |
| **Tarif Groq qui augmente** | Marge actuelle absorbe x2 sans menace. Au-delà, déclenche réflexion phase 2 self-host. |

---

## 14. Hors-périmètre v3.2 (à acter explicitement)

- Self-host Whisper sur GPU (cf. 12.2).
- Fallback OpenAI Whisper transcription (cf. 12.1).
- Provider post-process IA alternatif (cf. 12.3).
- Streaming partiel (Deepgram-only ; Groq batch suffit pour le périmètre dictée).
- Rétention audio temporaire (zero-retention strict acté).
- API publique (le Worker est privé, accessible uniquement depuis le client Lexena via JWT user).
- Plan illimité ou tarification à l'usage pure (cf. spec premium).
- Multi-tenant / team plans (cf. spec premium hors-périmètre 13).

---

**Fin du design.**
