# Conditions Générales d'Utilisation — Lexena

> **Version** : v3.0 — draft du 2026-05-01.
> **À publier** : après remplacement des `<placeholders>` (identité éditeur, domaine final, prix billing v3.2).
> **À relire** : par un juriste avant publication. Ce draft couvre v3.0 (gratuit) et anticipe v3.2 (billing) avec une section dédiée à activer le moment venu.

---

## 1. Objet

Les présentes Conditions Générales d'Utilisation (ci-après "**CGU**") régissent l'utilisation de l'application **Lexena** (ci-après "**l'Application**"), édité par **`<NOM ÉDITEUR>`** (ci-après "**l'Éditeur**"), basé à `<ADRESSE>`.

L'Application est distribuée gratuitement en téléchargement depuis `<URL_DOWNLOAD>` et fonctionne sur Windows, macOS et Linux. Elle propose deux modes d'utilisation :

1. **Mode local sans compte** — gratuit et illimité, aucune donnée ne quitte l'appareil de l'utilisateur.
2. **Mode avec compte** — fonctionnalités de synchronisation cloud des paramètres, du dictionnaire personnel et des snippets entre plusieurs appareils.

L'inscription à un compte vaut acceptation pleine et entière des présentes CGU, ainsi que de la [Politique de confidentialité](./privacy-policy-fr.md).

---

## 2. Définitions

- **Utilisateur** : toute personne physique utilisant l'Application, avec ou sans compte.
- **Compte** : ensemble des identifiants (email + mot de passe ou OAuth) permettant d'accéder aux fonctionnalités cloud.
- **Service** : ensemble des fonctionnalités cloud (synchronisation, export, etc.) accessibles depuis un Compte.
- **Contenu Utilisateur** : ensemble des données saisies ou produites par l'Utilisateur dans l'Application (paramètres, dictionnaire, snippets, transcriptions, notes, recordings).
- **Mode local** : utilisation de l'Application sans Compte, sans transmission de données vers les serveurs de l'Éditeur.

---

## 3. Acceptation des CGU

L'utilisation de l'Application en mode local n'implique pas l'acceptation des CGU.

La création d'un Compte exige l'acceptation explicite des CGU et de la Politique de confidentialité, matérialisée par une case à cocher au moment du signup.

L'Éditeur se réserve le droit de modifier les CGU à tout moment. Toute modification matérielle sera notifiée à l'Utilisateur :

- Par email à l'adresse associée au Compte (au moins **15 jours** avant l'entrée en vigueur).
- Par une notification dans l'Application au prochain démarrage.

L'Utilisateur qui n'accepte pas les nouvelles CGU peut supprimer son Compte (cf. article 11).

---

## 4. Création et accès au Compte

### 4.1 Création

La création d'un Compte est gratuite. Trois méthodes sont proposées :

- Email + mot de passe (avec confirmation par email).
- Magic link (lien unique envoyé par email).
- OAuth Google.

L'Utilisateur s'engage à fournir des informations exactes et à jour. Une seule adresse email réelle = un seul Compte (la canonicalisation Gmail est appliquée pour empêcher les doublons via aliases).

### 4.2 Sécurité du Compte

L'Utilisateur est responsable de la confidentialité de son mot de passe et des éventuels recovery codes générés à l'activation de la 2FA. L'Éditeur recommande fortement :

- L'utilisation d'un mot de passe long (≥ 12 caractères) et unique, généré et stocké via un gestionnaire de mots de passe.
- L'activation de la 2FA TOTP depuis Settings > Sécurité.

L'Utilisateur s'engage à signaler à l'Éditeur sans délai toute compromission suspectée de son Compte (`security@<DOMAINE>`).

### 4.3 Accès et restrictions

L'Application est destinée aux personnes âgées de **15 ans révolus** au moins (âge du consentement numérique en France). L'utilisation est interdite aux mineurs de moins de 15 ans.

L'Éditeur se réserve le droit de suspendre ou de fermer un Compte sans préavis en cas de :

