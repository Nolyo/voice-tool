# V3 Premium Offer — Design

**Date** : 2026-04-27
**Branche cible** : `feat/ui_params` (chantier v3)
**Statut** : design approuvé, prêt à être planifié
**Sous-épique principal** : `04-billing` (cible v3.2)
**Sous-épiques touchés** : `01-auth` (rétroactif), `05-managed-transcription`, `06-onboarding`, `06a-onboarding-tour`
**ADR à créer** : 0009 (premium offer), 0010 (trial mechanics), 0011 (email canonical)

---

## 1. Contexte et problème

Voice Tool est aujourd'hui une app desktop 100% locale qui supporte deux providers de transcription externes en BYOK : OpenAI Whisper API et Groq. Le post-process IA (reformulation, correction, mail…) tape l'API OpenAI directement avec la clé de l'utilisateur. Cette posture présente trois limites :

1. **Friction d'onboarding** : un utilisateur non-technique doit comprendre ce qu'est une "API key", aller sur un site externe (OpenAI, Groq), créer un compte payant, copier-coller un secret. Barrière forte qui exclut une partie significative du public cible.
2. **Pas de monétisation directe** : aucune voie de revenus pour Voice Tool aujourd'hui. Toute la valeur captée par OpenAI/Groq.
3. **Hétérogénéité du parcours** : selon le provider choisi, l'expérience diffère. Pas de garantie de qualité homogène.

Le sous-épique `04-billing` était cadré comme stub avec une question critique ouverte : *"Quelle est l'offre premium exacte ?"*. Cette session de brainstorming (2026-04-27) figeait cette décision pour permettre l'ouverture du plan d'implémentation v3.2.

## 2. Décisions de design

