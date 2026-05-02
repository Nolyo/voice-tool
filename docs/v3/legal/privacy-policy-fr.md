# Politique de confidentialité — Lexena

> **Version** : v3.0 — draft du 2026-05-01.
> **À publier** : après remplacement des `<placeholders>` (identité éditeur, domaine final, contact DPO).
> **À relire** : par un juriste avant publication publique. Ce draft s'appuie sur le registre des traitements interne (`docs/v3/compliance/registre-traitements.md`) et la base légale (`docs/v3/compliance/base-legale.md`).

---

## 1. Préambule

Lexena est une application de transcription vocale assistée par IA, distribuée sous forme d'application desktop pour Windows, macOS et Linux. Elle est éditée par **`<NOM ÉDITEUR>`**, basé en France.

La présente politique de confidentialité décrit les données que Lexena collecte, pourquoi, sur quelle base légale, à qui elles sont confiées, et comment vous pouvez exercer vos droits sur ces données.

Cette politique s'applique uniquement aux fonctionnalités **avec compte** introduites en version 3.0. **Le mode 100 % local sans compte ne fait l'objet d'aucune collecte côté serveur** : toutes vos données restent sur votre appareil.

---

## 2. Notre posture en une phrase

> Vous restez maître de vos données vocales et de vos clés d'API. Nous synchronisons uniquement ce que vous choisissez de synchroniser, sur des serveurs européens, et vous pouvez tout exporter ou tout supprimer à tout moment.

### Ce que nous ne voyons jamais

- **Vos clés d'API** (OpenAI, Groq, etc.) — elles restent stockées sur votre appareil, dans le coffre-fort sécurisé de votre système d'exploitation. Elles ne quittent jamais votre machine.
- **Vos enregistrements audio** — ils restent sur votre appareil. Aucun audio n'est uploadé sur nos serveurs en v3.0.
- **L'historique de vos transcriptions** — il reste sur votre appareil. Aucune transcription n'est synchronisée en v3.0.
- **Vos notes texte** — elles restent sur votre appareil en v3.0. La synchronisation des notes est planifiée pour la version 3.1, et nécessitera votre consentement explicite.

### Ce que nous voyons (uniquement si vous créez un compte)