- Violation manifeste des présentes CGU.
- Activité frauduleuse ou abusive (création de comptes multiples pour contourner les limites du free tier, scraping, attaques DDoS, etc.).
- Décision judiciaire ou injonction administrative.

---

## 5. Périmètre du Service v3.0

Le Service en version 3.0 inclut :

- **Synchronisation des paramètres** d'application (thème, langue, raccourcis, options d'insertion, choix du moteur de transcription).
- **Synchronisation du dictionnaire personnel** (mots et expressions de remplacement).
- **Synchronisation des snippets** (déclencheurs vocaux + textes de remplacement).
- **Suivi des appareils connectés** + notifications de sécurité.
- **Export GDPR** (téléchargement JSON de l'ensemble des données synchronisées).
- **Suppression de Compte** avec grace period de 30 jours.

**Le Service v3.0 NE synchronise PAS** :

- Les enregistrements audio.
- L'historique des transcriptions.
- Les notes texte (planifié v3.1, opt-in).
- Les clés d'API tierces (OpenAI, Groq, etc.) — celles-ci restent exclusivement sur l'appareil de l'Utilisateur, dans le coffre-fort sécurisé du système d'exploitation.

---

## 6. Quotas et limites

L'Éditeur applique un quota de stockage par Compte pour les données synchronisées (settings + dictionnaire + snippets). Le quota actuel est de **`<QUOTA_MO>` Mo**, dimensionné pour couvrir un usage normal très large. Si vous dépassez ce quota, les nouvelles modifications ne seront plus synchronisées tant que vous n'aurez pas réduit votre volume (suppression de snippets ou mots de dictionnaire). Une bannière dans l'Application vous en informera.

L'Éditeur peut ajuster ce quota à tout moment (à la hausse comme à la baisse, avec préavis raisonnable en cas de baisse).

---

## 7. Engagements de l'Éditeur

L'Éditeur s'engage à :

- Mettre à disposition le Service avec une diligence raisonnable, dans la limite des moyens d'un éditeur indépendant.
- Protéger les données de l'Utilisateur conformément à la [Politique de confidentialité](./privacy-policy-fr.md) et au RGPD.
- Notifier l'Utilisateur en cas d'incident de sécurité affectant ses données dans les conditions prévues à l'article 34 du RGPD.
- Permettre à l'Utilisateur d'exporter et de supprimer ses données à tout moment.
- Maintenir la **compatibilité du mode local sans compte** : aucune fonctionnalité essentielle d'utilisation hors-ligne ne sera retirée pour pousser l'Utilisateur vers un Compte payant.

L'Éditeur ne fournit **aucune garantie de disponibilité du Service** (SLA), ni de résultat. Le Service est fourni "en l'état". Voir article 9 pour la responsabilité.

---

## 8. Engagements de l'Utilisateur

L'Utilisateur s'engage à :

- Ne pas utiliser l'Application à des fins illégales (enregistrement clandestin de personnes sans leur consentement dans une juridiction où cela est interdit, harcèlement, etc.).
- Ne pas tenter de contourner les mécanismes de sécurité ou de quotas (création de comptes multiples, automation abusive, etc.).
- Respecter les droits de propriété intellectuelle de l'Éditeur et des tiers.
- Ne pas redistribuer l'Application modifiée sous le nom Lexena ou en utilisant la marque Lexena (cf. article 13).

L'Utilisateur reconnaît que **les transcriptions et le contenu généré par les modèles d'IA tiers** (OpenAI, Groq, modèles locaux) sont sous la responsabilité du fournisseur du modèle, et que l'Éditeur ne garantit ni la précision, ni l'exhaustivité, ni l'absence de biais des résultats produits.

---

## 9. Responsabilité

### 9.1 Limitation de responsabilité de l'Éditeur

Dans la limite maximale autorisée par la loi applicable, la responsabilité de l'Éditeur ne saurait être engagée :

- En cas d'indisponibilité temporaire du Service (maintenance, incident, panne d'un sous-traitant comme Supabase ou Cloudflare).
- En cas de perte de données causée par un dysfonctionnement de l'Application, sauf à démontrer une faute lourde de l'Éditeur. L'Utilisateur est invité à conserver des sauvegardes locales (la fonction "Export GDPR" est disponible à tout moment).
- En cas d'utilisation des transcriptions ou du contenu généré qui causerait un préjudice à l'Utilisateur ou à un tiers.