| # | Sujet | Décision |
|---|---|---|
| Q1 | Positionnement | Deux modes mutuellement exclusifs : **local gratuit illimité** OU **cloud Voice Tool payant**. Retrait BYOK (OpenAI/Groq) au lancement v3.2. |
| Q2 | Frontière free / paid | Local = transcription brute (whisper-rs). Cloud payant = transcription managée + post-process IA. Sync settings reste gratuite pour tous. |
| Q3 | Modèle tarifaire | Abonnement mensuel à quota inclus + dépassement payant. Plan unique dupliqué en deux tiers (Starter / Pro). Pas de plan illimité (risque de marge). |
| Q4 | Grille tarifaire | **Starter** : 5€/mois (49€/an) — 400 min — 0,03€/min dépassement. **Pro** : 9€/mois (89€/an) — 1000 min — 0,02€/min. Annuel à -18%. |
| Q5 | Essai gratuit | 60 min de crédit cloud + 30 jours calendaires. Premier des deux qui s'épuise termine l'essai. Sans CB demandée. |
| Q6 | Déclenchement essai | À la **vérification email** (compte actif). Si email jamais vérifié → pas de crédit, pas d'horloge. |
| Q7 | Comportement à expiration | Hard expiry au jour J (pas de grâce — Lemon Squeezy gère déjà les retry CB). Popup à la prochaine action cloud avec liens "Renouveler" / "Télécharger modèle local". |
| Q8 | First-run | Écran de bienvenue avec 2 CTA : (A) **Créer un compte gratuit** [Recommandé] avec 60 min essai cloud, ou (B) **Continuer en local uniquement**. Le mode local n'est plus le défaut implicite. |
| Q9 | Réconciliation signup ↔ checkout | Path A : signup-then-checkout. Tout le checkout passe par l'app installée + compte existant. Pas de checkout depuis le site marketing. |
| Q10 | Anti-abus | Defense in depth : (1) normalisation email canonique, (2) Captcha Turnstile, (3) email verification obligatoire avant crédit, (4) rate limit IP signup, (5) blocklist domaines jetables, (6) signal device fingerprint partagé en observation passive. |
| Q11 | Transition BYOK | Hard cutoff au lancement v3.2. Pas de geste commercial transitoire (pas de parc utilisateur significatif aujourd'hui ; aucune com publique avant v3.2). |

---

## 3. Cadre stratégique

### 3.1 Positionnement

| Mode | Tarif | Périmètre | Cible |
|---|---|---|---|
| **Local** | Gratuit illimité, open source | Transcription brute (whisper-rs offline) | Users techniques, soucieux de confidentialité, sans connexion stable, ou refus de payer |
| **Cloud Voice Tool** | Abonnement (2 tiers) | Transcription managée + post-process IA | Users non-techniques, qui veulent zéro friction (pas de modèle à choisir, pas de clé API à gérer) |

### 3.2 Différenciateurs marketing (du plus fort au plus faible)

1. **Mode local 100% gratuit, open source, sans tracking, illimité** — argument unique vs Otter / Sonix / Krisp (tous 100% cloud propriétaire).
2. **Ratio min/€ supérieur à la concurrence** : Pro à 0,009€/min vs Otter Pro à $0,014/min (~35% moins cher au ratio, ~50% moins cher en absolu).
3. **Funnel naturel "découvre en local → upgrade au cloud quand tu veux la convenience"** — modèle Cal.com / Plausible / Posthog.

### 3.3 Promesse de confiance préservée

L'objectif EPIC v3 *"l'usage 100% gratuit/local toujours possible"* reste tenu :
- Le mode local reste pleinement fonctionnel.
- À l'expiration de tout abonnement, bascule local possible (popup explicite avec lien download).
- Le code Rust + frontend reste open source.

---

## 4. Grille tarifaire

| Plan | Mensuel | Annuel | Quota inclus | Dépassement | Ratio €/min |
|---|---|---|---|---|---|
| **Starter** | 5€/mois | 49€/an (-18%) | 400 min/mois | 0,03€/min | 0,0125€/min |
| **Pro** | 9€/mois | 89€/an (-18%) | 1000 min/mois | 0,02€/min | 0,009€/min |

### 4.1 Comparaison concurrence

| Outil | Prix | Quota | €/min |
|---|---|---|---|
| Otter Pro | $17/mois | 1200 min | $0,014 |
| Otter Business | $30/mois | 6000 min | $0,005 |
| Voice Tool **Starter** | 5€/mois | 400 min | **0,0125€** |
| Voice Tool **Pro** | 9€/mois | 1000 min | **0,009€** |

### 4.2 Modélisation marge nette (par user payant à 100% du quota)

| Plan | Revenu | Coût direct provider* | Frais Lemon Squeezy (~5%) | Marge nette |
|---|---|---|---|---|
| Starter | 5€ | 0,40€ | 0,25€ | **~4,35€** |
| Pro | 9€ | 1,00€ | 0,45€ | **~7,55€** |

*Hypothèse Groq Whisper turbo à $0,001/min. À ré-évaluer une fois le provider final figé en sous-épique 05.

### 4.3 Choix tarifaires

- **Pas de plan Free permanent sur le cloud** — le Free permanent, c'est le mode local. Frontière nette.
- **Pas de plan Team / Enterprise** en v3.2. À ajouter plus tard si demande remonte.
- **Starter dépassement (0,03€) > Pro dépassement (0,02€)** : crée une vraie incitation à upgrader.
- **Annuel à -18% (modéré, pas agressif)** : le ratio min/€ joue déjà le rôle de différenciateur tarifaire. L'annuel agressif (-40%) restera une carte à jouer plus tard.
- **Upgrade Starter → Pro** : effet immédiat, prorata Lemon Squeezy.
- **Downgrade Pro → Starter** : effet à fin de période payée actuelle.

### 4.4 Notes

- Les prix sont **TTC** (Lemon Squeezy en tant que MoR gère la TVA selon le pays du user).
- Les minutes consommées sont comptées sur les **appels API réussis uniquement** (pas de débit en cas d'échec / timeout côté provider), au sample rate de l'audio entrant côté serveur, **arrondies à la seconde près** (pas à la minute). Évite les "perte 30s sur un fichier de 31s arrondi".
- Cycle de facturation : **mois calendaire roulant** depuis la date de souscription (standard Lemon Squeezy).

---

## 5. Mécanique de l'essai gratuit

### 5.1 Format

- **60 minutes** de crédit cloud + **30 jours calendaires** d'accès.
- L'essai prend fin au **premier des deux** qui survient (60 min consommées **OU** 30 jours écoulés depuis la vérification email).
- **Sans CB demandée**.

### 5.2 Flow

1. User crée un compte → email de vérification envoyé.
2. **Email vérifié** → 60 min créditées + horloge 30 jours démarre. Compte actif.
3. App bascule automatiquement sur le mode cloud (l'user peut toujours revenir en local manuellement).
4. Affichage permanent du **solde restant** et **jours restants** dans l'app (header / settings).
5. À l'épuisement → popup non-bloquante (cf. section 7).

### 5.3 Rationale

| Décision | Raison |
|---|---|
| **60 min** (pas 15, pas 300) | ~4-7 sessions de dictée + post-process réelles. Suffisant pour ressentir la valeur, insuffisant pour s'installer durablement gratos. Coût direct ~$0,06/signup. |
| **+ 30 jours cap** | Évite les essais dormants qui traînent 6 mois et reviennent générer une charge surprise. Force aussi la conversion *quand l'utilisateur est encore dans la fenêtre d'apprentissage*. |
| **Crédit en minutes**, pas en jours seuls | Aligne le coût réel sur ce qui est offert. Pas de heavy user qui crame 100h en 1 journée. |
| **Sans CB** | Cohérent avec l'objectif "onboarding sans friction pour non-techniques". Friction CB = anti-thèse. |
| **Crédit à la vérif email**, pas au signup | Décourage les comptes fakes. Email verif est le rempart anti-script. |
| **Horloge dès vérif email** | Décourage le stockage de comptes "au cas où" (un compte créé non utilisé se périme tout seul). |

### 5.4 UX du compteur

- L'app affiche la **valeur la plus contraignante** dans le compteur principal (ex. *"42 min restantes"* si c'est elle qui s'épuisera en premier ; *"12 jours restants"* sinon).
- En settings, les **deux valeurs sont visibles** simultanément.
- À J+25 ou à 50 min consommées, **rappel doux** (toast non-bloquant *"Ton essai approche de sa fin"*). Un seul rappel, pas de spam.
- À J+30 ou 60 min consommées, **paywall présenté à la prochaine action cloud**. Action non-cloud (settings, historique local) reste accessible normalement.

### 5.5 Cas particuliers

| Cas | Comportement |
|---|---|
| User consomme 60 min en 3 jours | Essai terminé à J+3 (cap minutes atteint). |
| User consomme 10 min en 30 jours | Essai terminé à J+30 (cap durée atteint). 50 min restantes perdues. |
| User crée son compte mais ne vérifie jamais son email | Pas de crédit, pas d'horloge. Compte reste en état "pending" Supabase. Politique de purge des comptes non-vérifiés à figer dans le plan d'impl (recommandation : suppression auto après 30 jours sans vérif). |
| User dépense son essai, revient 6 mois plus tard | Pas de re-crédit automatique. Bascule local possible. Re-crédit ponctuel possible via support si cas légitime. |
| User crée plusieurs comptes (anti-abus) | Cf. section 8. |

---

## 6. First-run experience

### 6.1 Écran de bienvenue (nouveau composant `WelcomeScreen`)

Au premier lancement de l'app, **avant** le `OnboardingSetup` existant :

```
┌─────────────────────────────────────────────────┐
│  Bienvenue sur Voice Tool                       │
│                                                 │
│  Comment veux-tu commencer ?                    │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Créer un compte gratuit  [Recommandé]   │   │
│  │                                         │   │
│  │ ✓ 60 min d'essai du service cloud       │   │
│  │ ✓ Post-process IA inclus (reformulation,│   │
│  │   correction, rédaction de mails…)      │   │
│  │ ✓ Rapide sur tout PC, même modeste      │   │
│  │ ✓ Sans carte bancaire                   │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Continuer en local uniquement           │   │
│  │                                         │   │
│  │ ○ Gratuit, illimité, 100% offline,      │   │
│  │   open source                           │   │
│  │ ○ Transcription brute uniquement        │   │
│  │   (pas de post-process IA)              │   │
│  │ ○ Performances dépendantes de ton       │   │
│  │   matériel (plus lent sur PC modeste)   │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Notes copywriting** :
- Symétrie ✓ vs ○ : ✓ = "ce que tu obtiens en plus", ○ = "limites à connaître". Pas de croix rouge culpabilisante.
- Pas de FUD : *"dépendantes de ton matériel"*, pas *"risqué"* ou *"limité"*.
- *"open source"* dans le bouton B préserve l'argument de confiance.
- La copie exacte (mots, ordre des bullets, intonation) sera **finalisée à l'écriture du composant React + i18n** (FR/EN). Ce qu'on fixe ici, c'est la **structure et l'intention**.

### 6.2 Branche A : Création de compte

- Signup intégré (UI auth existante du sous-épique 01) → email vérification → 60 min créditées + horloge 30 jours.
- Mode cloud activé par défaut. **Pas de download modèle local immédiat**.
- L'`OnboardingTour` (sous-épique 06a) peut directement faire la démo transcription + post-process avec son crédit fresh — sans complexité "crédit invité spécial" prévue à l'origine.

### 6.3 Branche B : Continuer en local uniquement

- Setup wizard classique (`OnboardingSetup` existant) → download modèle local.
- App fonctionne en local pur (transcription brute, pas de post-process).
- À tout moment, un CTA persistant *"Crée ton compte pour 60 min d'essai cloud"* reste accessible :
  - Bouton dans le header (à côté des settings).
  - Bandeau dismissible *"Essaie le cloud Voice Tool — 60 min offertes"* après ~3 sessions de transcription locale (signal d'usage actif). Dismiss = ne réapparaît pas.
  - Pas de re-prompt automatique au-delà.

### 6.4 Réconciliation signup ↔ checkout

```
[Compte créé + essai consommé OU clic "S'abonner" à tout moment]
       ↓
[Bouton ouvre navigateur via tauri::shell] → checkout Lemon Squeezy avec user_id en metadata
       ↓
[Lemon Squeezy redirige vers page succès] → deep link voice-tool:// → app revient au premier plan
       ↓
[Webhook subscription_created arrive en parallèle] → assigne subscription au user_id côté Postgres
       ↓
[App refresh état subscription] → bandeau "Bienvenue sur Starter/Pro"
```

**Interdits** :
- ❌ Bouton "Acheter" sur le site marketing (= source de complexité, pas de besoin réel).
- ❌ Checkout sans `user_id` en metadata.
- ❌ Création de compte différée *après* paiement.

**Site marketing** (sous-épique 06) :
- Page pricing affiche les plans à titre informatif.
- CTA principal = *"Télécharger Voice Tool"* (jamais *"Acheter"*).
- Sous-texte explicatif : *"Crée ton compte gratuit dans l'app, profite de 60 minutes d'essai, puis souscris depuis l'app si tu veux continuer."*

---

## 7. Comportement à l'expiration de l'abonnement

### 7.1 Principe

**Hard expiry au jour J. Pas de période de grâce côté Voice Tool** (Lemon Squeezy gère déjà les retry CB pendant ~14 jours en interne avant de marquer `subscription_expired` ; coder une grâce supplémentaire serait redondant).

### 7.2 Popup à la prochaine action cloud après expiration

```
┌─────────────────────────────────────────────────┐
│  Ton abonnement Voice Tool a expiré             │
│                                                 │
│  • [Renouveler ton abonnement]                  │
│    → ouvre portail Lemon Squeezy                │
│                                                 │
│  • [Télécharger le modèle local]                │
│    → déclenche le download direct du modèle     │
│      pour continuer en gratuit                  │
└─────────────────────────────────────────────────┘
```

Pas de bandeau préventif, pas de prompt à l'annulation, pas de logique "14 jours d'usage payant" à tracker. Si le sujet revient en remontée user post-lancement, on ajoutera.

### 7.3 Effet sur les fonctionnalités

| Fonction | État après expiration |
|---|---|
| Transcription cloud | ❌ Désactivée (bascule auto sur whisper-rs local si modèle installé) |
| Post-process IA | ❌ Désactivé (pas de fallback — feature exclusive payante) |
| Sync settings | ✅ Continue (gratuite pour tous) |
| Transcriptions / notes locales existantes | ✅ Toutes accessibles (déjà sur la machine) |
| Mode local (whisper-rs) si modèle installé | ✅ Bascule auto |

### 7.4 Cas particuliers

| Cas | Comportement |
|---|---|
| **Annulation volontaire** | Accès maintenu jusqu'à fin de période payée. Pas de remboursement prorata sauf demande. |
| **Échec CB renouvellement** | Lemon Squeezy gère les retry. À `subscription_expired` → popup expiration. |
| **Refund (à la demande de l'user)** | Hard expiry immédiat. |
| **Chargeback** (contestation bancaire) | Hard expiry immédiat + flag compte (signal de fraude potentielle, investigation manuelle). |
| **Upgrade Starter → Pro** | Effet immédiat, prorata Lemon Squeezy. |
| **Downgrade Pro → Starter** | Effet à fin de période payée actuelle (pas immédiat — sinon perte sèche pour le user). |
| **Réabonnement après expiration** | Crédit fresh sur le nouveau plan (pas de cumul de reliquats). |

### 7.5 Notes techniques

- **Source de vérité** : table `subscriptions` Postgres (déjà schématisée dans le POC `docs/research/lemonsqueezy-poc/`). Mise à jour via webhook `subscription_*`.
- **Cache local** : l'app cache l'état subscription (`active` / `expired` / `paused`) pour fonctionner offline. Refresh au login + démarrage app + consommation API cloud.
- **Latence webhook** : si webhook Lemon Squeezy retardé, l'user peut continuer brièvement à utiliser le cloud après expiration officielle. Acceptable (≤ quelques minutes en pratique). Le compteur côté serveur reste la source de vérité finale.

---

## 8. Anti-abus

**Stratégie : defense in depth.** Aucune mesure n'est parfaite seule, l'empilement décourage 95% des opportunistes.

### 8.1 Couches actives au signup

| # | Couche | Effet | Coût implémentation |
|---|---|---|---|
| 1 | **Normalisation email canonique** | Strip `+suffix`, strip `.` (Gmail/Googlemail), lowercase, alias domain → unique constraint sur `email_canonical`. Bloque `user+a@gmail.com` / `user+b@gmail.com` / `u.s.e.r@gmail.com` qui pointent vers la même boîte. | Faible (fonction Postgres + colonne générée) |
| 2 | **Captcha au signup** | Cloudflare Turnstile (gratuit, GDPR-friendly, pas de tracking comme reCAPTCHA). Bloque les scripts. | Faible (intégration JS standard) |
| 3 | **Email verification obligatoire** | Crédit 60 min + démarrage horloge 30 jours **uniquement après** clic sur le lien de vérification. Compte non vérifié = pas d'usage cloud. | Aucun (déjà standard Supabase Auth) |
| 4 | **Rate limit IP au signup** | Max N signups / 24h par IP. Géré côté Edge Function (table `rate_limit_log` déjà livrée en 01-auth). | Faible (réutilise infra existante) |
| 5 | **Blocklist domaines jetables** | Liste embarquée (mailinator, tempmail, guerrillamail, etc.). Refus signup avec message clair. | Faible (liste statique + check au signup) |

### 8.2 Signal passif d'observation (pas de blocage)

| Signal | Mécanique | Action |
|---|---|---|
| **Device fingerprint partagé** | Table `user_devices` (déjà livrée en 01-auth) associe `device_id` ↔ `user_id`. Requête analytique : `SELECT device_id, COUNT(DISTINCT user_id) FROM user_devices WHERE created_at > NOW() - 30d GROUP BY device_id HAVING COUNT(DISTINCT user_id) >= 3`. | Investigation manuelle / dashboard admin. Pas de blocage automatique (1-2 = légit familial / PC partagé, 3+ = pattern abusif probable). Soft-block possible en v3.3+ si patterns récurrents. |

### 8.3 Hors-périmètre v3.2 (à reporter si besoin remonté)

- Phone verification (friction = anti-thèse de l'objectif).
- Détection avancée VPN / proxy résidentiels.
- Bloquage automatique sur device_id partagé (trop agressif sans observation préalable des faux positifs).

---

## 9. Transition BYOK

**Hard cutoff au lancement v3.2.** Pas de stratégie de transition à coder.

**Rationale** :
- Pas d'utilisateurs significatifs en BYOK aujourd'hui (aucune communication publique avant v3.2).
- Aucune com publique prévue avant que l'offre payante soit prête → pas de promotion du BYOK à promettre.
- Code plus simple : pas de double mode à maintenir entre v3.2 et une v3.X future.

**Effet concret** :
- v3.2 supprime de l'UI les options OpenAI / Groq.
- Migration silencieuse pour les très rares users qui auraient configuré une clé : message in-app *"BYOK retiré. Crée un compte pour le service cloud Voice Tool, ou continue en local."*.

---

## 10. Implications pour les autres sous-épiques

### 10.1 Sous-épique `01-auth` (figé en 2026-04-22) — ajustements rétroactifs

| Sujet | Action requise | Lieu |
|---|---|---|
| Normalisation email canonique | Migration Postgres : colonne générée `email_canonical` + unique constraint. Edge Function ajustée pour valider unicité au signup. | Mini-ADR rétroactif (`docs/v3/decisions/0011-email-canonical.md`) ou ajout dans le plan v3.2. |
| First-run écran de choix | Le flux actuel envoie probablement directement vers `OnboardingSetup`. Insérer en amont un nouveau composant `WelcomeScreen`. | Nouveau composant React + ajustement `Dashboard`. |
| Captcha Turnstile au signup | À ajouter au flux signup existant. | Frontend + Edge Function. |
| Blocklist domaines jetables | Liste embarquée + check au signup. | Frontend + Edge Function. |
| Rate limit IP signup | Réutilise table `rate_limit_log`. Ajouter règle `signup_per_ip_24h`. | Edge Function existante à étendre. |
| Signal device fingerprint partagé | Pas de nouveau code (table `user_devices` existe). Documenter la requête analytique. | Doc ops dans `docs/v3/runbooks/`. |

### 10.2 Sous-épique `04-billing` — c'est ce sous-épique

Le présent spec devient le contenu canonique du sous-épique 04. Le stub initial est remplacé.

### 10.3 Sous-épique `05-managed-transcription` — basculé de v3.3 à v3.2

Le sous-épique 05 était cadré comme *"plus tard, après les premiers payants pour modéliser les coûts"*. L'offre actée ici **dépend de l'existence du service managé** (sans cloud, pas de plans Starter/Pro). **05 doit être livré simultanément à 04 en v3.2.**

Conséquences concrètes :
- Choix de stack proxy à figer **avant** l'écriture du plan v3.2 (Cloudflare Workers vs Fly.io vs Edge Function Supabase). Mini-session de brainstorming dédiée 05 à enchaîner après le présent spec.
- Choix du provider transcription (Groq Whisper turbo vs OpenAI direct vs Deepgram).
- Choix du provider post-process IA (OpenAI / Anthropic / autre).
- Comptage des minutes consommées : table `usage_minutes` (à figer dans le spec 05).

### 10.4 Sous-épique `06-onboarding` & `06a-onboarding-tour`

- `WelcomeScreen` (section 6.1) **fait partie** de l'onboarding et est livré en v3.2.
- `06a-onboarding-tour` est **débloqué par cette session** : la branche A garantit qu'au moment du tour, l'utilisateur a un crédit cloud frais → l'étape post-process IA marche du premier coup, sans besoin de "crédit invité spécial". Le tour peut être livré en v3.2 ou v3.3 sans dépendance technique supplémentaire.
- Site marketing : CTA = *"Télécharger Voice Tool"* (jamais *"Acheter"*). Page pricing informative. À figer dans 06.

### 10.5 ADR à créer

| ADR | Sujet | Contenu |
|---|---|---|
| `0009-premium-offer.md` | Offre premium (sections 3-4) | Positionnement, retrait BYOK, grille tarifaire 2 tiers, ratios concurrence, modélisation marges. |
| `0010-trial-mechanics.md` | Essai gratuit (section 5) | 60 min + 30 jours, pas de CB, paywall non-bloquant, anti-abus. |
| `0011-email-canonical.md` | Normalisation email canonique (section 8 + impact 01-auth) | Stratégie strip + unique constraint + migration. ADR rétroactif sur 01-auth. |
| `0012-managed-stack.md` | À créer dans la session de brainstorming 05 | Choix stack proxy, provider transcription, provider post-process. |

### 10.6 EPIC.md — révision phasage

Phasage actuel :
- v3.0 : auth + sync settings ✅
- v3.1 : sync notes + onboarding v1
- v3.2 : billing
- v3.3 : service managé

**Phasage proposé** :
- v3.0 : auth + sync settings ✅
- v3.1 : sync notes + onboarding v1
- **v3.2 : 04-billing + 05-managed-transcription + 06a-onboarding-tour (bundle "monétisation complète")**
- v3.3+ : team plans, optimisations, features avancées

Rationale : 04 et 05 sont indissociables fonctionnellement (l'offre payante n'a aucun sens sans le service managé). Les décaler en deux releases n'apporte pas de valeur, ajoute de la complexité (deux phases de communication, deux migrations).

---

## 11. Livrables du plan d'implémentation v3.2 (vue d'ensemble)

À détailler dans le plan d'implémentation. Liste indicative :

1. **Migration `email_canonical`** + ajustement signup Edge Function.
2. **Composant `WelcomeScreen`** (first-run écran de choix branche A / branche B).
3. **Captcha Turnstile** au signup.
4. **Blocklist domaines jetables** + rate limit IP.
5. **Schéma `subscriptions`** Postgres (reprise POC) + audit final.
6. **Webhook Lemon Squeezy** avec HMAC SHA-256 (reprise POC) + idempotence.
7. **Commande Tauri `open_checkout`** étendue (`user_id` + `plan_id` en metadata).
8. **Composant `SubscribeButton`** étendu (2 plans + toggle mensuel/annuel).
9. **Table `usage_minutes`** + Edge Function `transcribe` qui débite à chaque appel (livré conjointement avec sous-épique 05).
10. **Logique essai gratuit** : déclenchement à vérif email, double cap 60 min / 30 jours, paywall non-bloquant.
11. **Compteur essai / quota** dans le header app + settings.
12. **Popup expiration** avec liens "Renouveler" / "Télécharger modèle local".
13. **Cache local état subscription** + refresh logique.
14. **Suppression UI BYOK** (OpenAI / Groq) : settings, hooks, logique fallback.
15. **Tests E2E** : flow complet signup → essai → checkout → quota → expiration.
16. **3 ADR** : 0009, 0010, 0011 (+ 0012 dans la session 05).
17. **Documentation utilisateur** : page pricing, FAQ abonnement, RGPD.

---

## 12. Risques et incertitudes

| Risque | Mitigation |
|---|---|
| **Marge négative** si user heavy à 100% du dépassement Pro | Plafond soft à 5h/mois (signal alerte admin pour investigation, pas bloquage user). |
| **Dépendance au choix de provider transcription** (Groq, OpenAI, Deepgram) | Bloquant pour la modélisation marge précise. À figer dans la session de brainstorming 05 immédiatement après. |
| **Conversion essai → payant inconnue** (pas de baseline historique) | Acceptable car coût acquisition direct est négligeable. À mesurer post-lancement (dashboard funnel). |
| **Friction CB lors du checkout** Lemon Squeezy | Lemon Squeezy gère un checkout standard. Pas de mitigation supplémentaire à prévoir. |
| **Latence webhook après checkout** | Cache local + refresh à plusieurs moments (login, démarrage, action cloud). UX dégradée brièvement (≤ minutes), pas bloquant. |
| **Cas border anti-abus non couvert** (VPN payant + emails uniques + devices virtuels) | Acceptable en v3.2. Signal d'observation device_id permet d'ajuster post-lancement si remontée. |

---

## 13. Hors-périmètre v3.2 (à acter explicitement)

- Plans Team / Enterprise.
- Plan illimité (fair use).
- Annuel agressif (-40% ou plus).
- Trial avec CB demandée (style Stripe / Notion AI).
- Phone verification au signup.
- Détection avancée VPN / proxy.
- Bloquage automatique sur device_id partagé.
- Bouton "Acheter" sur site marketing.
- Réconciliation post-paiement (Path B / Path C).
- Pré-équipement systématique du modèle local pour les users payants (download silencieux en arrière-plan).
- Bandeau préventif "abonnement expire dans X jours" (Lemon Squeezy gère via email).
- Re-crédit automatique de l'essai après une période sans usage.
- Remboursement prorata automatique à l'annulation.

---

**Fin du design.**