- Votre adresse email.
- Vos paramètres d'application : thème, langue, raccourcis clavier, options d'insertion, choix du moteur de transcription.
- Votre dictionnaire personnel et vos snippets de remplacement.
- La liste de vos appareils connectés (nom, OS, version d'app, dernière activité).

---

## 3. Données collectées et finalités

Le tableau suivant détaille **chaque catégorie de données collectées**, la finalité, la base légale (au sens de l'article 6 du RGPD) et la durée de conservation.

| Donnée collectée | Finalité | Base légale | Durée de conservation |
|---|---|---|---|
| Email | Identifiant de compte, sécurité (notifications nouveau device, reset password) | Exécution du contrat (art. 6.1.b) | Durée du compte + 30 jours après demande de suppression |
| Hash du mot de passe (bcrypt) | Authentification | Exécution du contrat | Idem |
| Sessions actives (refresh tokens) | Maintenir la connexion sans re-saisie du mot de passe | Exécution du contrat | Jusqu'à déconnexion ou révocation |
| Code TOTP secret (si vous activez la 2FA) | Authentification à deux facteurs | Exécution du contrat | Tant que la 2FA est activée |
| Recovery codes hashés (si vous activez la 2FA) | Récupération en cas de perte du device d'authentification | Exécution du contrat | Tant que la 2FA est activée |
| Settings d'application (thème, langue, raccourcis, etc.) | Synchronisation multi-device | Exécution du contrat | Durée du compte + 30 jours |
| Dictionnaire personnel (mots, expressions de remplacement) | Synchronisation multi-device | Exécution du contrat | Idem |
| Snippets (déclencheurs vocaux + textes de remplacement) | Synchronisation multi-device | Exécution du contrat | Idem |
| Liste des appareils connectés (nom OS, version d'app, dernière activité) | Sécurité (signal d'alerte nouveau device, gestion des sessions) | Exécution du contrat (sécurité, art. 32 RGPD) | Tant que l'appareil est actif + 90 jours |
| Logs serveur (timestamp, endpoint, user_id pseudonymisé, code HTTP) | Sécurité, debug, rate limiting | Intérêt légitime (art. 6.1.f) | 30 jours |
| Métadonnées techniques de canonicalisation email (anti-doublons) | Empêcher la création abusive de plusieurs comptes via aliasing Gmail | Intérêt légitime | Durée du compte |

**Nous ne collectons pas** :
- Vos enregistrements audio.
- Vos transcriptions.
- Vos notes texte (en v3.0).
- Vos clés d'API tierces (OpenAI, Groq, etc.).
- Votre adresse IP (au-delà de la durée d'une requête, non stockée durablement).
- D'identifiants publicitaires, de cookies de tracking, ou d'analytics tiers.

---

## 4. Sous-traitants

Nous confions le traitement de vos données aux sous-traitants suivants. Chacun d'eux est lié à nous par un accord de traitement de données (DPA) conforme au RGPD.

| Sous-traitant | Finalité | Localisation | DPA | Certification |
|---|---|---|---|---|
| **Supabase, Inc.** | Hébergement de la base de données, authentification, fonctions serveur | Région **EU (Frankfurt, Allemagne)** | ✅ inclus dans le plan Supabase Pro | SOC 2 Type 2 |
| **Cloudflare, Inc.** | Hébergement statique de la page de callback authentification (`<auth.domaine>`) | Edge réseau global, CDN | ✅ DPA public Cloudflare | ISO 27001, SOC 2 Type 2 |
| **Google LLC** (uniquement si vous choisissez OAuth Google) | Authentification OAuth | Global | Inclus dans les Google API Terms of Service | Standard |

**Aucun transfert de données hors de l'Union Européenne** n'a lieu pour les fonctionnalités principales (compte, sync settings/dictionnaire/snippets). Les seules données qui transitent par des sous-traitants opérant hors UE sont :

- Si vous utilisez **Google OAuth** : votre email et votre identité Google transitent par Google (pour l'opération d'authentification uniquement). Nous ne stockons aucune autre donnée Google.
- Si vous utilisez **Cloudflare Pages** pour la page de callback : seul le token d'authentification temporaire transite, immédiatement consommé puis effacé du navigateur.

À partir de la version 3.2, un quatrième sous-traitant interviendra :

- **Lemon Squeezy** (Merchant of Record), pour la gestion des paiements. Localisation : États-Unis. DPA à signer lors de l'activation du billing.

Cette politique sera mise à jour avant l'introduction du billing.

---

## 5. Bases légales

Conformément à l'article 6 du RGPD, nous traitons vos données sur deux bases légales principales :

- **Exécution du contrat** (art. 6.1.b) : pour tout ce qui constitue le service lui-même — création et gestion du compte, synchronisation, sécurité, billing futur.
- **Intérêt légitime** (art. 6.1.f) : pour les logs techniques nécessaires à la sécurité du service (rate limiting, anti-fraude, debug). Ces logs ne contiennent **ni votre email, ni le contenu de vos notes ou settings, ni votre mot de passe, ni vos tokens d'authentification**.

Aucun traitement basé sur le consentement explicite (art. 6.1.a) n'est mis en œuvre en v3.0. Si nous introduisions à l'avenir des analytics produit, ils seraient **strictement opt-in**.

---

## 6. Vos droits

Vous disposez à tout moment des droits suivants sur vos données personnelles, conformément aux articles 15 à 22 du RGPD :

| Droit | Comment l'exercer | Délai de réponse |
|---|---|---|
| **Accès** (art. 15) | Settings > Compte > "Exporter mes données" — JSON téléchargeable | Immédiat |
| **Rectification** (art. 16) | Settings > Compte > modifier les champs | Immédiat |
| **Effacement** (art. 17) | Settings > Sécurité > "Supprimer mon compte" — purge effective sous 30 jours maximum | ≤ 30 jours |
| **Portabilité** (art. 20) | Identique à "Accès" — format JSON standard | Immédiat |
| **Limitation** (art. 18) | Contact email | ≤ 30 jours |
| **Opposition** (art. 21) | Contact email | ≤ 30 jours |
| **Réclamation** | CNIL — [www.cnil.fr](https://www.cnil.fr) | — |

### Détail "Suppression de compte"

Lorsque vous demandez la suppression de votre compte :

1. **Immédiatement** : votre session est invalidée sur tous vos appareils, vous êtes déconnecté.
2. **Pendant 30 jours** : vos données restent en base mais inaccessibles ; vous pouvez **annuler la demande** en vous reconnectant.
3. **Au bout de 30 jours** : un job automatisé (cron quotidien à 03:00 UTC) supprime définitivement votre compte de notre base : email, hash mot de passe, settings, dictionnaire, snippets, recovery codes, sessions, devices. La suppression est irréversible.

**Conservées intentionnellement après suppression** :
- Les **données 100 % locales** (recordings, transcriptions, notes) restent sur votre appareil. Elles n'ont jamais été chez nous, donc elles ne sont pas concernées.

---

## 7. Sécurité

Nous protégeons vos données par :

- **Chiffrement en transit** (TLS 1.3 obligatoire) sur toutes les connexions client ↔ serveur.
- **Chiffrement au repos** sur la base de données Supabase (fonctionnalité Postgres native).
- **Isolation stricte par utilisateur** au niveau base de données (Row-Level Security PostgreSQL avec policies vérifiées par tests automatisés).
- **Stockage des sessions dans le coffre-fort sécurisé du système d'exploitation** (Windows Credential Manager / macOS Keychain / Linux Secret Service).
- **2FA TOTP optionnel** activable depuis Settings > Sécurité.
- **Vérification anti-mots de passe leakés** au signup (refus des passwords présents dans le top 10 000 des fuites connues).
- **Captcha Cloudflare Turnstile** au signup pour limiter les abus.
- **Rate limiting** sur les endpoints sensibles (signup, magic link, reset password).
- **Audits CI quotidiens** des dépendances (`pnpm audit`, `cargo audit`).
- **Scanner anti-fuite de secrets** sur chaque release (vérifie qu'aucune clé technique ne se retrouve dans les binaires distribués).

### Limites assumées

Nous adoptons une posture dite "side-side encryption" (style Notion, Linear, Slack) — par opposition au chiffrement de bout en bout (style Signal, Proton, Bitwarden). Cela signifie :

- ✅ Vos données sont chiffrées en transit et au repos.
- ✅ Personne ne peut accéder à vos données via Internet sans votre mot de passe (et sans 2FA si vous l'activez).
- ⚠️ Une fuite de notre base de données par un attaquant extérieur impliquerait que vos paramètres synchronisés (settings, dictionnaire, snippets) puissent être lus. C'est un compromis assumé : les notes texte (sub-épique 03, prévu pour la version 3.1) seront concernées par cette posture.
- ⚠️ Un employé Supabase ayant accès à la base pourrait théoriquement lire vos données. Nous nous appuyons sur les engagements contractuels et les certifications SOC 2 Type 2 de Supabase (DPA signé).

Si cette posture ne vous convient pas, **continuez d'utiliser Lexena en mode 100 % local sans compte** — c'est gratuit, illimité, et aucune donnée ne quitte votre appareil.

### Notification en cas de fuite

Si une fuite affectant vos données venait à se produire, nous nous engageons à :

- Notifier la **CNIL** dans les **72 heures** suivant la prise de connaissance, conformément à l'article 33 du RGPD.
- Vous notifier par email **dans les meilleurs délais** si la fuite présente un risque élevé pour vos droits et libertés (art. 34).
- Publier une page d'information publique avec une timeline et les mesures prises.

Notre plan de réponse à incident est documenté en interne (`docs/v3/runbooks/incident-response.md`).

---

## 8. Cookies et traceurs

Lexena est une **application desktop**. Elle n'utilise **aucun cookie** côté serveur, **aucun pixel de tracking**, **aucun outil d'analytics tiers**.

La page web de callback authentification (hébergée sur Cloudflare Pages) ne dépose **aucun cookie persistant**. Elle utilise uniquement le `localStorage` du navigateur de manière temporaire pour transmettre le token d'authentification à l'application desktop, puis l'efface immédiatement.

---

## 9. Mineurs

Lexena n'est pas destinée aux personnes de moins de **15 ans** (âge du consentement numérique en France). Si vous avez moins de 15 ans, ne créez pas de compte.

Si nous apprenons qu'un compte a été créé par une personne de moins de 15 ans, nous le supprimerons.

---

## 10. Modifications de cette politique

Nous pouvons être amenés à modifier cette politique pour refléter des évolutions de l'application (ex. introduction de la sync des notes en v3.1, du billing en v3.2). Toute modification matérielle vous sera notifiée :

- Par email à l'adresse associée à votre compte (au moins 15 jours avant l'entrée en vigueur).
- Par une notification dans l'application au prochain démarrage.

L'historique des versions de cette politique est consultable publiquement à `<URL_FUTURE_DOMAINE>/privacy/changelog`.

---

## 11. Contact

| Type de demande | Contact |
|---|---|
| Exercice de vos droits RGPD (accès, rectif, suppression, etc.) | `<contact@DOMAINE>` |
| Question sur cette politique | `<contact@DOMAINE>` |
| Signalement de vulnérabilité de sécurité | `security@<DOMAINE>` (cf. `SECURITY.md` du projet) |
| Délégué à la Protection des Données (DPO) | `<DPO_NOM_OU_NA_NA_SI_PAS_DPO_DESIGNE>` |
| Autorité de contrôle | CNIL — [www.cnil.fr](https://www.cnil.fr) |

**Identité de l'éditeur** :

- **`<NOM ÉDITEUR>`** (forme juridique : `<EI / SASU / autre>`)
- Adresse : `<ADRESSE>`
- Email : `<contact@DOMAINE>`
- SIRET : `<SIRET>` (si applicable)
- Représentant légal : `<NOM PRÉNOM>`

**Hébergement principal** :

- Supabase, Inc. — Région Frankfurt (Allemagne)

---

## 12. Annexe — Données traitées en mode 100 % local (sans compte)

À titre d'information, le mode 100 % local de Lexena traite localement les données suivantes, **sans aucune transmission vers nos serveurs ou un tiers** (sauf si vous configurez explicitement une clé API tierce comme OpenAI ou Groq, auquel cas les enregistrements sont envoyés au prestataire de transcription que vous avez choisi, sous votre responsabilité) :

- Audio capturé via votre microphone (traité par le moteur de transcription configuré : OpenAI Whisper API, Groq, ou modèle local `whisper-rs`).
- Transcriptions générées et historique associé.
- Notes texte créées dans l'application.
- Paramètres d'application stockés localement (`%APPDATA%/com.nolyo.lexena/`).

Ces données restent sur votre appareil tant que vous n'activez pas la synchronisation.

---

*Dernière mise à jour : `<DATE_PUBLICATION>`.*