En tout état de cause, la responsabilité maximale de l'Éditeur envers l'Utilisateur est limitée :

- En version gratuite : à zéro (le Service est fourni gratuitement).
- En version payante (v3.2+) : au montant payé par l'Utilisateur au cours des **12 derniers mois** précédant le fait générateur.

### 9.2 Responsabilité de l'Utilisateur

L'Utilisateur est seul responsable :

- Du contenu qu'il enregistre, transcrit, ou stocke avec l'Application.
- Du respect des droits des tiers (notamment du droit à l'image et à la voix des personnes enregistrées, du secret professionnel s'il est concerné).
- De la sécurité de son Compte (mot de passe, 2FA, recovery codes).

---

## 10. Propriété intellectuelle

### 10.1 Application

L'Application Lexena, son code source, sa marque, son logo et son identité visuelle sont la propriété exclusive de l'Éditeur, sauf composants tiers sous licence open source listés dans `<URL_LICENCES>`.

L'Utilisateur dispose d'un droit d'usage personnel, non exclusif, non transférable, pour utiliser l'Application conformément aux présentes CGU. Aucun droit de revente, de redistribution modifiée, ou d'exploitation commerciale n'est concédé.

### 10.2 Contenu Utilisateur

L'Utilisateur conserve l'intégralité des droits sur son Contenu Utilisateur. L'Éditeur n'acquiert aucun droit de propriété, d'exploitation, ou de cession sur ce contenu.

L'Utilisateur accorde à l'Éditeur la licence strictement nécessaire pour héberger, sauvegarder, et synchroniser ses données entre ses appareils, dans la limite stricte du fonctionnement du Service. Cette licence est révocable à tout moment via la suppression du Compte.

L'Éditeur **ne pourra en aucun cas** :

- Utiliser le Contenu Utilisateur à des fins de marketing, de profilage, ou de revente à des tiers.
- Entraîner des modèles d'intelligence artificielle sur le Contenu Utilisateur.
- Lire le Contenu Utilisateur en clair sans une raison opérationnelle légitime explicite (ex. demande de support à l'initiative de l'Utilisateur, investigation suite à un incident de sécurité avec consentement).

---

## 11. Suppression du Compte et résiliation

### 11.1 À l'initiative de l'Utilisateur

L'Utilisateur peut supprimer son Compte à tout moment, sans préavis ni justification, depuis Settings > Sécurité > "Supprimer mon compte". La suppression entraîne :

- Une déconnexion immédiate de tous les appareils.
- Une grace period de **30 jours** pendant laquelle la demande peut être annulée par simple reconnexion.
- Au terme de la grace period, une suppression définitive et irréversible des données synchronisées (cf. Politique de confidentialité, article 6).

### 11.2 À l'initiative de l'Éditeur

L'Éditeur peut suspendre ou résilier un Compte sans préavis en cas de violation grave des présentes CGU (article 4.3). En cas de résiliation, l'Utilisateur dispose d'un délai de 30 jours pour exporter ses données.

### 11.3 Continuité d'usage en mode local

La résiliation d'un Compte n'empêche pas l'Utilisateur de continuer à utiliser l'Application en mode local sans compte. Le téléchargement et l'usage en mode local restent gratuits et illimités.

---

## 12. Service payant (à activer en v3.2)

> ⚠️ **Section non applicable en v3.0.** Cette section sera activée lors de l'introduction du billing en version 3.2. Elle est rédigée à titre indicatif et sera mise à jour avant publication effective.

### 12.1 Offre

Une offre payante "Lexena Premium" sera proposée à partir de la version 3.2 au tarif de **`<PRIX_MENSUEL>` € / mois** ou **`<PRIX_ANNUEL>` € / an** TTC. Cette offre comprendra : `<LISTE_FEATURES_PREMIUM_À_FIGER>`.

