# ADR 0006 — Threat model v3.0

- **Statut**: Accepté
- **Date**: 2026-04-22
- **Contexte de la décision**: session de brainstorming v3 dédiée au sous-épique `00-threat-model`

## Contexte

La v3 introduit des comptes utilisateurs, une synchronisation cloud (settings + notes) et un volet payant. Toutes les décisions techniques en aval (RLS, chiffrement, auth, gating) sont des réponses à un modèle de menace. Sans threat model écrit, ces décisions sont prises sans référentiel commun, ce qui mène à sur-protéger ou sous-protéger.

Cet ADR fige les choix structurants qui découlent du threat model détaillé dans [`../00-threat-model.md`](../00-threat-model.md).

## Décisions figées

### 1. Acteurs défendus (IN-SCOPE)

- Attaquant externe non-authentifié
- Attaquant externe authentifié (risque cross-tenant)
- Compte tiers compromis (Supabase, Lemon Squeezy, GitHub, DNS, Google Cloud)

### 2. Acteurs hors-scope (OUT-OF-SCOPE, documentés)

- **Insider dev solo** — accepté pour v3.0 (dev éthique solo). À rouvrir dès qu'un tiers (employé, prestataire) accède à la prod.
- Insider Supabase — cohérent avec la posture server-side (ADR 0002)
- État / subpoena — on n'est pas Signal, coopération légale
- Device utilisateur compromis — game over standard toute app desktop

### 3. Posture chiffrement

Rappel: server-side uniquement (cf. ADR 0002). Les clés API utilisateur ne sont jamais transmises (cf. ADR 0003), ce qui reste l'argument de confiance principal et vérifiable.

### 4. 2FA

- **TOTP optionnel dès v3.0** — supporté nativement par Supabase Auth
- **Email de notification à chaque nouveau device connecté** — signal de sécurité sans friction
- 2FA obligatoire reporté en v3.x (probablement d'abord pour comptes payants)

### 5. Conformité GDPR

Les 8 items must-have GDPR (registre, privacy policy, mentions légales, DPA, droit à l'oubli effectif, data export, process fuite <72h, base légale documentée) sont **bloquants** pour la sortie publique v3.0.

### 6. Audit sécurité externe

**Budgeté comme bloquant avant la sortie publique v3.0.** Doit couvrir: RLS, Edge Functions, flow auth, updater, deep link. Chiffrage à affiner quand la release approchera.

### 7. Compromis acceptés publiquement

La communication produit **ne** promettra **pas**:

- Zéro accès au contenu des notes (serait faux: posture server-side)
- Chiffrement bout-en-bout

Elle **promettra** en revanche:

- "Les clés API ne quittent jamais votre device" (vrai par construction)
- "Données chiffrées en transit (TLS) et au repos (Postgres)"
- "Mode local 100% gratuit et fonctionnel, sans compte requis"
- "2FA TOTP disponible"

## Justification

- **Dev solo** oblige à prioriser ce qui a le meilleur rapport coût/sécurité. Le threat model formel évite le sur-investissement dans des défenses contre des acteurs qu'on a explicitement choisi de ne pas couvrir (E2E, audit log, insider Supabase).
- **Les ADRs 0002 (server-side) et 0003 (clés API device-local) dictent déjà la posture**: ce threat model les compile et les justifie par menace identifiée, au lieu d'imposer des mesures sans rationale.
- **2FA optionnel** offre le meilleur rapport effort/bénéfice: quelques jours de dev, feature native Supabase, aucune friction par défaut, argument de confiance crédible. Obligatoire serait du overkill pour un outil de transcription vocale.

## Conséquences

### Positives

- Référentiel unique pour toutes les décisions sécu des sous-épiques 01→06
- Communication produit alignée (on ne promet que ce qu'on tient)
- Compromis documentés = pas de surprise dans 6 mois
- Budget audit externe anticipé = pas de surprise à la release

### Négatives / risques acceptés

- **Fuite DB Supabase = lecture notes en clair** (documenté en privacy policy)
- **Insider dev solo accepté v3.0** — nécessite vigilance personnelle, à revisiter si embauche
- **Pas d'audit log utilisateur v3.0** — un user ne peut pas vérifier qui a accédé à ses données

### Mitigations en place

- RLS strict + tests automatisés cross-tenant (mesure #1 du threat model)
- Logs serveur zéro PII (mesure #5)
- Rotation secrets documentée (mesure #6)
- 2FA obligatoire sur tous les comptes ops (mesure #13)
- Plan de réponse à incident écrit (mesure #12)

## Décisions reportées

- **Chiffrage précis audit externe** — quand la release approche
- **Passage à E2E partiel ou total** — si signal utilisateur fort (implique migration lourde, cf. ADR 0002)
- **Audit log utilisateur** — v3.x si demande émerge
- **2FA obligatoire** — v3.x, probablement comptes payants d'abord
- **Bug bounty public** — v3.x, budget dédié à prévoir
- **Réouverture acteur D (insider)** — déclenchée automatiquement par: embauche, signature prestataire, ajout co-fondateur, ou tout accès tiers à la prod

## Processus de révision

Cet ADR est **figé**. Toute révision passe par un **nouvel ADR** qui supersede celui-ci. Le document `00-threat-model.md` est en revanche un living document, révisé à chaque clôture de sous-épique et à chaque release majeure.