### 12.2 Provider de paiement

Le paiement est traité par **Lemon Squeezy** (Lemon Squeezy LLC, États-Unis), agissant en tant que **Merchant of Record**. À ce titre, Lemon Squeezy assume la collecte et le reversement de la TVA (UE) et des sales tax (US/Canada) applicables.

L'Éditeur ne stocke **aucune donnée bancaire**. Les conditions générales de Lemon Squeezy sont consultables à `<URL_LS>`.

### 12.3 Annulation et remboursement

L'Utilisateur peut résilier son abonnement à tout moment depuis le portail client Lemon Squeezy, sans pénalité. La résiliation prend effet à la fin de la période payée (mensuelle ou annuelle), sans remboursement prorata sauf disposition légale contraire (notamment droit de rétractation de 14 jours pour les premiers achats — cf. ci-dessous).

### 12.4 Droit de rétractation (UE)

Conformément à l'article L. 221-18 du Code de la consommation, l'Utilisateur consommateur résidant dans l'Union Européenne dispose d'un droit de rétractation de **14 jours** à compter de la souscription, **à l'exception** des cas où l'Utilisateur a expressément consenti à l'exécution immédiate du Service (auquel cas le droit de rétractation est purgé dès le premier usage).

---

## 13. Marque et identité visuelle

"Lexena" et le logo associé sont des marques de l'Éditeur. Toute reproduction, modification, ou usage commercial sans autorisation écrite préalable est strictement interdit.

L'usage de la marque dans des contextes éditoriaux (articles, tutoriels, podcasts, vidéos) est autorisé sans accord préalable, à condition de respecter l'identité visuelle (pas de modification du logo, pas de mise en contexte trompeuse).

---

## 14. Loi applicable et juridiction

Les présentes CGU sont régies par le **droit français**.

En cas de litige, et **après tentative de résolution amiable préalable obligatoire** (contact à `<contact@DOMAINE>`), les tribunaux compétents sont :

- Pour les Utilisateurs **consommateurs** : les tribunaux du domicile de l'Utilisateur, conformément aux dispositions du Code de la consommation.
- Pour les Utilisateurs **professionnels** : le **Tribunal de Commerce de `<VILLE_SIÈGE>`** est exclusivement compétent.

L'Utilisateur consommateur peut également recourir gratuitement à un médiateur de la consommation : `<MÉDIATEUR_OU_NA>`.

---

## 15. Dispositions diverses

### 15.1 Nullité partielle

Si une disposition des présentes CGU était jugée nulle ou inapplicable par une juridiction compétente, les autres dispositions resteraient en vigueur.

### 15.2 Non-renonciation

Le fait pour l'Éditeur de ne pas se prévaloir d'une disposition des CGU ne saurait être interprété comme une renonciation à s'en prévaloir ultérieurement.

### 15.3 Intégralité

Les présentes CGU, complétées par la [Politique de confidentialité](./privacy-policy-fr.md), constituent l'intégralité de l'accord entre l'Utilisateur et l'Éditeur concernant l'usage de l'Application.

---

## 16. Contact

| Type de demande | Contact |
|---|---|
| Support général | `<support@DOMAINE>` |
| Question contractuelle / litige | `<contact@DOMAINE>` |
| Signalement de vulnérabilité de sécurité | `security@<DOMAINE>` |
| Délégué à la Protection des Données | `<DPO_OU_NA>` |

**Identité de l'Éditeur** :

- **`<NOM ÉDITEUR>`** (forme juridique : `<EI / SASU / autre>`)
- Adresse : `<ADRESSE>`
- Email : `<contact@DOMAINE>`
- SIRET : `<SIRET>` (si applicable)
- Représentant légal : `<NOM PRÉNOM>`

**Hébergement principal** :

- **Supabase, Inc.** — Région Frankfurt (Allemagne)
- **Cloudflare, Inc.** — Edge réseau global (page de callback authentification)

---

*Dernière mise à jour : `<DATE_PUBLICATION>`.*
